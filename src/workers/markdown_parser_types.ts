
export type CustomTagInfo = {
    tag: string;
    attributes: Record<string, string>;
    content: string;
    fullMatch: string;
    inProgress?: boolean;
};

export type ContentPiece =
    | { type: "markdown"; content: string }
    | { type: "custom-tag"; tagInfo: CustomTagInfo };

export interface WorkerInput {
    requestId: number;
    content: string;
}

export interface WorkerOutput {
    requestId: number;
    contentPieces: ContentPiece[];
    timestamp: number;
}
