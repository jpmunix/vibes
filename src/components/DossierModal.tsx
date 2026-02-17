import { useState, useEffect, useRef, useCallback } from "react";
import { ipc } from "@/ipc/types";
import type { DossierChunk } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Loader2,
    Download,
    X,
    CheckCircle,
    AlertCircle,
    FileText,
    BookOpen,
    Package,
    Search,
    RefreshCw,
    Cloud,
} from "lucide-react";
import ConfirmationDialog from "./ConfirmationDialog";
import { storage } from "@/lib/firebase";
import { ref, uploadString } from "firebase/storage";
import { useAtomValue } from "jotai";
import { userAtom } from "@/atoms/authAtoms";
import { toast } from "sonner";

interface DossierModalProps {
    appId: number;
    appName: string;
    isOpen: boolean;
    onClose: () => void;
}

interface ProgressMessage {
    message: string;
    phase: DossierChunk["phase"];
    timestamp: Date;
}

type ModalState = "checking" | "idle" | "generating" | "done" | "error";

const PHASE_ICONS: Record<DossierChunk["phase"], React.ReactNode> = {
    analyzing: <Search className="h-3.5 w-3.5 text-blue-500" />,
    tutorial: <BookOpen className="h-3.5 w-3.5 text-green-500" />,
    memoria: <FileText className="h-3.5 w-3.5 text-purple-500" />,
    docx: <FileText className="h-3.5 w-3.5 text-orange-500" />,
    zip: <Package className="h-3.5 w-3.5 text-amber-500" />,
    done: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />,
};

const PHASE_LABELS: Record<DossierChunk["phase"], string> = {
    analyzing: "Analizando",
    tutorial: "Tutorial",
    memoria: "Memoria Técnica",
    docx: "Generando DOCX",
    zip: "Empaquetando ZIP",
    done: "Completado",
};

