import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";

interface CommunityCodeConsentDialogProps {
  isOpen: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export const CommunityCodeConsentDialog: React.FC<
  CommunityCodeConsentDialogProps
> = ({ isOpen, onAccept, onCancel }) => {
  const { t } = useI18n();
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("dialogs.communityCodeNotice")}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>{t("dialogs.communityCodeP1")}</p>
            <p>{t("dialogs.communityCodeP2")}</p>
            <p>{t("dialogs.communityCodeP3")}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onAccept}>{t("common.accept")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
