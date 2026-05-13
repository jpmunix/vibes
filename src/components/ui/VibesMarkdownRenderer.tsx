/**
 * VibesMarkdownRenderer — Reusable markdown → React component parser.
 * Used by the documentation system and release notes.
 *
 * Uses react-markdown + remark-gfm to parse standard markdown, with
 * custom component overrides for rich documentation rendering.
 *
 * ## Custom Marks System
 *
 * The pre-processor scans for HTML comment directives and converts them
 * into placeholder tokens that survive react-markdown parsing.
 * These tokens are then detected in the paragraph/code renderers and
 * rendered as native React components.
 *
 * ### Block marks (full line, become their own paragraph):
 *   <!-- @tip "text" -->
 *   <!-- @info "text" -->
 *   <!-- @warning "text" -->
 *   <!-- @danger "text" -->
 *
 * ### Inline marks (mixed with text):
 *   <!-- @kbd "Ctrl+S" -->
 *   <!-- @version "8.5+" -->
 *
 * ### Multi-line block marks:
 *   <!-- @tip -->
 *   Multiple paragraphs of content...
 *   <!-- @/tip -->
 */

import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Info, AlertTriangle, AlertOctagon, Lightbulb, Eye, Code2, ChevronRight } from "@/components/ui/icons";

const REMARK_PLUGINS = [remarkGfm];

// ─── Pre-processor: Custom marks → tokens ───────────────────────────────────

// Token format: ‹VIBES_MARK:type:content›
// Uses unicode angle brackets to avoid collisions with markdown
const TOKEN_PREFIX = "‹VIBES_MARK:";
const TOKEN_SUFFIX = "›";

type MarkType = "tip" | "info" | "warning" | "danger" | "kbd" | "version";

/**
 * Pre-process markdown to convert custom marks into tokens.
 * This runs BEFORE react-markdown, so HTML comments are converted
 * into text tokens that survive the markdown parser.
 */
function preprocessCustomMarks(content: string): string {
    let result = content;

    // ── Step 1: Protect ALL code fences and inline code spans ──
    const codeFences: string[] = [];
    // Fenced code blocks (triple+ backticks)
    result = result.replace(/(`{3,})[^\n]*\n[\s\S]*?\n\1/g, (fence) => {
        const idx = codeFences.length;
        codeFences.push(fence);
        return `\n%%CODEFENCE_${idx}%%\n`;
    });
    // Inline code spans (single backtick) — protect from mark transformation
    result = result.replace(/`([^`\n]+)`/g, (inlineCode) => {
        const idx = codeFences.length;
        codeFences.push(inlineCode);
        return `%%CODEFENCE_${idx}%%`;
    });

    // Helper: restore code fence placeholders inside a string
    const restoreFences = (text: string) =>
        text.replace(/%%CODEFENCE_(\d+)%%/g, (_m, i: string) => codeFences[Number(i)]);

    // ── Step 2: Extract @preview blocks (restore any code fences inside before encoding) ──
    result = result.replace(
        /<!--\s*@preview\s*-->\s*\n([\s\S]*?)\n\s*<!--\s*@\/preview\s*-->/g,
        (_match, body: string) => {
            const realBody = restoreFences(body.trim());
            const encoded = encodeBody(realBody);
            return `\n${TOKEN_PREFIX}preview:${encoded}${TOKEN_SUFFIX}\n`;
        },
    );

    // ── Step 3: Transform other custom marks (only in non-code content) ──

    // Multi-line block marks: <!-- @type --> or <!-- @type title="Custom" --> ... <!-- @/type -->
    result = result.replace(
        /<!--\s*@(tip|info|warning|danger)(?:\s+title="([^"]+)")?\s*-->\s*\n([\s\S]*?)\n\s*<!--\s*@\/\1\s*-->/g,
        (_match, type: string, title: string | undefined, body: string) => {
            const realBody = restoreFences(body.trim());
            const payload = title
                ? `${encodeBody(title)}|${encodeBody(realBody)}`
                : encodeBody(realBody);
            return `\n${TOKEN_PREFIX}block:${type}:${payload}${TOKEN_SUFFIX}\n`;
        },
    );

    // Multi-line collapse blocks: <!-- @collapse "Title" --> or <!-- @collapse "Title" level="2" --> ... <!-- @/collapse -->
    result = result.replace(
        /<!--\s*@collapse\s+"([^"]+)"(?:\s+level="([1-3])")?\s*-->\s*\n([\s\S]*?)\n\s*<!--\s*@\/collapse\s*-->/g,
        (_match, title: string, level: string | undefined, body: string) => {
            const lvl = level || "1";
            const realBody = restoreFences(body.trim());
            const payload = `${encodeBody(title)}|${encodeBody(lvl)}|${encodeBody(realBody)}`;
            return `\n${TOKEN_PREFIX}block:collapse:${payload}${TOKEN_SUFFIX}\n`;
        },
    );

    // Single-line block marks: <!-- @type title="Custom" "text" -->
    result = result.replace(
        /<!--\s*@(tip|info|warning|danger)(?:\s+title="([^"]+)")\s+"([^"]+)"\s*-->/g,
        (_match, type: string, title: string, text: string) => {
            const payload = `${encodeBody(title)}|${encodeBody(text)}`;
            return `${TOKEN_PREFIX}${type}:${payload}${TOKEN_SUFFIX}`;
        },
    );
    // Single-line block marks (no custom title): <!-- @type "text" -->
    // Note: uses a greedy pattern that allows escaped quotes inside the text
    result = result.replace(
        /<!-- *@(tip|info|warning|danger) +"((?:[^"\\]|\\.)*)" *-->/g,
        (_match, type: string, text: string) => {
            // Unescape any escaped quotes in the content
            const cleanText = text.replace(/\\"/g, '"');
            return `${TOKEN_PREFIX}${type}:${encodeBody(cleanText)}${TOKEN_SUFFIX}`;
        },
    );

    // Inline marks: <!-- @kbd "text" --> and <!-- @version "text" -->
    result = result.replace(
        /<!--\s*@(kbd|version)\s+"([^"]+)"\s*-->/g,
        (_match, type: string, text: string) => {
            return `${TOKEN_PREFIX}${type}:${encodeBody(text)}${TOKEN_SUFFIX}`;
        },
    );

    // ── Step 4: Restore remaining code fences ──
    result = result.replace(/%%CODEFENCE_(\d+)%%/g, (_match, idx: string) => {
        return codeFences[Number(idx)];
    });

    return result;
}

