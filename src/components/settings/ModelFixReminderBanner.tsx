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
import { useRouterState } from "@tanstack/react-router";

export function ModelFixReminderBanner() {
  const { t } = useI18n();
  const routerState = useRouterState();
  const showBanner = useAtomValue(showModelFixBannerAtom);
  const invalidSlots = useAtomValue(invalidModelSlotsAtom);
  const setDialogOpen = useSetAtom(modelFixDialogOpenAtom);
  const [, setDismissedSignature] = useAtom(dismissedBannerSignatureAtom);

  const isSettingsPage =
    routerState.location.pathname === "/settings" ||
    (typeof window !== "undefined" &&
      window.location.hash.includes("/settings"));

  if (!showBanner || invalidSlots.length === 0 || isSettingsPage) {
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
      className="relative z-30 flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/15 dark:bg-amber-950/60 px-4 py-2.5 text-xs text-amber-950 dark:text-amber-100 backdrop-blur-md shadow-xs transition-all animate-in fade-in slide-in-from-top-1"
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/25 dark:bg-amber-500/30 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
        <span className="truncate font-semibold tracking-tight">
          {t("models.validation.bannerText", { count: invalidSlots.length })}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          onClick={handleOpenDialog}
          className="h-7 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950 font-bold shadow-xs cursor-pointer text-xs"
        >
          <span>{t("models.validation.bannerReview")}</span>
          <ArrowRight className="h-3 w-3" />
        </Button>

        <button
          type="button"
          onClick={handleDismiss}
          title={t("models.validation.bannerDismiss")}
          className="rounded p-1 text-amber-900/70 hover:text-amber-950 hover:bg-amber-500/20 dark:text-amber-300/80 dark:hover:text-amber-100 dark:hover:bg-amber-500/20 transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
