import { expect } from "@playwright/test";
import { test } from "./helpers/test_helper";

test("renders the first page", async ({ electronApp }) => {
  const page = await electronApp.firstWindow();
  await page.waitForSelector("h1");
  await expect(page.getByText("vibes.start()")).toBeVisible({ timeout: 5000 });
});
