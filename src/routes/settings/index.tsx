import { createRoute } from "@tanstack/react-router";
import { settingsRoute } from "../settings";
import SettingsPage from "../../pages/settings";

export const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  component: SettingsPage,
});
