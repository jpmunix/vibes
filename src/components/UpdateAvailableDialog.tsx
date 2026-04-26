import { useState } from "react";
import { Download, X } from "@/components/ui/icons";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface UpdateAvailableDialogProps {
    updateVersion: string | null;
    isOpen: boolean;
    onDismiss: (remember: boolean) => void;
    onDownload: () => void;
}

export function UpdateAvailableDialog({
    updateVersion,
    isOpen,
    onDismiss,
    onDownload,
}: UpdateAvailableDialogProps) {
    const [remember, setRemember] = useState(false);

    if (!updateVersion) return null;

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onDismiss(remember);
            }}
        >
            <DialogContent className="sm:max-w-md" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>
                        🚀 Actualización {updateVersion} disponible
                    </DialogTitle>
                    <DialogDescription>
                        Descarga la app haciendo click en el siguiente botón.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 py-2">
                    <Checkbox
                        id="update-remember"
                        checked={remember}
                        onCheckedChange={(checked) => setRemember(checked === true)}
                    />
                    <Label
                        htmlFor="update-remember"
                        className="typo-caption cursor-pointer select-none"
                    >
                        No recordarme hasta la siguiente actualización
                    </Label>
                </div>

                <DialogFooter className="flex gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => onDismiss(remember)}>
                        <X className="size-4" />
                        Omitir
                    </Button>
                    <Button onClick={onDownload}>
                        <Download className="size-4" />
                        Descargar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
