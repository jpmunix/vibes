import { tool } from "@opencode-ai/plugin"
import * as nodeFs from "fs"
import * as nodePath from "path"

// ─── Patch parser ───

interface PatchHunk {
    contextBefore: string[]
    removedLines: string[]
    addedLines: string[]
    contextAfter: string[]
}

interface PatchOp {
    type: "update" | "add" | "delete"
    filePath: string
    hunks: PatchHunk[]
    addedContent: string  // for "add" type only
}

function parsePatch(patchText: string): PatchOp[] {
    const operations: PatchOp[] = []
    const lines = patchText.split("\n")
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        if (line.startsWith("*** Delete File:")) {
            const filePath = line.replace("*** Delete File:", "").trim()
            operations.push({ type: "delete", filePath, hunks: [], addedContent: "" })
            i++
            continue
        }

        if (line.startsWith("*** Add File:")) {
            const filePath = line.replace("*** Add File:", "").trim()
            const contentLines: string[] = []
            i++
            while (i < lines.length && !lines[i].startsWith("***")) {
                const l = lines[i].startsWith("+") ? lines[i].slice(1) : lines[i]
                contentLines.push(l)
                i++
            }
            operations.push({ type: "add", filePath, hunks: [], addedContent: contentLines.join("\n") })
            continue
        }

        if (line.startsWith("*** Update File:")) {
            const filePath = line.replace("*** Update File:", "").trim()
            i++

            const hunks: PatchHunk[] = []
            let currentHunk: PatchHunk = { contextBefore: [], removedLines: [], addedLines: [], contextAfter: [] }
            let inChange = false
            let afterChange = false

            while (i < lines.length && !lines[i].startsWith("***")) {
                const pl = lines[i]

                if (pl.startsWith("@@")) {
                    if (currentHunk.removedLines.length > 0 || currentHunk.addedLines.length > 0) {
                        hunks.push(currentHunk)
                        currentHunk = { contextBefore: [], removedLines: [], addedLines: [], contextAfter: [] }
                    }
                    inChange = false
                    afterChange = false
                    i++
                    continue
                }

                if (pl.startsWith("-")) {
                    if (afterChange) {
                        hunks.push(currentHunk)
                        currentHunk = { contextBefore: [], removedLines: [], addedLines: [], contextAfter: [] }
                        afterChange = false
                    }
                    inChange = true
                    currentHunk.removedLines.push(pl.slice(1))
                } else if (pl.startsWith("+")) {
                    inChange = true
                    currentHunk.addedLines.push(pl.slice(1))
                } else {
                    const content = pl.startsWith(" ") ? pl.slice(1) : pl
                    if (inChange) {
                        afterChange = true
                        inChange = false
                        currentHunk.contextAfter.push(content)
                    } else {
                        currentHunk.contextBefore.push(content)
                    }
                }
                i++
            }

            if (currentHunk.removedLines.length > 0 || currentHunk.addedLines.length > 0) {
                hunks.push(currentHunk)
            }

            operations.push({ type: "update", filePath, hunks, addedContent: "" })
            continue
        }

        i++
    }

    return operations
}

/**
 * Build a Morph-style partial <update> from parsed hunks.
 * Uses `// ...existing code...` markers between changed sections.
 * When the patch has no context lines, finds the removed lines
 * in the original code and extracts surrounding context for anchoring.
 */
function buildMorphUpdate(hunks: PatchHunk[], originalCode: string): string {
    if (hunks.length === 0) return ""

    const fileLines = originalCode.split("\n")
    const parts: string[] = []
    parts.push("// ...existing code...")

    for (let h = 0; h < hunks.length; h++) {
        const hunk = hunks[h]
        let ctxBefore = hunk.contextBefore.slice(-3)
        let ctxAfter = hunk.contextAfter.slice(0, 3)

        // If no context from patch AND we have removed lines, find them in the file
        if (ctxBefore.length === 0 && ctxAfter.length === 0 && hunk.removedLines.length > 0) {
            const needle = hunk.removedLines[0].trim()
            if (needle.length > 0) {
                for (let i = 0; i < fileLines.length; i++) {
                    if (fileLines[i].trim() === needle) {
                        ctxBefore = fileLines.slice(Math.max(0, i - 3), i)
                        const endIdx = i + hunk.removedLines.length
                        ctxAfter = fileLines.slice(endIdx, Math.min(fileLines.length, endIdx + 3))
                        break
                    }
                }
            }
        }

        if (ctxBefore.length > 0) parts.push(...ctxBefore)

        if (hunk.addedLines.length > 0) {
            parts.push(...hunk.addedLines)
        }

        if (ctxAfter.length > 0) parts.push(...ctxAfter)

        parts.push("// ...existing code...")
    }

    return parts.join("\n")
}

export default tool({
    description:
        "Apply a patch to the codebase. The patch should use the format:\n" +
        "*** Add File: path/to/new/file.ts\n" +
        "file content here\n" +
        "*** Update File: path/to/existing/file.ts\n" +
        "-old line\n" +
        "+new line\n" +
        "*** Delete File: path/to/delete.ts\n" +
        "Replaces the built-in apply_patch tool with Morph AI integration.",
    args: {
        patch: tool.schema.string().describe("The patch content to apply"),
    },
    async execute(args, context) {
        const operations = parsePatch(args.patch)
        const results: string[] = []

        for (const op of operations) {
            const fullPath = nodePath.join(context.directory, op.filePath)

            // ── DELETE ──
            if (op.type === "delete") {
                if (nodeFs.existsSync(fullPath)) {
                    nodeFs.unlinkSync(fullPath)
                    results.push("Deleted " + op.filePath)
                } else {
                    results.push("Not found: " + op.filePath)
                }
                continue
            }

            // ── ADD ──
            if (op.type === "add") {
                const dir = nodePath.dirname(fullPath)
                if (!nodeFs.existsSync(dir)) {
                    nodeFs.mkdirSync(dir, { recursive: true })
                }
                nodeFs.writeFileSync(fullPath, op.addedContent, "utf-8")
                results.push("Created " + op.filePath)
                continue
            }

            // ── UPDATE via Morph ──
            if (!nodeFs.existsSync(fullPath)) {
                results.push("ERROR: not found " + op.filePath)
                continue
            }

            const originalCode = nodeFs.readFileSync(fullPath, "utf-8")

            const apiKey = process.env.OPENROUTER_API_KEY
            if (!apiKey) {
                results.push("ERROR: no API key for " + op.filePath)
                continue
            }

            const model = "morph/morph-v3-fast"
            const updateBlock = buildMorphUpdate(op.hunks, originalCode)

            const instruction = "Apply the following changes to the file"
            const morphPrompt =
                "<instruction>" + instruction + "</instruction>\n" +
                "<code>" + originalCode + "</code>\n" +
                "<update>" + updateBlock + "</update>"

            const startApi = Date.now()
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + apiKey,
                    "X-Title": "vibes-morph-patch",
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: morphPrompt }],
                    temperature: 0,
                }),
            })

            const apiMs = Date.now() - startApi

            if (!response.ok) {
                results.push("ERROR: Morph " + response.status + " for " + op.filePath)
                continue
            }

            const data = await response.json() as any
            const mergedCode = data.choices?.[0]?.message?.content
            if (!mergedCode) {
                results.push("ERROR: empty response for " + op.filePath)
                continue
            }

            nodeFs.writeFileSync(fullPath, mergedCode, "utf-8")
            results.push("Updated " + op.filePath + " via Morph (" + apiMs + "ms)")
        }

        return results.join("\n")
    },
})
