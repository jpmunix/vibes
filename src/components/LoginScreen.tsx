/**
 * LoginScreen — Fullscreen login for minube vibes.
 * Uses the app's existing theme CSS variables (light/dark mode).
 * Real cloud logo from assets.
 */
import { useState } from "react";
import { ipc } from "@/ipc/types";
import { useSetAtom } from "jotai";
import { userAtom } from "@/atoms/authAtoms";
import type { VibesUser } from "@/atoms/authAtoms";
import { toast } from "sonner";
import logoSrc from "../../assets/icon/logo.png";

interface LoginScreenProps {
  onAuthSuccess: () => void;
}

export function LoginScreen({ onAuthSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const setUser = useSetAtom(userAtom);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await ipc.auth.login({ email, password });
      localStorage.setItem("vibes_user_id", result.user.id);
      localStorage.setItem("vibes_session_token", result.sessionToken);
      setUser(result.user as VibesUser);
      toast.success(`Bienvenido, ${result.user.displayName}`);
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-background app-region-drag">
      <div className="w-full max-w-[400px] p-10 bg-card rounded-3xl border border-border shadow-lg no-app-region-drag">
        {/* Logo & Brand */}
        <div className="text-center mb-8">
          <img
            src={logoSrc}
            alt="minube vibes"
            className="w-12 h-12 mx-auto mb-4 rounded-lg"
          />
          <h1 className="typo-section-title tracking-tight">
            minube vibes
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="typo-micro uppercase tracking-wider">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="w-full px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="typo-micro uppercase tracking-wider">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors"
            />
          </div>

          {error && (
            <div className="px-3.5 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive-foreground text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg typo-button cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {isLoading ? "Cargando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
