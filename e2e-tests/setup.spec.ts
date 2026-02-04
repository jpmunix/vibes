import { testWithConfig } from "./helpers/test_helper";
import { expect } from "@playwright/test";

const testSetup = testWithConfig({
  showSetupScreen: true,
});

testSetup("setup ai provider", async ({ po }) => {
  await po.page
    .getByRole("button", { name: "Setup Google Gemini API Key" })
    .click();
  await expect(
    po.page.getByRole("heading", { name: "Configurar Google" }),
  ).toBeVisible();

  await po.page.getByRole("button", { name: "Atrás" }).click();
  await po.page
    .getByRole("button", { name: "Establecer un API Key de OpenRouter" })
    .click();
  await expect(
    po.page.getByRole("heading", { name: "Configurar OpenRouter" }),
  ).toBeVisible();

  await po.page.getByRole("button", { name: "Atrás" }).click();
  await po.page
    .getByRole("button", { name: "Configurar otros proveedores de IA" })
    .click();
});
