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
        <div className="flex flex-col w-full gap-1.5 py-0.5">
            <div className="flex justify-between items-center leading-tight w-full">
                <div className="flex items-center gap-2 flex-1">
                    <span className="font-semibold text-[14px] text-foreground">{model.displayName}</span>
                    {showAutoRouterBadge && <AutoRouterBadge />}
                </div>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 ${isAutoRouter ? "grayscale opacity-40" : "opacity-90"}`}>
                        <PriceBadge dollarSigns={model.dollarSigns} />
                        <BrainBadge brainSigns={model.brainSigns} />
                    </div>
                </div>
            </div>
            <div className="flex justify-between items-center text-[10px] leading-tight pt-0">
                {!isAutoRouter ? (
                    <div className="flex items-center gap-4 opacity-70">
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-wider">Ctx</span>
                            <span className="text-foreground font-medium">{formatTokens(model.contextWindow)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-wider">Max</span>
                            <span className="text-foreground font-medium">{formatTokens(model.maxOutputTokens)}</span>
                        </div>
                    </div>
                ) : (
                    <span className="text-[9px] opacity-60">Inteligencia auto-gestionada</span>
                )}
                {model.tag && (
                    <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold uppercase tracking-tighter">
                        {model.tag}
                    </span>
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

