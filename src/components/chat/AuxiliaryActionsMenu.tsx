import { useRef } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const handleClick = () => {
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
      <Button
        variant="ghost"
        size="sm"
        className="has-[>svg]:px-2 hover:bg-muted bg-primary/10 text-primary cursor-pointer rounded-xl"
        data-testid="auxiliary-actions-menu"
        onClick={handleClick}
      >
        <Plus size={20} />
      </Button>
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
