import { Copy, Check } from "@/components/ui/icons";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

interface CopyErrorMessageProps {
  errorMessage: string;
  className?: string;
}

export const CopyErrorMessage = ({
  errorMessage,
  className = "",
}: CopyErrorMessageProps) => {
  const { t } = useI18n();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(errorMessage);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy error message:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        isCopied
          ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 shadow-sm"
          : "bg-gray-100 dark:bg-gray-700 text-foreground hover:bg-accent dark:hover:bg-gray-600 shadow-sm hover:shadow-md"
      } ${className}`}
      title={isCopied ? t("chat.copied") : t("chat.copy")}
    >
      {isCopied ? (
        <>
          <Check size={16} />
          <span>{t("chat.copied")}</span>
        </>
      ) : (
        <>
          <Copy size={16} />
          <span>{t("chat.copy")}</span>
        </>
      )}
    </button>
  );
};
