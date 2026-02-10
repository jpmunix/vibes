import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Database, Settings, BarChart3, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { backupClient } from "@/ipc/types/backup";
import { storage, auth } from "@/lib/firebase";
import { ref, uploadString, listAll, deleteObject } from "firebase/storage";

interface BackupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function BackupModal({ isOpen, onClose }: BackupModalProps) {
    const [backupSettings, setBackupSettings] = useState(true);
    const [backupDatabase, setBackupDatabase] = useState(true);
    const [backupStats, setBackupStats] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    const handleBackup = async () => {
        const user = auth.currentUser;
        if (!user) {
            toast.error("Debes iniciar sesión para realizar copias de seguridad");
            return;
        }

        setIsLoading(true);
        try {
            // 1. Obtener los datos de los archivos desde el proceso principal (IPC)
            const result = await backupClient.performBackup({
                includeSettings: backupSettings,
                includeDatabase: backupDatabase,
                includeStats: backupStats,
            });

            if (!result.success) {
                throw new Error(result.message);
            }

            // 2. Subir cada archivo a Firebase Storage
            const uploadPromises = result.backupData.map(async (file) => {
                // Ruta: backups/{uid}/{timestamp}/{filename}
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const storageRef = ref(storage, `backups/${user.uid}/${timestamp}/${file.name}`);

                // Usamos uploadString con formato base64
                await uploadString(storageRef, file.content, "base64", {
                    contentType: file.contentType,
                });
                return file.name;
            });

            await Promise.all(uploadPromises);

            // 3. Rotación de copias: mantener solo las 3 más recientes en la nube
            try {
                const backupsRootRef = ref(storage, `backups/${user.uid}`);
                const res = await listAll(backupsRootRef);

                if (res.prefixes.length > 3) {
                    // Ordenar por nombre (los timestamps ISO se ordenan bien alfabéticamente) de antiguo a nuevo
                    const sortedPrefixes = [...res.prefixes].sort((a, b) => a.name.localeCompare(b.name));

                    // Seleccionar los que sobran (los más antiguos)
                    const toDelete = sortedPrefixes.slice(0, sortedPrefixes.length - 3);

                    for (const prefix of toDelete) {
                        const folderRes = await listAll(prefix);
                        const deletePromises = folderRes.items.map(item => deleteObject(item));
                        await Promise.all(deletePromises);
                    }
                }
            } catch (rotationError) {
                console.error("Error al rotar copias antiguas:", rotationError);
            }

            toast.success("Copia de seguridad subida a la nube correctamente");
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Error al realizar la copia de seguridad");
            console.error(error);
        } finally {
            setIsLoading(false);
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
                        Selecciona los datos que deseas respaldar en Firebase Cloud Storage.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="flex items-center justify-between space-x-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600">
                                <Settings className="h-5 w-5" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="settings" className="text-sm font-bold cursor-pointer">Ajustes del usuario</Label>
                                <p className="text-xs text-muted-foreground">user-settings.json</p>
                            </div>
                        </div>
                        <Switch
                            id="settings"
                            checked={backupSettings}
                            onCheckedChange={setBackupSettings}
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600">
                                <Database className="h-5 w-5" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="database" className="text-sm font-bold cursor-pointer">Base de Datos</Label>
                                <p className="text-xs text-muted-foreground">sqlite.db</p>
                            </div>
                        </div>
                        <Switch
                            id="database"
                            checked={backupDatabase}
                            onCheckedChange={setBackupDatabase}
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600">
                                <BarChart3 className="h-5 w-5" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="stats" className="text-sm font-bold cursor-pointer">Estadísticas</Label>
                                <p className="text-xs text-muted-foreground">token-stats.json</p>
                            </div>
                        </div>
                        <Switch
                            id="stats"
                            checked={backupStats}
                            onCheckedChange={setBackupStats}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
                    <Button
                        onClick={handleBackup}
                        disabled={isLoading || (!backupSettings && !backupDatabase && !backupStats)}
                        className="bg-[#1a1f2e] hover:bg-[#2a2f3e] text-white"
                    >
                        {isLoading ? "Subiendo..." : "Realizar Copia"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
