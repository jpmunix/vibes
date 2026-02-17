import React, { useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  AlertTriangle,
  XCircle,
  Sparkles,
  CheckCircle,
  Info,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useStreamChat } from "@/hooks/useStreamChat";
import { CopyErrorMessage } from "@/components/CopyErrorMessage";
interface DyadOutputProps {
  type: "error" | "warning" | "success" | "info";
  message?: string;
  children?: React.ReactNode;
}

export const DyadOutput: React.FC<DyadOutputProps> = ({
  type,
  message,
  children,
}) => {
  const [isContentVisible, setIsContentVisible] = useState(false);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const { streamMessage } = useStreamChat();

  const isError = type === "error";

  const styles = {
    error: {
      border: "border-red-500",
      text: "text-red-500",
      icon: <XCircle size={16} className="text-red-500" />,
      label: "Error",
    },
    warning: {
      border: "border-amber-500",
      text: "text-amber-500",
      icon: <AlertTriangle size={16} className="text-amber-500" />,
      label: "Advertencia",
    },
    success: {
      border: "border-green-500",
      text: "text-green-500",
      icon: <CheckCircle size={16} className="text-green-500" />,
      label: "Éxito",
    },
    info: {
      border: "border-primary",
      text: "text-primary",
      icon: <Info size={16} className="text-primary" />,
      label: "Info",
    },
  };

  const style = styles[type] || styles.info;
  const borderColor = style.border;
  const iconColor = style.text;
  const icon = style.icon;
  const label = style.label;

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
    <div
      className={`relative bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer min-h-18 ${borderColor}`}
      onClick={() => setIsContentVisible(!isContentVisible)}
    >
      {/* Top-left label badge */}
      <div
        className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${iconColor} bg-background`}
        style={{ zIndex: 1 }}
      >
        {icon}
        <span>{label}</span>
      </div>

      {/* Main content, padded to avoid label */}
      <div className="flex items-center justify-between pl-24 pr-6">
        <div className="flex items-center gap-2">
          {message && (
            <span className="text-foreground font-medium text-sm">
              {message.slice(0, isContentVisible ? undefined : 100) +
                (!isContentVisible ? "..." : "")}
            </span>
          )}
        </div>
        <div className="flex items-center">
          {isContentVisible ? (
            <ChevronsDownUp
              size={20}
              className="text-muted-foreground hover:text-foreground"
            />
          ) : (
            <ChevronsUpDown
              size={20}
              className="text-muted-foreground hover:text-foreground"
            />
          )}
        </div>
      </div>

      {/* Content area */}
      {isContentVisible && children && (
        <div className="mt-4 pl-20 text-sm text-foreground">
          {children}
        </div>
      )}

      {/* Action buttons at the bottom - always visible for errors */}
      {isError && message && (
        <div className="mt-3 px-6 flex justify-end gap-2">
          <CopyErrorMessage
            errorMessage={children ? `${message}\n${children}` : message}
          />
          <button
            onClick={handleAIFix}
            className="cursor-pointer flex items-center justify-center bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white rounded text-xs px-2 py-1 h-6"
          >
            <Sparkles size={14} className="mr-1" />
            <span>Arreglar con IA</span>
          </button>
        </div>
      )}
    </div>
  );
};
