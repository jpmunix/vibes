import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useLoadApp } from "@/hooks/useLoadApp";
import { GitHubConnector } from "@/components/GitHubConnector";
import { VercelConnector } from "@/components/VercelConnector";
import { FirebaseConnector } from "@/components/FirebaseConnector";
import { FirebaseDeployer } from "@/components/FirebaseDeployer";
import { PortalMigrate } from "@/components/PortalMigrate";
import { ipc } from "@/ipc/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GithubCollaboratorManager } from "@/components/GithubCollaboratorManager";
import { Triangle, Loader2, Server, Github, AlertTriangle, Flame } from "@/components/ui/icons";

export const PublishPanel = () => {
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { app, loading } = useLoadApp(selectedAppId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
        <h2 className="typo-subsection-title">
          Cargando...
        </h2>
      </div>
    );
  }

  if (!selectedAppId || !app) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Server className="w-6 h-6 text-muted-foreground" />
        </div>
        <h2 className="typo-subsection-title">
          Ninguna aplicación seleccionada
        </h2>
        <p className="text-muted-foreground max-w-md">
          Selecciona una aplicación para ver las opciones de publicación.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div>
          <h1 className="typo-section-title mb-2">
            Publicar aplicación
          </h1>
        </div>

        {/* Portal Section - Show only if app has neon project */}
        {app.neonProjectId && <PortalMigrate appId={selectedAppId} />}

        {/* GitHub Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Github className="w-5 h-5 flex-shrink-0" />
              GitHub
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="typo-caption">
              Sincroniza tu código con GitHub para colaborar.
            </p>
            <GitHubConnector
              appId={selectedAppId}
              folderName={app.name}
              expanded={true}
            />
            {app.githubOrg && app.githubRepo && (
              <div className="pt-4 border-t border-border">
                <GithubCollaboratorManager appId={selectedAppId} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vercel Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <button
                onClick={() => {
                  ipc.system.openExternalUrl("https://vercel.com/dashboard");
                }}
                className="flex items-center gap-2 hover:text-primary transition-colors cursor-pointer bg-transparent border-none p-0"
              >
                <Triangle className="w-5 h-5 fill-current" />
                Vercel
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="typo-caption">
              Publica tu aplicación desplegándola en Vercel.
            </p>

            {!app?.githubOrg || !app?.githubRepo ? (
              <div className="bg-accent border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="typo-label">
                      Se requiere GitHub para el despliegue en Vercel
                    </h3>
                    <p className="typo-caption mt-1">
                      El despliegue en Vercel requiere conectar primero con
                      GitHub. Por favor, configura tu repositorio de GitHub
                      arriba.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <VercelConnector appId={selectedAppId} folderName={app.name} />
            )}
          </CardContent>
        </Card>

        {/* Firebase Section - Hidden temporarily
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <button
                onClick={() => {
                  ipc.system.openExternalUrl("https://console.firebase.google.com/");
                }}
                className="flex items-center gap-2 hover:text-orange-600 dark:hover:text-orange-400 transition-colors cursor-pointer bg-transparent border-none p-0"
              >
                <Flame className="w-5 h-5 text-orange-500" />
                Firebase
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Publica tu aplicación directamente en Firebase Hosting.
            </p>

            {app.firebaseProjectId ? (
              <FirebaseDeployer appId={selectedAppId} app={app} />
            ) : (
              <FirebaseConnector appId={selectedAppId} noCard={true} />
            )}
          </CardContent>
        </Card>
        */}
      </div>
    </div>
  );
};
