import { useState, useEffect } from "react";
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
import { Database, Settings, BarChart3, CloudUpload, List, Trash2, Clock, RotateCcw, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { backupClient } from "@/ipc/types/backup";
import { dossierClient } from "@/ipc/types/dossier";
import { useAtomValue } from "jotai";
import { userAtom } from "@/atoms/authAtoms";

interface BackupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function BackupModal({ isOpen, onClose }: BackupModalProps) {
    const user = useAtomValue(userAtom);
    const [isLoading, setIsLoading] = useState(false);

    // Backups legacy (deprecated via Firebase, mostly empty now)
    const [backups, setBackups] = useState<{ id: string, name: string, date: string }[]>([]);
    const [isLoadingBackups, setIsLoadingBackups] = useState(false);
    const [activeTab, setActiveTab] = useState("dossiers");
    const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
    const [backupToRestore, setBackupToRestore] = useState<string | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);

    // Dossiers state
    const [dossiers, setDossiers] = useState<{ id: number, name: string, appName: string, appId: number }[]>([]);
    const [isLoadingDossiers, setIsLoadingDossiers] = useState(false);
    const [dossierToDelete, setDossierToDelete] = useState<number | null>(null);
    const [isDownloadingDossier, setIsDownloadingDossier] = useState<number | null>(null);

    const handleBackup = async () => {
        if (!user) {
            toast.error("Debes iniciar sesión para realizar copias de seguridad");
            return;
        }

        setIsLoading(true);
        try {
            // Nota: En V3 (BD remota), esto solo generará ZIP de settings y stats locales.
            const result = await backupClient.performBackup({
                includeSettings: true,
                includeDatabase: false, // Local DB no longer backed up
                includeStats: true,
            });

            if (!result.success) {
                throw new Error(result.message);
            }

            toast.info("Copia local generada (Firebase disabled en V3).");
        } catch (error: any) {
            toast.error(error.message || "Error al realizar la copia de seguridad");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBackupsAndDossiers = async () => {
        if (!user) return;

        setIsLoadingBackups(true);
        setIsLoadingDossiers(true);

        try {
            // Load Dossiers using IPC from remote database
            const dossierList = await dossierClient.list();
            setDossiers(dossierList.map(d => ({
                id: d.id,
                name: d.storagePath,
                appName: d.appName,
                appId: d.appId
            })));

            // Fallback for backups list since Firebase is disabled in V3
            setBackups([]);
        } catch (error: any) {
            console.error("[BackupModal] Error fetching data:", error);
            toast.error("Error al cargar datos desde el backend remoto");
        } finally {
            setIsLoadingBackups(false);
            setIsLoadingDossiers(false);
        }
    };

    const handleDeleteBackup = async () => {
        // Disabled in V3
        toast.info("Funcionalidad deshabilitada. V3 no usa copias locales de BD.");
        setBackupToDelete(null);
    };

    const handleDeleteDossier = async () => {
        if (!user || dossierToDelete === null) return;

        try {
            await dossierClient.delete({ id: dossierToDelete });
            toast.success("Dossier eliminado correctamente");
            fetchBackupsAndDossiers();
        } catch (error) {
            console.error("[BackupModal] Error deleting dossier:", error);
            toast.error("Error al eliminar el dossier");
        } finally {
            setDossierToDelete(null);
        }
    };

    const handleDownloadDossier = async (dossierId: number, appId: number, name: string) => {
        if (!user) return;

        setIsDownloadingDossier(dossierId);
        try {
            const result = await dossierClient.download({ appId });

            // Decodificamos el base64 a un Blob para descargarlo
            const byteCharacters = atob(result.zipBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/zip" });
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = result.fileName || name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);

            toast.success("Dossier descargado");
        } catch (error) {
            console.error("[BackupModal] Error downloading dossier:", error);
            toast.error("Error al descargar el dossier desde Bunny Storage");
        } finally {
            setIsDownloadingDossier(null);
        }
    };

    const handleRestoreBackup = async () => {
        toast.info("Restauración de SQLite local deshabilitada. Usa directamente la Nube.");
        setBackupToRestore(null);
    };

    useEffect(() => {
        if (isOpen) {
            fetchBackupsAndDossiers();
            setActiveTab("dossiers"); // Default to dossiers in V3
        }
    }, [isOpen]);

    const hasDossiers = dossiers.length > 0 || isLoadingDossiers;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none bg-background">
                    <div className="p-6 space-y-4">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                Gestor de Dossiers y Copias (V3)
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground text-sm">
                                Gestiona tus dossiers remotos e historial del entorno.
                            </DialogDescription>
                        </DialogHeader>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className={`grid w-full grid-cols-3 bg-muted/50 p-1 h-12`}>
                                <TabsTrigger value="dossiers" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none">
                                    <FileText className="h-4 w-4" />
                                    Dossiers
                                </TabsTrigger>
                                <TabsTrigger value="list" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none opacity-50">
                                    <List className="h-4 w-4" />
                                    Antiguas Copias
                                </TabsTrigger>
                                <TabsTrigger value="create" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none opacity-50">
                                    <CloudUpload className="h-4 w-4" />
                                    Copia Local
                                </TabsTrigger>
                            </TabsList>

                            {/* Dossiers Tab */}
                            <TabsContent value="dossiers" className="space-y-4 pt-6">
                                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {isLoadingDossiers ? (
                                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                                            <p>Cargando dossiers remotos...</p>
                                        </div>
                                    ) : dossiers.length === 0 ? (
                                        <div className="text-center py-10 text-muted-foreground">
                                            <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                            <p>No tienes dossiers almacenados</p>
                                            <p className="text-xs mt-1">Los dossiers pueden generarse desde las aplicaciones</p>
                                        </div>
                                    ) : (
                                        dossiers.map((dossier) => (
                                            <div key={dossier.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-md">
                                                        <FileText className="h-4 w-4 text-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{dossier.appName}</p>
                                                        <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{dossier.name}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="opacity-0 group-hover:opacity-100 text-indigo-600 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-opacity"
                                                        onClick={() => handleDownloadDossier(dossier.id, dossier.appId, dossier.name)}
                                                        disabled={isDownloadingDossier === dossier.id}
                                                    >
                                                        {isDownloadingDossier === dossier.id ? (
                                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
                                                        ) : (
                                                            <Download className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                                        onClick={() => setDossierToDelete(dossier.id)}
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

                            <TabsContent value="list" className="space-y-4 pt-6">
                                <div className="text-center py-10 text-muted-foreground">
                                    <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                    <p>Las copias en Firebase se han deshabilitado en esta versión.</p>
                                    <p className="text-xs">Usa la nueva base de datos remota para tu persistencia.</p>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <Button variant="outline" onClick={onClose}>Cerrar</Button>
                                </div>
                            </TabsContent>

                            <TabsContent value="create" className="space-y-6 pt-6">
                                <div className="text-center py-10 text-muted-foreground">
                                    <Database className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                    <p>El backup de DB local (SQLite) ya no es necesario.</p>
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                                </div>
                            </TabsContent>

                        </Tabs>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!backupToDelete} onOpenChange={(open) => !open && setBackupToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar copia local?</AlertDialogTitle>
                        <AlertDialogDescription>Esta funcionalidad ya no tiene efecto.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cerrar</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!dossierToDelete} onOpenChange={(open) => !open && setDossierToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar dossier?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. El dossier será eliminado permanentemente del almacenamiento remoto y Bunny.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteDossier}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
