
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { type LanguageModel } from "@/ipc/types";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { Separator } from "@/components/ui/separator";
import {
    Type,
    Image,
    Music,
    Video,
    FileText,
    ArrowRight,
    ChevronDown,
    Edit2,
    Check,
    X,
    Sparkles,
} from "@/components/ui/icons";
import { useState, useRef, useEffect } from "react";

interface ModelInfoDialogProps {
    model: LanguageModel;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isAutoRouter?: boolean;
    /** Current alias for this model (if any) */
    alias?: string;
    /** Callback to save an alias */
    onSetAlias?: (alias: string) => void;
    /** Callback to remove the alias */
    onRemoveAlias?: () => void;
}

const MODALITY_ICONS: Record<string, { icon: React.ElementType; label: string }> = {
    text: { icon: Type, label: "Texto" },
    image: { icon: Image, label: "Imagen" },
    audio: { icon: Music, label: "Audio" },
    video: { icon: Video, label: "Video" },
    file: { icon: FileText, label: "Archivo" },
};

function formatPrice(pricePerToken: string | undefined): string {
    if (!pricePerToken) return "—";
    const price = parseFloat(pricePerToken);
    if (isNaN(price)) return "—";
    if (price === 0) return "Gratis";
    // Price is per token, convert to per 1M tokens
    const perMillion = price * 1_000_000;
    if (perMillion < 0.01) return `$${perMillion.toFixed(4)}/M`;
    if (perMillion < 1) return `$${perMillion.toFixed(3)}/M`;
    return `$${perMillion.toFixed(2)}/M`;
}

function ModalityBadges({ modalities, label }: { modalities?: string[]; label: string }) {
    if (!modalities || modalities.length === 0) return null;
    return (
        <div className="space-y-2">
            <span className="typo-micro uppercase">{label}</span>
            <div className="flex gap-2">
                {modalities.map((mod) => {
                    const info = MODALITY_ICONS[mod] || { icon: FileText, label: mod };
                    const Icon = info.icon;
                    return (
                        <div
                            key={mod}
                            className="p-1.5 rounded-md bg-muted typo-caption"
                            title={info.label}
                        >
                            <Icon className="w-4 h-4" />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ExpandableDescription({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full bg-muted p-3 rounded-md typo-caption text-left group cursor-pointer"
        >
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    {expanded ? (
                        <p>{text}</p>
                    ) : (
                        <p className="line-clamp-3">{text}</p>
                    )}
                </div>
                <ChevronDown
                    className={`size-4 shrink-0 mt-0.5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""
                        }`}
                />
            </div>
        </button>
    );
}

export function ModelInfoDialog({
    model,
    open,
    onOpenChange,
    isAutoRouter = false,
    alias,
    onSetAlias,
    onRemoveAlias,
}: ModelInfoDialogProps) {
    const [isEditingAlias, setIsEditingAlias] = useState(false);
    const [aliasValue, setAliasValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const formatTokens = (num: number | undefined) => {
        if (num === undefined) return "—";
        if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toString();
    };

    const inputPrice = formatPrice(model.pricingInput);
    const outputPrice = formatPrice(model.pricingOutput);
    const isFree = inputPrice === "Gratis" && outputPrice === "Gratis";

    // Focus input when editing starts
    useEffect(() => {
        if (isEditingAlias && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditingAlias]);

    // Reset editing state when dialog closes
    useEffect(() => {
        if (!open) {
            setIsEditingAlias(false);
        }
    }, [open]);

    const startEditingAlias = () => {
        setAliasValue(alias || model.displayName);
        setIsEditingAlias(true);
    };

    const confirmAlias = () => {
        const trimmed = aliasValue.trim();
        if (trimmed && trimmed !== model.displayName) {
            onSetAlias?.(trimmed);
        } else {
            // Reverted to original or cleared — remove alias
            onRemoveAlias?.();
        }
        setIsEditingAlias(false);
    };

    const cancelAlias = () => {
        setIsEditingAlias(false);
    };

    const clearAlias = () => {
        onRemoveAlias?.();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isEditingAlias ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={aliasValue}
                                    onChange={(e) => setAliasValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") confirmAlias();
                                        if (e.key === "Escape") cancelAlias();
                                    }}
                                    placeholder={model.displayName}
                                    className="flex-1 min-w-0 bg-background border border-border rounded-md px-3 py-1 text-base font-semibold outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={confirmAlias}
                                    className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors cursor-pointer"
                                    title="Guardar"
                                >
                                    <Check size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelAlias}
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                                    title="Cancelar"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <span className="truncate">{alias || model.displayName}</span>
                                {isAutoRouter && <AutoRouterBadge />}
                                {onSetAlias && !isAutoRouter && (
                                    <button
                                        type="button"
                                        onClick={startEditingAlias}
                                        className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground/50 hover:text-primary transition-colors cursor-pointer shrink-0"
                                        title={alias ? "Editar alias" : "Poner alias"}
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                )}
                                {alias && onRemoveAlias && (
                                    <button
                                        type="button"
                                        onClick={clearAlias}
                                        className="p-1 rounded-md hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-500 transition-colors cursor-pointer shrink-0"
                                        title="Quitar alias"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </>
                        )}
                    </DialogTitle>
                    {alias && !isEditingAlias && (
                        <p className="text-[13px] text-muted-foreground -mt-1">{model.displayName}</p>
                    )}
                    <DialogDescription>Detalles técnicos del modelo</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-2">

                    {/* Description */}
                    {model.description && (
                        <ExpandableDescription text={model.description} />
                    )}

                    {/* Pricing */}
                    <div className="space-y-2">
                        <h4 className="typo-label">Precios</h4>
                        {isFree ? (
                            <div className="typo-body font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <Sparkles size={14} /> Gratis
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <div className="typo-micro uppercase tracking-widest mb-1">Input</div>
                                    <div className="typo-mono font-semibold">{inputPrice}</div>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <div className="typo-micro uppercase tracking-widest mb-1">Output</div>
                                    <div className="typo-mono font-semibold">{outputPrice}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Context & Output tokens */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <span className="typo-caption">Ventana de contexto</span>
                            <div className="typo-mono font-semibold">{formatTokens(model.contextWindow)} tokens</div>
                        </div>
                        <div className="space-y-1">
                            <span className="typo-caption">Máx. salida</span>
                            <div className="typo-mono font-semibold">{formatTokens(model.maxOutputTokens)} tokens</div>
                        </div>
                    </div>

                    <Separator />

                    {/* Modalities */}
                    {(model.inputModalities || model.outputModalities) && (
                        <div className="space-y-3">
                            <h4 className="typo-label flex items-center gap-2">
                                Modalidades
                            </h4>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <ModalityBadges modalities={model.inputModalities} label="Entrada" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                                <div className="flex-1">
                                    <ModalityBadges modalities={model.outputModalities} label="Salida" />
                                </div>
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* Technical ID */}
                    <div className="space-y-2">
                        <h4 className="typo-label">Identificador</h4>
                        <div className="flex items-center justify-between bg-muted/50 p-2 rounded border typo-mono-xs overflow-hidden">
                            <span className="truncate select-all">{model.apiName}</span>
                            {model.id && <Badge variant="outline" className="ml-2 text-xs">ID: {model.id}</Badge>}
                        </div>
                    </div>

                    {/* Tags */}
                    {model.tag && (
                        <div className="flex gap-2">
                            <span className="typo-badge uppercase tracking-tighter">
                                {model.tag}
                            </span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
