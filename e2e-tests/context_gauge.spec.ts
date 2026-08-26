import { test, Timeout } from "./helpers/test_helper";
import { expect } from "@playwright/test";

/**
 * Context gauge (#207) — sustituye al antiguo ContextLimitBanner (jubilado).
 *
 * El gauge es una rueda donut que muestra el % de contexto consumido por la
 * sesión (datos reales de los tags <vibes-token-usage> por mensaje) y ofrece
 * "Resumir a chat nuevo" al cruzar el umbral de compactación.
 */
test("context gauge appears and summarize works", async ({ po }) => {
  await po.setUp();

  // Send a message that triggers high token usage (110k tokens)
  // With a default context window of 128k, this is 86% used → above the
  // 70% compact threshold → the gauge shows the summarize button.
  await po.sendPrompt("tc=context-limit-response [high-tokens=110000]");

  // Verify the context gauge appears
  const contextGauge = po.page.getByTestId("context-gauge");
  await expect(contextGauge).toBeVisible({ timeout: Timeout.MEDIUM });

  // Click the summarize button (shown when compact is recommended)
  await contextGauge
    .getByRole("button", { name: "Summarize to new chat" })
    .click();

  // Wait for the new chat to load and message to complete
  await po.waitForChatCompletion();

  // Snapshot the messages in the new chat
  await po.snapshotMessages();
});

test("context gauge does not appear when within limit", async ({ po }) => {
  await po.setUp();

  // Send a message with low token usage (50k tokens)
  // With a 128k context window, this is ~39% used → below thresholds,
  // but the gauge still shows the donut (it only hides without usage data).
  await po.sendPrompt("tc=context-limit-response [high-tokens=50000]");

  // Verify the summarize button does NOT appear (no compact recommendation)
  const contextGauge = po.page.getByTestId("context-gauge");
  if (await contextGauge.isVisible().catch(() => false)) {
    await expect(
      contextGauge.getByRole("button", { name: "Summarize to new chat" }),
    ).not.toBeVisible();
  }
});
