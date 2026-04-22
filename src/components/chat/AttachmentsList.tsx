import { FileText, X, Upload } from "@/components/ui/icons";
import type { FileAttachment } from "@/ipc/types";
import { useState, useEffect, useCallback } from "react";

interface AttachmentsListProps {
  attachments: FileAttachment[];
  onRemove: (index: number) => void;
}

export function AttachmentsList({
  attachments,
  onRemove,
}: AttachmentsListProps) {
  // Expanded image state (shared across all attachments)
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  const handleClose = useCallback(() => setExpandedUrl(null), []);

  if (attachments.length === 0) return null;

  // Separate images from non-image files
  const imageAttachments = attachments
    .map((a, i) => ({ attachment: a, index: i }))
    .filter(({ attachment }) => attachment.file.type.startsWith("image/"));
  const fileAttachments = attachments
    .map((a, i) => ({ attachment: a, index: i }))
    .filter(({ attachment }) => !attachment.file.type.startsWith("image/"));

  return (
    <>
      <div className="mx-3 mt-2.5 mb-2 flex flex-col gap-1.5">
        {/* Image attachments — square thumbnails with click-to-expand */}
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageAttachments.map(({ attachment, index }) => (
              <ImageAttachment
                key={index}
                file={attachment.file}
                onRemove={() => onRemove(index)}
                onExpand={setExpandedUrl}
              />
            ))}
          </div>
        )}

        {/* Non-image file attachments — compact chips */}
        {fileAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {fileAttachments.map(({ attachment, index }) => (
              <div
                key={index}
                className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1.5 text-xs animate-in fade-in slide-in-from-bottom-1 duration-150"
                title={`${attachment.file.name} (${(attachment.file.size / 1024).toFixed(1)}KB)`}
              >
                {attachment.type === "upload-to-codebase" ? (
                  <Upload size={12} className="text-blue-500 shrink-0" />
                ) : (
                  <FileText size={12} className="text-muted-foreground/60 shrink-0" />
                )}
                <span className="truncate max-w-[160px] text-muted-foreground/80">
                  {attachment.file.name}
                </span>
                <button
                  onClick={() => onRemove(index)}
                  className="cursor-pointer p-0.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors shrink-0"
                  aria-label="Eliminar adjunto"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expanded image overlay — same style as UserMessageContent */}
      {expandedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
          onClick={handleClose}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              onClick={handleClose}
              className="absolute -top-3 -right-3 z-10 bg-background/90 rounded-full p-1.5 shadow-lg hover:bg-background transition-colors border border-border"
            >
              <X size={16} />
            </button>
            <img
              src={expandedUrl}
              alt="Captura ampliada"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}

function ImageAttachment({
  file,
  onRemove,
  onExpand,
}: {
  file: File;
  onRemove: () => void;
  onExpand: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url)
    return (
      <div className="w-[88px] h-[88px] bg-muted/40 rounded-lg animate-pulse border border-border/30" />
    );

  return (
    <div
      className="relative group overflow-hidden border border-primary/20 bg-primary/[0.04] hover:border-primary/40 transition-[border-color,box-shadow] duration-200 hover:shadow-md animate-in fade-in slide-in-from-bottom-1 duration-150 cursor-pointer rounded-lg"
      style={{ width: 88, height: 88, flexShrink: 0 }}
      onClick={() => onExpand(url)}
    >
      <img
        src={url}
        alt={file.name}
        className="block w-full h-full object-cover rounded-lg"
      />
      {/* Title overlay on hover */}
      <div className="absolute inset-x-0 bottom-0 flex items-center px-1.5 py-1 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="text-[9px] font-medium text-white/90 drop-shadow-sm truncate">
          {file.name}
        </span>
      </div>
      {/* Dismiss button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1 right-1 p-0.5 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
        aria-label="Eliminar captura"
      >
        <X size={10} />
      </button>
    </div>
  );
}
