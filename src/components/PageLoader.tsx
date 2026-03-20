import { Loader2 } from "lucide-react";

/**
 * Minimal full-area loading spinner shown as a Suspense fallback
 * while lazy-loaded route pages resolve.
 */
export const PageLoader = ({ text = "Cargando..." }: { text?: string }) => (
    <div className="flex flex-col items-center justify-center h-full w-full gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin opacity-60" />
        <span className="text-sm font-medium opacity-70">{text}</span>
    </div>
);
