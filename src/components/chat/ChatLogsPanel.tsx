import { useEffect, useState } from "react";
import { ipc, type ChatLogEntry } from "@/ipc/types";
import { Button } from "../ui/button";
import {
  X,
  Info,
  TrendingUp,
  Clock,
  Zap,
  Bot,
  Brain,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface ChatLogsPanelProps {
  chatId: number;
  isOpen: boolean;
  onClose: () => void;
}

interface TokenStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

interface HourlyStats {
  hour: string;
  tokens: number;
  messages: number;
}

export function ChatLogsPanel({ chatId, isOpen, onClose }: ChatLogsPanelProps) {
  const [logs, setLogs] = useState<ChatLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ChatLogEntry | null>(null);

  const getModeIcon = (log: ChatLogEntry) => {
    const chatMode = log.metadata?.chatMode as string | undefined;
    if (chatMode === "local-agent" || chatMode === "agent") {
      return (
        <div className="flex items-center gap-1 w-[72px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800">
          <Brain className="text-purple-600 dark:text-purple-400" size={10} />
          <span className="text-[9px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-tighter">
            Agente
          </span>
        </div>
      );
    }
    // Default to build mode icon
    return (
      <div className="flex items-center gap-1 w-[72px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
        <Bot className="text-blue-600 dark:text-blue-400" size={10} />
        <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-tighter">
          Build
        </span>
      </div>
    );
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await ipc.chatLogs.getChatLogs({ chatId, limit: 500 });
      setLogs(data);
    } catch (error) {
      console.error("Failed to load chat logs", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && chatId) {
      void loadLogs();
    }
  }, [isOpen, chatId]);

  // Calculate token stats
  const tokenStats: TokenStats = logs.reduce(
    (acc, log) => {
      if (log.category === "token-usage" && log.metadata) {
        const total = (log.metadata.totalTokens as number) || 0;
        const input = (log.metadata.inputTokens as number) || 0;
        const output = (log.metadata.outputTokens as number) || 0;
        return {
          totalTokens: acc.totalTokens + total,
          inputTokens: acc.inputTokens + input,
          outputTokens: acc.outputTokens + output,
        };
      }
      return acc;
    },
    { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
  );

  // Calculate hourly stats
  const hourlyStats: HourlyStats[] = (() => {
    const stats = new Map<string, { tokens: number; messages: Set<number> }>();

    logs.forEach((log) => {
      const date = new Date(log.timestamp);
      const hourKey = `${date.getHours()}:00`;

      if (!stats.has(hourKey)) {
        stats.set(hourKey, { tokens: 0, messages: new Set() });
      }

      const entry = stats.get(hourKey)!;

      if (log.category === "token-usage" && log.metadata) {
        entry.tokens += (log.metadata.totalTokens as number) || 0;
      }

      if (log.messageId) {
        entry.messages.add(log.messageId);
      }
    });

    return Array.from(stats.entries())
      .map(([hour, data]) => ({
        hour,
        tokens: data.tokens,
        messages: data.messages.size,
      }))
      .sort((a, b) => {
        const aHour = parseInt(a.hour);
        const bHour = parseInt(b.hour);
        return aHour - bHour;
      });
  })();

  // Get recent activity (last 10 significant events)
  const recentActivity = logs
    .filter(
      (log) =>
        log.category === "model-selection" ||
        log.category === "token-usage" ||
        log.category === "error-handling",
    )
    .slice(0, 10);

  const maxHourlyTokens = Math.max(...hourlyStats.map((h) => h.tokens), 1);

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute top-full left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg max-h-[500px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900">
          <div className="flex items-center gap-3">
            <TrendingUp
              className="text-blue-600 dark:text-blue-400"
              size={20}
            />
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Estadísticas del Chat
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Actividad y uso de tokens
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadLogs}
              disabled={loading}
              className="text-xs"
            >
              {loading ? "Cargando..." : "Refrescar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Info
                className="text-gray-400 dark:text-gray-600 mb-3"
                size={48}
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay logs disponibles.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Asegúrate de que "Logs verbosos de chat" esté habilitado en
                Settings
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Token Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap
                      className="text-blue-600 dark:text-blue-400"
                      size={14}
                    />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Total
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {tokenStats.totalTokens.toLocaleString()}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    tokens
                  </p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp
                      className="text-green-600 dark:text-green-400"
                      size={14}
                    />
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">
                      Input
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {tokenStats.inputTokens.toLocaleString()}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    tokens
                  </p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp
                      className="text-purple-600 dark:text-purple-400"
                      size={14}
                    />
                    <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                      Output
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {tokenStats.outputTokens.toLocaleString()}
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    tokens
                  </p>
                </div>
              </div>

              {/* Hourly Chart */}
              {hourlyStats.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock
                      className="text-gray-600 dark:text-gray-400"
                      size={16}
                    />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Uso por Hora
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {hourlyStats.map((stat) => (
                      <div key={stat.hour} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 w-12">
                          {stat.hour}
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-[width] duration-300"
                            style={{
                              width: `${(stat.tokens / maxHourlyTokens) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-20 text-right">
                          {stat.tokens.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">
                          {stat.messages} msg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Actividad Reciente
                </h4>
                <div className="space-y-2">
                  {recentActivity.map((log) => (
                    <button
                      key={log.id ?? log.timestamp}
                      onClick={() => setSelectedLog(log)}
                      className="w-full text-left p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getModeIcon(log)}
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono">
                              {log.category}
                            </span>
                          </div>
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                            {log.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDistanceToNow(new Date(log.timestamp), {
                                addSuffix: true,
                                locale: es,
                              })}
                            </span>
                          </div>
                        </div>
                        {log.metadata &&
                          Object.keys(log.metadata).length > 0 && (
                            <Info
                              className="text-gray-400 flex-shrink-0"
                              size={14}
                            />
                          )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Log</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Mensaje
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                  {selectedLog.message}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nivel
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {selectedLog.level.toUpperCase()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Categoría
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {selectedLog.category}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Timestamp
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              {selectedLog.metadata &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Metadata
                    </label>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded mt-2 overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
