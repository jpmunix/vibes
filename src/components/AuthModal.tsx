import { useState } from "react";
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
import { auth } from "@/lib/firebase";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
} from "firebase/auth";
import { toast } from "sonner";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
                toast.success("Sesión iniciada correctamente");
            } else {
                const userCredential = await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );
                await updateProfile(userCredential.user, {
                    displayName: name,
                });
                toast.success("Cuenta creada correctamente");
            }
            onClose();
        } catch (error: any) {
            console.error("Auth error:", error);
            toast.error(error.message || "Error en la autenticación");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{isLogin ? "Iniciar Sesión" : "Crear Cuenta"}</DialogTitle>
                    <DialogDescription>
                        {isLogin
                            ? "Introduce tus credenciales para acceder a tu cuenta."
                            : "Completa el formulario para registrarte."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {!isLogin && (
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre</Label>
                            <Input
                                id="name"
                                placeholder="Tu nombre"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required={!isLogin}
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="tu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Contraseña</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading
                            ? "Cargando..."
                            : isLogin
                                ? "Iniciar Sesión"
                                : "Crear Cuenta"}
                    </Button>
                </form>
                <div className="text-center text-sm">
                    <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setIsLogin(!isLogin)}
                    >
                        {isLogin
                            ? "¿No tienes cuenta? Regístrate"
                            : "¿Ya tienes cuenta? Inicia sesión"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