function encodeBody(text: string): string {
    // Simple encoding: replace pipes and angle brackets
    return btoa(unescape(encodeURIComponent(text)));
}

function decodeBody(encoded: string): string {
    try {
        return decodeURIComponent(escape(atob(encoded)));
    } catch {
        return encoded;
    }
}

/**
 * Split a token payload that may contain a custom title.
 * Format: "title_b64|content_b64" (custom title) or "content_b64" (default title).
 */
function splitTitlePayload(raw: string): { title?: string; body: string } {
    if (raw.includes("|")) {
        const pipeIdx = raw.indexOf("|");
        const titleEncoded = raw.slice(0, pipeIdx);
        const bodyEncoded = raw.slice(pipeIdx + 1);
        return { title: decodeBody(titleEncoded), body: decodeBody(bodyEncoded) };
    }
    return { body: decodeBody(raw) };
}

// ─── Custom mark components ─────────────────────────────────────────────────

const CALLOUT_STYLES: Record<string, { border: string; bg: string; icon: React.ElementType; iconClass: string; label: string }> = {
    tip: {
        border: "border-green-500/40",
        bg: "bg-green-500/5",
        icon: Lightbulb,
        iconClass: "text-green-500",
        label: "Consejo",
    },
    info: {
        border: "border-blue-500/40",
        bg: "bg-blue-500/5",
        icon: Info,
        iconClass: "text-blue-500",
        label: "Información",
    },
    warning: {
        border: "border-amber-500/40",
        bg: "bg-amber-500/5",
        icon: AlertTriangle,
        iconClass: "text-amber-500",
        label: "Atención",
    },
    danger: {
        border: "border-red-500/40",
        bg: "bg-red-500/5",
        icon: AlertOctagon,
        iconClass: "text-red-500",
        label: "Peligro",
    },
};

function CalloutBlock({ type, customTitle, children }: { type: string; customTitle?: string; children: React.ReactNode }) {
    const style = CALLOUT_STYLES[type] || CALLOUT_STYLES.info;
    const Icon = style.icon;

    return (
        <div className={`my-4 rounded-lg border-l-4 ${style.border} ${style.bg} p-4`}>
            <div className="flex items-start gap-3">
                <Icon size={18} className={`${style.iconClass} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${style.iconClass}`}>
                        {customTitle || style.label}
                    </div>
                    <div className="text-foreground/90 leading-relaxed text-sm">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function KbdBadge({ keys }: { keys: string }) {
    const parts = keys.split("+").map((k) => k.trim());
    return (
        <span className="inline-flex items-center gap-0.5">
            {parts.map((key, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground text-xs mx-0.5">+</span>}
                    <kbd className="inline-flex items-center justify-center min-w-[1.5em] h-[1.6em] px-1.5 rounded-[4px] border border-border bg-muted text-foreground text-xs font-mono font-medium shadow-[0_1px_0_1px_rgba(0,0,0,0.05)]">
                        {key}
                    </kbd>
                </React.Fragment>
            ))}
        </span>
    );
}

function VersionBadge({ version }: { version: string }) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
            v{version}
        </span>
    );
}

