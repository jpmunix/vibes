import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import type { CreateMcpServer, McpServer, McpServerUpdate } from "@/ipc/types/mcp";
import { showSuccess, showError } from "@/lib/toast";

export function useMcpServers() {
  const queryClient = useQueryClient();

  const serversQuery = useQuery({
    queryKey: queryKeys.mcp.servers,
    queryFn: () => ipc.mcp.listServers(),
  });

  const createServer = useMutation({
    mutationFn: (data: CreateMcpServer) => ipc.mcp.createServer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcp.all });
      showSuccess("Servidor MCP añadido correctamente");
    },
    onError: (err: any) => {
      showError(`Error al crear el servidor: ${err.message}`);
    },
  });

  const updateServer = useMutation({
    mutationFn: (data: McpServerUpdate) => ipc.mcp.updateServer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcp.all });
    },
    onError: (err: any) => {
      showError(`Error al actualizar el servidor: ${err.message}`);
    },
  });

  const deleteServer = useMutation({
    mutationFn: (id: number) => ipc.mcp.deleteServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mcp.all });
      showSuccess("Servidor MCP eliminado");
    },
    onError: (err: any) => {
      showError(`Error al eliminar el servidor: ${err.message}`);
    },
  });

  return {
    servers: serversQuery.data || [],
    isLoading: serversQuery.isLoading,
    createServer: createServer.mutateAsync,
    isCreating: createServer.isPending,
    updateServer: updateServer.mutateAsync,
    isUpdating: updateServer.isPending,
    deleteServer: deleteServer.mutateAsync,
    isDeleting: deleteServer.isPending,
  };
}

export function useMcpTools(serverId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.mcp.toolsByServer.all, serverId],
    queryFn: () => serverId ? ipc.mcp.listTools(serverId) : Promise.resolve([]),
    enabled: !!serverId,
    staleTime: 1000 * 60 * 5, // Cache for 5 mins as getting tools can take a second to connect
    retry: 1, 
  });
}
