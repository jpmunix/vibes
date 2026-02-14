import { useState } from "react";
import { AlertTriangle, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreateCustomModelDialog } from "@/components/CreateCustomModelDialog";
import { EditCustomModelDialog } from "@/components/EditCustomModelDialog";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider"; // Use the hook directly here
import { useDeleteCustomModel } from "@/hooks/useDeleteCustomModel"; // Import the new hook
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
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const formatTokens = (num: number | undefined) => {
  if (num === undefined) return "---";
  if (num >= 1000000) return `${Math.ceil(num / 1000000)}M`;
  if (num >= 1000) return `${Math.ceil(num / 1000)}K`;
  return num.toString();
};

interface ModelsSectionProps {
  providerId: string;
}

export function ModelsSection({ providerId }: ModelsSectionProps) {
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false);
  const [isEditModelDialogOpen, setIsEditModelDialogOpen] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const [modelToEdit, setModelToEdit] = useState<any | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const invalidateModels = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.forProvider({ providerId }),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.byProviders,
    });
  };

  // Fetch custom models within this component now
  const {
    data: models,
    isLoading: modelsLoading,
    error: modelsError,
  } = useLanguageModelsForProvider(providerId);

  const { mutate: deleteModel, isPending: isDeleting } = useDeleteCustomModel({
    onSuccess: () => {
      // Optionally show a success toast here
      invalidateModels();
    },
    onError: (error: Error) => {
      // Optionally show an error toast here
      console.error("Failed to delete model:", error);
    },
  });

  const handleDeleteClick = (modelApiName: string) => {
    setModelToDelete(modelApiName);
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleEditClick = (model: any) => {
    setModelToEdit(model);
    setIsEditModelDialogOpen(true);
  };

  const handleModelClick = (modelApiName: string) => {
    setSelectedModel(selectedModel === modelApiName ? null : modelApiName);
  };

  const handleModelDoubleClick = (model: any) => {
    if (model.type === "custom") {
      handleEditClick(model);
    }
  };

  const handleConfirmDelete = () => {
    if (modelToDelete) {
      deleteModel({ providerId, modelApiName: modelToDelete });
      setModelToDelete(null);
    }
    setIsConfirmDeleteDialogOpen(false);
  };

  return (
    <div className="mt-4">
      <h2 className="text-xl font-semibold mb-2">Modelos</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Administre modelos específicos disponibles a través de este proveedor.
      </p>

      {/* Custom Models List Area */}
      {modelsLoading && (
        <div className="space-y-3 mt-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      )}
      {modelsError && (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Models</AlertTitle>
          <AlertDescription>{modelsError.message}</AlertDescription>
        </Alert>
      )}
      {!modelsLoading && !modelsError && models && models.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {models.map((model) => (
            <div
              key={model.apiName + model.displayName}
              className={`p-4 bg-card border border-border rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow flex flex-col h-[180px] ${selectedModel === model.apiName ? "ring-2 ring-primary" : ""
                }`}
              onClick={() => handleModelClick(model.apiName)}
              onDoubleClick={() => handleModelDoubleClick(model)}
            >
              <div className="flex justify-between items-start gap-2">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate flex-1">
                  {model.displayName}
                </h4>
                {model.type === "custom" && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(model);
                      }}
                      className="text-primary hover:bg-primary/10 h-6 w-6"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(model.apiName);
                      }}
                      disabled={isDeleting}
                      className="text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/50 h-6 w-6"
                    >
                      <TrashIcon className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground italic truncate mt-1">
                {model.apiName}
              </p>
              {model.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">
                  {model.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-auto pt-2">
                {model.contextWindow && model.maxOutputTokens ? (
                  <>
                    <span className="inline-block bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
                      Contexto: {formatTokens(model.contextWindow)}
                    </span>
                    <span className="inline-block bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
                      Salida: {formatTokens(model.maxOutputTokens)}
                    </span>
                  </>
                ) : model.type === "custom" ? (
                  <span className="inline-block bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 rounded-full">
                    Personalizado
                  </span>
                ) : null}
                {model.tag && (
                  <span className="inline-block bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 rounded-full">
                    {model.tag}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!modelsLoading && !modelsError && (!models || models.length === 0) && (
        <p className="text-muted-foreground mt-4">
          No se han agregado modelos personalizados para este proveedor aún.
        </p>
      )}
      {/* End Custom Models List Area */}

      {providerId !== "auto" && (
        <Button
          onClick={() => setIsCustomModelDialogOpen(true)}
          variant="outline"
          className="mt-6"
        >
          <PlusIcon className="mr-2 h-4 w-4" /> Añadir modelo personalizado
        </Button>
      )}

      {/* Render the dialogs */}
      <CreateCustomModelDialog
        isOpen={isCustomModelDialogOpen}
        onClose={() => setIsCustomModelDialogOpen(false)}
        onSuccess={() => {
          setIsCustomModelDialogOpen(false);
          invalidateModels();
        }}
        providerId={providerId}
      />

      <EditCustomModelDialog
        isOpen={isEditModelDialogOpen}
        onClose={() => setIsEditModelDialogOpen(false)}
        onSuccess={() => {
          setIsEditModelDialogOpen(false);
          invalidateModels();
        }}
        providerId={providerId}
        model={modelToEdit}
      />

      <AlertDialog
        open={isConfirmDeleteDialogOpen}
        onOpenChange={setIsConfirmDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Está seguro de que desea eliminar este modelo?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente
              el modelo personalizado "
              {modelToDelete
                ? models?.find((m) => m.apiName === modelToDelete)
                  ?.displayName || modelToDelete
                : ""}
              " (API Name: {modelToDelete}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setModelToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Eliminando..." : "Sí, eliminarlo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
