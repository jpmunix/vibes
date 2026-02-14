import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface CopyErrorMessageProps {
  errorMessage: string;
  className?: string;
}

export const CopyErrorMessage = ({
  errorMessage,
  className = "",
}: CopyErrorMessageProps) => {
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
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${isCopied
          ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 shadow-sm"
          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 shadow-sm hover:shadow-md"
        } ${className}`}
      title={isCopied ? "¡Copiado!" : "Copiar mensaje de error"}
    >
      {isCopied ? (
        <>
          <Check size={16} />
          <span>Copiado</span>
        </>
      ) : (
        <>
          <Copy size={16} />
          <span>Copiar</span>
        </>
      )}
    </button>
  );
};
