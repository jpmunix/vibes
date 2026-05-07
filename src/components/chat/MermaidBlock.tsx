import React, { useEffect, useRef, useState, memo, useCallback } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { Copy, Check, Maximize2, X } from "@/components/ui/icons";

let initCounter = 0;

/**
 * Always (re-)initialise mermaid so the theme is correct.
 */
async function renderMermaidSvg(dark: boolean, code: string, id: string) {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "default",
    themeVariables: dark
      ? {
          primaryColor: "#3b82f6",
          primaryTextColor: "#e2e8f0",
          primaryBorderColor: "#475569",
          lineColor: "#64748b",
          secondaryColor: "#1e293b",
          tertiaryColor: "#0f172a",
          background: "#0f172a",
          mainBkg: "#1e293b",
          nodeBorder: "#475569",
          clusterBkg: "#1e293b",
          clusterBorder: "#334155",
          titleColor: "#e2e8f0",
          edgeLabelBackground: "#1e293b",
          nodeTextColor: "#e2e8f0",
        }
      : {},
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    securityLevel: "loose",
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
  });
  return mermaid.render(id, code.trim());
}

interface MermaidBlockProps {
  code: string;
}

export const MermaidBlock = memo(function MermaidBlock({
  code,
}: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const { isDarkMode } = useTheme();

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++initCounter}`;

    (async () => {
      try {
        const { svg: renderedSvg } = await renderMermaidSvg(
          isDarkMode,
          code,
          id,
        );
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Error rendering diagram");
          setSvg(null);
        }
        const orphan = document.getElementById(`d${id}`);
        orphan?.remove();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, isDarkMode]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // ── Header bar (shared between inline + modal) ──────────────────────
  const headerBar = (isModal: boolean) => (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/80 dark:bg-zinc-900 border-b border-border/40">
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 mr-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
        </div>
        <span className="text-xs uppercase font-bold tracking-widest text-muted-foreground/70">
          mermaid
        </span>
        {error && (
          <span className="text-[10px] text-red-400 ml-2">⚠ parse error</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer border border-transparent hover:border-primary/10"
          onClick={handleCopy}
          type="button"
        >
          {copied ? (
            <Check size={12} className="text-emerald-500" />
          ) : (
            <Copy size={12} />
          )}
          <span>{copied ? "Copiado" : "Copiar"}</span>
        </button>
        {!isModal && svg && (
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer border border-transparent hover:border-primary/10"
            onClick={() => setMaximized(true)}
            type="button"
            title="Ver a pantalla completa"
          >
            <Maximize2 size={12} />
          </button>
        )}
        {isModal && (
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => setMaximized(false)}
            type="button"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Inline block */}
      <div className="shiki not-prose relative border border-border/40 rounded-xl overflow-hidden shadow-sm group/code bg-muted/50 dark:bg-zinc-950/50">
        {headerBar(false)}
        <div className="px-6 py-4 overflow-auto max-h-[60vh] flex justify-center">
          {svg ? (
            <div
              ref={containerRef}
              className="[&_svg]:max-w-full [&_svg]:h-auto [&_svg]:min-w-[300px]"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : error ? (
            <pre className="text-sm whitespace-pre-wrap">
              <code>{code}</code>
            </pre>
          ) : (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-sm">Renderizando diagrama…</span>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen modal */}
      {maximized && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setMaximized(false)}
        >
          <div
            className="relative flex flex-col w-[96vw] h-[94vh] bg-background border border-border/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {headerBar(true)}
            <div className="flex-1 overflow-auto flex items-center justify-center p-8">
              {svg ? (
                <div
                  className="w-full h-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:max-w-none [&_svg]:max-h-[82vh]"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <pre className="text-sm whitespace-pre-wrap">
                  <code>{code}</code>
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
