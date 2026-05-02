import { tool } from "@opencode-ai/plugin"
import * as nodeFs from "fs"
import * as nodePath from "path"

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
        // Resolve file_path — agent may pass it under different names
        const rawPath = args.file_path || (args as any).filePath || (args as any).path || (args as any).file || (args as any).filepath
        if (!rawPath) {
            throw new Error("No file path provided. Got args: " + Object.keys(args).join(", "))
        }

        // Handle absolute vs relative paths
        const fullPath = nodePath.isAbsolute(rawPath) ? rawPath : nodePath.join(context.directory, rawPath)

        if (!nodeFs.existsSync(fullPath)) {
            throw new Error("File not found: " + rawPath)
        }

        const originalCode = nodeFs.readFileSync(fullPath, "utf-8")
        const lines = originalCode.split("\n")
        const lineCount = lines.length

        // Find context around old_string for anchoring
        const oldIdx = originalCode.indexOf(args.old_string)
        if (oldIdx === -1) {
            throw new Error("old_string not found in " + rawPath)
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

        const model = "morph/morph-v3-fast"
        const instruction = "Replace the old text with the new text in the file"
        const morphPrompt =
            "<instruction>" + instruction + "</instruction>\n" +
            "<code>" + originalCode + "</code>\n" +
            "<update>" + updateBlock + "</update>"

        const apiKey = process.env.OPENROUTER_API_KEY
        if (!apiKey) {
            throw new Error("OPENROUTER_API_KEY not set")
        }

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

        if (!response.ok) {
            const errText = await response.text()
            throw new Error("Morph API error: " + response.status + " " + errText)
        }

        const data = await response.json() as any
        const mergedCode = data.choices?.[0]?.message?.content
        if (!mergedCode) {
            throw new Error("Morph returned empty response")
        }

        nodeFs.writeFileSync(fullPath, mergedCode, "utf-8")
        return "Edit applied successfully."
    },
})
