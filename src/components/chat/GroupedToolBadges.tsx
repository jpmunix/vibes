import React, { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronUp, Wrench, type LucideIcon } from "lucide-react";
import { TOOL_META, resolveToolMeta, type ToolBadgeState } from "./CompactToolBadge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export interface BadgeItem {
    tag: string;
    state: ToolBadgeState;
    detail?: string;
    originalContent: React.ReactNode;
    attributes?: Record<string, string>;
}

interface GroupEntry {
    tag: string;
    icon: LucideIcon;
    label: string;
    color: string;
    items: BadgeItem[];
}

/** Minimum number of badges before grouping kicks in */
const GROUP_THRESHOLD = 4;

interface GroupedToolBadgesProps {
    badges: BadgeItem[];
    isStreaming?: boolean;
    isFirstGroup?: boolean;
}

/**
 * Groups finished tool badges by type and renders:
 * - Collapsed (default): compact bar with icon + ×N per type
 * - Expanded: full list of each individual action, clickable to open modal
 *
 * If fewer than GROUP_THRESHOLD badges, renders them individually (ungrouped).
 */
export const GroupedToolBadges: React.FC<GroupedToolBadgesProps> = ({ badges, isStreaming, isFirstGroup }) => {
    const [isExpanded, setIsExpanded] = useState(!!(isStreaming && isFirstGroup));

    // Auto-collapse when streaming ends
    useEffect(() => {
        if (!isStreaming && isFirstGroup) {
            setIsExpanded(false);
        }
    }, [isStreaming, isFirstGroup]);
    const [modalItem, setModalItem] = useState<BadgeItem | null>(null);

    // Group badges by icon (not tag), so tools sharing an icon merge in the summary
    const groups: GroupEntry[] = useMemo(() => {
        const seen = new Map<string, GroupEntry>();
        for (const b of badges) {
            const meta = resolveToolMeta(b.tag, b.attributes);
            // Use icon.displayName as grouping key so e.g. Pencil groups write+edit+search-replace
            const iconKey = meta.icon.displayName || meta.icon.name || b.tag;
            if (seen.has(iconKey)) {
                seen.get(iconKey)!.items.push(b);
            } else {
                seen.set(iconKey, {
                    tag: b.tag,
                    icon: meta.icon,
                    label: meta.label,
                    color: meta.color,
                    items: [b],
                });
            }
        }
        return Array.from(seen.values());
    }, [badges]);

    // If few badges, render them inline without grouping
    if (badges.length < GROUP_THRESHOLD) {
        return (
            <div className="flex flex-wrap items-center gap-1">
                {badges.map((b, i) => {
                    const meta = resolveToolMeta(b.tag, b.attributes);
                    const Icon = meta.icon;
                    return (
                        <button
                            key={i}
                            onClick={() => setModalItem(b)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 hover:bg-accent text-xs transition-colors cursor-pointer"
                            title={`${meta.label}${b.detail ? ` · ${b.detail}` : ""}`}
                        >
                            <Icon size={12} className={meta.color} />
                            {b.detail && (
                                <span className="text-muted-foreground max-w-24 truncate">{b.detail}</span>
                            )}
                        </button>
                    );
                })}
                <ModalDialog item={modalItem} onClose={() => setModalItem(null)} />
            </div>
        );
    }

    return (
        <>
            {/* Summary bar */}
            <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
                {/* Collapsed summary row */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center gap-0.5 px-2 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                        {groups.map((group, i) => {
                            const Icon = group.icon;
                            return (
                                <React.Fragment key={i}>
                                    {i > 0 && (
                                        <div className="w-px h-3.5 bg-border/50 mx-0.5" />
                                    )}
                                    <div
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                                        title={group.label}
                                    >
                                        <Icon size={13} className={group.color} />
                                        {group.items.length > 1 && (
                                            <span className="text-[11px] text-muted-foreground font-medium">
                                                ×{group.items.length}
                                            </span>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    <div className="flex-shrink-0 ml-1 p-0.5 text-muted-foreground">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </button>

                {/* Expanded detail list */}
                {isExpanded && (
                    <div className="border-t border-border/30">
                        {badges.map((b, i) => {
                            const meta = resolveToolMeta(b.tag, b.attributes);
                            const Icon = meta.icon;
                            return (
                                <button
                                    key={i}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer text-left"
                                    onClick={() => setModalItem(b)}
                                >
                                    <Icon size={13} className={`${meta.color} flex-shrink-0`} />
                                    <span className="text-xs font-medium text-foreground/80">
                                        {meta.label}
                                    </span>
                                    {b.detail && (
                                        <span className="text-xs text-muted-foreground truncate">
                                            · {b.detail}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <ModalDialog item={modalItem} onClose={() => setModalItem(null)} />
        </>
    );
};

/** Shared modal for displaying tool content */
function ModalDialog({ item, onClose }: { item: BadgeItem | null; onClose: () => void }) {
    if (!item) return null;
    const meta = resolveToolMeta(item.tag, item.attributes);
    const Icon = meta.icon;

    return (
        <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-6xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 ${meta.color}`}>
                        <Icon size={20} />
                        {meta.label}
                        {item.detail && (
                            <span className="text-muted-foreground font-normal text-sm ml-1">{item.detail}</span>
                        )}
                    </DialogTitle>
                </DialogHeader>
                <div className="mt-2 overflow-hidden min-w-0">{item.originalContent}</div>
            </DialogContent>
        </Dialog>
    );
}
