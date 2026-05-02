/**
 * Admin — Create User form.
 * Form with name, email, and password (manual or auto-generated).
 */
import { useState, useCallback } from "react";
import { ipc } from "@/ipc/types";
import {
    Eye,
    EyeOff,
    Copy,
    RefreshCw,
    Loader2,
    Check,
} from "@/components/ui/icons";
import { toast } from "sonner";

/**
 * Generate a strong random password: 16 chars, mixed case, digits, symbols.
 */
function generatePassword(): string {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const symbols = "!@#$%&*-_+=?";
    const all = upper + lower + digits + symbols;

    // Guarantee at least one char from each pool
    const pw = [
        upper[Math.floor(Math.random() * upper.length)],
        lower[Math.floor(Math.random() * lower.length)],
        digits[Math.floor(Math.random() * digits.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
    ];

    for (let i = pw.length; i < 16; i++) {
        pw.push(all[Math.floor(Math.random() * all.length)]);
    }

    // Shuffle
    for (let i = pw.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pw[i], pw[j]] = [pw[j], pw[i]];
    }

    return pw.join("");
}

interface AdminCreateUserProps {
    onCreated?: () => void;
}

export function AdminCreateUser({ onCreated }: AdminCreateUserProps) {
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleGenerate = useCallback(() => {
        const pw = generatePassword();
        setPassword(pw);
        setShowPassword(true);
    }, []);

    const handleCopy = useCallback(async () => {
        if (!password) return;
        await navigator.clipboard.writeText(password);
        setCopied(true);
        toast.success("Contraseña copiada");
        setTimeout(() => setCopied(false), 2000);
    }, [password]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!displayName.trim()) {
            toast.error("El nombre es obligatorio");
            return;
        }
        if (!email.trim()) {
            toast.error("El email es obligatorio");
            return;
        }
        if (password.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            return;
        }

        setSaving(true);
        try {
            const user = await ipc.admin.createUser({
                displayName: displayName.trim(),
                email: email.trim(),
                password,
            });
            toast.success(`Usuario "${user.displayName}" creado`);
            // Reset form
            setDisplayName("");
            setEmail("");
            setPassword("");
            setShowPassword(false);
            onCreated?.();
        } catch (err: any) {
            toast.error(err.message || "Error al crear usuario");
        } finally {
            setSaving(false);
        }
    };

    const inputClass =
        "w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors";

    return (
        <div className="p-6 max-w-lg mx-auto w-full">
            {/* Header */}
            <h2 className="typo-section-title mb-6">Crear usuario</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                    <label htmlFor="admin-name" className="typo-label">
                        Nombre
                    </label>
                    <input
                        id="admin-name"
                        type="text"
                        placeholder="Nombre del usuario"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        autoFocus
                        className={inputClass}
                    />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                    <label htmlFor="admin-email" className="typo-label">
                        Email
                    </label>
                    <input
                        id="admin-email"
                        type="email"
                        placeholder="usuario@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={inputClass}
                    />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                    <label htmlFor="admin-password" className="typo-label">
                        Contraseña
                    </label>
                    <div className="flex gap-1.5">
                        <div className="relative flex-1">
                            <input
                                id="admin-password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Mínimo 6 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className={`${inputClass} pr-9`}
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                        {/* Generate button */}
                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs transition-colors cursor-pointer shrink-0"
                            onClick={handleGenerate}
                            title="Generar contraseña segura"
                        >
                            <RefreshCw size={12} />
                            Generar
                        </button>
                        {/* Copy button */}
                        {password && (
                            <button
                                type="button"
                                className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs transition-colors cursor-pointer shrink-0"
                                onClick={handleCopy}
                                title="Copiar contraseña"
                            >
                                {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                            </button>
                        )}
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
                >
                    {saving ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            Creando...
                        </>
                    ) : (
                        "Crear usuario"
                    )}
                </button>
            </form>
        </div>
    );
}
