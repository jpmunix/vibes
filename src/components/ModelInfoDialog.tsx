
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { type LanguageModel } from "@/ipc/types";
import { BrainBadge } from "./BrainBadge";
import { PriceBadge } from "./PriceBadge";
import { AutoRouterBadge } from "./AutoRouterBadge";
import { Separator } from "@/components/ui/separator";

interface ModelInfoDialogProps {
    model: LanguageModel;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isAutoRouter?: boolean;
}

export function ModelInfoDialog({
    model,
    open,
    onOpenChange,
    isAutoRouter = false,
}: ModelInfoDialogProps) {
    const formatTokens = (num: number | undefined) => {
        if (num === undefined) return "---";
        if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toString();
    };

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
                    {/* Descripción, si existe */}
                    {model.description && (
                        <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
                            {model.description}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {/* Contexto y Tokens */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium leading-none">Capacidades</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <span className="text-muted-foreground">Contexto:</span>
                                <span className="font-mono">{formatTokens(model.contextWindow)}</span>

                                <span className="text-muted-foreground">Max Output:</span>
                                <span className="font-mono">{formatTokens(model.maxOutputTokens)}</span>
                            </div>
                        </div>

                        {/* Coste e Inteligencia */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium leading-none">Métricas</h4>
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Inteligencia:</span>
                                    <BrainBadge brainSigns={model.brainSigns} />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Coste:</span>
                                    <PriceBadge dollarSigns={model.dollarSigns} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Información Técnica */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium leading-none">Identificador</h4>
                        <div className="flex items-center justify-between bg-muted/50 p-2 rounded border font-mono text-xs overflow-hidden">
                            <span className="truncate select-all">{model.apiName}</span>
                            {model.id && <Badge variant="outline" className="ml-2 text-[10px]">ID: {model.id}</Badge>}
                        </div>
                    </div>

                    {/* Tags */}
                    {model.tag && (
                        <div className="flex gap-2 mt-2">
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
