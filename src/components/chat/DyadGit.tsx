import type React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
    ChevronsDownUp,
    ChevronsUpDown,
    GitBranch,
    Loader,
    CircleX,
} from "lucide-react";
import { CodeHighlight } from "./CodeHighlight";
import { CustomTagState } from "./stateTypes";

/** Maps git operation names to human-readable Spanish labels */
const OPERATION_LABELS: Record<string, string> = {
    status: "Estado",
    diff: "Diff",
    diff_file: "Diff archivo",
    log: "Historial",
    show_commit: "Detalle commit",
    current_branch: "Rama actual",
    list_branches: "Ramas",
    commit: "Commit",
    create_branch: "Crear rama",
    checkout: "Checkout",
    stash_save: "Stash guardar",
    stash_pop: "Stash aplicar",
    stash_list: "Stashes",
    revert_file: "Revertir archivo",
};

interface DyadGitProps {
    children?: ReactNode;
    node?: {
        properties?: {
            state?: CustomTagState;
            operation?: string;
            // Additional attributes that may be present
            [key: string]: string | undefined;
        };
    };
}

export const DyadGit: React.FC<DyadGitProps> = ({ children, node }) => {
    const [isContentVisible, setIsContentVisible] = useState(false);

    // State handling
    const state = node?.properties?.state as CustomTagState;
    const inProgress = state === "pending";
    const aborted = state === "aborted";

    // Get properties from node
    const operation = node?.properties?.operation || "";
    const operationLabel = OPERATION_LABELS[operation] || operation;

    // Build detail string from attributes
    const details: string[] = [];
    if (node?.properties?.file_path) details.push(node.properties.file_path);
    if (node?.properties?.commit) details.push(node.properties.commit);
    if (node?.properties?.branch) details.push(node.properties.branch);
    if (node?.properties?.ref) details.push(node.properties.ref);
    if (node?.properties?.message) details.push(`"${node.properties.message}"`);
    const detailStr = details.join(" · ");

    // Dynamic border styling
    const borderClass = inProgress
        ? "border-(--primary)"
        : aborted
            ? "border-red-500"
            : "border-orange-500/30";

    return (
        <div
            data-testid="vibes-git"
            className={`bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer ${borderClass}`}
            onClick={() => setIsContentVisible(!isContentVisible)}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <GitBranch size={16} className="text-orange-500" />
                    <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">
                        <span className="font-bold mr-2 outline-2 outline-orange-500/20 bg-orange-500/10 text-orange-500 rounded-md px-1">
                            GIT
                        </span>
                        {operationLabel}
                        {detailStr && (
                            <span className="ml-2 text-gray-500">{detailStr}</span>
                        )}
                    </span>
                    {inProgress && (
                        <div className="flex items-center text-orange-500 text-xs">
                            <Loader size={14} className="mr-1 animate-spin" />
                            <span>Consultando git...</span>
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
                            className="text-orange-500/70 hover:text-orange-500"
                        />
                    ) : (
                        <ChevronsUpDown
                            size={20}
                            className="text-orange-500/70 hover:text-orange-500"
                        />
                    )}
                </div>
            </div>
            {isContentVisible && (
                <div className="text-xs mt-2">
                    <CodeHighlight className="language-log">{children}</CodeHighlight>
                </div>
            )}
        </div>
    );
};
