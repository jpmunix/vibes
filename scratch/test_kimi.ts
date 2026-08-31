import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, tool } from "ai";
import { z } from "zod";

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    process.exit(1);
  }

  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const model = provider("moonshotai/kimi-k2.7-code");

  // Create a 1x1 black png in base64
  const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  console.log("Testing with tools...");
  try {
    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this image?" },
            { type: "image", image: Buffer.from(base64Image, "base64"), mimeType: "image/png" }
          ],
        },
      ],
      tools: {
        dummyTool: tool({
          description: "A dummy tool",
          parameters: z.object({ value: z.string() }),
          execute: async () => "dummy",
        })
      }
    });

    console.log("Response with tools:", result.text);
  } catch (e) {
    console.error("Error with tools:", e);
  }

  console.log("\nTesting without tools...");
  try {
    const result2 = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this image?" },
            { type: "image", image: Buffer.from(base64Image, "base64"), mimeType: "image/png" }
          ],
        },
      ],
    });

    console.log("Response without tools:", result2.text);
  } catch (e) {
    console.error("Error without tools:", e);
  }
}

main().catch(console.error);
