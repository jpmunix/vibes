import React, { useState, useCallback, useMemo } from "react";
import { VanillaMarkdownParser } from "./VibesMarkdownParser";
import { X, Wrench } from "@/components/ui/icons";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface UserMessageContentProps {
    content: string;
    aiMessagesJson?: any;
}

/**
 * Extract image base64 data from aiMessagesJson if available.
 * Returns an array of { base64, mimeType } objects.
 */
function extractImagesFromAiMessages(aiMessagesJson: any): Array<{
    base64: string;
    mimeType: string;
}> {
    if (!aiMessagesJson) {
        return [];
    }

    let parsed = aiMessagesJson;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch (e) {
            console.warn("[UserMessageContent] Failed to parse aiMessagesJson string", e);
            return [];
        }
    }

    // Handle both new format {messages: [...]} and old format [...]
    const messages = Array.isArray(parsed)
        ? parsed
        : parsed?.messages;

    if (!messages || !Array.isArray(messages)) {
        return [];
    }

    const images: Array<{ base64: string; mimeType: string }> = [];

    for (const msg of messages) {
        if (msg.role !== "user") continue;
        if (!Array.isArray(msg.content)) continue;

        for (const part of msg.content) {
            if (part.type === "image" && part.image) {
                images.push({
                    base64: part.image,
                    mimeType: part.mediaType || part.mimeType || "image/png",
                });
            }
        }
    }

    return images;
}

/**
 * Renders user message content with image thumbnails instead of raw attachment text.
 * If images are found in aiMessagesJson, they're shown as clickable thumbnails.
 * The raw attachment text section is stripped from the markdown display.
 */
export const UserMessageContent = React.memo(function UserMessageContent({
    content,
    aiMessagesJson,
}: UserMessageContentProps) {
    const [expandedImage, setExpandedImage] = useState<string | null>(null);

    // Parse attached images from aiMessagesJson
    const images = useMemo(
        () => extractImagesFromAiMessages(aiMessagesJson),
        [aiMessagesJson],
    );

    // Strip the "Attachments:" section and anything after it for display
    const cleanContent = useMemo(() => {
        let text = content;

        // Remove attachment metadata
        const attachmentMarker = text.indexOf("\n\nAttachments:\n");
        if (attachmentMarker !== -1) {
            text = text.substring(0, attachmentMarker);
        }

        // Also remove selected components info
        const componentMarker = text.indexOf("\n\nSelected components:\n");
        if (componentMarker !== -1) {
            text = text.substring(0, componentMarker);
        }

        // Also remove file upload instructions
        const uploadMarker = text.indexOf("\n\nFile to upload to codebase:");
        if (uploadMarker !== -1) {
            text = text.substring(0, uploadMarker);
        }

        // Convert single \n into markdown hard breaks (two trailing spaces + \n)
        // so plain-text messages preserve line breaks without whitespace-pre-wrap,
        // while markdown block elements (lists, headings) still render correctly.
        text = text.replace(/\n(?!\n)/g, '  \n');

        return text.trim();
    }, [content]);

    // Detect "Fix error:" messages
    const isFixError = cleanContent.startsWith("Fix error:");

    // Check if there are image attachment references in the raw content
    const hasAttachmentText = content.includes("\n\nAttachments:\n");

    const [errorModalOpen, setErrorModalOpen] = useState(false);

    const handleImageClick = useCallback((dataUrl: string) => {
        setExpandedImage(dataUrl);
    }, []);

    const handleCloseExpanded = useCallback(() => {
        setExpandedImage(null);
    }, []);

    return (
        <>
            {/* Render content: compact badge for fix-error, normal markdown otherwise */}
            {isFixError ? (
                <>
                    <div
                        onClick={() => setErrorModalOpen(true)}
                        className="not-prose flex items-center gap-2 cursor-pointer"
                    >
                        <Wrench size={14} className="text-destructive flex-shrink-0" />
                        <span className="typo-button font-normal text-foreground">Soluciona este error</span>
                    </div>
                    <Dialog open={errorModalOpen} onOpenChange={setErrorModalOpen}>
                        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-destructive">
                                    <Wrench size={20} />
                                    Detalle del error
                                </DialogTitle>
                            </DialogHeader>
                            <div className="mt-2 prose dark:prose-invert prose-sm max-w-none">
                                <VanillaMarkdownParser content={cleanContent} />
                            </div>
                        </DialogContent>
                    </Dialog>
                </>
            ) : (
                cleanContent && (
                    <div>
                        <VanillaMarkdownParser content={cleanContent} />
                    </div>
                )
            )}

            {/* Render image thumbnails — styled like quote cards */}
            {images.length > 0 && (
                <div className="not-prose flex flex-wrap gap-2 mt-2">
                    {images.map((img, index) => {
                        const dataUrl = `data:${img.mimeType};base64,${img.base64}`;
                        return (
                            <button
                                key={index}
                                onClick={() => handleImageClick(dataUrl)}
                                className="relative group rounded-lg overflow-hidden border border-primary/20 bg-primary/[0.04] hover:border-primary/40 transition-[border-color,box-shadow] duration-200 hover:shadow-md cursor-pointer"
                                style={{ width: 120, height: 120, flexShrink: 0 }}
                            >
                                <img
                                    src={dataUrl}
                                    alt={`Captura ${index + 1}`}
                                    className="block w-full h-full object-cover rounded-lg"
                                />
                                {/* Title overlay on hover */}
                                <div className="absolute inset-x-0 bottom-0 flex items-center px-2 py-1 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <span className="text-[9px] font-medium text-white/90 drop-shadow-sm">Captura {index + 1}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Fallback: if we have attachment text but no aiMessagesJson images,
          show a subtle indicator that there were attachments */}
            {hasAttachmentText && images.length === 0 && (
                <div className="flex items-center gap-1.5 mt-2 typo-micro text-muted-foreground/60">
                    <span>📎 Adjuntos enviados</span>
                </div>
            )}

            {/* Expanded image overlay */}
            {expandedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
                    onClick={handleCloseExpanded}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh]">
                        <button
                            onClick={handleCloseExpanded}
                            className="absolute -top-3 -right-3 z-10 bg-background/90 rounded-full p-1.5 shadow-lg hover:bg-background transition-colors border border-border"
                        >
                            <X size={16} />
                        </button>
                        <img
                            src={expandedImage}
                            alt="Captura ampliada"
                            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </>
    );
});
