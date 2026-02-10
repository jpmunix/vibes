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
// common languages
import astro from "@shikijs/langs/astro";
import css from "@shikijs/langs/css";
import graphql from "@shikijs/langs/graphql";
import html from "@shikijs/langs/html";
import java from "@shikijs/langs/java";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import less from "@shikijs/langs/less";
import markdown from "@shikijs/langs/markdown";
import python from "@shikijs/langs/python";
import sass from "@shikijs/langs/sass";
import scss from "@shikijs/langs/scss";
import shell from "@shikijs/langs/shell";
import sql from "@shikijs/langs/sql";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import vue from "@shikijs/langs/vue";

type HighlighterCore = Awaited<ReturnType<typeof createHighlighterCore>>;

// Create a singleton highlighter instance
let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [github, githubDark],
      langs: [
        astro,
        css,
        graphql,
        html,
        java,
        javascript,
        json,
        jsx,
        less,
        markdown,
        python,
        sass,
        scss,
        shell,
        sql,
        tsx,
        typescript,
        vue,
      ],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise as Promise<HighlighterCore>;
}

function useHighlighter() {
  const [highlighter, setHighlighter] = useState<HighlighterCore>();

  useEffect(() => {
    getHighlighter().then(setHighlighter);
  }, []);

  return highlighter;
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
    const highlighter = useHighlighter();

    return !isInline ? (
      <div
        className="shiki not-prose relative border border-border/40 rounded-xl overflow-hidden shadow-sm group/code"
      >
        {language ? (
          <div className="flex items-center justify-between px-4 py-2 bg-(--background-lighter) dark:bg-zinc-900/80 backdrop-blur-sm border-b border-border/40">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 mr-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/70">
                {language}
              </span>
            </div>
            {code && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all cursor-pointer border border-transparent hover:border-primary/10"
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
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.children === nextProps.children;
  },
);
