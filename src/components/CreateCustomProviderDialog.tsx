import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useCustomLanguageModelProvider } from "@/hooks/useCustomLanguageModelProvider";
import type { LanguageModelProvider } from "@/ipc/types";

interface CreateCustomProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingProvider?: LanguageModelProvider | null;
}

export function CreateCustomProviderDialog({
  isOpen,
  onClose,
  onSuccess,
  editingProvider = null,
}: CreateCustomProviderDialogProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [envVarName, setEnvVarName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const isEditMode = Boolean(editingProvider);

  const { createProvider, editProvider, isCreating, isEditing, error } =
    useCustomLanguageModelProvider();
  // Load provider data when editing
  useEffect(() => {
    if (editingProvider && isOpen) {
      const cleanId = editingProvider.id?.startsWith("custom::")
        ? editingProvider.id.replace("custom::", "")
        : editingProvider.id || "";
      setId(cleanId);
      setName(editingProvider.name || "");
      setApiBaseUrl(editingProvider.apiBaseUrl || "");
      setEnvVarName(editingProvider.envVarName || "");
    } else if (!isOpen) {
      // Reset form when dialog closes
      setId("");
      setName("");
      setApiBaseUrl("");
      setEnvVarName("");
      setErrorMessage("");
    }
  }, [editingProvider, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    try {
      if (isEditMode && editingProvider) {
        const cleanId = editingProvider.id?.startsWith("custom::")
          ? editingProvider.id.replace("custom::", "")
          : editingProvider.id || "";
        await editProvider({
          id: cleanId,
          name: name.trim(),
          apiBaseUrl: apiBaseUrl.trim(),
          envVarName: envVarName.trim() || undefined,
        });
      } else {
        await createProvider({
          id: id.trim(),
          name: name.trim(),
          apiBaseUrl: apiBaseUrl.trim(),
          envVarName: envVarName.trim() || undefined,
        });
      }

      // Reset form
      setId("");
      setName("");
      setApiBaseUrl("");
      setEnvVarName("");

      onSuccess();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Failed to ${isEditMode ? "edit" : "create"} custom provider`,
      );
    }
  };

  const handleClose = () => {
    if (!isCreating && !isEditing) {
      setErrorMessage("");
      onClose();
    }
  };
  const isLoading = isCreating || isEditing;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? "Editar proveedor personalizado"
              : "Añadir proveedor personalizado"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Actualiza la configuración de tu proveedor de modelo de lenguaje personalizado."
              : "Conéctate a una API de proveedor de modelo de lenguaje personalizada."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="id">ID del proveedor</Label>
            <Input
              id="id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Ej., mi-proveedor"
              required
              disabled={isLoading || isEditMode}
            />
            <p className="text-xs text-muted-foreground">
              Un identificador único para este proveedor (sin espacios).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre a mostrar</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej., Mi proveedor"
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              El nombre que se mostrará en la interfaz.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiBaseUrl">URL base de la API</Label>
            <Input
              id="apiBaseUrl"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="Ej., https://api.example.com/v1"
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              La URL base para el endpoint de la API.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="envVarName">Variable de entorno (Opcional)</Label>
            <Input
              id="envVarName"
              value={envVarName}
              onChange={(e) => setEnvVarName(e.target.value)}
              placeholder="Ej., MI_PROVEEDOR_API_KEY"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Nombre de la variable de entorno para la clave API.
            </p>
          </div>

          {(errorMessage || error) && (
            <div className="text-sm text-red-500">
              {errorMessage ||
                (error instanceof Error
                  ? error.message
                  : "Error al crear el proveedor personalizado")}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading
                ? isEditMode
                  ? "Actualizando..."
                  : "Creando..."
                : isEditMode
                  ? "Actualizar proveedor"
                  : "Añadir proveedor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
