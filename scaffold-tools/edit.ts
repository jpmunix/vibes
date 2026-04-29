import { tool } from "@opencode-ai/plugin"
import * as nodeFs from "fs"
import * as nodePath from "path"

const LOG_FILE = "/tmp/morph.log"
const SEP = "\n" + "═".repeat(80) + "\n\n"
function log(msg: string) {
    const ts = new Date().toISOString().substring(11, 23)
    const line = ts + " [EDIT] " + msg + "\n"
    try { nodeFs.appendFileSync(LOG_FILE, line) } catch {}
}

export default tool({
    description:
        "Modify existing files by replacing exact text content. " +
        "Uses Morph AI for ultrafast, accurate code merging (~400ms). " +
        "Provide the file path, the exact text to find (old_string), " +
        "and the replacement text (new_string). " +
        "Replaces the built-in edit tool.",
    args: {
        file_path: tool.schema.string().describe("Relative path to the file to edit"),
        old_string: tool.schema.string().describe("Exact string to find in the file"),
        new_string: tool.schema.string().describe("Replacement string"),
    },
    async execute(args, context) {
        const toolStart = Date.now()
        try { nodeFs.appendFileSync(LOG_FILE, SEP) } catch {}
        log("━━━━━ EDIT TOOL INVOKED ━━━━━")
        log("directory: " + (context?.directory || "UNDEFINED"))
        log("raw args keys: " + Object.keys(args).join(", "))

        try {
            // Resolve file_path — agent may pass it under different names
            const rawPath = args.file_path || (args as any).filePath || (args as any).path || (args as any).file || (args as any).filepath
            if (!rawPath) {
                log("ERROR: No file path in args. Keys: " + Object.keys(args).join(", "))
                log("Full args: " + JSON.stringify(args).substring(0, 500))
                throw new Error("No file path provided. Got args: " + Object.keys(args).join(", "))
            }
            log("file_path: " + rawPath)

            // Handle absolute vs relative paths
            const fullPath = nodePath.isAbsolute(rawPath) ? rawPath : nodePath.join(context.directory, rawPath)

            // ── AGENT INPUT ──
            log("── AGENT INPUT ──")
            log("old_string (" + args.old_string.length + " chars): " + JSON.stringify(args.old_string.substring(0, 300)))
            log("new_string (" + args.new_string.length + " chars): " + JSON.stringify(args.new_string.substring(0, 300)))

            if (!nodeFs.existsSync(fullPath)) {
                log("ERROR: File not found: " + fullPath)
                throw new Error("File not found: " + args.file_path)
            }

            const originalCode = nodeFs.readFileSync(fullPath, "utf-8")
            const lines = originalCode.split("\n")
            const lineCount = lines.length
            log("── FILE STATE ──")
            log("Original file: " + originalCode.length + " chars, " + lineCount + " lines")

            // ── Build Morph-style partial <update> ──
            // Find context around old_string for anchoring
            const oldIdx = originalCode.indexOf(args.old_string)
            if (oldIdx === -1) {
                log("ERROR: old_string NOT FOUND in file")
                throw new Error("old_string not found in " + args.file_path)
            }

            // Get line numbers for context
            const beforeText = originalCode.substring(0, oldIdx)
            const startLine = beforeText.split("\n").length - 1
            const oldLines = args.old_string.split("\n").length
            const endLine = startLine + oldLines

            // Grab 3 lines of context before and after for anchoring
            const ctxBefore = lines.slice(Math.max(0, startLine - 3), startLine)
            const ctxAfter = lines.slice(endLine, Math.min(lines.length, endLine + 3))

            // Build the partial update — Morph style
            const updateParts: string[] = []
            updateParts.push("// ...existing code...")
            if (ctxBefore.length > 0) updateParts.push(...ctxBefore)
            updateParts.push(...args.new_string.split("\n"))
            if (ctxAfter.length > 0) updateParts.push(...ctxAfter)
            updateParts.push("// ...existing code...")
            const updateBlock = updateParts.join("\n")

            // ── MODEL SELECTION ──
            const model = "morph/morph-v3-fast"

            // ── Build prompt ──
            const instruction = "Replace the old text with the new text in the file"
            const morphPrompt =
                "<instruction>" + instruction + "</instruction>\n" +
                "<code>" + originalCode + "</code>\n" +
                "<update>" + updateBlock + "</update>"

            log("── MORPH REQUEST ──")
            log("Model: " + model + " (" + lineCount + " lines)")
            log("  <instruction>: " + instruction)
            log("  <code>: " + originalCode.length + " chars (full original)")
            log("  <update>: " + updateBlock.length + " chars (PARTIAL with // ...existing code...)")
            log("  Update block:\n" + updateBlock.substring(0, 500))

            const apiKey = process.env.OPENROUTER_API_KEY
            if (!apiKey) {
                log("ERROR: OPENROUTER_API_KEY not set")
                throw new Error("OPENROUTER_API_KEY not set")
            }

            const startApi = Date.now()

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + apiKey,
                    "X-Title": "vibes-morph-edit",
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: morphPrompt }],
                    temperature: 0,
                }),
            })

            const apiMs = Date.now() - startApi

            log("── MORPH RESPONSE ──")
            log("HTTP " + response.status + " in " + apiMs + "ms")

            if (!response.ok) {
                const errText = await response.text()
                log("API ERROR: " + errText.substring(0, 1000))
                throw new Error("Morph API error: " + response.status + " " + errText)
            }

            const data = await response.json() as any
            log("Usage: " + JSON.stringify(data.usage || {}))
            log("Model: " + (data.model || "unknown"))
            log("Finish: " + (data.choices?.[0]?.finish_reason || "unknown"))

            const mergedCode = data.choices?.[0]?.message?.content
            if (!mergedCode) {
                log("ERROR: Morph returned empty content")
                throw new Error("Morph returned empty response")
            }

            const mergedLines = mergedCode.split("\n").length
            log("── MERGE RESULT ──")
            log("Merged: " + mergedCode.length + " chars, " + mergedLines + " lines")
            log("Delta: " + (mergedCode.length - originalCode.length) + " chars, " + (mergedLines - lineCount) + " lines")
            log("First 300: " + JSON.stringify(mergedCode.substring(0, 300)))

            nodeFs.writeFileSync(fullPath, mergedCode, "utf-8")
            log("File written ✓")

            const totalMs = Date.now() - toolStart
            const result = "Edited " + args.file_path + " via Morph (" + model + ", " + apiMs + "ms)"
            log("")
            log("⏱️  TOTAL: " + totalMs + "ms (API: " + apiMs + "ms, overhead: " + (totalMs - apiMs) + "ms)")
            log("━━━━━ EDIT COMPLETE ━━━━━ " + result)
            return result

        } catch (err: any) {
            const totalMs = Date.now() - toolStart
            log("")
            log("⏱️  TOTAL: " + totalMs + "ms (FAILED)")
            log("💥 FATAL: " + err.message)
            log("Stack: " + (err.stack || "no stack"))
            throw err
        }
    },
})
