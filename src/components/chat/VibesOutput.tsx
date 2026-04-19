import React from "react";
import {
  AlertTriangle,
  XCircle,
  Sparkles,
  CheckCircle,
  Info,
} from "@/components/ui/icons";
import { useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useStreamChat } from "@/hooks/useStreamChat";
import { CopyErrorMessage } from "@/components/CopyErrorMessage";

interface VibesOutputProps {
  type: "error" | "warning" | "success" | "info";
  message?: string;
  children?: React.ReactNode;
}

export const VibesOutput: React.FC<VibesOutputProps> = ({
  type,
  message,
  children,
}) => {
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const { streamMessage } = useStreamChat();

  const isError = type === "error";

  const styles = {
    error: {
      bg: "bg-red-500/10 dark:bg-red-500/20",
      text: "text-red-600 dark:text-red-400",
      icon: <XCircle size={16} className="text-red-600 dark:text-red-400 mt-0.5" />,
      label: "Error",
      borderLeft: "border-l-2 border-red-500",
    },
    warning: {
      bg: "bg-amber-500/10 dark:bg-amber-500/20",
      text: "text-amber-600 dark:text-amber-400",
      icon: <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5" />,
      label: "Aviso",
      borderLeft: "border-l-2 border-amber-500",
    },
    success: {
      bg: "bg-green-500/10 dark:bg-green-500/20",
      text: "text-green-600 dark:text-green-400",
      icon: <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5" />,
      label: "Éxito",
      borderLeft: "border-l-2 border-green-500",
    },
    info: {
      bg: "bg-blue-500/10 dark:bg-blue-500/20",
      text: "text-blue-600 dark:text-blue-400",
      icon: <Info size={16} className="text-blue-600 dark:text-blue-400 mt-0.5" />,
      label: "Info",
      borderLeft: "border-l-2 border-blue-500",
    },
  };

  const style = styles[type] || styles.info;

  const handleAIFix = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (message && selectedChatId) {
      streamMessage({
        prompt: `Arreglar el error: ${message}`,
        chatId: selectedChatId,
      });
    }
  };

  return (
    <div className={`w-full my-4 py-3 pr-4 pl-3 ${style.bg} ${style.borderLeft}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="shrink-0">{style.icon}</div>

        {/* Content */}
        <div className="flex-1 space-y-1 overflow-hidden">
          {/* Label + Message */}
          <div className={`font-medium text-sm ${style.text}`}>
            <span className="font-semibold mr-2 uppercase tracking-wide text-xs">
              {style.label}
            </span>
            {message && <span className="break-words leading-relaxed opacity-90">{message}</span>}
          </div>

          {/* Detailed Content */}
          {children && (
            <div className={`text-sm mt-2 opacity-80 whitespace-pre-wrap break-words ${style.text}`}>
              {children}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons at the bottom - always visible for errors */}
      {isError && message && (
        <div className="mt-3 ml-7 flex items-center gap-2">
          <CopyErrorMessage
            errorMessage={children ? `${message}\n${children}` : message}
          />
          <button
            onClick={handleAIFix}
            className="cursor-pointer flex items-center justify-center bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white transition-colors rounded text-xs px-2.5 py-1.5"
          >
            <Sparkles size={14} className="mr-1.5 opacity-80" />
            <span className="font-medium">Arreglar con IA</span>
          </button>
        </div>
      )}
    </div>
  );
};
