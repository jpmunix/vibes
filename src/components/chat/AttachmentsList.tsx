import { FileText, X, MessageSquare, Upload } from "@/components/ui/icons";
import type { FileAttachment } from "@/ipc/types";
import { useState, useEffect } from "react";

interface AttachmentsListProps {
  attachments: FileAttachment[];
  onRemove: (index: number) => void;
}

export function AttachmentsList({
  attachments,
  onRemove,
}: AttachmentsListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="px-2 pt-2 flex flex-wrap gap-1">
      {attachments.map((attachment, index) => (
        <div
          key={index}
          className="flex items-center bg-muted rounded-md px-2 py-1 text-xs gap-1"
          title={`${attachment.file.name} (${(attachment.file.size / 1024).toFixed(1)}KB)`}
        >
          <div className="flex items-center gap-1">
            {attachment.type === "upload-to-codebase" ? (
              <Upload size={12} className="text-blue-600" />
            ) : (
              <MessageSquare size={12} className="text-green-600" />
            )}
            {attachment.file.type.startsWith("image/") ? (
              <Thumbnail file={attachment.file} />
            ) : (
              <FileText size={12} />
            )}
          </div>
          <span className="truncate max-w-[120px]">{attachment.file.name}</span>
          <button
            onClick={() => onRemove(index)}
            className="cursor-pointer hover:bg-muted-foreground/20 rounded-full p-0.5"
            aria-label="Remove attachment"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return <div className="w-5 h-5 bg-muted-foreground/20 rounded animate-pulse" />;

  return (
    <div className="relative group/thumb">
      <img
        src={url}
        alt={file.name}
        className="w-5 h-5 object-cover rounded"
      />
      <div className="absolute hidden group-hover/thumb:block top-6 left-0 z-50">
        <img
          src={url}
          alt={file.name}
          className="max-w-[250px] max-h-[250px] object-contain bg-background border border-border p-1 rounded-lg shadow-xl"
        />
      </div>
    </div>
  );
}
