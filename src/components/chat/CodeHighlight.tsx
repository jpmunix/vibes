import React, { useState, useEffect, memo, useCallback, lazy, Suspense, type ReactNode } from "react";
import ShikiHighlighter, {
  isInlineCode,
  createHighlighterCore,
  createJavaScriptRegexEngine,
} from "react-shiki/core";

const MermaidBlock = lazy(() => import("./MermaidBlock").then(m => ({ default: m.MermaidBlock })));
import type { Element as HastElement } from "hast";
import { useTheme } from "../../contexts/ThemeContext";
import { Copy, Check, FileCode2, X, ExternalLink, Maximize2, Minimize2 } from "@/components/ui/icons";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import github from "@shikijs/themes/github-light-default";
import githubDark from "@shikijs/themes/github-dark-default";

// Only eagerly load the 4 most common languages for fast initial render
import javascript from "@shikijs/langs/javascript";
import typescript from "@shikijs/langs/typescript";
import html from "@shikijs/langs/html";
import css from "@shikijs/langs/css";

type HighlighterCore = Awaited<ReturnType<typeof createHighlighterCore>>;

// Map of language aliases to their dynamic import functions
const LAZY_LANG_LOADERS: Record<string, () => Promise<any>> = {
  astro: () => import("@shikijs/langs/astro"),
  graphql: () => import("@shikijs/langs/graphql"),
  java: () => import("@shikijs/langs/java"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  less: () => import("@shikijs/langs/less"),
  markdown: () => import("@shikijs/langs/markdown"),
  md: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  py: () => import("@shikijs/langs/python"),
  sass: () => import("@shikijs/langs/sass"),
  scss: () => import("@shikijs/langs/scss"),
  shell: () => import("@shikijs/langs/shell"),
  bash: () => import("@shikijs/langs/shell"),
  sh: () => import("@shikijs/langs/shell"),
  sql: () => import("@shikijs/langs/sql"),
  tsx: () => import("@shikijs/langs/tsx"),
  vue: () => import("@shikijs/langs/vue"),
};

// Track which languages have been loaded to avoid redundant loading
const loadedLanguages = new Set<string>(["javascript", "typescript", "html", "css", "js", "ts"]);

// Create a singleton highlighter instance with only the most common languages
let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [github, githubDark],
      langs: [javascript, typescript, html, css],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise as Promise<HighlighterCore>;
}

// Load a language grammar on-demand if not already loaded
async function ensureLanguage(lang: string): Promise<void> {
  if (loadedLanguages.has(lang)) return;

  const loader = LAZY_LANG_LOADERS[lang];
  if (!loader) return; // Unknown language, skip

  const highlighter = await getHighlighter();
  const grammar = await loader();
  await highlighter.loadLanguage(grammar.default || grammar);
  loadedLanguages.add(lang);
}

export function useHighlighter(language?: string) {
  const [highlighter, setHighlighter] = useState<HighlighterCore>();
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const hl = await getHighlighter();
      // If a specific language is requested, ensure it's loaded
      if (language) {
        await ensureLanguage(language);
      }
      if (!cancelled) {
        setHighlighter(hl);
        setLangReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [language]);

  return langReady ? highlighter : undefined;
}

// ── File path detection ─────────────────────────────────────────────────────
// Known file extensions that indicate inline code is a file reference
const FILE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "css", "scss", "less", "sass",
  "html", "htm", "vue", "svelte", "astro",
  "json", "yaml", "yml", "toml",
  "md", "mdx", "txt", "csv",
  "py", "rb", "go", "rs", "java", "kt", "swift",
  "sql", "graphql", "gql",
  "sh", "bash", "zsh",
  "xml", "svg",
  "env", "gitignore", "dockerignore", "dockerfile",
  "prisma", "proto",
  "makefile", "license", "lock"
]);

