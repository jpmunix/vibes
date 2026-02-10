import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Database, Settings, BarChart3, CloudUpload } from "lucide-react";
import { performAndUploadBackup } from "@/lib/backup_service";

interface BackupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function BackupModal({ isOpen, onClose }: BackupModalProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleBackup = async () => {
        setIsLoading(true);
        // Pass false to show foreground notifications (toasts)
        const success = await performAndUploadBackup(false);
        setIsLoading(false);
        if (success) {
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CloudUpload className="h-5 w-5" />
                        Copia de Seguridad
                    </DialogTitle>
                    <DialogDescription>
                        Se realizará una copia de seguridad segura y encriptada de todos tus datos.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="flex items-center space-x-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600">
                            <Settings className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-sm font-bold">Ajustes del usuario</span>
                            <p className="text-xs text-muted-foreground">user-settings.json</p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600">
                            <Database className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-sm font-bold">Base de Datos</span>
                            <p className="text-xs text-muted-foreground">sqlite.db.gz</p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600">
                            <BarChart3 className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-sm font-bold">Estadísticas</span>
                            <p className="text-xs text-muted-foreground">token-stats.json</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
                    <Button
                        onClick={handleBackup}
                        disabled={isLoading}
                        className="bg-[#1a1f2e] hover:bg-[#2a2f3e] text-white"
                    >
                        {isLoading ? "Subiendo..." : "Realizar Copia"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
