import { Loader2 } from "@/components/ui/icons";

/**
 * Minimal full-area loading spinner shown as a Suspense fallback
 * while lazy-loaded route pages resolve.
 */
export const PageLoader = ({ text = "Cargando..." }: { text?: string }) => (
    <div className="flex flex-col items-center justify-center h-full w-full gap-3 typo-caption opacity-80">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span>{text}</span>
    </div>
);