// Extension → language mapping for syntax highlighting
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  css: "css", scss: "scss", less: "less", sass: "sass",
  html: "html", htm: "html", vue: "vue", svelte: "html", astro: "html",
  json: "json", yaml: "markdown", yml: "markdown", toml: "markdown",
  md: "markdown", mdx: "markdown", txt: "markdown",
  py: "python", rb: "markdown", go: "markdown", rs: "markdown", java: "java",
  sql: "sql", graphql: "graphql", gql: "graphql",
  sh: "shell", bash: "shell", zsh: "shell",
  xml: "html", svg: "html",
  env: "shell", prisma: "markdown",
  makefile: "makefile", license: "markdown", lock: "json"
};

function isFilePath(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.includes(" ") || trimmed.length > 120) return false;
  if (trimmed.startsWith("http")) return false;

  const cleanPath = trimmed.replace(/(?:[:#][L]?[0-9]+(?:-[0-9]+)?)$/, '');

  // Check for known file extension
  const ext = cleanPath.split(".").pop()?.toLowerCase();
  
  if (ext && FILE_EXTENSIONS.has(ext)) {
    // If it has a dot (like .env or file.ts), it's a file
    if (cleanPath.includes(".")) return true;
    
    // If it has a slash (like /src/gitignore), it's a file
    if (cleanPath.includes("/")) return true;
    
    // Extensionless exact matches just in case
    if (["dockerfile", "makefile", "license"].includes(ext)) {
      return true;
    }
  }

  return false;
}

export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANG[ext] || "markdown";
}

// ── File Viewer Modal ───────────────────────────────────────────────────────
const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);

