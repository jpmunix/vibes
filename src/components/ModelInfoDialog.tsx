
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
} from "lucide-react";
import { useState } from "react";

interface ModelInfoDialogProps {
    model: LanguageModel;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isAutoRouter?: boolean;
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
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
            <div className="flex gap-2">
                {modalities.map((mod) => {
                    const info = MODALITY_ICONS[mod] || { icon: FileText, label: mod };
                    const Icon = info.icon;
                    return (
                        <div
                            key={mod}
                            className="p-1.5 rounded-md bg-muted text-muted-foreground"
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
            className="w-full bg-muted p-3 rounded-md text-sm text-muted-foreground text-left group cursor-pointer"
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
}: ModelInfoDialogProps) {
    const formatTokens = (num: number | undefined) => {
        if (num === undefined) return "—";
        if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toString();
    };

    const inputPrice = formatPrice(model.pricingInput);
    const outputPrice = formatPrice(model.pricingOutput);
    const isFree = inputPrice === "Gratis" && outputPrice === "Gratis";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {model.displayName}
                        {isAutoRouter && <AutoRouterBadge />}
                    </DialogTitle>
                    <DialogDescription>Detalles técnicos del modelo</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-2">
                    {/* Description */}
                    {model.description && (
                        <ExpandableDescription text={model.description} />
                    )}

                    {/* Pricing */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium leading-none">Precios</h4>
                        {isFree ? (
                            <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                ✦ Gratis
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Input</div>
                                    <div className="text-sm font-semibold font-mono">{inputPrice}</div>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Output</div>
                                    <div className="text-sm font-semibold font-mono">{outputPrice}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Context & Output tokens */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Ventana de contexto</span>
                            <div className="text-sm font-mono font-semibold">{formatTokens(model.contextWindow)} tokens</div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Máx. salida</span>
                            <div className="text-sm font-mono font-semibold">{formatTokens(model.maxOutputTokens)} tokens</div>
                        </div>
                    </div>

                    <Separator />

                    {/* Modalities */}
                    {(model.inputModalities || model.outputModalities) && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium leading-none flex items-center gap-2">
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
                        <h4 className="text-sm font-medium leading-none">Identificador</h4>
                        <div className="flex items-center justify-between bg-muted/50 p-2 rounded border font-mono text-xs overflow-hidden">
                            <span className="truncate select-all">{model.apiName}</span>
                            {model.id && <Badge variant="outline" className="ml-2 text-[10px]">ID: {model.id}</Badge>}
                        </div>
                    </div>

                    {/* Tags */}
                    {model.tag && (
                        <div className="flex gap-2">
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold uppercase tracking-tighter">
                                {model.tag}
                            </span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