function triggerDownload(base64: string, fileName: string) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/zip" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function DossierModal({
    appId,
    appName,
    isOpen,
    onClose,
}: DossierModalProps) {
    const user = useAtomValue(userAtom);
    const [modalState, setModalState] = useState<ModalState>("checking");
    const [hasExisting, setHasExisting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ProgressMessage[]>([]);
    const [currentPhase, setCurrentPhase] =
        useState<DossierChunk["phase"]>("analyzing");
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [zipData, setZipData] = useState<{
        base64: string;
        fileName: string;
    } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const sessionIdRef = useRef<string>("");

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const addMessage = useCallback(
        (message: string, phase: DossierChunk["phase"]) => {
            setMessages((prev) => [
                ...prev,
                { message, phase, timestamp: new Date() },
            ]);
            setCurrentPhase(phase);
        },
        [],
    );

    // Check if dossier already exists when modal opens
    useEffect(() => {
        if (!isOpen) return;

        // Reset state
        setModalState("checking");
        setHasExisting(false);
        setError(null);
        setMessages([]);
        setZipData(null);

        ipc.dossier
            .checkExisting({ appId })
            .then((result) => {
                if (result.exists) {
                    setHasExisting(true);
                    setModalState("idle");
                } else {
                    setHasExisting(false);
                    setModalState("idle");
                }
            })
            .catch(() => {
                setHasExisting(false);
                setModalState("idle");
            });
    }, [isOpen, appId]);

    const startGeneration = useCallback(
        (forceRegenerate: boolean) => {
            setModalState("generating");
            setError(null);
            setMessages([]);
            setZipData(null);
            setCurrentPhase("analyzing");

            const sessionId = `dossier-${appId}-${Date.now()}`;
            sessionIdRef.current = sessionId;

            ipc.dossierStream.start(
                { appId, sessionId, forceRegenerate },
                {
                    onChunk: (data) => {
                        addMessage(data.message, data.phase);
                    },
                    onEnd: async (data) => {
                        setModalState("done");
                        setHasExisting(true);
                        setZipData({
                            base64: data.zipBase64,
                            fileName: data.fileName,
                        });
                        // Auto-download removed upon user request
                        // triggerDownload(data.zipBase64, data.fileName);

                        // Auto-upload to Firebase if logged in
                        if (user) {
                            try {
                                addMessage("Subiendo dossier a la nube...", "done");
                                const sanitizedName = appName.replace(/[^a-zA-Z0-9]/g, "_");
                                // Use 'backups' folder to reuse existing storage rules
                                const storageRef = ref(storage, `backups/${user.uid}/dossier_${sanitizedName}.zip`);
                                await uploadString(storageRef, data.zipBase64, "base64", {
                                    contentType: "application/zip",
                                });
                                addMessage("✓ Dossier guardado en la nube", "done");
                                toast.success("Dossier subido a la nube");
                            } catch (err) {
                                console.error("[DossierModal] Firebase upload error:", err);
                                // Non-blocking: don't change modal state
                                toast.error("No se pudo subir el dossier a la nube");
                            }
                        }
                    },
                    onError: (data) => {
                        setModalState("error");
                        setError(data.error);
                    },
                },
            );
        },
        [appId, addMessage],
    );

    const handleCancel = () => {
        if (modalState === "generating") {
            setShowCancelConfirm(true);
        } else {
            onClose();
        }
    };

    const handleConfirmCancel = () => {
        ipc.dossierStream.cancel(sessionIdRef.current);
        setShowCancelConfirm(false);
        setModalState("idle");
        onClose();
    };

    const handleDownloadExisting = () => {
        if (zipData) {
            triggerDownload(zipData.base64, zipData.fileName);
            return;
        }
        // Download from backend cache
        ipc.dossier
            .download({ appId })
            .then((result) => {
                triggerDownload(result.zipBase64, result.fileName);
            })
            .catch((err: Error) => {
                setError(
                    err.message || "Error al descargar el dossier existente.",
                );
            });
    };

    const isGenerating = modalState === "generating";
    const isDone = modalState === "done";
    const isIdle = modalState === "idle";
    const isChecking = modalState === "checking";
    const isError = modalState === "error";

    return (
        <>
            <Dialog
                open={isOpen}
                onOpenChange={(open) => {
                    if (!open) handleCancel();
                }}
            >
                <DialogContent className="sm:max-w-[600px]! w-[90vw]! max-h-[80vh]! overflow-hidden flex flex-col p-6">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <DialogTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" />
                                Dossier de la App
                            </DialogTitle>
                            {isGenerating && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse">
                                    {PHASE_LABELS[currentPhase]}
                                </span>
                            )}
                            {isDone && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                    ✓ Completado
                                </span>
                            )}
                            {isError && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                    Error
                                </span>
                            )}
                        </div>
                        <DialogDescription>
                            {isChecking
                                ? "Comprobando estado del dossier..."
                                : isIdle && hasExisting
                                    ? `Ya existe un dossier generado para "${appName}".`
                                    : isIdle && !hasExisting
                                        ? `Genera documentación profesional (Tutorial + Memoria Técnica) para "${appName}".`
                                        : isGenerating
                                            ? `Generando documentación para "${appName}"...`
                                            : isDone
                                                ? "El dossier se ha generado y descargado exitosamente."
                                                : "Hubo un error al generar el dossier."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Idle state: show action buttons */}
                    {isIdle && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            {hasExisting && (
                                <>
                                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle className="h-4 w-4" />
                                        <span>Dossier disponible</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={handleDownloadExisting}
                                        className="gap-2 text-primary border-primary/20 hover:bg-primary/10 dark:border-primary/30 dark:hover:bg-primary/10"
                                    >
                                        <Download className="h-4 w-4" />
                                        Descargar Dossier
                                    </Button>
                                </>
                            )}

                            <Button
                                onClick={() =>
                                    startGeneration(hasExisting)
                                }
                                className="gap-2"
                            >
                                <RefreshCw className="h-4 w-4" />
                                {hasExisting
                                    ? "Regenerar Dossier"
                                    : "Generar Dossier"}
                            </Button>

                            {!hasExisting && (
                                <p className="text-xs text-muted-foreground text-center max-w-sm">
                                    Se analizará el código del proyecto y se
                                    generarán dos documentos DOCX empaquetados en
                                    un ZIP.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Checking state */}
                    {isChecking && (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Comprobando...
                        </div>
                    )}

                    {/* Progress Messages (generating / done / error) */}
                    {(isGenerating || isDone || isError) && (
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto min-h-[250px] max-h-[400px] rounded-md border border-border bg-muted/30 p-3 space-y-1.5"
                        >
                            {messages.length === 0 && isGenerating && (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Iniciando generación...
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-2 text-xs animate-in fade-in slide-in-from-bottom-1 duration-300"
                                >
                                    <span className="flex-shrink-0 mt-0.5">
                                        {PHASE_ICONS[msg.phase]}
                                    </span>
                                    <span
                                        className={`${msg.phase === "done"
                                            ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                            : "text-gray-600 dark:text-gray-400"
                                            }`}
                                    >
                                        {msg.message}
                                    </span>
                                    <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                                        {msg.timestamp.toLocaleTimeString(
                                            "es-ES",
                                            {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                second: "2-digit",
                                            },
                                        )}
                                    </span>
                                </div>
                            ))}

                            {isGenerating && messages.length > 0 && (
                                <div className="flex items-center gap-2 text-xs text-gray-400 pt-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span className="animate-pulse">
                                        Procesando...
                                    </span>
                                </div>
                            )}

                            {error && (
                                <div className="flex items-start gap-2 text-xs text-red-500 mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2">
                        {isGenerating && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                            >
                                <X className="h-4 w-4 mr-1" />
                                Cancelar
                            </Button>
                        )}

                        {isDone && zipData && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    triggerDownload(
                                        zipData.base64,
                                        zipData.fileName,
                                    )
                                }
                                className="text-primary border-primary/20 hover:bg-primary/10 dark:border-primary/30 dark:hover:bg-primary/10"
                            >
                                <Download className="h-4 w-4 mr-1" />
                                Descargar Dossier
                            </Button>
                        )}

                        {(isDone || isError) && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startGeneration(true)}
                                    className="gap-1"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Regenerar
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={onClose}
                                >
                                    Cerrar
                                </Button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmationDialog
                isOpen={showCancelConfirm}
                title="¿Cancelar generación?"
                message="El dossier aún se está generando. Si cancelas, se perderá todo el progreso. ¿Estás seguro?"
                confirmText="Sí, cancelar"
                cancelText="Continuar generando"
                onConfirm={handleConfirmCancel}
                onCancel={() => setShowCancelConfirm(false)}
            />
        </>
    );
}
