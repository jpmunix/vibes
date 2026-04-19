import { useState, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/lib/firebase";
import {
    reauthenticateWithCredential,
    EmailAuthProvider,
} from "firebase/auth";
import { toast } from "sonner";
import { User, Lock, Upload, X, Palette } from "@/components/ui/icons";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import { useSetAtom } from "jotai";
import { userAtom, VibesUser } from "@/atoms/authAtoms";
import { ipc } from "@/ipc/types";

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: VibesUser;
}

export function ProfileModal({ isOpen, onClose, user }: ProfileModalProps) {
    const [name, setName] = useState(user?.displayName || "");
    const [photoURL, setPhotoURL] = useState(user?.photoUrl || "");
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const setUser = useSetAtom(userAtom);

    // Password fields
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const handleUpdateProfile = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const updatedUser = await (ipc as any).auth.updateProfile({
                userId: user.id,
                displayName: name,
                photoUrl: photoURL,
            });

            setUser(updatedUser);
            toast.success("Perfil actualizado correctamente");
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Error al actualizar el perfil");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsLoading(true);
        try {
            const extension = file.name.split('.').pop();
            const fileName = `avatar-${user.id}-${Date.now()}.${extension}`;

            // Read file as ArrayBuffer
            const fileData = await file.arrayBuffer();

            // Upload via IPC to Bunny Storage
            const url = await (ipc as any).bunny.uploadAvatar({
                fileName,
                data: fileData,
                contentType: file.type
            });

            // Update profile via IPC
            const updatedUser = await (ipc as any).auth.updateProfile({
                userId: user.id,
                photoUrl: url
            });

            setUser(updatedUser);
            setPhotoURL(url);
            toast.success("Imagen subida correctamente");
        } catch (error: any) {
            toast.error("Error al subir la imagen");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!user) return;
        if (newPassword !== confirmPassword) {
            toast.error("Las contraseñas no coinciden");
            return;
        }

        setIsLoading(true);
        try {
            const credential = EmailAuthProvider.credential(user.email!, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            toast.success("Contraseña actualizada correctamente");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Error al actualizar la contraseña");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none bg-background">
                <div className="p-6 space-y-4">
                    <DialogHeader className="flex flex-row items-center justify-between">
                        <div className="space-y-1">
                            <DialogTitle className="typo-section-title">Configuración de cuenta</DialogTitle>
                            <DialogDescription className="typo-caption">
                                Administra tu perfil y configuración de seguridad
                            </DialogDescription>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="profile" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 h-12">
                            <TabsTrigger value="profile" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none typo-tab">
                                <User className="h-4 w-4" />
                                Perfil
                            </TabsTrigger>
                            <TabsTrigger value="password" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none border-none typo-tab">
                                <Lock className="h-4 w-4" />
                                Contraseña
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="profile" className="space-y-6 pt-6">
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="relative group">
                                    <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-muted flex items-center justify-center bg-muted">
                                        <SimpleAvatar
                                            src={photoURL}
                                            fallbackText={name?.[0] || user?.email?.[0] || "U"}
                                            className="h-full w-full text-4xl"
                                        />
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                >
                                    <Upload className="h-4 w-4" />
                                    Cambiar foto
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="displayName" className="typo-label">Nombre visible</Label>
                                    <Input
                                        id="displayName"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Tu nombre"
                                        className="h-10"
                                    />
                                </div>
                                <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
                                    <p className="typo-caption">Tu dirección de email: <span className="font-bold">{user?.email}</span></p>
                                    <p className="typo-micro uppercase">El email no se puede cambiar por razones de seguridad</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                                <Button
                                    onClick={handleUpdateProfile}
                                    disabled={isLoading}
                                    className="bg-[#1a1f2e] hover:bg-[#2a2f3e] text-white"
                                >
                                    Guardar cambios
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="password" className="space-y-4 pt-6">
                            <div className="space-y-1">
                                <h3 className="typo-label">Cambiar contraseña</h3>
                                <p className="typo-caption">
                                    Para cambiar tu contraseña, por favor confirma tu contraseña actual y establece una nueva
                                </p>
                            </div>

                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="current" className="typo-micro uppercase tracking-wider">Contraseña actual</Label>
                                    <Input
                                        id="current"
                                        type="password"
                                        placeholder="Ingresa tu contraseña actual"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new" className="typo-micro uppercase tracking-wider">Nueva contraseña</Label>
                                    <Input
                                        id="new"
                                        type="password"
                                        placeholder="Mínimo 6 caracteres"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm" className="typo-micro uppercase tracking-wider">Confirmar nueva contraseña</Label>
                                    <Input
                                        id="confirm"
                                        type="password"
                                        placeholder="Repite la nueva contraseña"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50 p-4 rounded-lg">
                                <p className="typo-caption">
                                    <span className="font-bold">Importante:</span> Después de cambiar la contraseña, necesitarás usarla para iniciar sesión la próxima vez.
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                                <Button
                                    onClick={handleUpdatePassword}
                                    disabled={isLoading}
                                    className="bg-[#1a1f2e] hover:bg-[#2a2f3e] text-white shadow-none"
                                >
                                    Cambiar contraseña
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
