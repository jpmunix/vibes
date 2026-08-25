import { Loader2 } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n";

/**
 * Minimal full-area loading spinner shown as a Suspense fallback
 * while lazy-loaded route pages resolve.
 */
export const PageLoader = ({ text }: { text?: string }) => {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-3 typo-caption opacity-80">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span>{text ?? t("common.loading")}</span>
    </div>
  );
};
