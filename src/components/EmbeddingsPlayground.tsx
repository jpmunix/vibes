import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ipc } from "@/ipc/types";
import type { ListedApp } from "@/ipc/types/app";
import { showError } from "@/lib/toast";
import { FileText, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface EmbeddingsPlaygroundProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  path: string;
  score: number;
  snippet: string;
}

export function EmbeddingsPlayground({
  open,
  onOpenChange,
}: EmbeddingsPlaygroundProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [embeddings, setEmbeddings] = useState<number[] | null>(null);
  const [indexStats, setIndexStats] = useState<{
    totalFiles: number;
    totalChunks: number;
    indexSize: number;
  } | null>(null);
  const [apps, setApps] = useState<ListedApp[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [loadingApps, setLoadingApps] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const appPath =
    apps.find((app) => app.id === selectedAppId)?.resolvedPath ?? null;

  // Load index stats when appPath changes
  useEffect(() => {
    const loadStats = async () => {
      if (!appPath) {
        setIndexStats(null);
        return;
      }

      try {
        const stats = await ipc.embeddings.getIndexStats(appPath);
        setIndexStats(stats);
      } catch (error) {
        console.error("Error loading index stats:", error);
        // Don't show error, just set empty stats
        setIndexStats({ totalFiles: 0, totalChunks: 0, indexSize: 0 });
      }
    };

    loadStats();
  }, [appPath]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      showError("Por favor, introduce una consulta");
      return;
    }

    if (!appPath) {
      showError("No hay una aplicación abierta");
      return;
    }

    setIsSearching(true);
    try {
      // Get embeddings for the query
      const queryEmbeddings = await ipc.embeddings.getEmbeddings(query);
      setEmbeddings(Array.from(queryEmbeddings));

      // Get semantic search results
      const searchResults = await ipc.embeddings.searchSimilarFiles({
        appPath,
        query,
        maxResults: 10,
      });
      setResults(searchResults);

      // Get index stats
      const stats = await ipc.embeddings.getIndexStats(appPath);
      setIndexStats(stats);

      toast.success(`Encontrados ${searchResults.length} resultados`);
    } catch (error) {
      console.error("Error en búsqueda semántica:", error);
      showError(
        error instanceof Error ? error.message : "Error al buscar archivos",
      );
    } finally {
      setIsSearching(false);
    }
  }, [query, appPath]);

  const handleClose = useCallback(() => {
    setQuery("");
    setResults([]);
    setEmbeddings(null);
    setIndexStats(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleIndexFiles = useCallback(async () => {
    if (!appPath) {
      showError("Selecciona una aplicación primero");
      return;
    }

    setIsIndexing(true);
    console.log(`[UI] Starting indexation for app: ${appPath}`);

    try {
      toast.info("Escaneando archivos...", { duration: 2000 });

      const result = await ipc.embeddings.indexAllFiles(appPath);

      if (result.filesIndexed === 0) {
        toast.warning("No se encontraron archivos para indexar");
      } else {
        toast.success(
          `Indexación completada: ${result.filesIndexed} archivos indexados`,
          { duration: 5000 },
        );
      }

      // Refresh stats
      const stats = await ipc.embeddings.getIndexStats(appPath);
      setIndexStats(stats);
    } catch (error) {
      console.error("Error indexando archivos:", error);
      showError(
        error instanceof Error ? error.message : "Error al indexar archivos",
      );
    } finally {
      setIsIndexing(false);
    }
  }, [appPath]);

  const handleClearAndReindex = useCallback(async () => {
    if (!appPath) {
      showError("Selecciona una aplicación primero");
      return;
    }

    setIsIndexing(true);
    console.log(`[UI] Clearing and reindexing for app: ${appPath}`);

    try {
      toast.info("Borrando índice y reindexando...", { duration: 2000 });

      const result = await ipc.embeddings.clearAndReindex(appPath);

      if (result.filesIndexed === 0) {
        toast.warning("No se encontraron archivos para indexar");
      } else {
        toast.success(
          `Reindexación completada: ${result.filesIndexed} archivos indexados`,
          { duration: 5000 },
        );
      }

      // Refresh stats
      const stats = await ipc.embeddings.getIndexStats(appPath);
      setIndexStats(stats);
    } catch (error) {
      console.error("Error reindexando:", error);
      showError(
        error instanceof Error ? error.message : "Error al reindexar archivos",
      );
    } finally {
      setIsIndexing(false);
    }
  }, [appPath]);

  const handleClearIndex = useCallback(async () => {
    if (!appPath) {
      showError("Selecciona una aplicación primero");
      return;
    }

    setIsClearing(true);
    console.log(`[UI] Clearing index for app: ${appPath}`);

    try {
      await ipc.embeddings.clearIndex(appPath);
      toast.success("Índice eliminado correctamente");

      // Refresh stats
      setIndexStats({ totalFiles: 0, totalChunks: 0, indexSize: 0 });
    } catch (error) {
      console.error("Error clearing index:", error);
      showError(
        error instanceof Error ? error.message : "Error al eliminar el índice",
      );
    } finally {
      setIsClearing(false);
    }
  }, [appPath]);

  // Load apps when dialog opens
  useEffect(() => {
    if (open) {
      setLoadingApps(true);
      ipc.app
        .listApps()
        .then((response) => {
          setApps(response.apps);
          // Auto-select first app if available
          if (response.apps.length > 0 && !selectedAppId) {
            setSelectedAppId(response.apps[0].id);
          }
        })
        .catch((error) => {
          console.error("Error loading apps:", error);
          showError("Error al cargar las aplicaciones");
        })
        .finally(() => {
          setLoadingApps(false);
        });
    }
  }, [open, selectedAppId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Playground de Embeddings MiniLM</DialogTitle>
          <DialogDescription>
            Prueba el modelo de embeddings all-MiniLM-L6-v2 y la búsqueda
            semántica en tu codebase
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* App Selector */}
          <div className="space-y-2">
            <Label htmlFor="app-select">Aplicación</Label>
            <Select
              value={selectedAppId?.toString() ?? ""}
              onValueChange={(value) => setSelectedAppId(Number(value))}
              disabled={loadingApps || apps.length === 0}
            >
              <SelectTrigger id="app-select">
                <SelectValue
                  placeholder={
                    loadingApps
                      ? "Cargando aplicaciones..."
                      : apps.length === 0
                        ? "No hay aplicaciones disponibles"
                        : "Selecciona una aplicación"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {apps.map((app) => (
                  <SelectItem key={app.id} value={app.id.toString()}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {apps.length === 0 && !loadingApps && (
              <p className="text-xs text-muted-foreground">
                Crea o abre una aplicación primero
              </p>
            )}
            {appPath && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleIndexFiles}
                  disabled={isIndexing}
                  className="flex-1"
                >
                  {isIndexing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Indexando...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Indexar archivos
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAndReindex}
                  disabled={isIndexing || isClearing}
                  className="flex-1"
                >
                  {isIndexing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reindexando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reindexar desde cero
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearIndex}
                  disabled={isIndexing || isClearing}
                  className="px-3"
                >
                  {isClearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Index Stats - Always show if app is selected */}
          {appPath && indexStats && (
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-medium">Estadísticas del índice</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Archivos indexados</p>
                  <p className="font-mono font-medium">
                    {indexStats.totalFiles}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Chunks totales</p>
                  <p className="font-mono font-medium">
                    {indexStats.totalChunks}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tamaño del índice</p>
                  <p className="font-mono font-medium">
                    {(indexStats.indexSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              {indexStats.totalFiles === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  No hay archivos indexados. Haz clic en "Indexar archivos" para empezar.
                </p>
              )}
            </div>
          )}

          {/* Search Input */}
          <div className="space-y-2">
            <Label htmlFor="query">Consulta de búsqueda</Label>
            <div className="flex gap-2">
              <Input
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: función de autenticación, manejo de errores, etc."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSearching) {
                    handleSearch();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching || !query.trim() || !appPath}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Embeddings Vector */}
          {embeddings && (
            <div className="space-y-2">
              <Label>Vector de embeddings (384 dimensiones)</Label>
              <div className="bg-muted rounded-lg p-4 max-h-32 overflow-y-auto">
                <code className="text-xs font-mono break-all">
                  [
                  {embeddings
                    .slice(0, 20)
                    .map((v) => v.toFixed(4))
                    .join(", ")}
                  , ... {embeddings.length - 20} más]
                </code>
              </div>
              <p className="text-xs text-muted-foreground">
                Mostrando las primeras 20 dimensiones del vector de{" "}
                {embeddings.length}
              </p>
            </div>
          )}

          {/* Search Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <Label>Archivos más similares</Label>
              <div className="space-y-2">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className="bg-muted rounded-lg p-4 space-y-2 hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="text-sm font-mono font-medium truncate">
                          {result.path}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded">
                          {(result.score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="bg-background rounded p-2 text-xs font-mono overflow-x-auto">
                      <pre className="whitespace-pre-wrap break-words">
                        {result.snippet}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isSearching && results.length === 0 && embeddings === null && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Introduce una consulta y presiona "Buscar" para ver resultados
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
