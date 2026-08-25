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

interface DeleteChatDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  chatTitle?: string;
}

export function DeleteChatDialog({
  isOpen,
  onOpenChange,
  onConfirmDelete,
  chatTitle,
}: DeleteChatDialogProps) {
  const { t } = useI18n();
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("chatActions.deleteChat")}</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que quieres eliminar "{chatTitle || "este chat"}"?
            Esta acción no se puede deshacer y todos los mensajes de este chat
            se perderán permanentemente.
            <br />
            <br />
            <strong>Nota:</strong> Cualquier cambio de código que ya haya sido
            aceptado se mantendrá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("chatActions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
          >
            {t("chatActions.deleteChat")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
