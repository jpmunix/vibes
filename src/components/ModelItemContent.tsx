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
                <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px]">{model.displayName}</span>
                    {showAutoRouterBadge && <AutoRouterBadge />}
                </div>
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 ${isAutoRouter ? "grayscale opacity-40" : "opacity-90"}`}>
                        <PriceBadge dollarSigns={model.dollarSigns} />
                        <BrainBadge brainSigns={model.brainSigns} />
                    </div>
                    {model.tag && (
                        <span className="text-[9px] bg-primary/10 text-primary px-1 py-0 rounded-full font-medium">
                            {model.tag}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex justify-between items-center text-[10px] leading-tight pt-0.5">
                {!isAutoRouter ? (
                    <div className="flex items-center gap-3.5">
                        <div className="flex items-center gap-1">
                            <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-wider opacity-70">Ctx</span>
                            <span className="text-foreground font-medium">{formatTokens(model.contextWindow)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-wider opacity-70">Max</span>
                            <span className="text-foreground font-medium">{formatTokens(model.maxOutputTokens)}</span>
                        </div>
                    </div>
                ) : (
                    <span className="text-[9px] opacity-70">Inteligencia auto-gestionada</span>
                )}
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
