import { createClient } from "../contracts/core";
import { aiQueryLogContracts } from "../contracts/ai_query_logs";

export const aiQueryLogClient = createClient(aiQueryLogContracts);

export interface AiQueryLog {
    id: number;
    queryType: string;
    model: string;
    promptSnippet: string;
    payload: any;
    response: any;
    inputTokens: number | null;
    outputTokens: number | null;
    createdAt: Date;
}