function FileViewerModal({
  filePath,
  onClose,
}: {
  filePath: string;
  onClose: () => void;
}) {
  const appId = useAtomValue(selectedAppIdAtom);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { isDarkMode } = useTheme();
  const fileName = filePath.split("/").pop() || filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isMarkdown = MARKDOWN_EXTENSIONS.has(ext);
  const lang = getLanguageFromPath(filePath);
  const highlighter = useHighlighter(isMarkdown ? undefined : lang);
  const [copied, setCopied] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!appId) {
      setError("No hay app seleccionada");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const fileContent = await ipc.app.readAppFile({ appId, filePath });
        if (!cancelled) {
          setContent(fileContent);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "No se pudo leer el archivo");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [appId, filePath]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleCopy = useCallback(() => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  const handleOpenWithSystem = useCallback(async () => {
    if (!appId) return;
    try {
      await ipc.app.openAppFile({ appId, filePath });
    } catch (err: any) {
      console.error("Error opening file with system:", err);
    }
  }, [appId, filePath]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`relative flex flex-col bg-background border border-border/60 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 transition-all ${
          isMaximized
            ? "w-full h-full rounded-none"
            : "w-[92vw] max-w-6xl max-h-[85vh] rounded-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 bg-muted/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileCode2 size={16} className="text-primary flex-shrink-0" />
            <span className="text-sm font-medium truncate" title={filePath}>
              {filePath}
            </span>
            {ext && (
              <span className="text-xs uppercase font-bold tracking-widest text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
                {ext}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
              onClick={handleOpenWithSystem}
              type="button"
              title="Abrir con la aplicación predeterminada del sistema"
            >
              <ExternalLink size={12} />
              <span>Abrir</span>
            </button>
            {content && (
              <button
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                onClick={handleCopy}
                type="button"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copied ? "Copiado" : "Copiar"}</span>
              </button>
            )}
            <button
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => setIsMaximized((v) => !v)}
              type="button"
              title={isMaximized ? "Restaurar" : "Maximizar"}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="ml-3 text-sm text-muted-foreground">Leyendo archivo…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              {error}
            </div>
          )}
          {content !== null && !loading && isMarkdown && (
            <div className="px-8 py-6 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          )}
          {content !== null && !loading && !isMarkdown && (
            <div className="[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:px-6 [&_pre]:py-4 text-sm">
              {highlighter ? (
                <ShikiHighlighter
                  highlighter={highlighter}
                  language={lang}
                  theme={isDarkMode ? "github-dark-default" : "github-light-default"}
                  delay={100}
                >
                  {content}
                </ShikiHighlighter>
              ) : (
                <pre className="px-6 py-4 whitespace-pre-wrap">
                  <code>{content}</code>
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer — line count */}
        {content !== null && !loading && (
          <div className="flex items-center justify-between px-5 py-2 border-t border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
            <span>{content.split("\n").length} líneas</span>
            <span>{(new Blob([content]).size / 1024).toFixed(1)} KB</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface CodeHighlightProps {
  className?: string | undefined;
  children?: ReactNode | undefined;
  node?: HastElement | undefined;
}

export const CodeHighlight = memo(
  ({ className, children, node, ...props }: CodeHighlightProps) => {
    const code = String(children).trim();
    const language = className?.match(/language-(\w+)/)?.[1];
    const isInline = node ? isInlineCode(node) : false;
    //handle copying code to clipboard with transition effect
    const [copied, setCopied] = useState(false);
    const [viewingFile, setViewingFile] = useState<string | null>(null);

    const handleCopy = () => {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // revert after 2s
    };

    const { isDarkMode } = useTheme();
    const highlighter = useHighlighter(language);

    // For inline code, check if it looks like a file path
    const filePathDetected = isInline && isFilePath(code);

    // Mermaid diagrams: render as interactive SVG instead of syntax-highlighted code
    if (!isInline && language === "mermaid") {
      return (
        <Suspense fallback={
          <div className="shiki not-prose relative border border-border/40 rounded-xl overflow-hidden shadow-sm bg-muted/50 dark:bg-zinc-950/50 px-6 py-8 flex items-center justify-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Cargando mermaid…</span>
          </div>
        }>
          <MermaidBlock code={code} />
        </Suspense>
      );
    }

    return !isInline ? (
      <div
        className="shiki not-prose relative border border-border/40 rounded-xl overflow-hidden shadow-sm group/code bg-muted/50 dark:bg-zinc-950/50"
      >
        {language ? (
          <div className="flex items-center justify-between px-4 py-2 bg-muted/80 dark:bg-zinc-900 border-b border-border/40">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 mr-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
              </div>
              <span className="text-xs uppercase font-bold tracking-widest text-muted-foreground/70">
                {language}
              </span>
            </div>
            {code && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer border border-transparent hover:border-primary/10"
                onClick={handleCopy}
                type="button"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copied ? "Copiado" : "Copiar"}</span>
              </button>
            )}
          </div>
        ) : null}
        <div className="[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:px-6 [&_pre]:py-4 overflow-auto max-h-[60vh]">
          {highlighter ? (
            <ShikiHighlighter
              highlighter={highlighter}
              language={language}
              theme={isDarkMode ? "github-dark-default" : "github-light-default"}
              delay={150}
            >
              {code}
            </ShikiHighlighter>
          ) : (
            <pre>
              <code>{code}</code>
            </pre>
          )}
        </div>
      </div>
    ) : (
      <>
        {filePathDetected ? (
          <code
            className={`${className || ''} not-prose bg-primary/30 text-foreground px-1.5 py-0.5 rounded-md typo-mono-xs leading-tight cursor-pointer hover:bg-primary/50 hover:underline transition-colors`}
            onClick={() => {
              const cleanPath = code.trim().replace(/(?:[:#][L]?[0-9]+(?:-[0-9]+)?)$/, '');
              setViewingFile(cleanPath);
            }}
            title={`Ver archivo: ${code}`}
            {...props}
          >
            {children}
          </code>
        ) : (
          <code className={`${className || ''} not-prose bg-primary/30 text-foreground px-1.5 py-0.5 rounded-md typo-mono-xs leading-tight`} {...props}>
            {children}
          </code>
        )}
        {viewingFile && (
          <FileViewerModal
            filePath={viewingFile}
            onClose={() => setViewingFile(null)}
          />
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.children === nextProps.children;
  },
);
