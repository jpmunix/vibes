import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Copy } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ForceCloseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  performanceData?: {
    timestamp: number;
    memoryUsageMB: number;
    cpuUsagePercent?: number;
    systemMemoryUsageMB?: number;
    systemMemoryTotalMB?: number;
    systemCpuPercent?: number;
  };
  appVersion?: string;
  platform?: string;
  recentLogs?: string;
}

export function ForceCloseDialog({
  isOpen,
  onClose,
  performanceData,
  appVersion,
  platform,
  recentLogs,
}: ForceCloseDialogProps) {
  const [copied, setCopied] = useState(false);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const generateTraceReport = () => {
    let report = "=== INFORME DE CIERRE INESPERADO ===\n\n";

    if (appVersion) {
      report += `Versión: ${appVersion}\n`;
    }

    if (platform) {
      report += `Plataforma: ${platform}\n`;
    }

    if (performanceData) {
      report += `\nMomento del cierre: ${formatTimestamp(performanceData.timestamp)}\n`;
      report += `\n--- Métricas de rendimiento ---\n`;
      report += `Memoria del proceso: ${performanceData.memoryUsageMB} MB\n`;

      if (performanceData.cpuUsagePercent !== undefined) {
        report += `CPU del proceso: ${performanceData.cpuUsagePercent}%\n`;
      }

      if (
        performanceData.systemMemoryUsageMB !== undefined &&
        performanceData.systemMemoryTotalMB !== undefined
      ) {
        report += `Memoria del sistema: ${performanceData.systemMemoryUsageMB} / ${performanceData.systemMemoryTotalMB} MB\n`;
      }

      if (performanceData.systemCpuPercent !== undefined) {
        report += `CPU del sistema: ${performanceData.systemCpuPercent}%\n`;
      }
    }

    if (recentLogs) {
      report += `\n--- Logs recientes ---\n${recentLogs}\n`;
    }

    return report;
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(generateTraceReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error al copiar el informe:", error);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-6xl w-[90vw] max-h-[85vh] flex flex-col">
        <AlertDialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <AlertDialogTitle>Cierre inesperado detectado</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <AlertDialogDescription asChild>
          <div className="space-y-4 pt-2 overflow-y-auto flex-1 pr-2">
            <div className="typo-body">
              La aplicación no se cerró correctamente la última vez. Esto
              podría indicar un error o una terminación inesperada.
            </div>

            {/* System Info */}
            {(appVersion || platform) && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="typo-label text-foreground">
                  Información del sistema
                </div>
                <div className="space-y-1 typo-body">
                  {appVersion && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Versión:</span>
                      <span className="font-mono">{appVersion}</span>
                    </div>
                  )}
                  {platform && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plataforma:</span>
                      <span className="font-mono">{platform}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {performanceData && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="typo-label text-foreground">
                  Último estado conocido:{" "}
                  <span className="font-normal text-muted-foreground">
                    {formatTimestamp(performanceData.timestamp)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 typo-body">
                  {/* Process Metrics */}
                  <div className="space-y-2">
                    <div className="typo-label text-foreground">
                      Métricas del proceso
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Memoria:</span>
                        <span className="font-mono">
                          {performanceData.memoryUsageMB} MB
                        </span>
                      </div>
                      {performanceData.cpuUsagePercent !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">CPU:</span>
                          <span className="font-mono">
                            {performanceData.cpuUsagePercent}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* System Metrics */}
                  {(performanceData.systemMemoryUsageMB !== undefined ||
                    performanceData.systemCpuPercent !== undefined) && (
                      <div className="space-y-2">
                        <div className="typo-label text-foreground">
                          Métricas del sistema
                        </div>
                        <div className="space-y-1">
                          {performanceData.systemMemoryUsageMB !== undefined &&
                            performanceData.systemMemoryTotalMB !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Memoria:
                                </span>
                                <span className="font-mono">
                                  {performanceData.systemMemoryUsageMB} /{" "}
                                  {performanceData.systemMemoryTotalMB} MB
                                </span>
                              </div>
                            )}
                          {performanceData.systemCpuPercent !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">CPU:</span>
                              <span className="font-mono">
                                {performanceData.systemCpuPercent}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Recent Logs */}
            {recentLogs && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="typo-label text-foreground">
                  Logs recientes
                </div>
                <pre className="typo-mono bg-background p-3 rounded overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words">
                  {recentLogs}
                </pre>
              </div>
            )}
          </div>
        </AlertDialogDescription>
        <AlertDialogFooter className="flex-shrink-0 flex-row gap-2 justify-between mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyReport}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            {copied ? "¡Copiado!" : "Copiar informe"}
          </Button>
          <AlertDialogAction onClick={onClose}>Aceptar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
