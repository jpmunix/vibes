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

interface VibesTypecheckSummaryProps {
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

export const VibesTypecheckSummary: React.FC<VibesTypecheckSummaryProps> = ({ children }) => {
    const content = typeof children === "string" ? children : "";
    const entries = parseEntries(content);

    return (
        <div data-testid="vibes-typecheck-summary" className="mt-2 space-y-1">
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
                            <pre className="text-red-400/80 mt-0.5 whitespace-pre-wrap break-all font-mono text-xs leading-tight">
                                {entry.detail.trim()}
                            </pre>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
