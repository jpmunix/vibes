/**
 * LoginScreen — Fullscreen login/registration for minube vibes.
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
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const setUser = useSetAtom(userAtom);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (isLogin) {
        const result = await ipc.auth.login({ email, password });
        localStorage.setItem("vibes_user_id", result.user.id);
        localStorage.setItem("vibes_session_token", result.sessionToken);
        setUser(result.user as VibesUser);
        toast.success(`Bienvenido, ${result.user.displayName}`);
        onAuthSuccess();
      } else {
        if (!displayName.trim()) {
          setError("El nombre es obligatorio");
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError("Las contraseñas no coinciden");
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setError("La contraseña debe tener al menos 6 caracteres");
          setIsLoading(false);
          return;
        }
        const result = await ipc.auth.register({
          email,
          password,
          displayName: displayName.trim(),
        });
        localStorage.setItem("vibes_user_id", result.user.id);
        localStorage.setItem("vibes_session_token", result.sessionToken);
        setUser(result.user as VibesUser);
        toast.success("¡Cuenta creada correctamente!");
        onAuthSuccess();
      }
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

        {/* Tabs */}
        <div className="flex bg-muted rounded-xl p-1 mb-6 gap-1">
          <button
            type="button"
            className={`flex-1 py-2.5 px-4 typo-tab rounded-lg transition-all cursor-pointer ${isLogin
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }`}
            onClick={() => { setIsLogin(true); setError(""); }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`flex-1 py-2.5 px-4 typo-tab rounded-lg transition-all cursor-pointer ${!isLogin
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }`}
            onClick={() => { setIsLogin(false); setError(""); }}
          >
            Crear cuenta
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="displayName" className="typo-micro uppercase tracking-wider">
                Nombre
              </label>
              <input
                id="displayName"
                type="text"
                placeholder="Tu nombre"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoComplete="name"
                className="w-full px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors"
              />
            </div>
          )}

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
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors"
            />
          </div>

          {!isLogin && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="typo-micro uppercase tracking-wider">
                Confirmar contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors"
              />
            </div>
          )}

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
            {isLoading
              ? "Cargando..."
              : isLogin
                ? "Entrar"
                : "Crear cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}
