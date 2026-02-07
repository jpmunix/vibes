import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitCommit, FileText, BarChart3, Clock, Sparkles } from "lucide-react";
import type { GitPreview } from "@/ipc/types";
import { cn } from "@/lib/utils";

interface GitPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: GitPreview | null;
  isLoading: boolean;
  onConfirm: () => void;
  isConfirming: boolean;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  onGenerateCommitMessage: () => void;
  isGeneratingMessage: boolean;
}

function getStatusColor(status: string) {
  switch (status) {
    case "added":
      return "text-green-600 dark:text-green-400";
    case "modified":
      return "text-blue-600 dark:text-blue-400";
    case "deleted":
      return "text-red-600 dark:text-red-400";
    case "renamed":
      return "text-yellow-600 dark:text-yellow-400";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "added":
      return "+";
    case "modified":
      return "~";
    case "deleted":
      return "-";
    case "renamed":
      return "→";
    default:
      return "?";
  }
}

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 0) return `hace ${days}d`;
    if (hours > 0) return `hace ${hours}h`;
    if (minutes > 0) return `hace ${minutes}m`;
    return "justo ahora";
  } catch {
    return dateStr;
  }
}

export function GitPreviewModal({
  open,
  onOpenChange,
  preview,
  isLoading,
  onConfirm,
  isConfirming,
  commitMessage,
  onCommitMessageChange,
  onGenerateCommitMessage,
  isGeneratingMessage,
}: GitPreviewModalProps) {
  const [selectedTab, setSelectedTab] = useState("overview");

  if (!preview && !isLoading) return null;

  const hasUncommittedFiles = (preview?.uncommittedFiles?.length ?? 0) > 0;
  const hasLocalCommits = (preview?.localCommits?.length ?? 0) > 0;
  const hasChanges = hasUncommittedFiles || hasLocalCommits;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            Vista previa de cambios
          </DialogTitle>
          <DialogDescription>
            Revisa los cambios antes de sincronizar con GitHub
          </DialogDescription>
        </DialogHeader>

        {/* Commit Message Input */}
        {hasUncommittedFiles && !isLoading && (
          <div className="space-y-2 border-b border-gray-200 dark:border-gray-700 pb-4">
            <div className="flex justify-between items-center">
              <Label
                htmlFor="modal-commit-message"
                className="text-sm font-semibold"
              >
                Mensaje de commit
              </Label>
              {!commitMessage.trim() && (
                <span className="text-xs text-red-500 font-medium">
                  Obligatorio
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="modal-commit-message"
                placeholder="Describe tus cambios..."
                value={commitMessage}
                onChange={(e) => onCommitMessageChange(e.target.value)}
                className={cn(
                  "flex-1",
                  !commitMessage.trim() &&
                    "border-red-500 focus-visible:ring-red-500",
                )}
                disabled={isGeneratingMessage}
              />
              <Button
                onClick={onGenerateCommitMessage}
                disabled={isGeneratingMessage}
                variant="outline"
                size="icon"
                className="flex-shrink-0"
                title="Generar mensaje con IA"
              >
                {isGeneratingMessage ? (
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isGeneratingMessage
                ? "Generando mensaje con IA..."
                : "Edita el mensaje o genera uno automáticamente con IA"}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <svg
                className="animate-spin h-8 w-8 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Cargando cambios...
              </p>
            </div>
          </div>
        ) : !hasChanges ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No hay cambios para sincronizar
              </p>
            </div>
          </div>
        ) : (
          <Tabs
            value={selectedTab}
            onValueChange={setSelectedTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Resumen
              </TabsTrigger>
              <TabsTrigger value="files" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Archivos ({preview?.uncommittedFiles?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="commits" className="flex items-center gap-2">
                <GitCommit className="h-4 w-4" />
                Commits ({preview?.localCommits?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent
              value="overview"
              className="flex-1 overflow-hidden mt-4"
            >
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 pr-4">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-gray-900">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        +{preview?.totalAdditions ?? 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Líneas añadidas
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-red-50 to-white dark:from-red-900/20 dark:to-gray-900">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        -{preview?.totalDeletions ?? 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Líneas eliminadas
                      </div>
                    </div>
                  </div>

                  {/* Uncommitted Files Summary */}
                  {hasUncommittedFiles && (
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Archivos modificados
                      </h3>
                      <div className="space-y-2">
                        {preview?.uncommittedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span
                                className={`font-mono text-xs font-bold ${getStatusColor(file.status)}`}
                              >
                                {getStatusIcon(file.status)}
                              </span>
                              <span className="truncate font-mono text-xs">
                                {file.path}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs ml-4">
                              <span className="text-green-600 dark:text-green-400">
                                +{file.additions}
                              </span>
                              <span className="text-red-600 dark:text-red-400">
                                -{file.deletions}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Local Commits Summary */}
                  {hasLocalCommits && (
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <GitCommit className="h-4 w-4" />
                        Commits locales
                      </h3>
                      <div className="space-y-2">
                        {preview?.localCommits.map((commit, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-3 text-sm"
                          >
                            <code className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {commit.shortHash}
                            </code>
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{commit.message}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {commit.author} · {formatDate(commit.date)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Files Tab */}
            <TabsContent value="files" className="flex-1 overflow-hidden mt-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 pr-4">
                  {preview?.uncommittedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span
                            className={`font-mono text-xs font-bold ${getStatusColor(file.status)}`}
                          >
                            {getStatusIcon(file.status)}
                          </span>
                          <span className="truncate font-mono text-sm font-semibold">
                            {file.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs ml-4">
                          <span className="text-green-600 dark:text-green-400 font-semibold">
                            +{file.additions}
                          </span>
                          <span className="text-red-600 dark:text-red-400 font-semibold">
                            -{file.deletions}
                          </span>
                        </div>
                      </div>
                      {file.diff && (
                        <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto max-h-64">
                          <code>{file.diff}</code>
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Commits Tab */}
            <TabsContent
              value="commits"
              className="flex-1 overflow-hidden mt-4"
            >
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {preview?.localCommits.map((commit, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                          <GitCommit className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium mb-1">
                            {commit.message}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-mono">
                              {commit.shortHash}
                            </span>
                            <span>·</span>
                            <span>{commit.author}</span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(commit.date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={
              isConfirming ||
              isLoading ||
              !hasChanges ||
              (hasUncommittedFiles && !commitMessage.trim())
            }
          >
            {isConfirming ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 mr-2"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Sincronizando...
              </>
            ) : (
              "Sincronizar con GitHub"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
