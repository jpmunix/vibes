import React, { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { createRoute } from "@tanstack/react-router";
import { settingsRoute } from "../settings";

const AiQueryLogsPage = React.lazy(() => import("../../pages/AiQueryLogs"));

export const aiQueryLogsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: "/ai-query-logs",
    component: () => (
        <Suspense fallback={<PageLoader />}>
            <AiQueryLogsPage />
        </Suspense>
    ),
});
