import { createRoute } from "@tanstack/react-router";
import { settingsRoute } from "../settings";
import PromptsSettings from "../../pages/PromptsSettings";

export const promptsSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/prompts",
  component: PromptsSettings,
});
