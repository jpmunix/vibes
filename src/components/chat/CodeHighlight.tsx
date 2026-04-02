import React, { useState, useEffect, memo, type ReactNode } from "react";
import ShikiHighlighter, {
  isInlineCode,
  createHighlighterCore,
  createJavaScriptRegexEngine,
} from "react-shiki/core";
import type { Element as HastElement } from "hast";
import { useTheme } from "../../contexts/ThemeContext";
import { Copy, Check } from "lucide-react";
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

function useHighlighter(language?: string) {
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
    const handleCopy = () => {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // revert after 2s
    };

    const { isDarkMode } = useTheme();
    const highlighter = useHighlighter(language);

    return !isInline ? (
      <div
        className="shiki not-prose relative border border-border/40 rounded-xl overflow-hidden shadow-sm group/code"
      >
        {language ? (
          <div className="flex items-center justify-between px-4 py-2 bg-(--background-lighter) dark:bg-zinc-900 border-b border-border/40">
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
      <code className={`${className || ''} not-prose bg-primary/30 text-foreground px-1.5 py-0.5 rounded-md font-mono text-[0.85em] leading-tight`} {...props}>
        {children}
      </code>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.children === nextProps.children;
  },
);
