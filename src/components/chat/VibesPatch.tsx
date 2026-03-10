import type React from "react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
    ChevronsDownUp,
    ChevronsUpDown,
    Loader,
    CircleX,
    Scissors,
} from "lucide-react";
import { CodeHighlight } from "./CodeHighlight";
import { CustomTagState } from "./stateTypes";

interface PatchOperation {
    range: string;
    content: string;
}

function parsePatchContent(raw: string): PatchOperation[] {
    const ops: PatchOperation[] = [];
    // Split by [Lx] or [Lx-Ly] markers
    const parts = raw.split(/\[L\d+(?:-L?\d+)?\]/g);
    const markers = raw.match(/\[L\d+(?:-L?\d+)?\]/g) || [];

    for (let i = 0; i < markers.length; i++) {
        const range = markers[i].replace(/[\[\]]/g, "");
        const content = (parts[i + 1] || "").trim();
        ops.push({ range, content });
    }

    // If no markers found, treat entire content as single block
    if (ops.length === 0 && raw.trim()) {
        ops.push({ range: "", content: raw.trim() });
    }

    return ops;
}

interface VibesPatchProps {
    children?: ReactNode;
    node?: any;
    path?: string;
    description?: string;
}

export const VibesPatch: React.FC<VibesPatchProps> = ({
    children,
    node,
    path: pathProp,
    description: descriptionProp,
}) => {
    const [isContentVisible, setIsContentVisible] = useState(false);

    const path = pathProp || node?.properties?.path || "";
    const description = descriptionProp || node?.properties?.description || "";
    const lines = node?.properties?.lines || "";
    const state = node?.properties?.state as CustomTagState;
    const retryCount = node?.properties?.retryCount || "";
    const inProgress = state === "pending";
    const aborted = state === "aborted";

    const operations = useMemo(
        () => parsePatchContent(String(children ?? "")),
        [children],
    );

    const fileName = path ? path.split("/").pop() : "";

    return (
        <div
            data-testid="vibes-patch"
            className={`bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer ${inProgress
                ? "border-teal-500"
                : aborted
                    ? "border-red-500"
                    : "border-border"
                }`}
            onClick={() => setIsContentVisible(!isContentVisible)}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex items-center">
                        <Scissors size={16} className="text-teal-500" />
                        <span className="bg-teal-600 text-white text-xs px-1.5 py-0.5 rounded ml-1 font-medium">
                            Patch
                        </span>
                    </div>
                    {fileName && (
                        <div className="flex items-center">
                            <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">
                                {fileName}
                            </span>
                            {lines && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">
                                    ({lines})
                                </span>
                            )}
                            {retryCount && Number(retryCount) > 1 && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 italic">
                                    (reintento {Number(retryCount) - 1})
                                </span>
                            )}
                        </div>
                    )}
                    {inProgress && (
                        <div className="flex items-center text-teal-600 text-xs">
                            <Loader size={14} className="mr-1 animate-spin" />
                            <span>Aplicando patch...</span>
                        </div>
                    )}
                    {aborted && (
                        <div className="flex items-center text-red-600 text-xs">
                            <CircleX size={14} className="mr-1" />
                            <span>No terminado</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center">
                    {isContentVisible ? (
                        <ChevronsDownUp
                            size={20}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        />
                    ) : (
                        <ChevronsUpDown
                            size={20}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        />
                    )}
                </div>
            </div>
            {path && (
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">
                    {path}
                </div>
            )}
            {description && (
                <div className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Summary: </span>
                    {description}
                </div>
            )}
            {isContentVisible && (
                <div
                    className="text-xs cursor-text"
                    onClick={(e) => e.stopPropagation()}
                >
                    {operations.length === 0 ? (
                        <CodeHighlight className="language-typescript">
                            {children}
                        </CodeHighlight>
                    ) : (
                        <div className="space-y-3">
                            {operations.map((op, i) => (
                                <div key={i} className="border rounded-lg">
                                    <div className="flex items-center justify-between px-3 py-2 bg-(--background-lighter) rounded-t-lg text-[11px]">
                                        <div className="flex items-center gap-2">
                                            <Scissors size={14} className="text-teal-500" />
                                            <span className="font-medium">
                                                {op.range || `Patch ${i + 1}`}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-3 border-t">
                                        <CodeHighlight className="language-typescript">
                                            {op.content}
                                        </CodeHighlight>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