/** Collapsible section with title bar + chevron */
function CollapseBlock({ title, level = 1, children }: { title: string; level?: number; children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    const titleClass = {
        1: "text-xl font-bold",
        2: "text-lg font-semibold",
        3: "text-base font-medium",
    }[level] || "text-base font-medium";

    return (
        <div className="my-4 rounded-lg border border-border overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer text-left"
            >
                <span className={`${titleClass} text-foreground`}>{title}</span>
                <ChevronRight
                    size={16}
                    className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                />
            </button>
            {isOpen && (
                <div className="px-4 py-3 border-t border-border text-sm leading-relaxed">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Preview block (code ↔ result toggle) ───────────────────────────────────

function PreviewBlock({ content }: { content: string }) {
    const [showResult, setShowResult] = useState(false);
    // Pre-process custom marks so callouts/kbd/version work in preview results
    const processedContent = useMemo(() => preprocessCustomMarks(content), [content]);

    return (
        <div className="my-4 rounded-lg overflow-hidden border border-border bg-muted/30">
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/50">
                <span className="typo-micro text-muted-foreground uppercase tracking-wider">
                    {showResult ? "Resultado" : "Markdown"}
                </span>
                <button
                    type="button"
                    onClick={() => setShowResult(!showResult)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer hover:bg-background/60 text-muted-foreground hover:text-foreground"
                    title={showResult ? "Ver código fuente" : "Ver resultado"}
                >
                    {showResult ? (
                        <><Code2 size={12} /> Código</>
                    ) : (
                        <><Eye size={12} /> Resultado</>
                    )}
                </button>
            </div>
            {showResult ? (
                <div className="p-4">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={DOCS_COMPONENTS}>
                        {processedContent}
                    </ReactMarkdown>
                </div>
            ) : (
                <pre className="p-4 overflow-x-auto">
                    <code className="text-sm font-mono leading-relaxed">{content}</code>
                </pre>
            )}
        </div>
    );
}

// ─── Token detection & rendering ────────────────────────────────────────────

/**
 * Check if a text node contains a VIBES_MARK token and render it.
 * Returns null if no token found.
 */
function renderTokensInText(text: string): React.ReactNode[] | null {
    if (!text.includes(TOKEN_PREFIX)) return null;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = new RegExp(
        `${escapeRegex(TOKEN_PREFIX)}(block:)?(preview|collapse|tip|info|warning|danger|kbd|version):([^${TOKEN_SUFFIX}]+)${escapeRegex(TOKEN_SUFFIX)}`,
        "g",
    );

    let match;
    while ((match = regex.exec(text)) !== null) {
        // Add text before the token
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const isBlock = !!match[1];
        const type = match[2] as MarkType;
        const rawPayload = match[3];
        const decoded = decodeBody(rawPayload);

        if (type === "preview") {
            parts.push(<PreviewBlock key={match.index} content={decoded} />);
        } else if (type === "collapse") {
            // Collapse block — payload: title|level|body
            const parts3 = rawPayload.split("|");
            const collapseTitle = decodeBody(parts3[0] || "");
            const collapseLevel = Number(decodeBody(parts3[1] || "1")) || 1;
            const collapseBody = preprocessCustomMarks(decodeBody(parts3.slice(2).join("|")));
            parts.push(
                <CollapseBlock key={match.index} title={collapseTitle || "Detalles"} level={collapseLevel}>
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={INNER_COMPONENTS}>
                        {collapseBody}
                    </ReactMarkdown>
                </CollapseBlock>,
            );
        } else if (isBlock) {
            // Block callout with multi-line content — may have custom title
            const { title: blockTitle, body: blockBody } = splitTitlePayload(rawPayload);
            parts.push(
                <CalloutBlock key={match.index} type={type} customTitle={blockTitle}>
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={INNER_COMPONENTS}>
                        {blockBody}
                    </ReactMarkdown>
                </CalloutBlock>,
            );
        } else if (type === "kbd") {
            parts.push(<KbdBadge key={match.index} keys={decoded} />);
        } else if (type === "version") {
            parts.push(<VersionBadge key={match.index} version={decoded} />);
        } else {
            // Single-line callout — may have custom title
            const { title: lineTitle, body: lineBody } = splitTitlePayload(rawPayload);
            parts.push(
                <CalloutBlock key={match.index} type={type} customTitle={lineTitle}>
                    {lineBody}
                </CalloutBlock>,
            );
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : null;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Standard component overrides ───────────────────────────────────────────

/** Links: external links open in new window */
const DocsLink = ({ node: _node, ...props }: any) => (
    <a
        {...props}
        onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            window.open(props.href, "_blank");
        }}
        className="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors"
    />
);

/** Headings with auto-generated anchor IDs for deep-linking */
function DocsHeading({ level, children, ...props }: any) {
    const text = extractText(children);
    const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    const sizeClass = {
        1: "text-2xl font-bold mt-8 mb-4",
        2: "text-xl font-semibold mt-6 mb-3 pb-2 border-b border-border",
        3: "text-lg font-semibold mt-5 mb-2",
        4: "text-base font-semibold mt-4 mb-2",
        5: "text-sm font-semibold mt-3 mb-1",
        6: "text-sm font-medium mt-3 mb-1 text-muted-foreground",
    }[level] || "";

    return (
        <Tag id={id} className={`${sizeClass} text-foreground scroll-mt-4 group`} {...props}>
            {children}
            <a
                href={`#${id}`}
                className="ml-2 opacity-0 group-hover:opacity-40 hover:!opacity-80 text-muted-foreground transition-opacity"
                onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                }}
            >
                #
            </a>
        </Tag>
    );
}

/** Code blocks with enhanced styling */
const DocsCodeBlock = ({ node, inline, className, children, ...props }: any) => {
    // react-markdown v9 may not pass `inline` — fallback: no className + simple text = inline
    const isInline = inline ?? (!className && typeof children === "string" && !String(children).includes("\n"));

    if (isInline) {
        return (
            <code
                className="px-1.5 py-0.5 rounded-md bg-muted text-primary text-[0.9em] font-mono"
                {...props}
            >
                {children}
            </code>
        );
    }

    const language = className?.replace("language-", "") || "";

    return (
        <div className="relative my-4 rounded-lg overflow-hidden border border-border bg-muted/30">
            {language && (
                <div className="flex items-center px-4 py-1.5 border-b border-border bg-muted/50">
                    <span className="typo-micro text-muted-foreground uppercase tracking-wider">{language}</span>
                </div>
            )}
            <pre className="p-4 overflow-x-auto">
                <code className={`${className || ""} text-sm font-mono leading-relaxed`} {...props}>
                    {children}
                </code>
            </pre>
        </div>
    );
};

/** Tables with proper styling */
const DocsTable = ({ children, ...props }: any) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" {...props}>
            {children}
        </table>
    </div>
);

const DocsTableHead = ({ children, ...props }: any) => (
    <thead className="bg-muted/50 border-b border-border" {...props}>
        {children}
    </thead>
);

const DocsTableRow = ({ children, ...props }: any) => (
    <tr className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors" {...props}>
        {children}
    </tr>
);

const DocsTableCell = ({ children, ...props }: any) => (
    <td className="px-4 py-2.5 text-foreground" {...props}>
        {children}
    </td>
);

const DocsTableHeaderCell = ({ children, ...props }: any) => (
    <th className="px-4 py-2.5 text-left font-semibold text-foreground/80" {...props}>
        {children}
    </th>
);

/** Blockquotes with accent styling */
const DocsBlockquote = ({ children, ...props }: any) => (
    <blockquote
        className="my-4 pl-4 border-l-3 border-primary/40 bg-primary/5 rounded-r-lg py-3 pr-4 text-foreground/80 italic"
        {...props}
    >
        {children}
    </blockquote>
);

/** Lists with proper spacing */
const DocsUnorderedList = ({ children, ...props }: any) => (
    <ul className="my-3 ml-6 space-y-1.5 list-disc text-foreground/90 marker:text-primary/50" {...props}>
        {children}
    </ul>
);

const DocsOrderedList = ({ children, ...props }: any) => (
    <ol className="my-3 ml-6 space-y-1.5 list-decimal text-foreground/90 marker:text-primary/50" {...props}>
        {children}
    </ol>
);

const DocsListItem = ({ children, ...props }: any) => (
    <li className="leading-relaxed" {...props}>
        {children}
    </li>
);

/**
 * Paragraphs — intercepts custom mark tokens.
 * If the paragraph contains ONLY a block mark token, render the mark directly.
 * If it contains inline tokens mixed with text, render inline.
 */
const DocsParagraph = ({ children, ...props }: any) => {
    // Check if children contain tokens
    const childArray = React.Children.toArray(children);

    const processed = childArray.map((child, i) => {
        if (typeof child === "string") {
            const tokens = renderTokensInText(child);
            if (tokens) return <React.Fragment key={i}>{tokens}</React.Fragment>;
        }
        return child;
    });

    // If the entire paragraph is a single block callout, don't wrap in <p>
    if (processed.length === 1 && React.isValidElement(processed[0])) {
        const fragment = processed[0] as React.ReactElement;
        // Check if the fragment's children include a CalloutBlock
        if (fragment.props?.children) {
            const innerChildren = React.Children.toArray(fragment.props.children);
            if (innerChildren.length === 1 && React.isValidElement(innerChildren[0])) {
                const comp = innerChildren[0] as React.ReactElement;
                if (comp.type === CalloutBlock || comp.type === PreviewBlock) {
                    return <>{comp}</>;
                }
            }
        }
    }

    return (
        <p className="my-3 leading-relaxed text-foreground/90" {...props}>
            {processed}
        </p>
    );
};

/** Horizontal rule */
const DocsHr = (props: any) => (
    <hr className="my-8 border-border" {...props} />
);

/** Strong */
const DocsStrong = ({ children, ...props }: any) => (
    <strong className="font-semibold text-foreground" {...props}>
        {children}
    </strong>
);

/** Images */
const DocsImage = ({ src, alt, ...props }: any) => (
    <figure className="my-6 w-fit">
        <img
            src={src}
            alt={alt}
            className="rounded-lg border border-border max-w-full"
            {...props}
        />
        {alt && (
            <figcaption className="mt-2 text-center typo-micro text-muted-foreground">
                {alt}
            </figcaption>
        )}
    </figure>
);

// ─── Component maps ─────────────────────────────────────────────────────────

// Inner components for rendering markdown inside callout/collapse blocks
const INNER_COMPONENTS = {
    a: DocsLink,
    code: DocsCodeBlock,
    strong: DocsStrong,
    ul: DocsUnorderedList,
    ol: DocsOrderedList,
    li: DocsListItem,
    p: DocsParagraph,
    table: DocsTable,
    thead: DocsTableHead,
    tr: DocsTableRow,
    td: DocsTableCell,
    th: DocsTableHeaderCell,
    hr: DocsHr,
    img: DocsImage,
};

const DOCS_COMPONENTS = {
    a: DocsLink,
    h1: (props: any) => <DocsHeading level={1} {...props} />,
    h2: (props: any) => <DocsHeading level={2} {...props} />,
    h3: (props: any) => <DocsHeading level={3} {...props} />,
    h4: (props: any) => <DocsHeading level={4} {...props} />,
    h5: (props: any) => <DocsHeading level={5} {...props} />,
    h6: (props: any) => <DocsHeading level={6} {...props} />,
    code: DocsCodeBlock,
    table: DocsTable,
    thead: DocsTableHead,
    tr: DocsTableRow,
    td: DocsTableCell,
    th: DocsTableHeaderCell,
    blockquote: DocsBlockquote,
    ul: DocsUnorderedList,
    ol: DocsOrderedList,
    li: DocsListItem,
    p: DocsParagraph,
    hr: DocsHr,
    strong: DocsStrong,
    img: DocsImage,
};

// ─── Main renderer ──────────────────────────────────────────────────────────

interface DocsMarkdownRendererProps {
    content: string;
}

export const VibesMarkdownRenderer = React.memo(function VibesMarkdownRenderer({ content }: DocsMarkdownRendererProps) {
    // Pre-process custom marks before passing to react-markdown
    const processedContent = useMemo(() => preprocessCustomMarks(content), [content]);

    return (
        <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            components={DOCS_COMPONENTS}
        >
            {processedContent}
        </ReactMarkdown>
    );
});

/** @deprecated Use VibesMarkdownRenderer instead */
export const DocsMarkdownRenderer = VibesMarkdownRenderer;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractText(children: any): string {
    if (typeof children === "string") return children;
    if (Array.isArray(children)) return children.map(extractText).join("");
    if (children?.props?.children) return extractText(children.props.children);
    return "";
}
