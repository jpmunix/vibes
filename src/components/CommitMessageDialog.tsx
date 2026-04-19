import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "@/components/ui/icons";

interface CommitMessageDialogProps {
  isOpen: boolean;
  filename: string;
  value: string;
  onChange: (val: string) => void;
  isCommitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CommitMessageDialog({
  isOpen,
  filename,
  value,
  onChange,
  isCommitting,
  onConfirm,
  onCancel,
}: CommitMessageDialogProps) {
  console.log("[DEBUG] CommitMessageDialog render, isOpen=", isOpen);
  if (!isOpen) return null;

  console.log("[DEBUG] CommitMessageDialog IS OPEN, rendering card for:", filename);

  // No portals — render inline. The parent must have position:relative.
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {/* Overlay */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onCancel}
      />

      {/* Card */}
      <div
        style={{
          position: "relative",
          zIndex: 10000,
          width: "100%",
          maxWidth: "28rem",
          borderRadius: "0.75rem",
          border: "1px solid var(--border)",
          backgroundColor: "var(--background, #1a1a2e)",
          padding: "1.5rem",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,.5)",
          margin: "0 1rem",
        }}
      >
        <h3 className="typo-subsection-title font-semibold mb-1">Mensaje de commit</h3>
        <p className="typo-caption text-muted-foreground mb-4">
          Archivo: <span className="text-foreground font-medium">{filename}</span>
        </p>
        <input
          autoFocus
          className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 typo-body focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 placeholder:text-muted-foreground/40"
          placeholder="Escribe un mensaje..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button
            size="sm"
            disabled={!value.trim() || isCommitting}
            onClick={onConfirm}
          >
            {isCommitting ? <Loader2 className="animate-spin mr-2" size={14} /> : <Check className="mr-2" size={14} />}
            Commit
          </Button>
        </div>
      </div>
    </div>
  );
}
