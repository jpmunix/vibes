import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";
import { showSuccess } from "@/lib/toast";
import {
  Smartphone,
  TabletSmartphone,
  Loader2,
  ExternalLink,
  Copy,
} from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { queryKeys } from "@/lib/queryKeys";

interface CapacitorControlsProps {
  appId: number;
}

type CapacitorStatus = "idle" | "syncing" | "opening";

export function CapacitorControls({ appId }: CapacitorControlsProps) {
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [iosStatus, setIosStatus] = useState<CapacitorStatus>("idle");
  const [androidStatus, setAndroidStatus] = useState<CapacitorStatus>("idle");

  // Check if Capacitor is installed
  const { data: isCapacitor, isLoading } = useQuery({
    queryKey: queryKeys.appUpgrades.isCapacitor({ appId }),
    queryFn: () => ipc.capacitor.isCapacitor({ appId }),
    enabled: appId !== undefined && appId !== null,
  });

  const showErrorDialog = (title: string, error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setErrorDetails({ title, message: errorMessage });
    setErrorDialogOpen(true);
  };

  // Sync and open iOS mutation
  const syncAndOpenIosMutation = useMutation({
    mutationFn: async () => {
      setIosStatus("syncing");
      // First sync
      await ipc.capacitor.syncCapacitor({ appId });
      setIosStatus("opening");
      // Then open iOS
      await ipc.capacitor.openIos({ appId });
    },
    onSuccess: () => {
      setIosStatus("idle");
      showSuccess("Proyecto iOS sincronizado y abierto en Xcode");
    },
    onError: (error) => {
      setIosStatus("idle");
      showErrorDialog("Error al sincronizar y abrir el proyecto iOS", error);
    },
  });

  // Sync and open Android mutation
  const syncAndOpenAndroidMutation = useMutation({
    mutationFn: async () => {
      setAndroidStatus("syncing");
      // First sync
      await ipc.capacitor.syncCapacitor({ appId });
      setAndroidStatus("opening");
      // Then open Android
      await ipc.capacitor.openAndroid({ appId });
    },
    onSuccess: () => {
      setAndroidStatus("idle");
      showSuccess("Proyecto Android sincronizado y abierto en Android Studio");
    },
    onError: (error) => {
      setAndroidStatus("idle");
      showErrorDialog(
        "Error al sincronizar y abrir el proyecto Android",
        error,
      );
    },
  });

  // Helper function to get button text based on status
  const getIosButtonText = () => {
    switch (iosStatus) {
      case "syncing":
        return { main: "Sincronizando...", sub: "Construyendo la aplicación" };
      case "opening":
        return { main: "Abriendo...", sub: "Iniciando Xcode" };
      default:
        return { main: "Sincronizar y abrir iOS", sub: "Xcode" };
    }
  };

  const getAndroidButtonText = () => {
    switch (androidStatus) {
      case "syncing":
        return { main: "Sincronizando...", sub: "Construyendo la aplicación" };
      case "opening":
        return { main: "Abriendo...", sub: "Iniciando Android Studio" };
      default:
        return { main: "Sincronizar y abrir Android", sub: "Android Studio" };
    }
  };

  // Don't render anything if loading or if Capacitor is not installed
  if (isLoading || !isCapacitor) {
    return null;
  }

  const iosButtonText = getIosButtonText();
  const androidButtonText = getAndroidButtonText();

  return (
    <>
      <Card className="mt-1" data-testid="capacitor-controls">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between typo-section-title">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Desarrollo móvil
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // TODO: Add actual help link
                ipc.system.openExternalUrl(
                  "https://github.com/minube/vibes/guides/mobile-app#troubleshooting",
                );
              }}
              className="typo-caption text-muted-foreground hover:text-foreground dark:text-muted-foreground/70 dark:hover:text-foreground flex items-center gap-1"
            >
              ¿Necesitas ayuda?
              <ExternalLink className="h-3 w-3" />
            </Button>
          </CardTitle>
          <CardDescription>
            Sincroniza y abre tus proyectos móviles de Capacitor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => syncAndOpenIosMutation.mutate()}
              disabled={syncAndOpenIosMutation.isPending}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 h-10"
            >
              {syncAndOpenIosMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              <div className="text-left">
                <div className="typo-label">{iosButtonText.main}</div>
                <div className="typo-caption text-muted-foreground">{iosButtonText.sub}</div>
              </div>
            </Button>

            <Button
              onClick={() => syncAndOpenAndroidMutation.mutate()}
              disabled={syncAndOpenAndroidMutation.isPending}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 h-10"
            >
              {syncAndOpenAndroidMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TabletSmartphone className="h-4 w-4" />
              )}
              <div className="text-left">
                <div className="typo-label">
                  {androidButtonText.main}
                </div>
                <div className="typo-caption text-muted-foreground">
                  {androidButtonText.sub}
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {errorDetails?.title}
            </DialogTitle>
            <DialogDescription>
              Ocurrió un error al ejecutar el comando de Capacitor. Ver detalles
              a continuación:
            </DialogDescription>
          </DialogHeader>

          {errorDetails && (
            <div className="relative">
              <div className="max-h-[50vh] w-full max-w-md rounded border p-4 bg-muted overflow-y-auto">
                <pre className="typo-mono whitespace-pre-wrap">
                  {errorDetails.message}
                </pre>
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(errorDetails.message);
                  showSuccess("Detalles del error copiados al portapapeles");
                }}
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-8 w-8 p-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                if (errorDetails) {
                  navigator.clipboard.writeText(errorDetails.message);
                  showSuccess("Error details copied to clipboard");
                }
              }}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copiar error
            </Button>
            <Button
              onClick={() => setErrorDialogOpen(false)}
              variant="outline"
              size="sm"
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
