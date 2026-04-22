import React from "react";
import { LanguageModel } from "@/ipc/types";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { Info, X } from "@/components/ui/icons";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip";

interface ModelItemContentProps {
    model: LanguageModel;
    showAutoRouterBadge?: boolean;
    isAutoRouter?: boolean;
    onInfoClick?: (model: LanguageModel) => void;
    onRemoveClick?: (model: LanguageModel) => void;
}

/**
 * Formats a per-token price string (e.g. "0.000003") into a human-readable
 * cost per million tokens (e.g. "$3.00/M").
 */
function formatPricePerMillion(pricePerToken: string | undefined): string {
    if (!pricePerToken) return "—";
    const num = parseFloat(pricePerToken);
    if (isNaN(num)) return "—";
    if (num === 0) return "gratis";
    const perMillion = num * 1_000_000;
    if (perMillion < 0.01) return `$${perMillion.toFixed(4)}/M`;
    if (perMillion < 1) return `$${perMillion.toFixed(2)}/M`;
    return `$${perMillion.toFixed(2)}/M`;
}

export function ModelItemContent({
    model,
    showAutoRouterBadge = false,
    isAutoRouter = false,
    onInfoClick,
    onRemoveClick,
}: ModelItemContentProps) {

    const formatTokens = (num: number | undefined) => {
        if (num === undefined) return "---";
        if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toString();
    };

    const hasPricing = model.pricingInput || model.pricingOutput;

    return (
        <div className="flex items-center justify-between w-full gap-2 py-0.5 group">
            <div className="flex flex-col gap-0 overflow-hidden flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="!font-medium truncate">
                        {model.displayName}
                    </span>
                    {showAutoRouterBadge && <AutoRouterBadge />}
                </div>
                <span className="typo-caption truncate leading-tight">
                    {isAutoRouter ? (
                        "Gestión automática"
                    ) : (
                        <>
                            {formatTokens(model.contextWindow)} context
                        </>
                    )}
                </span>
            </div>

            {(onInfoClick || onRemoveClick) && (
                <div
                    className="flex items-center shrink-0 z-10"
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
                    {onRemoveClick && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onRemoveClick(model);
                                    }}
                                    className="p-1 hover:bg-red-500/10 rounded text-muted-foreground/50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer mr-0.5"
                                >
                                    <X size={14} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={4}>
                                Eliminar de recientes
                            </TooltipContent>
                        </Tooltip>
                    )}
                    {onInfoClick && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onInfoClick(model);
                                    }}
                                    className="p-1 hover:bg-muted rounded text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                >
                                    <Info size={14} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent
                                side="right"
                                sideOffset={6}
                                className="model-pricing-tooltip"
                            >
                                {hasPricing ? (
                                    <div className="flex flex-col gap-1 py-0.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium">In</span>
                                            <span className="font-semibold tabular-nums">{formatPricePerMillion(model.pricingInput)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium">Out</span>
                                            <span className="font-semibold tabular-nums">{formatPricePerMillion(model.pricingOutput)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <span>Ver detalles</span>
                                )}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )}
        </div>
    );
}
