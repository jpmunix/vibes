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
import ADMZip from "adm-zip";

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

            // We'll use a dynamic import for adm-zip if possible, or build the zip manually if in renderer
            // Since ADMZip is usually for node, we might need to handle this differently in renderer
            // But we can just create a JSON file for now, or use a client-side zip lib if available.
            // Actually, let's just create a single large JSON for simplicity if ADMZip fails in renderer,
            // but the requirement was "zip of jsons". Let's try to bundle them.

            const zip = new ADMZip();

            fullLogs.forEach((log: any) => {
                const dateStr = format(new Date(log.createdAt), "yyyy-MM-dd_HH-mm-ss");
                const fileName = `${log.id}_${log.queryType}_${dateStr}.json`;
                const content = JSON.stringify(log, null, 2);
                zip.addFile(fileName, Buffer.from(content, "utf8"));
            });

            const zipBuffer = zip.toBuffer();
            const blob = new Blob([zipBuffer], { type: "application/zip" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ai-query-logs-${format(new Date(), "yyyy-MM-dd")}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Logs exportados correctamente en formato ZIP");
        } catch (error) {
            console.error("Export failed:", error);
            toast.error("Error al exportar los logs. Asegúrate de que adm-zip esté disponible.");
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
        <div className="flex flex-col h-screen bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate({ to: "/settings" })}
                        className="rounded-xl hover:bg-muted"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Database className="h-6 w-6 text-primary" />
                            Logs de Consultas IA
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Historial completo de peticiones y respuestas de modelos de IA
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-2xl border border-border mr-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Límite FIFO:
                        </span>
                        <AiQueryLogRotationSelector />
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadLogs}
                        className="rounded-xl font-bold h-10 border-border hover:bg-muted"
                        disabled={isLoading}
                    >
                        <History className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refrescar
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportZip}
                        className="rounded-xl font-bold h-10 border-border hover:bg-muted text-primary"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Exportar ZIP
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearLogs}
                        className="rounded-xl font-bold h-10 text-destructive hover:bg-destructive/10"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Limpiar
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleAddTestLog}
                        className="rounded-xl text-muted-foreground hover:text-primary"
                        title="Generar log de prueba"
                    >
                        <Bug className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Main Content - Full Width */}
            <div className="flex-1 overflow-auto">
                <div className="w-full">
                    <Table>
                        <TableHeader className="bg-muted/30 sticky top-0 z-10">
                            <TableRow className="hover:bg-transparent border-border">
                                <TableHead className="w-[80px] pl-8 text-[11px] font-black uppercase tracking-widest">ID</TableHead>
                                <TableHead className="w-[180px] text-[11px] font-black uppercase tracking-widest">Fecha</TableHead>
                                <TableHead className="w-[150px] text-[11px] font-black uppercase tracking-widest">Tipo</TableHead>
                                <TableHead className="w-[200px] text-[11px] font-black uppercase tracking-widest">Modelo</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-widest">Snippet del Prompt</TableHead>
                                <TableHead className="text-right pr-8 w-[150px] text-[11px] font-black uppercase tracking-widest">Tokens (I/O)</TableHead>
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
                                        <TableCell className="font-mono text-[11px] text-muted-foreground pl-8">
                                            #{log.id}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-sm font-medium">
                                            {log.createdAt && format(new Date(log.createdAt), "dd MMM, HH:mm:ss")}
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-tighter border border-primary/20">
                                                {log.queryType}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-semibold text-sm truncate max-w-[200px]">
                                            {log.model}
                                        </TableCell>
                                        <TableCell className="max-w-0 w-full">
                                            <div className="truncate italic text-muted-foreground text-sm group-hover:text-foreground transition-colors">
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
                <DialogContent className="max-w-[85vw] w-full max-h-[90vh] overflow-hidden flex flex-col rounded-[2.5rem] border-none shadow-2xl p-0 h-[85vh] bg-card">
                    <div className="p-8 border-b border-border bg-muted/10">
                        <DialogHeader>
                            <DialogTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-2xl font-bold">
                                    <div className="p-3 rounded-2xl bg-primary/10">
                                        <Code className="h-6 w-6 text-primary" />
                                    </div>
                                    Consulta IA #{selectedLog?.id}
                                </div>
                                <div className="flex gap-4 pr-10">
                                    <div className="text-right px-6 py-2 bg-muted/30 rounded-2xl border border-border">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Tokens Consumidos</p>
                                        <p className="font-mono text-sm font-bold">
                                            <span className="text-blue-500">{selectedLog?.inputTokens || 0}</span>
                                            <span className="mx-2 opacity-20">/</span>
                                            <span className="text-green-500">{selectedLog?.outputTokens || 0}</span>
                                        </p>
                                    </div>
                                </div>
                            </DialogTitle>
                        </DialogHeader>
                    </div>

                    <div className="flex-1 overflow-auto p-10 space-y-10 custom-scrollbar">
                        <div className="grid grid-cols-3 gap-8">
                            <div className="p-6 rounded-[2rem] bg-muted/40 border border-border">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                                    <Cpu className="h-3.5 w-3.5" /> Modelo Utilizado
                                </p>
                                <p className="font-bold text-xl text-foreground">{selectedLog?.model}</p>
                            </div>
                            <div className="p-6 rounded-[2rem] bg-muted/40 border border-border">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                                    <Database className="h-3.5 w-3.5" /> Origen de Llamada
                                </p>
                                <p className="font-bold text-xl text-foreground capitalize">{selectedLog?.queryType}</p>
                            </div>
                            <div className="p-6 rounded-[2rem] bg-muted/40 border border-border">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                                    <History className="h-3.5 w-3.5" /> Marca de Tiempo
                                </p>
                                <p className="font-bold text-xl text-foreground">
                                    {selectedLog?.createdAt && format(new Date(selectedLog.createdAt), "dd/MM/yyyy · HH:mm:ss")}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2 px-2">
                                <Code className="h-4 w-4 text-primary" /> Payload de Entrada (JSON)
                            </h3>
                            <div className="group relative">
                                <pre className="p-8 rounded-[2.5rem] bg-zinc-950 text-zinc-300 font-mono text-[13px] overflow-auto border border-zinc-800 leading-relaxed max-h-[450px] scrollbar-thin scrollbar-thumb-zinc-700">
                                    {JSON.stringify(selectedLog?.payload, null, 2)}
                                </pre>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(selectedLog?.payload, null, 2));
                                        toast.success("Copiado al portapapeles");
                                    }}
                                >
                                    <History className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4 pb-6">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2 px-2">
                                <Sparkles className="h-4 w-4 text-primary" /> Respuesta del Modelo (RAW JSON)
                            </h3>
                            <div className="group relative">
                                <pre className="p-8 rounded-[2.5rem] bg-primary/[0.03] text-foreground font-mono text-[13px] overflow-auto border border-primary/10 leading-relaxed max-h-[700px] scrollbar-thin scrollbar-thumb-primary/20">
                                    {JSON.stringify(selectedLog?.response, null, 2)}
                                </pre>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
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
