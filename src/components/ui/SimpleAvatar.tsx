import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SimpleAvatarProps {
  src?: string;
  alt?: string;
  fallbackText?: ReactNode;
  className?: string;
}

export function SimpleAvatar({ src, alt, fallbackText, className }: SimpleAvatarProps) {
  const [hasError, setHasError] = useState(false);

  // Reset error state when src changes so new images can be attempted
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const showImage = src && !hasError;

  return (
    <div className={cn(
      "flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden text-xs font-medium text-foreground select-none",
      className
    )}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="flex items-center justify-center w-full h-full text-center">
          {fallbackText}
        </span>
      )}
    </div>
  );
}
