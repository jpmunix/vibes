import { z } from "zod";
import { defineContract } from "./core";

export const aiQueryLogContracts = {
    getAiQueryLogs: defineContract({ channel: "ai-query-logs:get-all", input: z.void(), output: z.array(z.any()) }),
    getAiQueryLogDetail: defineContract({ channel: "ai-query-logs:get-detail", input: z.number(), output: z.any() }),
    getFullLogs: defineContract({ channel: "ai-query-logs:get-full", input: z.void(), output: z.array(z.any()) }),
    addTestLog: defineContract({ channel: "ai-query-logs:add-test", input: z.void(), output: z.void() }),
    clearLogs: defineContract({ channel: "ai-query-logs:clear", input: z.void(), output: z.void() }),
};
