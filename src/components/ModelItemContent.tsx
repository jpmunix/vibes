import React, { useState, useRef, useEffect } from "react";
import { LanguageModel } from "@/ipc/types";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { Info, X, Type, Image, Music, Video, FileText, ArrowRight, Edit2, Check, Sparkles } from "@/components/ui/icons";
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
    /** User-defined alias for this model (if set) */
    alias?: string;
    /** Callback to set/update the alias */
    onSetAlias?: (model: LanguageModel, alias: string) => void;
    /** Callback to remove the alias */
    onRemoveAlias?: (model: LanguageModel) => void;
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
    alias,
    onSetAlias,
    onRemoveAlias,
}: ModelItemContentProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const hasPricing = model.pricingInput || model.pricingOutput;
    const inputPrice = formatPricePerMillion(model.pricingInput);
    const outputPrice = formatPricePerMillion(model.pricingOutput);
    const isFree = inputPrice === "gratis" && outputPrice === "gratis";

    const displayName = alias || model.displayName;

    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const startEditing = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setEditValue(alias || model.displayName);
        setIsEditing(true);
    };

    const confirmEdit = () => {
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== model.displayName) {
            onSetAlias?.(model, trimmed);
        } else if (!trimmed || trimmed === model.displayName) {
            // If the user cleared or reverted to original, remove the alias
            onRemoveAlias?.(model);
        }
        setIsEditing(false);
    };

    const cancelEdit = () => {
        setIsEditing(false);
    };

    return (
        <div 
            className="flex items-center justify-between w-full gap-2 py-0.5 group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex flex-col gap-0 overflow-hidden flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <div
                            className="flex items-center gap-1 flex-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <input
                                ref={inputRef}
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") confirmEdit();
                                    if (e.key === "Escape") cancelEdit();
                                }}
                                onBlur={confirmEdit}
                                className="flex-1 min-w-0 bg-background/80 border border-primary/40 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                                placeholder={model.displayName}
                            />
                            <button
                                type="button"
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    confirmEdit();
                                }}
                                className="p-0.5 hover:bg-primary/10 rounded text-primary transition-colors cursor-pointer"
                            >
                                <Check size={12} />
                            </button>
                        </div>
                    ) : (
                        <span className="!font-medium truncate">
                            {displayName}
                        </span>
                    )}
                    {showAutoRouterBadge && <AutoRouterBadge />}
                </div>
                <span className="typo-caption truncate leading-tight inline-flex items-center gap-1">
                    {isAutoRouter ? (
                        "Gestión automática"
                    ) : (
                        <>
                            {model.inputModalities?.includes("image") && (
                                <Image
                                    className="shrink-0 text-primary/70"
                                    style={{ width: 10, height: 10 }}
                                    title="Soporta imágenes"
                                />
                            )}
                            <span>{formatTokens(model.contextWindow)} context</span>
                        </>
                    )}
                </span>
            </div>

            {isHovered && (onRemoveClick || !isAutoRouter || onSetAlias) && !isEditing && (
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
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onRemoveClick(model);
                            }}
                            className="p-1 hover:bg-red-500/10 rounded text-muted-foreground/50 hover:text-red-500 transition-colors cursor-pointer mr-0.5"
                            title="Eliminar de recientes"
                        >
                            <X size={14} />
                        </button>
                    )}
                    {onSetAlias && !isAutoRouter && (
                        <button
                            type="button"
                            onClick={startEditing}
                            className="p-1 hover:bg-primary/10 rounded text-muted-foreground/50 hover:text-primary transition-colors cursor-pointer mr-0.5"
                            title={alias ? "Editar alias" : "Poner alias"}
                        >
                            <Edit2 size={14} />
                        </button>
                    )}
                    {!isAutoRouter && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div
                                    className="p-1 hover:bg-muted rounded text-muted-foreground/50 hover:text-foreground transition-colors"
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
                                    <div>
                                        <div className="font-semibold text-base leading-snug">
                                            {alias || model.displayName}
                                        </div>
                                        {alias && (
                                            <div className="text-[13px] text-muted-foreground">
                                                {model.displayName}
                                            </div>
                                        )}
                                    </div>

                                    {/* Pricing — inline */}
                                    {hasPricing && (
                                        <div className="flex items-center gap-3 text-[13px]">
                                            {isFree ? (
                                                <span className="text-emerald-400 font-medium flex items-center gap-1"><Sparkles size={11} /> Gratis</span>
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
