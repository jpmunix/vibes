/**
 * Shared recursive two-column table viewer for JSON-like data.
 * Used in admin user settings and knowledge base sections.
 */
import { useState } from "react";
import { ChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** Describes the size of a complex value */
function describeComplex(val: unknown): string {
    if (Array.isArray(val)) {
        const n = val.length;
        return n === 0 ? "[ ] vacío" : `${n} elemento${n !== 1 ? "s" : ""}`;
    }
    if (typeof val === "object" && val !== null) {
        const n = Object.keys(val).length;
        return n === 0 ? "{ } vacío" : `${n} propiedad${n !== 1 ? "es" : ""}`;
    }
    return "";
}

function isComplex(val: unknown): boolean {
    return val !== null && typeof val === "object";
}

/** A two-column table that renders key–value pairs, with expandable rows for nested data */
export function SettingsTable({ entries }: { entries: [string, unknown][] }) {
    return (
        <table className="w-full text-sm">
            <tbody>
                {entries.map(([key, val]) => (
                    <SettingsRow key={key} label={key} value={val} />
                ))}
            </tbody>
        </table>
    );
}

function SettingsRow({ label, value }: { label: string; value: unknown }) {
    const complex = isComplex(value);
    const [expanded, setExpanded] = useState(false);

    // Nested entries when expanded
    const nestedEntries: [string, unknown][] = expanded
        ? Array.isArray(value)
            ? value.map((item, idx) => [`[${idx}]`, item])
            : typeof value === "object" && value !== null
                ? Object.entries(value as Record<string, unknown>)
                : []
        : [];

    return (
        <>
            <tr
                className={cn(
                    "border-t border-border/30 first:border-t-0 transition-colors",
                    complex ? "hover:bg-muted/50 cursor-pointer" : "hover:bg-muted/20",
                )}
                onClick={complex ? () => setExpanded((e) => !e) : undefined}
            >
                {/* Key column */}
                <td className="px-4 py-2.5 align-top text-left">
                    <div className="flex items-center gap-1.5">
                        {complex && (
                            <ChevronRight
                                className={cn(
                                    "size-3.5 text-muted-foreground/50 transition-transform duration-150 shrink-0",
                                    expanded && "rotate-90",
                                )}
                            />
                        )}
                        <span className="typo-caption text-muted-foreground break-all">{label}</span>
                    </div>
                </td>

                {/* Value column */}
                <td className="px-4 py-2.5 align-top text-right">
                    {complex ? (
                        <span className="typo-caption text-muted-foreground/70 italic">
                            {describeComplex(value)}
                        </span>
                    ) : (
                        <ValueDisplay value={value} />
                    )}
                </td>
            </tr>

            {/* Nested sub-table */}
            {expanded && nestedEntries.length > 0 && (
                <tr>
                    <td colSpan={2} className="p-0">
                        <div className="ml-6 border-l-2 border-border/30">
                            <SettingsTable entries={nestedEntries} />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

/** Renders a primitive value with appropriate styling */
function ValueDisplay({ value }: { value: unknown }) {
    if (value === null || value === undefined) {
        return <span className="typo-caption italic text-muted-foreground/50">null</span>;
    }

    if (typeof value === "boolean") {
        return (
            <span className={cn(
                "typo-caption font-mono px-1.5 py-0.5 rounded",
                value
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground bg-muted/50",
            )}>
                {value ? "true" : "false"}
            </span>
        );
    }

    if (typeof value === "number") {
        return <span className="typo-caption font-mono text-primary">{value}</span>;
    }

    if (typeof value === "string") {
        if (value === "") {
            return <span className="typo-caption italic text-muted-foreground/50">""</span>;
        }
        return (
            <span className="typo-caption font-mono text-foreground/80 break-all select-all">
                {value}
            </span>
        );
    }

    return <span className="typo-caption">{String(value)}</span>;
}
