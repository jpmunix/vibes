import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import { ipc } from "@/ipc/types";
import {
  Trash2,
  UserPlus,
  Users,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { showSuccess, showError } from "@/lib/toast";
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

interface Collaborator {
  login: string;
  avatar_url: string;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

interface CollaboratorManagerProps {
  appId: number;
}

export function GithubCollaboratorManager({ appId }: CollaboratorManagerProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<
    string | null
  >(null);

  const loadCollaborators = useCallback(async () => {
    setIsLoading(true);
    try {
      const collabs = await ipc.github.listCollaborators({ appId });
      setCollaborators(collabs);
    } catch (error: any) {
      console.error("Failed to load collaborators:", error);
      showError("Error al cargar colaboradores: " + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [appId]);

  // Now the effect depends on loadCollaborators, which only changes when appId changes
  useEffect(() => {
    loadCollaborators();
  }, [loadCollaborators]);

  const handleInvite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedUsername = inviteUsername.trim();
    if (!trimmedUsername) return;

    setIsInviting(true);
    try {
      await ipc.github.inviteCollaborator({ appId, username: trimmedUsername });
      showSuccess(`Se ha invitado a ${trimmedUsername} al proyecto.`);
      setInviteUsername("");
      // Reload list (though they might be pending)
      loadCollaborators();
    } catch (error: any) {
      showError(error.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!collaboratorToDelete) return;

    try {
      await ipc.github.removeCollaborator({
        appId,
        username: collaboratorToDelete,
      });
      showSuccess(`Se ha eliminado a ${collaboratorToDelete} del proyecto.`);
      loadCollaborators();
    } catch (error: any) {
      showError(error.message);
    } finally {
      setCollaboratorToDelete(null);
    }
  };

  return (
    <Card className="transition-all duration-200">
      <CardHeader
        className="p-2 cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5" />
            <div>
              <CardTitle className="text-sm" data-testid="collaborators-header">
                Colaboradores
              </CardTitle>
              <CardDescription className="text-xs">
                Gestiona quién tiene acceso a este proyecto a través de GitHub.
              </CardDescription>
            </div>
          </div>
          {isExpanded ? (
            <ChevronsDownUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronsUpDown className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </CardHeader>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out ${
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <CardContent className="space-y-4">
          {/* Invite Form */}
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              placeholder="Nombre de usuario de GitHub"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              disabled={isInviting}
              data-testid="collaborator-invite-input"
            />
            <Button
              type="submit"
              data-testid="collaborator-invite-button"
              disabled={isInviting || !inviteUsername.trim()}
            >
              {isInviting ? (
                "Invitando..."
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invitar
                </>
              )}
            </Button>
          </form>

          {/* Collaborators List */}
          <div className="space-y-2 mt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Equipo actual
            </h3>
            {isLoading ? (
              <div className="text-sm text-center py-4 text-gray-500">
                Cargando colaboradores...
              </div>
            ) : collaborators.length === 0 ? (
              <div className="text-sm text-center py-4 text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-md">
                No se encontraron colaboradores.
              </div>
            ) : (
              <div className="space-y-2">
                {collaborators.map((collab) => (
                  <div
                    key={collab.login}
                    data-testid={`collaborator-item-${collab.login}`}
                    className="flex items-center justify-between p-2 rounded-md border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
                  >
                    <div className="flex items-center gap-3">
                      <SimpleAvatar
                        src={collab.avatar_url}
                        alt={collab.login}
                        fallbackText={collab.login.slice(0, 2).toUpperCase()}
                      />
                      <div>
                        <p className="text-sm font-medium">{collab.login}</p>
                        <p className="text-xs text-gray-500">
                          {collab.permissions?.admin
                            ? "Administrador"
                            : collab.permissions?.push
                              ? "Editor"
                              : "Lector"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      data-testid={`collaborator-remove-button-${collab.login}`}
                      onClick={() => setCollaboratorToDelete(collab.login)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </div>

      <AlertDialog
        open={!!collaboratorToDelete}
        onOpenChange={(open) => {
          if (!open) setCollaboratorToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar a{" "}
              <span className="font-medium">{collaboratorToDelete}</span> de
              este proyecto? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="confirm-remove-collaborator-cancel">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-remove-collaborator"
              onClick={handleRemove}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
