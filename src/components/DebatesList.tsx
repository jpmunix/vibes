import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  PlusCircle,
  Trash2,
  Search,
  Loader2,
  MessageSquare,
  Tag as TagIcon,
} from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
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
import { Button } from "@/components/ui/button";
import { useDebates } from "@/hooks/useDebates";
import { atom } from "jotai";

export const selectedDebateIdAtom = atom<number | null>(null);

export function DebatesList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const [selectedDebateId, setSelectedDebateId] = useAtom(selectedDebateIdAtom);
  const { debates, loading, invalidateDebates } = useDebates();
  const routerState = useRouterState();
  const isDebateRoute = routerState.location.pathname.startsWith("/debates");

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debateToDelete, setDebateToDelete] = useState<number | null>(null);

  useEffect(() => {
    if (isDebateRoute) {
      const id = (routerState.location.search as any).id;
      if (id) {
        setSelectedDebateId(Number(id));
      }
    }
  }, [isDebateRoute, routerState.location.search, setSelectedDebateId]);

  if (!show) return null;

  const handleDebateClick = (debateId: number) => {
    setSelectedDebateId(debateId);
    navigate({
      to: "/debates",
      search: { id: debateId },
    });
  };

  const handleNewDebate = () => {
    setSelectedDebateId(null);
    navigate({ to: "/debates" });
  };

  const handleDeleteClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setDebateToDelete(id);
  };

  const confirmDelete = async () => {
    if (!debateToDelete) return;

    try {
      await ipc.debate.deleteDebate(debateToDelete);
      showSuccess("Debate eliminado");
      if (selectedDebateId === debateToDelete) {
        setSelectedDebateId(null);
        navigate({ to: "/debates" });
      }
      await invalidateDebates();
    } catch (e: any) {
      showError(`Error al eliminar: ${e.message}`);
    } finally {
      setDebateToDelete(null);
    }
  };

  const filteredDebates = debates.filter((d) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <SidebarGroup className="overflow-y-auto h-[calc(100vh-112px)]">
      <SidebarGroupLabel>Debates</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="flex flex-col space-y-4 px-2">
          <Button
            onClick={handleNewDebate}
            variant="outline"
            className="flex items-center justify-start gap-2 py-3 w-full"
          >
            <PlusCircle size={16} />
            <span>Nuevo debate</span>
          </Button>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Buscar debates..."
              className="w-full bg-background border rounded-md py-2 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2
                className="animate-spin text-muted-foreground"
                size={20}
              />
            </div>
          ) : filteredDebates.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No se encontraron debates
            </div>
          ) : (
            <SidebarMenu className="space-y-1">
              {filteredDebates.map((debate) => (
                <SidebarMenuItem key={debate.id}>
                  <div className="group relative flex items-center">
                    <Button
                      variant="ghost"
                      onClick={() => handleDebateClick(debate.id)}
                      className={`justify-start h-14 w-full text-left bg-transparent hover:bg-sidebar-accent/50 ${
                        selectedDebateId === debate.id
                          ? "border-l-4 border-primary bg-primary/5 text-primary"
                          : ""
                      }`}
                    >
                      <div className="flex flex-col gap-1 w-full overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="truncate font-medium flex-1">
                            {debate.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MessageSquare size={10} />
                            {formatDistanceToNow(new Date(debate.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                          {debate.tags.length > 0 && (
                            <span className="flex items-center gap-1">
                              <TagIcon size={10} />
                              {debate.tags.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </Button>
                    <button
                      onClick={(e) => handleDeleteClick(e, debate.id)}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}

          <AlertDialog
            open={!!debateToDelete}
            onOpenChange={(open) => !open && setDebateToDelete(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar debate?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer. Esto eliminará
                  permanentemente el debate y todo su historial.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
