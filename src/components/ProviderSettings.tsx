import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";
import { providerSettingsRoute } from "@/routes/settings/providers/$provider";
import type { LanguageModelProvider } from "@/ipc/types";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useCustomLanguageModelProvider } from "@/hooks/useCustomLanguageModelProvider";
import { Trash2, Edit } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { CreateCustomProviderDialog } from "./CreateCustomProviderDialog";

export function ProviderSettingsGrid() {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<LanguageModelProvider | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);

  const {
    data: providers,
    isLoading,
    error,
    isProviderSetup,
    refetch,
  } = useLanguageModelProviders();

  const { deleteProvider, isDeleting } = useCustomLanguageModelProvider();

  const handleProviderClick = (providerId: string) => {
    navigate({
      to: "/settings/providers/$provider",
      params: { provider: providerId },
    });
  };

  const handleDeleteProvider = async () => {
    if (providerToDelete) {
      await deleteProvider(providerToDelete);
      setProviderToDelete(null);
      refetch();
    }
  };

  const handleEditProvider = (provider: LanguageModelProvider) => {
    setEditingProvider(provider);
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Proveedores de IA</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border rounded-2xl bg-muted/30">
              <CardHeader className="p-6">
                <Skeleton className="h-6 w-3/4 mb-3 rounded-lg" />
                <Skeleton className="h-4 w-1/2 rounded-lg" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Proveedores de IA</h2>
        <Alert variant="destructive" className="rounded-2xl border-destructive/20 bg-destructive/5">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">Error</AlertTitle>
          <AlertDescription className="text-base">
            No se pudieron cargar los proveedores: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Proveedores de IA</h2>
      <div className="grid grid-cols-1 gap-6">
        {providers
          ?.filter((p) => p.type !== "local" && p.id === "openrouter")
          .map((provider: LanguageModelProvider) => {
            const isCustom = provider.type === "custom";
            const isSetup = isProviderSetup(provider.id);

            return (
              <Card
                key={provider.id}
                className="relative transition-all hover:bg-muted/50 border-border w-full rounded-2xl shadow-none overflow-hidden group cursor-pointer"
                onClick={() => handleProviderClick(provider.id)}
              >
                <CardHeader className="p-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <CardTitle className="text-xl font-bold flex items-center gap-4">
                        {provider.name}
                        {isSetup ? (
                          <span className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 px-3 py-1 rounded-lg">
                            Listo
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-3 py-1 rounded-lg">
                            Requiere configuración
                          </span>
                        )}
                      </CardTitle>
                      <p className="text-base text-muted-foreground">
                        Configura las credenciales y modelos para {provider.name}
                      </p>
                    </div>

                    {isCustom && (
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="edit-custom-provider"
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0 hover:bg-white dark:hover:bg-gray-800 rounded-xl"
                              onClick={() => handleEditProvider(provider)}
                            >
                              <Edit className="h-5 w-5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar proveedor</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="delete-custom-provider"
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0 text-destructive hover:bg-destructive/10 rounded-xl"
                              onClick={() => setProviderToDelete(provider.id)}
                            >
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Eliminar proveedor</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
      </div>

      <CreateCustomProviderDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingProvider(null);
        }}
        onSuccess={() => {
          setIsDialogOpen(false);
          refetch();
          setEditingProvider(null);
        }}
        editingProvider={editingProvider}
      />

      <AlertDialog
        open={!!providerToDelete}
        onOpenChange={(open) => !open && setProviderToDelete(null)}
      >
        <AlertDialogContent className="rounded-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Eliminar proveedor personalizado
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Esto eliminará permanentemente este proveedor personalizado y
              todos sus modelos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl font-bold">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProvider}
              disabled={isDeleting}
              className="rounded-xl font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Eliminando..." : "Eliminar proveedor"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
