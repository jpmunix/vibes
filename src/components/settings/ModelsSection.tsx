import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreateCustomModelDialog } from "@/components/CreateCustomModelDialog";
import { EditCustomModelDialog } from "@/components/EditCustomModelDialog";
import { ModelInfoDialog } from "@/components/ModelInfoDialog";
import { AddModelDialog } from "@/components/settings/AddModelDialog";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { useDeleteCustomModel } from "@/hooks/useDeleteCustomModel";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { type LanguageModel } from "@/ipc/types";
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
  onAddRef?: (openAdd: () => void) => void;
}

export function ModelsSection({ providerId, onAddRef }: ModelsSectionProps) {
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false);
  const [isAddModelDialogOpen, setIsAddModelDialogOpen] = useState(false);

  // Expose the add dialog opener to parent
  useEffect(() => {
    onAddRef?.(() => setIsAddModelDialogOpen(true));
  }, [onAddRef]);
  const [isEditModelDialogOpen, setIsEditModelDialogOpen] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const [modelToEdit, setModelToEdit] = useState<any | null>(null);
  const [infoModel, setInfoModel] = useState<LanguageModel | null>(null);
  const queryClient = useQueryClient();
  const { settings, updateSettings } = useSettings();

  const enabledModelIds =
    settings?.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;

  const invalidateModels = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.forProvider({ providerId }),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.byProviders,
    });
  };

  const {
    data: models,
    isLoading: modelsLoading,
    error: modelsError,
  } = useLanguageModelsForProvider(providerId);

  const { mutate: deleteModel, isPending: isDeleting } = useDeleteCustomModel({
    onSuccess: () => {
      invalidateModels();
    },
    onError: (error: Error) => {
      console.error("Failed to delete model:", error);
    },
  });

  // Only show enabled models
  const enabledModels = useMemo(() => {
    if (!models) return [];
    return models.filter((m) => enabledModelIds.includes(m.apiName));
  }, [models, enabledModelIds]);

  const handleDeleteClick = (modelApiName: string) => {
    setModelToDelete(modelApiName);
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleEditClick = (model: any) => {
    setModelToEdit(model);
    setIsEditModelDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (modelToDelete) {
      deleteModel({ providerId, modelApiName: modelToDelete });
      setModelToDelete(null);
    }
    setIsConfirmDeleteDialogOpen(false);
  };

  const handleToggleModel = (modelApiName: string, enabled: boolean) => {
    const current = settings?.enabledOpenRouterModels ?? [
      ...DEFAULT_ENABLED_MODELS,
    ];
    let newEnabled: string[];
    if (enabled) {
      newEnabled = [...current, modelApiName];
    } else {
      newEnabled = current.filter((id) => id !== modelApiName);
    }
    updateSettings({ enabledOpenRouterModels: newEnabled });
  };

  return (
    <div>

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
      {!modelsLoading && !modelsError && enabledModels.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {enabledModels.map((model) => (
            <div
              key={model.apiName + model.displayName}
              className="p-3 bg-card border border-border rounded-xl shadow-sm cursor-pointer hover:shadow-md hover:border-primary/30 transition-all flex flex-col"
              onClick={() => setInfoModel(model)}
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

              <div className="flex items-center justify-between mt-auto pt-2">
                <div className="flex items-center gap-2">
                  {model.contextWindow || model.maxOutputTokens ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {model.contextWindow ? <span>Contexto: {formatTokens(model.contextWindow)}</span> : null}
                      {model.contextWindow && model.maxOutputTokens ? <span>•</span> : null}
                      {model.maxOutputTokens ? <span>Salida: {formatTokens(model.maxOutputTokens)}</span> : null}
                    </div>
                  ) : model.type === "custom" ? (
                    <span className="text-xs text-muted-foreground">
                      Personalizado
                    </span>
                  ) : null}
                </div>
                {/* Disable switch */}
                <Switch
                  checked={true}
                  onCheckedChange={() =>
                    handleToggleModel(model.apiName, false)
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 ml-2"
                />
              </div>
            </div>
          ))}
        </div>
      )
      }
      {
        !modelsLoading &&
        !modelsError &&
        enabledModels.length === 0 && (
          <p className="text-muted-foreground mt-4">
            No hay modelos habilitados. Usa "Añadir más modelos" para
            activar algunos.
          </p>
        )
      }



      {/* Model Info Dialog */}
      {
        infoModel && (
          <ModelInfoDialog
            open={!!infoModel}
            onOpenChange={(open) => !open && setInfoModel(null)}
            model={infoModel}
          />
        )
      }

      {/* Add Model Dialog (search OpenRouter models) */}
      <AddModelDialog
        open={isAddModelDialogOpen}
        onOpenChange={setIsAddModelDialogOpen}
      />

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
    </div >
  );
}
