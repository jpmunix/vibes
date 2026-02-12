import React from "react";
import { LanguageModel } from "@/ipc/types";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { PriceBadge } from "./PriceBadge";
import { BrainBadge } from "./BrainBadge";

interface ModelItemContentProps {
    model: LanguageModel;
    showAutoRouterBadge?: boolean;
    isAutoRouter?: boolean;
}

export function ModelItemContent({
    model,
    showAutoRouterBadge = false,
    isAutoRouter = false,
}: ModelItemContentProps) {
    return (
        <div className="flex flex-col w-full gap-0.5 py-0">
            <div className="flex justify-between items-center leading-tight">
                <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[13px]">{model.displayName}</span>
                    {showAutoRouterBadge && <AutoRouterBadge />}
                </div>
                {model.tag && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1 py-0 rounded-full font-medium">
                        {model.tag}
                    </span>
                )}
            </div>
            <div className="flex justify-between items-center text-[10px] text-muted-foreground/60 leading-tight">
                {!isAutoRouter ? (
                    <div className="flex items-center gap-1 font-mono">
                        <span className="opacity-40">in:</span>
                        <span className="font-medium text-foreground/70">
                            {formatTokens(model.contextWindow)}
                        </span>
                        <span className="mx-0 opacity-20">/</span>
                        <span className="opacity-40">out:</span>
                        <span className="font-medium text-foreground/70">
                            {formatTokens(model.maxOutputTokens)}
                        </span>
                    </div>
                ) : (
                    <span className="text-[9px] opacity-70">Inteligencia auto-gestionada</span>
                )}
                <div className={`flex items-center gap-1 ${isAutoRouter ? "grayscale opacity-50" : "opacity-80"}`}>
                    <PriceBadge dollarSigns={model.dollarSigns} />
                    <BrainBadge brainSigns={model.brainSigns} />
                </div>
            </div>
        </div>
    );
}

const formatTokens = (num: number | undefined) => {
    if (num === undefined) return "---";
    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
};
