import React from "react";
import { LanguageModel } from "@/ipc/types";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { X, Image } from "@/components/ui/icons";
import type { I18nApi } from "@/lib/i18n";

interface ModelItemContentProps {
    model: LanguageModel;
    showAutoRouterBadge?: boolean;
    isAutoRouter?: boolean;
    onRemoveClick?: (model: LanguageModel) => void;
    providerLabel?: string;
    /**
     * Función de traducción inyectada desde el padre (#VIBES-204).
     * Hoist del hook useI18n: con ~400 modelos en el selector, llamar al hook
     * dentro de cada item suponía ~400 subscripciones a Jotai por apertura.
     */
    t: I18nApi["t"];
}

/**
 * Formats a number of tokens into a compact human-readable string ("262K", "1M").
 */
function formatTokens(num: number | undefined): string {
    if (num === undefined) return "—";
    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
}

/**
 * Ultra-lightweight model list item.
 * Shows: display name (+ auto-router badge when applicable), context window
 * and provider label. NO pricing, NO alias editing, NO modality icons,
 * NO info tooltip — keeps the DOM minimal for huge model lists.
 */
export function ModelItemContent({
    model,
    showAutoRouterBadge = false,
    isAutoRouter = false,
    onRemoveClick,
    providerLabel,
    t,
}: ModelItemContentProps) {
    return (
        <div className="flex items-center justify-between w-full gap-2 py-0.5 group">
            <div className="flex flex-col gap-0 overflow-hidden flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="!font-medium truncate">
                        {model.displayName}
                    </span>
                    {showAutoRouterBadge && <AutoRouterBadge />}
                </div>
                <div className="flex items-center justify-between w-full min-w-0 typo-caption leading-tight mt-0.5">
                    {isAutoRouter ? (
                        <span className="truncate">{t("modelItem.autoManage")}</span>
                    ) : (
                        <>
                            <div className="flex items-center gap-1 min-w-0 truncate">
                                {model.inputModalities?.includes("image") && (
                                    <span title={t("modelItem.supportsImages")}>
                                        <Image
                                            className="shrink-0 text-primary/70"
                                            size={10}
                                        />
                                    </span>
                                )}
                                {model.contextWindow && model.contextWindow > 0 ? (
                                    <span className="text-foreground/80 truncate">
                                        {formatTokens(model.contextWindow)} context
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground/50 italic truncate">
                                        Sin información
                                    </span>
                                )}
                            </div>

                            {providerLabel ? (
                                <span className="text-primary/70 font-medium shrink-0 text-[9px] ml-2">
                                    {providerLabel}
                                </span>
                            ) : null}
                        </>
                    )}
                </div>
            </div>

            {onRemoveClick && (
                <div
                    className="flex items-center shrink-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                    }}
                    onPointerUp={(e) => {
                        e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onRemoveClick(model);
                        }}
                        className="p-1 hover:bg-red-500/10 rounded text-muted-foreground/50 hover:text-red-500 transition-colors cursor-pointer mr-0.5"
                        title={t("modelItem.removeFromRecents")}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
