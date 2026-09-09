import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AlertTriangle, X, ArrowRight } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n";
import {
  invalidModelSlotsAtom,
  modelFixDialogOpenAtom,
  showModelFixBannerAtom,
  dismissedBannerSignatureAtom,
  getInvalidSlotsSignature,
} from "@/atoms/modelValidationAtoms";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";

export function ModelFixReminderBanner() {
  const { t } = useI18n();
  const showBanner = useAtomValue(showModelFixBannerAtom);
  const invalidSlots = useAtomValue(invalidModelSlotsAtom);
  const setDialogOpen = useSetAtom(modelFixDialogOpenAtom);
  const [, setDismissedSignature] = useAtom(dismissedBannerSignatureAtom);

  if (!showBanner || invalidSlots.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    const signature = getInvalidSlotsSignature(invalidSlots);
    setDismissedSignature(signature);
    ipc.misc
      .setPreference({
        key: "modelValidation.bannerDismissedSignature",
        value: signature,
      })
      .catch((err: any) => {
        console.error("Failed to persist model validation banner dismissal:", err);
      });
  };

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  return (
    <div
      role="alert"
      className="relative z-30 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 backdrop-blur-sm transition-all animate-in fade-in slide-in-from-top-1"
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="truncate font-medium">
          {t("models.validation.bannerText", { count: invalidSlots.length })}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={handleOpenDialog}
          className="h-7 gap-1 border-amber-500/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 hover:text-white cursor-pointer"
        >
          <span>{t("models.validation.bannerReview")}</span>
          <ArrowRight className="h-3 w-3" />
        </Button>

        <button
          type="button"
          onClick={handleDismiss}
          title={t("models.validation.bannerDismiss")}
          className="rounded p-1 text-amber-300/70 hover:bg-amber-500/20 hover:text-amber-100 transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
