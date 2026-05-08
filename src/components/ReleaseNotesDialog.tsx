import { useState, useEffect, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ipc } from "@/ipc/types";
import { useAppVersion } from "@/hooks/useAppVersion";
import { ChevronRight, Share2, Rocket } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";

interface ReleaseNotesDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

/** A single release section parsed from the markdown. */
interface ReleaseSection {
    /** The raw heading text, e.g. "v8.2" */
    title: string;
    /** The date line if present, e.g. "26 de abril de 2026" */
    date: string | null;
    /** The body markdown (everything after heading + date until next heading) */
    body: string;
}

/**
 * Splits the raw markdown into release sections.
 * Looks for lines starting with `# ` (H1) as section delimiters.
 */
function parseReleaseSections(markdown: string): ReleaseSection[] {
    const lines = markdown.split("\n");
    const sections: ReleaseSection[] = [];
    let current: ReleaseSection | null = null;
    let bodyLines: string[] = [];

    const flush = () => {
        if (current) {
            current.body = bodyLines.join("\n").trim();
            sections.push(current);
            bodyLines = [];
        }
    };

    for (const line of lines) {
        if (line.startsWith("# ") && !line.startsWith("## ")) {
            flush();
            const title = line.replace(/^#\s+/, "").trim();
            current = { title, date: null, body: "" };
        } else if (current && current.body === "" && bodyLines.length === 0 && /^\*[^*]+\*$/.test(line.trim())) {
            // Italic date line right after the heading, e.g. *26 de abril de 2026*
            current.date = line.trim().replace(/^\*|\*$/g, "");
        } else {
            bodyLines.push(line);
        }
    }
    flush();

    return sections;
}

function ReleaseSectionItem({
    section,
    defaultOpen,
}: {
    section: ReleaseSection;
    defaultOpen: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-border/40 last:border-b-0">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2.5 w-full px-1 py-4 text-left cursor-pointer group transition-colors hover:opacity-80"
            >
                <ChevronRight
                    size={16}
                    className={cn(
                        "text-muted-foreground shrink-0 transition-transform duration-200",
                        isOpen && "rotate-90",
                    )}
                />
                <div className="flex flex-col gap-0.5">
                    <span className="text-lg font-bold leading-tight">{section.title}</span>
                    {section.date && (
                        <span className="typo-caption text-muted-foreground italic">{section.date}</span>
                    )}
                </div>
            </button>

            {isOpen && (
                <div className="pl-7 pb-6 pr-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
    );
}

export function ReleaseNotesDialog({
    isOpen,
    onOpenChange,
}: ReleaseNotesDialogProps) {
    const [content, setContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const appVersion = useAppVersion();

    useEffect(() => {
        if (isOpen) {
            const loadContent = async () => {
                setIsLoading(true);
                try {
                    const result = await ipc.system.getReleaseNotesContent();
                    setContent(result);
                } catch (error) {
                    console.error("Failed to load release notes:", error);
                    setContent("# Error al cargar las notas de lanzamiento.");
                } finally {
                    setIsLoading(false);
                }
            };
            loadContent();
        }
    }, [isOpen]);

    const sections = useMemo(() => parseReleaseSections(content), [content]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-[900px] !w-[90vw] max-h-[85vh] flex flex-col p-8 !gap-0 overflow-hidden">
                <DialogHeader className="mb-4 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-3">
                            <Rocket size={18} /> ¿Qué hay de nuevo en v{appVersion}?
                        </DialogTitle>
                        {content && !isLoading && (
                            <button
                                type="button"
                                title="Compartir"
                                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                onClick={async () => {
                                    try {
                                        const result = await ipc.markdownShare.uploadDocument({
                                            id: "release-notes",
                                            title: `Release Notes v${appVersion}`,
                                            content,
                                            format: "md",
                                        });
                                        await navigator.clipboard.writeText(result.data.share_url);
                                        showSuccess("URL copiada al portapapeles");
                                    } catch (e) {
                                        showError(e);
                                    }
                                }}
                            >
                                <Share2 size={16} />
                            </button>
                        )}
                    </div>
                </DialogHeader>
                <div className="flex-1 min-h-0 w-full overflow-y-auto pr-4 custom-scrollbar">
                    {isLoading ? (
                        <p className="typo-body opacity-50 text-center py-10">Cargando novedades...</p>
                    ) : sections.length > 0 ? (
                        <div className="flex flex-col">
                            {sections.map((section, index) => (
                                <ReleaseSectionItem
                                    key={section.title}
                                    section={section}
                                    defaultOpen={index < 1}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none pb-8 text-left">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
