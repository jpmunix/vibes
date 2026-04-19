import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ipc } from "@/ipc/types";
import { useAppVersion } from "@/hooks/useAppVersion";

interface ReleaseNotesDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ReleaseNotesDialog({
    isOpen,
    onOpenChange,
}: ReleaseNotesDialogProps) {
    const [content, setContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const appVersion = useAppVersion();

    useEffect(() => {
        if (isOpen) {
            const loadContent = async () => {
                setIsLoading(true);
                try {
                    const result = await ipc.system.getReleaseNotesContent();
                    setContent(result);
                } catch (error) {
                    console.error("Failed to load release notes:", error);
                    setContent("# Error al cargar las notas de lanzamiento.");
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
                        🚀 ¿Qué hay de nuevo en v{appVersion}?
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 w-full overflow-y-auto pr-6 custom-scrollbar">
                    <div className="prose prose-sm dark:prose-invert max-w-none pb-8 text-left">
                        {isLoading ? (
                            <p className="typo-body opacity-50 text-center py-10">Cargando novedades...</p>
                        ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
