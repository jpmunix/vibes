import type React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
    ChevronsDownUp,
    ChevronsUpDown,
    CheckCircle2,
    AlertTriangle,
    FileSearch,
} from "lucide-react";

interface DyadTypecheckSummaryProps {
    children?: ReactNode;
    node?: {
        properties?: {
            "has-errors"?: string;
            [key: string]: string | undefined;
        };
    };
}

interface ParsedEntry {
    status: "ok" | "error";
    label: string;
    detail?: string;
}

function parseEntries(content: string): ParsedEntry[] {
    const entries: ParsedEntry[] = [];
    const rawLines = content.split("\n");
    let current: ParsedEntry | null = null;

    for (const line of rawLines) {
        if (line.startsWith("OK:")) {
            if (current) entries.push(current);
            current = { status: "ok", label: line.slice(3) };
        } else if (line.startsWith("ERR:")) {
            if (current) entries.push(current);
            current = { status: "error", label: line.slice(4) };
        } else if (current && current.status === "error" && line.trim()) {
            current.detail = current.detail ? current.detail + "\n" + line : line;
        }
    }
    if (current) entries.push(current);
    return entries;
}

export const DyadTypecheckSummary: React.FC<DyadTypecheckSummaryProps> = ({ children, node }) => {
    const forceOpen = node?.properties?.["force-open"] === "true";
    const [isContentVisible, setIsContentVisible] = useState(forceOpen);

    const hasErrors = node?.properties?.["has-errors"] === "true";
    const content = typeof children === "string" ? children : "";
    const entries = parseEntries(content);

    const errorCount = entries.filter(e => e.status === "error").length;
    const okCount = entries.filter(e => e.status === "ok").length;

    const summaryText = hasErrors
        ? `${errorCount} con errores, ${okCount} sin errores`
        : `${okCount} archivo${okCount !== 1 ? "s" : ""} sin errores`;

    const borderClass = hasErrors
        ? "border-amber-500/30"
        : "border-emerald-500/30";

    const iconColor = hasErrors ? "text-amber-500" : "text-emerald-500";

    return (
        <div
            data-testid="dyad-typecheck-summary"
            className={`bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer ${borderClass}`}
            onClick={() => setIsContentVisible(!isContentVisible)}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileSearch size={16} className={iconColor} />
                    <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">
                        <span className={`font-bold mr-2 outline-2 ${hasErrors ? "outline-amber-500/20 bg-amber-500/10 text-amber-500" : "outline-emerald-500/20 bg-emerald-500/10 text-emerald-500"} rounded-md px-1`}>
                            TSC
                        </span>
                        {summaryText}
                    </span>
                </div>
                <div className="flex items-center">
                    {isContentVisible ? (
                        <ChevronsDownUp
                            size={20}
                            className={`${iconColor} opacity-70 hover:opacity-100`}
                        />
                    ) : (
                        <ChevronsUpDown
                            size={20}
                            className={`${iconColor} opacity-70 hover:opacity-100`}
                        />
                    )}
                </div>
            </div>
            {isContentVisible && (
                <div className="mt-2 space-y-1">
                    {entries.map((entry, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                            {entry.status === "ok" ? (
                                <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                            ) : (
                                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                                <span className={`font-medium ${entry.status === "ok" ? "text-emerald-400" : "text-amber-400"}`}>
                                    {entry.label}
                                </span>
                                {entry.status === "ok" && (
                                    <span className="text-gray-500 ml-1">— sin errores</span>
                                )}
                                {entry.detail && (
                                    <pre className="text-red-400/80 mt-0.5 whitespace-pre-wrap break-all font-mono text-[11px] leading-tight">
                                        {entry.detail.trim()}
                                    </pre>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
