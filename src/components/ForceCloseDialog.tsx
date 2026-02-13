import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Copy } from "lucide-react";
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
    let report = "=== CRASH REPORT ===\n\n";

    if (appVersion) {
      report += `App Version: ${appVersion}\n`;
    }

    if (platform) {
      report += `Platform: ${platform}\n`;
    }

    if (performanceData) {
      report += `\nCrash Time: ${formatTimestamp(performanceData.timestamp)}\n`;
      report += `\n--- Performance Metrics ---\n`;
      report += `Process Memory: ${performanceData.memoryUsageMB} MB\n`;

      if (performanceData.cpuUsagePercent !== undefined) {
        report += `Process CPU: ${performanceData.cpuUsagePercent}%\n`;
      }

      if (
        performanceData.systemMemoryUsageMB !== undefined &&
        performanceData.systemMemoryTotalMB !== undefined
      ) {
        report += `System Memory: ${performanceData.systemMemoryUsageMB} / ${performanceData.systemMemoryTotalMB} MB\n`;
      }

      if (performanceData.systemCpuPercent !== undefined) {
        report += `System CPU: ${performanceData.systemCpuPercent}%\n`;
      }
    }

    if (recentLogs) {
      report += `\n--- Recent Logs ---\n${recentLogs}\n`;
    }

    return report;
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(generateTraceReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy report:", error);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-6xl w-[90vw] max-h-[85vh] flex flex-col">
        <AlertDialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <AlertDialogTitle>Force Close Detected</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <AlertDialogDescription asChild>
          <div className="space-y-4 pt-2 overflow-y-auto flex-1 pr-2">
            <div className="text-base">
              The app was not closed properly the last time it was running. This
              could indicate a crash or unexpected termination.
            </div>

            {/* System Info */}
            {(appVersion || platform) && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="font-semibold text-sm text-foreground">
                  System Information
                </div>
                <div className="space-y-1 text-sm">
                  {appVersion && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version:</span>
                      <span className="font-mono">{appVersion}</span>
                    </div>
                  )}
                  {platform && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform:</span>
                      <span className="font-mono">{platform}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {performanceData && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="font-semibold text-sm text-foreground">
                  Last Known State:{" "}
                  <span className="font-normal text-muted-foreground">
                    {formatTimestamp(performanceData.timestamp)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {/* Process Metrics */}
                  <div className="space-y-2">
                    <div className="font-medium text-foreground">
                      Process Metrics
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Memory:</span>
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
                        <div className="font-medium text-foreground">
                          System Metrics
                        </div>
                        <div className="space-y-1">
                          {performanceData.systemMemoryUsageMB !== undefined &&
                            performanceData.systemMemoryTotalMB !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Memory:
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
                <div className="font-semibold text-sm text-foreground">
                  Recent Logs
                </div>
                <pre className="text-xs bg-background p-3 rounded overflow-x-auto overflow-y-auto font-mono whitespace-pre-wrap break-words">
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
            {copied ? "Copied!" : "Copy Report"}
          </Button>
          <AlertDialogAction onClick={onClose}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
