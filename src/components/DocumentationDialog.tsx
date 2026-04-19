import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ipc } from "@/ipc/types";

interface DocumentationDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DocumentationDialog({
    isOpen,
    onOpenChange,
}: DocumentationDialogProps) {
    const [content, setContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const loadContent = async () => {
                setIsLoading(true);
                try {
                    if (!ipc.system || !ipc.system.getDocumentationContent) {
                        console.error("IPC system or getDocumentationContent not found", ipc.system);
                        setContent("# Error interno: El sistema de comunicación no está listo.");
                        return;
                    }
                    const result = await ipc.system.getDocumentationContent();
                    setContent(result);
                } catch (error) {
                    console.error("Failed to load documentation:", error);
                    setContent("# Error al cargar la documentación (" + (error instanceof Error ? error.message : String(error)) + ").");
                } finally {
                    setIsLoading(false);
                }
            };
            loadContent();
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-[1400px] !w-[95vw] max-h-[90vh] flex flex-col p-8 !gap-0 overflow-hidden">
                <DialogHeader className="mb-6 flex-shrink-0">
                    <DialogTitle className="typo-page-title flex items-center gap-3">
                        📚 Documentación
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 w-full overflow-y-auto pr-6 custom-scrollbar">
                    <div className="typo-body prose prose-sm dark:prose-invert max-w-none pb-8 text-left">
                        {isLoading ? (
                            <p className="text-muted-foreground text-center py-10">Cargando documentación...</p>
                        ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
