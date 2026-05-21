import type React from "react";
import { useState, useCallback } from "react";
import { GitCommit, FileCode } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";

interface VibesGitCommitProps {
  action?: string; // "commit" | "commit-push"
  files?: string;  // Comma-separated list of files
  children?: React.ReactNode; // Commit message
}

export const VibesGitCommit: React.FC<VibesGitCommitProps> = ({ action, files, children }) => {
  const appId = useAtomValue(selectedAppIdAtom);

  // Extract commit message lines
  const fullMessage = typeof children === "string" ? children.trim() : "";
  const lines = fullMessage.split("\n");
  const subject = lines[0] || "";
  const bodyLines = lines.slice(1).filter(line => line.trim() !== "");

  // Extract file list
  const fileArray = files ? files.split(",").map(f => f.trim()).filter(Boolean) : [];

  const isPush = action === "commit-push";

  const handleFileClick = useCallback((filePath: string) => {
    if (!appId) return;
    ipc.app.openAppFile({ appId, filePath }).catch((err: any) => {
      console.error("Error opening file:", err);
    });
  }, [appId]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCommit size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground/90">
            Sincronización de Git completada
          </span>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border/40 uppercase tracking-wider font-mono">
          {isPush ? "Commit & Push" : "Commit"}
        </span>
      </div>

      {/* Commit message as blockquote */}
      {fullMessage && (
        <div className="border-l-2 border-primary/30 bg-primary/[0.03] rounded-r pl-3 py-2 pr-3">
          <div className="text-sm font-semibold text-foreground leading-relaxed">
            {subject}
          </div>
          {bodyLines.length > 0 && (
            <div className="text-xs text-muted-foreground leading-relaxed mt-1 whitespace-pre-line">
              {bodyLines.join("\n")}
            </div>
          )}
        </div>
      )}

      {/* Files list — always visible, clickable */}
      {fileArray.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Archivos modificados
          </span>
          <ul className="space-y-1">
            {fileArray.map((filePath, i) => (
              <li
                key={i}
                className="flex items-center gap-1.5"
              >
                <FileCode size={12} className="text-muted-foreground/50 shrink-0" />
                <button
                  onClick={() => handleFileClick(filePath)}
                  className="text-xs font-mono text-muted-foreground/85 cursor-pointer hover:underline transition-colors text-left truncate"
                  title={`Ver archivo: ${filePath}`}
                >
                  {filePath}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
