import { useRef } from "react";
import { Plus } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

/** Accepted file types: images + plain text formats */
const ACCEPTED_FILE_TYPES = [
  "image/*",
  ".md", ".txt", ".html", ".htm", ".csv", ".json", ".xml",
  ".yaml", ".yml", ".log", ".ini", ".cfg", ".conf", ".toml",
  ".env", ".gitignore",
  ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".scss",
  ".sh", ".bash", ".zsh",
  ".sql", ".graphql", ".gql",
  ".rs", ".go", ".java", ".kt", ".swift", ".c", ".cpp", ".h",
  ".rb", ".php", ".lua", ".r", ".m",
].join(",");

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
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files, "chat-context");
      // Reset the input value so the same file can be selected again
      e.target.value = "";
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
                className="has-[>svg]:px-2 hover:bg-muted bg-primary/10 text-primary cursor-pointer rounded-xl"
                data-testid="auxiliary-actions-menu"
                onClick={handleClick}
              >
                <Plus size={20} />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("chatActions.attachMediaOrFiles")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        data-testid="attach-chat-context-file-input"
        onChange={handleFileChange}
      />
    </>
  );
}
