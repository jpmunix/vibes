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

  const filteredDebates = debates.filter((d) => {
    const query = searchQuery.toLowerCase();
    const titleMatch = d.title.toLowerCase().includes(query);
    const tagMatch = d.tags.some((tag) =>
      tag.name.toLowerCase().includes(query),
    );
    return titleMatch || tagMatch;
  });

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
                  <div className="group/menu-item relative flex items-center">
                    <Button
                      variant="ghost"
                      onClick={() => handleDebateClick(debate.id)}
                      className={`justify-start h-14 w-full text-left bg-transparent hover:bg-sidebar-accent/50 pr-1 ${selectedDebateId === debate.id
                        ? "bg-primary/5 text-primary"
                        : ""
                        }`}
                    >
                      <div className="flex flex-col gap-1 w-full overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="truncate font-medium flex-1 mr-8">
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
                        </div>
                        {debate.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {debate.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold truncate max-w-[80px]"
                                style={{
                                  backgroundColor: `#3b82f620`,
                                  color: "#3b82f6",
                                  border: `1px solid #3b82f640`,
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {debate.tags.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">
                                +{debate.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Button>

                    {/* Hover gradient shadow */}
                    <div
                      className={`absolute right-0 top-0 bottom-0 w-24 pointer-events-none opacity-0 group-hover/menu-item:opacity-100 transition-opacity z-10
                        ${selectedDebateId === debate.id
                          ? "bg-gradient-to-l from-[#f0f4ff] dark:from-[#1e2433] via-[#f0f4ff]/90 dark:via-[#1e2433]/90 to-transparent"
                          : "bg-gradient-to-l from-[var(--sidebar-accent)] via-[var(--sidebar-accent)]/90 to-transparent"
                        }`}
                    />

                    <SidebarMenuAction
                      showOnHover
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(e, debate.id);
                      }}
                      className="right-1 z-20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </SidebarMenuAction>
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
    </SidebarGroup >
  );
}
