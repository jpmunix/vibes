import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Settings, BarChart3, CloudUpload, List, Trash2, Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { backupClient } from "@/ipc/types/backup";
import { storage, auth } from "@/lib/firebase";
import { ref, uploadString, listAll, deleteObject, getDownloadURL } from "firebase/storage";
import { useEffect, useCallback } from "react";
import { useAtomValue } from "jotai";
import { userAtom } from "@/atoms/authAtoms";

interface BackupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function BackupModal({ isOpen, onClose }: BackupModalProps) {
    const user = useAtomValue(userAtom);
    const [isLoading, setIsLoading] = useState(false);
    const [backups, setBackups] = useState<{ id: string, name: string, date: string }[]>([]);
    const [isLoadingBackups, setIsLoadingBackups] = useState(false);
    const [activeTab, setActiveTab] = useState("create");
    const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
    const [backupToRestore, setBackupToRestore] = useState<string | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);

    const handleBackup = async () => {
        if (!user) {
            toast.error("Debes iniciar sesión para realizar copias de seguridad");
            console.warn("[BackupModal] Attempted backup without user session");
            return;
        }

        setIsLoading(true);
        try {
            // 1. Obtener el ZIP de backup desde el proceso principal (IPC)
            const result = await backupClient.performBackup({
                includeSettings: true,
                includeDatabase: true,
                includeStats: true,
            });

            if (!result.success) {
                throw new Error(result.message);
            }

            // 2. Subir el archivo ZIP a Firebase Storage
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const zipFile = result.backupData[0]; // Solo hay un archivo ahora (backup.zip)

            // Ruta: backups/{uid}/backup-{timestamp}.zip
            const storageRef = ref(storage, `backups/${user.uid}/backup-${timestamp}.zip`);

            // Subir el ZIP
            await uploadString(storageRef, zipFile.content, "base64", {
                contentType: zipFile.contentType,
            });

            // 3. Rotación de copias: mantener solo las 3 más recientes en la nube
            await rotateBackups(user.uid);

            toast.success("Copia de seguridad subida a la nube correctamente");
            fetchBackups(); // Refresh list
        } catch (error: any) {
            toast.error(error.message || "Error al realizar la copia de seguridad");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const rotateBackups = async (uid: string) => {
        try {
            const backupsRootRef = ref(storage, `backups/${uid}`);
            const res = await listAll(backupsRootRef);

            // Ahora trabajamos con archivos individuales (items) en lugar de carpetas (prefixes)
            if (res.items.length > 3) {
                const sortedItems = [...res.items].sort((a, b) => a.name.localeCompare(b.name));
                const toDelete = sortedItems.slice(0, sortedItems.length - 3);

                for (const item of toDelete) {
                    await deleteObject(item);
                }
            }
        } catch (error) {
            console.error("Error al rotar copias:", error);
        }
    };

    const fetchBackups = async () => {
        if (!user) {
            console.log("[BackupModal] No user session found");
            return;
        }

        console.log("[BackupModal] Fetching backups for user:", user.uid);
        setIsLoadingBackups(true);
        try {
            const backupsRootRef = ref(storage, `backups/${user.uid}`);
            const res = await listAll(backupsRootRef);
            console.log("[BackupModal] Found", res.items.length, "backup files");

            // Ahora trabajamos con archivos ZIP individuales
            const fetchedBackups = res.items.map(item => {
                // Nombre del archivo: backup-2024-02-10T19-45-12-123Z.zip
                // Extraer el timestamp del nombre del archivo
                const match = item.name.match(/backup-(.+)\.zip$/);
                const timestamp = match ? match[1] : item.name;

                // Formatear fecha para mostrar
                let formattedDate = timestamp;
                try {
                    const parts = timestamp.split('T');
                    if (parts.length === 2) {
                        const timePart = parts[1].replace(/-/g, ':').replace(/:([^:]*)$/, '.$1');
                        const isoStr = `${parts[0]}T${timePart}`;
                        formattedDate = new Date(isoStr).toLocaleString();
                    }
                } catch (e) {
                    formattedDate = timestamp;
                }

                return {
                    id: item.name, // Nombre completo del archivo
                    name: `Backup ${timestamp}`,
                    date: formattedDate
                };
            }).sort((a, b) => b.id.localeCompare(a.id));

            setBackups(fetchedBackups);
        } catch (error: any) {
            console.error("[BackupModal] Error fetching backups:", error);
            if (error.code === 'storage/object-not-found') {
                setBackups([]);
            } else {
                toast.error("Error al cargar la lista de copias");
            }
        } finally {
            setIsLoadingBackups(false);
        }
    };

    const handleDeleteBackup = async () => {
        if (!user || !backupToDelete) return;

        try {
            // backupToDelete es el nombre del archivo (backup-{timestamp}.zip)
            const fileRef = ref(storage, `backups/${user.uid}/${backupToDelete}`);
            await deleteObject(fileRef);
            toast.success("Copia de seguridad eliminada");
            fetchBackups();
        } catch (error) {
            console.error("[BackupModal] Error deleting backup:", error);
            toast.error("Error al eliminar la copia");
        } finally {
            setBackupToDelete(null);
        }
    };

    const handleRestoreBackup = async () => {
        if (!user || !backupToRestore) return;

        setIsRestoring(true);
        try {
            // 1. Get the signed download URL from Firebase
            const fileRef = ref(storage, `backups/${user.uid}/${backupToRestore}`);
            const downloadUrl = await getDownloadURL(fileRef);

            // 2. Send the URL to the main process for restoration
            const result = await backupClient.restoreBackup({
                downloadUrl
            });

            if (!result.success) {
                throw new Error(result.message);
            }

            toast.success(result.message);
            // The app will restart automatically
        } catch (error: any) {
            console.error("[BackupModal] Error restoring backup:", error);
            toast.error(error.message || "Error al restaurar la copia");
        } finally {
            setBackupToRestore(null);
            setIsRestoring(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchBackups();
        }
    }, [isOpen]);

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none bg-background">
                    <div className="p-6 space-y-4">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <CloudUpload className="h-5 w-5" />
                                Copia de Seguridad
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground text-sm">
                                Gestiona tus copias de seguridad en la nube
                            </DialogDescription>
                        </DialogHeader>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 h-12">
                                <TabsTrigger value="create" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none">
                                    <CloudUpload className="h-4 w-4" />
                                    Sacar Copia
                                </TabsTrigger>
                                <TabsTrigger value="list" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none">
                                    <List className="h-4 w-4" />
                                    Ver Existentes
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="create" className="space-y-6 pt-6">
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Se creará una copia de seguridad completa con los siguientes datos:
                                    </p>

                                    <div className="flex items-center gap-3 p-3">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600">
                                            <Settings className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">Ajustes del usuario</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 p-3">
                                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600">
                                            <Database className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">Base de Datos</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 p-3">
                                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600">
                                            <BarChart3 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">Estadísticas</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
                                    <Button
                                        onClick={handleBackup}
                                        disabled={isLoading}
                                        className="bg-[#1a1f2e] hover:bg-[#2a2f3e] text-white"
                                    >
                                        {isLoading ? "Subiendo..." : "Realizar Copia"}
                                    </Button>
                                </div>
                            </TabsContent>

                            <TabsContent value="list" className="space-y-4 pt-6">
                                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {isLoadingBackups ? (
                                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                                            <p>Cargando copias...</p>
                                        </div>
                                    ) : backups.length === 0 ? (
                                        <div className="text-center py-10 text-muted-foreground">
                                            <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                            <p>No hay copias de seguridad disponibles</p>
                                        </div>
                                    ) : (
                                        backups.map((backup) => (
                                            <div key={backup.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-md">
                                                        <Database className="h-4 w-4 text-zinc-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{backup.date}</p>
                                                        <p className="text-[10px] text-muted-foreground uppercase">{backup.id}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="opacity-0 group-hover:opacity-100 text-primary hover:text-primary hover:bg-primary/10 transition-opacity"
                                                        onClick={() => setBackupToRestore(backup.id)}
                                                        disabled={isRestoring}
                                                    >
                                                        <RotateCcw className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                                        onClick={() => setBackupToDelete(backup.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="flex justify-end pt-2">
                                    <Button variant="outline" onClick={onClose}>Cerrar</Button>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!backupToDelete} onOpenChange={(open) => !open && setBackupToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar copia de seguridad?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. La copia de seguridad será eliminada permanentemente de la nube.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteBackup}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!backupToRestore} onOpenChange={(open) => !open && setBackupToRestore(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Restaurar copia de seguridad?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm text-muted-foreground">
                                <p>
                                    Esta acción reemplazará todos tus datos de usuario actuales con los datos de la copia de seguridad seleccionada.
                                </p>
                                <p className="font-medium text-foreground">
                                    Se restaurarán:
                                </p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Ajustes del usuario</li>
                                    <li>Base de datos (chats, tareas, etc.)</li>
                                    <li>Estadísticas de uso</li>
                                </ul>
                                <p className="text-amber-600 dark:text-amber-500 font-medium">
                                    ⚠️ Las aplicaciones no se restaurarán ya que están en el repositorio.
                                </p>
                                <p className="font-medium text-foreground mt-2">
                                    La aplicación se reiniciará automáticamente después de la restauración.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRestoring}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRestoreBackup}
                            disabled={isRestoring}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {isRestoring ? "Restaurando..." : "Restaurar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
