import type { CodebaseFile } from "@/utils/codebase";
import type { AppChatContext } from "@/lib/schemas";

export interface ContextWorkerInput {
  appPath: string;
  chatContext: AppChatContext;
  prompt: string;
  useSemanticSearch: boolean;
  maxFiles: number;
}

export interface ContextWorkerOutput {
  success: boolean;
  data?: {
    codebaseInfo: string;
    files: CodebaseFile[];
  };
  error?: string;
}
