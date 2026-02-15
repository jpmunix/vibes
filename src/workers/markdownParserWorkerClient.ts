
import { WorkerInput, WorkerOutput, ContentPiece } from "./markdown_parser_types";

class MarkdownParserWorkerClient {
    private worker: Worker | null = null;
    private pendingRequests = new Map<number, { resolve: (value: ContentPiece[]) => void; reject: (reason?: any) => void }>();
    private nextRequestId = 0;

    constructor() {
        this.initWorker();
    }

    private initWorker() {
        if (typeof window === "undefined") return; // SSR check

        try {
            this.worker = new Worker(new URL("./markdown_parser.worker.ts", import.meta.url), {
                type: "module",
            });

            this.worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
                const { requestId, contentPieces } = event.data;
                const pending = this.pendingRequests.get(requestId);

                if (pending) {
                    pending.resolve(contentPieces);
                    this.pendingRequests.delete(requestId);
                }
            };

            this.worker.onerror = (error) => {
                console.error("Markdown parser worker error:", error);
            };
        } catch (error) {
            console.error("Failed to initialize markdown parser worker:", error);
        }
    }

    public parse(content: string): Promise<ContentPiece[]> {
        if (!this.worker) {
            // Retry init?
            this.initWorker();
            if (!this.worker) {
                return Promise.reject(new Error("Worker not initialized"));
            }
        }

        const requestId = this.nextRequestId++;
        const input: WorkerInput = { requestId, content };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
            this.worker!.postMessage(input);
        });
    }
}

export const markdownParser = new MarkdownParserWorkerClient();
