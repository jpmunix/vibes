import { cn } from "@/lib/utils";
import React from "react";

interface LoadingBarProps {
  isVisible: boolean;
  message?: string;
}

export const LoadingBar: React.FC<LoadingBarProps> = ({
  isVisible,
  message,
}) => {
  return (
    <div className={cn("w-full", isVisible ? "" : "invisible")}>
      <div
        key="loading-bar"
        className="relative w-full h-1 bg-primary/20 overflow-hidden"
      >
        <div className="absolute top-0 left-0 h-full w-1/2 bg-primary animate-marquee" />
      </div>
      {message && (
        <div className="px-4 py-1.5 text-xs text-muted-foreground bg-muted/30">
          {message}
        </div>
      )}
    </div>
  );
};
