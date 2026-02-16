import React from "react";
import { LanguageModel } from "@/ipc/types";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { Info } from "lucide-react";

interface ModelItemContentProps {
    model: LanguageModel;
    showAutoRouterBadge?: boolean;
    isAutoRouter?: boolean;
    onInfoClick?: (model: LanguageModel) => void;
}

export function ModelItemContent({
    model,
    showAutoRouterBadge = false,
    isAutoRouter = false,
    onInfoClick,
}: ModelItemContentProps) {

    const formatTokens = (num: number | undefined) => {
        if (num === undefined) return "---";
        if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toString();
    };

    return (
        <div className="flex items-center justify-between w-full gap-2 py-0.5 group">
            <div className="flex flex-col gap-0 overflow-hidden flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] text-foreground truncate">
                        {model.displayName}
                    </span>
                    {showAutoRouterBadge && <AutoRouterBadge />}
                </div>
                <span className="text-[10px] text-muted-foreground truncate leading-tight">
                    {isAutoRouter ? (
                        "Gestión automática"
                    ) : (
                        <>
                            {formatTokens(model.contextWindow)} context
                        </>
                    )}
                </span>
            </div>

            {onInfoClick && (
                <div
                    className="flex items-center shrink-0"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onInfoClick(model);
                        }}
                        className="p-1 hover:bg-muted rounded text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Ver detalles"
                    >
                        <Info size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
