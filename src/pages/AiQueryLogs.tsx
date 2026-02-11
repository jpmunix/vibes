import React, { useEffect, useState } from "react";
import { ipc } from "@/ipc/types";
import type { AiQueryLog } from "@/ipc/types/ai_query_logs";
import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Database, Code, Cpu, Sparkles, Trash2, History, Download, Bug } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { AiQueryLogRotationSelector } from "@/components/AiQueryLogRotationSelector";
import { toast } from "sonner";
import JSZip from "jszip";

export default function AiQueryLogsPage() {
    const [logs, setLogs] = useState<Partial<AiQueryLog>[]>([]);
    const [selectedLog, setSelectedLog] = useState<AiQueryLog | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const data = await ipc.aiQueryLogs.getAiQueryLogs();
            setLogs(data);
        } catch (error) {
            console.error("Failed to load AI query logs:", error);
            toast.error("Error al cargar los logs");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogClick = async (id: number) => {
        try {
            const detail = await ipc.aiQueryLogs.getAiQueryLogDetail(id);
            setSelectedLog(detail);
        } catch (error) {
            console.error("Failed to load AI query log detail:", error);
            toast.error("Error al cargar el detalle del log");
        }
    };

    const handleExportZip = async () => {
        try {
            toast.info("Preparando exportación...");
            const fullLogs = await ipc.aiQueryLogs.getFullLogs();

            if (fullLogs.length === 0) {
                toast.error("No hay logs para exportar");
                return;
            }

            const zip = new JSZip();

            fullLogs.forEach((log: any) => {
                const dateStr = format(new Date(log.createdAt), "yyyy-MM-dd_HH-mm-ss");
                const fileName = `${log.id}_${log.queryType}_${dateStr}.json`;
                const content = JSON.stringify(log, null, 2);
                zip.file(fileName, content);
            });

            const blob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ai-query-logs-${format(new Date(), "yyyy-MM-dd")}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Logs exportados correctamente en formato ZIP");
        } catch (error) {
            console.error("Export failed:", error);
            toast.error("Error al exportar los logs.");
        }
    };

    const handleClearLogs = async () => {
        if (!confirm("¿Estás seguro de que quieres borrar todos los logs?")) return;
        try {
            await ipc.aiQueryLogs.clearLogs();
            setLogs([]);
            toast.success("Logs borrados");
        } catch (error) {
            toast.error("Error al borrar los logs");
        }
    };

    const handleAddTestLog = async () => {
        try {
            await ipc.aiQueryLogs.addTestLog();
            toast.success("Log de prueba generado");
            loadLogs();
        } catch (error) {
            toast.error("Error al generar log de prueba");
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-background min-h-0">
            {/* Header - Forced Two Rows */}
            <div className="px-8 py-5 border-b border-border bg-card/40 backdrop-blur-xl sticky top-0 z-10 grid grid-rows-[auto_auto] gap-5">
                {/* Row 1: Title + FIFO selector */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => navigate({ to: "/settings" })}
                            className="rounded-2xl hover:bg-muted shrink-0 h-11 w-11 shadow-sm border-border/50"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                                <Database className="h-6 w-6 text-primary shrink-0" />
                                <span className="truncate">Logs de Consultas IA</span>
                            </h1>
                            <p className="text-sm text-muted-foreground font-medium truncate opacity-80">
                                Historial completo de peticiones y respuestas de modelos de IA
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 rounded-2xl border border-border/50 shrink-0 shadow-inner">
                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                            Límite FIFO
                        </span>
                        <div className="h-4 w-[1px] bg-border/50 mx-1" />
                        <AiQueryLogRotationSelector />
                    </div>
                </div>

                {/* Row 2: Action buttons */}
                <div className="flex items-center justify-between pl-[60px]">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={loadLogs}
                            className="rounded-xl font-bold h-10 px-5 text-sm shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                            disabled={isLoading}
                        >
                            <History className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Refrescar logs
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportZip}
                            className="rounded-xl font-bold h-10 px-5 text-sm border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-primary shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Exportar ZIP
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearLogs}
                            className="rounded-xl font-bold h-10 px-5 text-sm text-destructive hover:bg-destructive/10 transition-all"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpiar historial
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleAddTestLog}
                        className="rounded-2xl text-muted-foreground hover:text-primary h-11 w-11 hover:bg-primary/10 transition-colors"
                        title="Generar log de prueba"
                    >
                        <Bug className="h-5 w-5" />
                    </Button>
                </div>
            </div>

            {/* Main Content - Full Width */}
            <div className="flex-1 overflow-auto bg-background/50">
                <div className="min-w-full inline-block align-middle">
                    <Table className="w-full">
                        <TableHeader className="bg-muted/30 sticky top-0 z-10 shadow-sm">
                            <TableRow className="hover:bg-transparent border-border">
                                <TableHead className="w-[80px] pl-8 text-xs font-bold uppercase tracking-wider text-muted-foreground">ID</TableHead>
                                <TableHead className="w-[180px] text-xs font-bold uppercase tracking-wider text-muted-foreground">Fecha</TableHead>
                                <TableHead className="w-[150px] text-xs font-bold uppercase tracking-wider text-muted-foreground">Tipo</TableHead>
                                <TableHead className="w-[200px] text-xs font-bold uppercase tracking-wider text-muted-foreground">Modelo</TableHead>
                                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[300px]">Snippet del Prompt</TableHead>
                                <TableHead className="text-right pr-8 w-[150px] text-xs font-bold uppercase tracking-wider text-muted-foreground">Tokens (I/O)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-32">
                                        <div className="flex flex-col items-center gap-4 text-muted-foreground">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                            <p className="font-medium">Cargando logs del sistema...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-32">
                                        <div className="flex flex-col items-center gap-4 text-muted-foreground opacity-50">
                                            <Database className="h-12 w-12" />
                                            <p className="text-lg font-medium">No hay logs registrados aún</p>
                                            <p className="text-sm">Las interacciones con la IA aparecerán aquí automáticamente</p>
                                            <Button variant="outline" size="sm" onClick={handleAddTestLog} className="mt-4 rounded-xl">
                                                Crear Log de Prueba
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow
                                        key={log.id}
                                        className="group cursor-pointer hover:bg-primary/5 transition-colors border-border"
                                        onClick={() => log.id && handleLogClick(log.id)}
                                    >
                                        <TableCell className="font-mono text-xs text-muted-foreground pl-8">
                                            #{log.id}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-xs font-medium">
                                            {log.createdAt && format(new Date(log.createdAt), "dd MMM, HH:mm:ss")}
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                                                {log.queryType}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-medium text-xs truncate max-w-[200px]">
                                            {log.model}
                                        </TableCell>
                                        <TableCell className="max-w-[500px] truncate">
                                            <div className="truncate italic text-muted-foreground text-xs group-hover:text-foreground transition-colors">
                                                "{log.promptSnippet}..."
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-8 font-mono text-xs">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span className="text-blue-500 font-bold">{log.inputTokens ?? 0}</span>
                                                <span className="opacity-20 text-foreground">/</span>
                                                <span className="text-green-500 font-bold">{log.outputTokens ?? 0}</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                <DialogContent
                    className="sm:max-w-[1000px] !max-w-[1000px] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col rounded-3xl border border-border/50 shadow-2xl p-0 bg-card/95 backdrop-blur-xl"
                    style={{ maxWidth: '1000px', width: '95vw' }}
                >
                    <div className="px-8 py-6 border-b border-border/50 bg-muted/20">
                        <DialogHeader>
                            <DialogTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-2xl font-black tracking-tight">
                                    <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                                        <Code className="h-6 w-6 text-primary" />
                                    </div>
                                    Detalle de Consulta #{selectedLog?.id}
                                </div>
                                <div className="flex gap-4 pr-10">
                                    <div className="text-right px-5 py-2.5 bg-muted/40 rounded-2xl border border-border/50 shadow-sm">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">Tokens Consumidos</p>
                                        <p className="font-mono text-base font-bold">
                                            <span className="text-blue-500">{selectedLog?.inputTokens || 0}</span>
                                            <span className="mx-2 opacity-20 text-foreground">/</span>
                                            <span className="text-green-500">{selectedLog?.outputTokens || 0}</span>
                                        </p>
                                    </div>
                                </div>
                            </DialogTitle>
                        </DialogHeader>
                    </div>

                    <div className="flex-1 overflow-auto px-8 py-8 space-y-8 custom-scrollbar">
                        <div className="grid grid-cols-3 gap-6">
                            <div className="p-5 rounded-2xl bg-muted/40 border border-border/50 shadow-sm transition-all hover:bg-muted/50">
                                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2.5 flex items-center gap-2">
                                    <Cpu className="h-3.5 w-3.5" /> Modelo Utilizado
                                </p>
                                <p className="font-bold text-lg text-foreground truncate">{selectedLog?.model}</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-muted/40 border border-border/50 shadow-sm transition-all hover:bg-muted/50">
                                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2.5 flex items-center gap-2">
                                    <Database className="h-3.5 w-3.5" /> Origen de Llamada
                                </p>
                                <p className="font-bold text-lg text-foreground capitalize truncate">{selectedLog?.queryType}</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-muted/40 border border-border/50 shadow-sm transition-all hover:bg-muted/50">
                                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2.5 flex items-center gap-2">
                                    <History className="h-3.5 w-3.5" /> Fecha y Hora
                                </p>
                                <p className="font-bold text-lg text-foreground whitespace-nowrap">
                                    {selectedLog?.createdAt && format(new Date(selectedLog.createdAt), "dd/MM/yyyy · HH:mm:ss")}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 flex items-center gap-2 px-1">
                                <Code className="h-4 w-4 text-primary" /> Payload de Entrada (JSON)
                            </h3>
                            <div className="group relative">
                                <pre className="p-6 rounded-2xl bg-zinc-950 text-zinc-300 font-mono text-[13px] overflow-auto border border-zinc-800 leading-relaxed max-h-[350px] scrollbar-thin scrollbar-thumb-zinc-700 shadow-xl">
                                    {JSON.stringify(selectedLog?.payload, null, 2)}
                                </pre>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all h-9 w-9 shadow-lg"
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(selectedLog?.payload, null, 2));
                                        toast.success("Copiado al portapapeles");
                                    }}
                                >
                                    <History className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3 pb-6">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 flex items-center gap-2 px-1">
                                <Sparkles className="h-4 w-4 text-primary" /> Respuesta del Modelo (RAW JSON)
                            </h3>
                            <div className="group relative">
                                <pre className="p-6 rounded-2xl bg-primary/[0.03] text-foreground font-mono text-[13px] overflow-auto border border-primary/10 leading-relaxed max-h-[500px] scrollbar-thin scrollbar-thumb-primary/20 shadow-lg">
                                    {JSON.stringify(selectedLog?.response, null, 2)}
                                </pre>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all h-9 w-9 shadow-lg"
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(selectedLog?.response, null, 2));
                                        toast.success("Copiado al portapapeles");
                                    }}
                                >
                                    <History className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
