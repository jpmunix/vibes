import { createRoute } from "@tanstack/react-router";
import { settingsRoute } from "../settings";
import AiQueryLogsPage from "../../pages/AiQueryLogs";

export const aiQueryLogsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: "/ai-query-logs",
    component: AiQueryLogsPage,
});
