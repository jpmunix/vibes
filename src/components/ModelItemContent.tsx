import React from "react";
import { LanguageModel } from "@/ipc/types";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { Info, X, Type, Image, Music, Video, FileText, ArrowRight } from "@/components/ui/icons";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip";

interface ModelItemContentProps {
    model: LanguageModel;
    showAutoRouterBadge?: boolean;
    isAutoRouter?: boolean;
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

function formatTokens(num: number | undefined): string {
    if (num === undefined) return "—";
    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
}

const MODALITY_ICONS: Record<string, { icon: React.ElementType; label: string }> = {
    text: { icon: Type, label: "Texto" },
    image: { icon: Image, label: "Imagen" },
    audio: { icon: Music, label: "Audio" },
    video: { icon: Video, label: "Video" },
    file: { icon: FileText, label: "Archivo" },
};

function ModalityRow({ input, output }: { input?: string[]; output?: string[] }) {
    if (!input && !output) return null;
    const renderIcons = (modalities: string[]) =>
        modalities.map((mod) => {
            const info = MODALITY_ICONS[mod] || { icon: FileText, label: mod };
            const Icon = info.icon;
            return (
                <div key={mod} className="p-1.5 rounded-md bg-muted/60" title={info.label}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
            );
        });

    return (
        <div className="flex items-center gap-2.5 pt-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">Entrada</span>
            <div className="flex gap-1.5">{input && renderIcons(input)}</div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">Salida</span>
            <div className="flex gap-1.5">{output && renderIcons(output)}</div>
        </div>
    );
}

export function ModelItemContent({
    model,
    showAutoRouterBadge = false,
    isAutoRouter = false,
    onRemoveClick,
}: ModelItemContentProps) {

    const hasPricing = model.pricingInput || model.pricingOutput;
    const inputPrice = formatPricePerMillion(model.pricingInput);
    const outputPrice = formatPricePerMillion(model.pricingOutput);
    const isFree = inputPrice === "gratis" && outputPrice === "gratis";

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

            {(onRemoveClick || !isAutoRouter) && (
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
                    {!isAutoRouter && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div
                                    className="p-1 hover:bg-muted rounded text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                                    onPointerDown={(e) => e.preventDefault()}
                                >
                                    <Info size={14} />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent
                                side="right"
                                sideOffset={10}
                                className="model-info-hover-card p-5 max-w-[380px]"
                            >
                                <div className="flex flex-col gap-3.5">
                                    {/* Model name */}
                                    <div className="font-semibold text-base leading-snug">
                                        {model.displayName}
                                    </div>

                                    {/* Pricing — inline */}
                                    {hasPricing && (
                                        <div className="flex items-center gap-3 text-[13px]">
                                            {isFree ? (
                                                <span className="text-emerald-400 font-medium">✦ Gratis</span>
                                            ) : (
                                                <>
                                                    <span className="text-muted-foreground">In</span>
                                                    <span className="font-semibold tabular-nums">{inputPrice}</span>
                                                    <span className="text-muted-foreground/30">·</span>
                                                    <span className="text-muted-foreground">Out</span>
                                                    <span className="font-semibold tabular-nums">{outputPrice}</span>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Context & Max output — inline */}
                                    <div className="flex items-center gap-3 text-[13px]">
                                        <span className="text-muted-foreground">Contexto</span>
                                        <span className="font-semibold tabular-nums">{formatTokens(model.contextWindow)}</span>
                                        <span className="text-muted-foreground/30">·</span>
                                        <span className="text-muted-foreground">Máx. salida</span>
                                        <span className="font-semibold tabular-nums">{formatTokens(model.maxOutputTokens)}</span>
                                    </div>

                                    {/* Modalities */}
                                    {(model.inputModalities || model.outputModalities) && (
                                        <ModalityRow
                                            input={model.inputModalities}
                                            output={model.outputModalities}
                                        />
                                    )}

                                    {/* Tag (e.g. Reasoning) */}
                                    {model.tag && (
                                        <div className="flex pt-1">
                                            <span className="text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-purple-500/15 text-purple-400">
                                                {model.tag}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )}
        </div>
    );
}
