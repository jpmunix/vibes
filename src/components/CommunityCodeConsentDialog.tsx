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

interface CommunityCodeConsentDialogProps {
  isOpen: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export const CommunityCodeConsentDialog: React.FC<
  CommunityCodeConsentDialogProps
> = ({ isOpen, onAccept, onCancel }) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Aviso de código de la comunidad</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Este código fue creado por un miembro de la comunidad de Dyad, no
              por nuestro equipo principal.
            </p>
            <p>
              El código de la comunidad puede ser muy útil, pero como se
              desarrolla de forma independiente, puede tener errores, riesgos de
              seguridad o causar problemas en tu sistema. No podemos ofrecer
              soporte oficial si surgen problemas.
            </p>
            <p>
              Recomendamos revisar primero el código en GitHub. Procede solo si
              te sientes cómodo con estos riesgos.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onAccept}>Aceptar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
