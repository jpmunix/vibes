import { useRef } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSelectedModelSupportsImages } from "@/hooks/useSelectedModelSupportsImages";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AuxiliaryActionsMenuProps {
  onFileSelect: (
    files: FileList,
    type: "chat-context" | "upload-to-codebase",
  ) => void;
  showTokenBar?: boolean;
  toggleShowTokenBar?: () => void;
  hideContextFilesPicker?: boolean;
  appId?: number;
}

export function AuxiliaryActionsMenu({
  onFileSelect,
}: AuxiliaryActionsMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supportsImages = useSelectedModelSupportsImages();

  const handleClick = () => {
    if (!supportsImages) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files, "chat-context");
      e.target.value = ""; // Reset for re-selection
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                variant="ghost"
                size="sm"
                className="has-[>svg]:px-2 hover:bg-muted bg-primary/10 text-primary cursor-pointer rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="auxiliary-actions-menu"
                onClick={handleClick}
                disabled={!supportsImages}
              >
                <Plus size={20} />
              </Button>
            </span>
          </TooltipTrigger>
          {!supportsImages && (
            <TooltipContent>
              <p>El modelo actual no soporta imágenes</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        data-testid="attach-chat-context-file-input"
        onChange={handleFileChange}
      />
    </>
  );
}
