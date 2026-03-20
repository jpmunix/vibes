import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { currentAppAtom, selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { useState, useCallback, useMemo } from "react";
import { showError, showSuccess } from "@/lib/toast";

export interface TableFilter {
    column: string;
    operator:
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "LIKE"
    | "ILIKE"
    | "IS NULL"
    | "IS NOT NULL";
    value?: string;
}

export function useDatabase() {
    const currentApp = useAtomValue(currentAppAtom);
    const selectedAppId = useAtomValue(selectedAppIdAtom);
    const queryClient = useQueryClient();

    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [orderBy, setOrderBy] = useState<string | undefined>();
    const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
    const [filters, setFilters] = useState<TableFilter[]>([]);

    const appId = selectedAppId ?? 0;

    const dbType = useMemo(() => {
        if (!currentApp) return null;
        if (currentApp.bunnyConfig) return "bunny";
        if (currentApp.supabaseProjectId) return "supabase";
        if (currentApp.pocketbaseConfig) return "pocketbase";
        return null;
    }, [currentApp]);

    const isConnected = Boolean(dbType);

    // Fetch tables
    const tablesQuery = useQuery({
        queryKey: dbType === "bunny"
            ? queryKeys.bunny.dbTables(appId)
            : dbType === "pocketbase"
                ? queryKeys.pocketbase.dbTables(appId)
                : queryKeys.supabase.dbTables(appId),
        queryFn: () => {
            if (dbType === "bunny") return ipc.bunny.listTables({ appId });
            if (dbType === "pocketbase") return ipc.pocketbase.listTables({ appId });
            return ipc.supabase.listTables({ appId });
        },
        enabled: isConnected && appId > 0,
        staleTime: 30_000,
    });

    // Fetch table data
    const tableDataQuery = useQuery({
        queryKey: dbType === "bunny"
            ? queryKeys.bunny.dbTableData(appId, selectedTable ?? "", page, pageSize, orderBy, orderDir)
            : dbType === "pocketbase"
                ? queryKeys.pocketbase.dbTableData(appId, selectedTable ?? "", page, pageSize, orderBy, orderDir)
                : queryKeys.supabase.dbTableData(appId, selectedTable ?? "", page, pageSize, orderBy, orderDir),
        queryFn: () => {
            const params = {
                appId,
                table: selectedTable!,
                page,
                pageSize,
                orderBy,
                orderDir,
                filters: filters.length > 0 ? filters : undefined,
            };
            if (dbType === "bunny") return ipc.bunny.queryTable(params);
            if (dbType === "pocketbase") return ipc.pocketbase.queryTable(params);
            return ipc.supabase.queryTable(params);
        },
        enabled: isConnected && appId > 0 && !!selectedTable,
        staleTime: 10_000,
    });

    // Selected table info
    const selectedTableInfo = useMemo(() => {
        if (!selectedTable || !tablesQuery.data) return null;
        return (tablesQuery.data.tables as any[]).find((t: any) => t.name === selectedTable) ?? null;
    }, [selectedTable, tablesQuery.data]);

    // Primary key columns for the selected table
    const primaryKeyColumns = useMemo(() => {
        if (!selectedTableInfo) return [];
        return (selectedTableInfo.columns as any[])
            .filter((c: any) => c.isPrimaryKey)
            .map((c: any) => c.name);
    }, [selectedTableInfo]);

    // Execute raw SQL
    const executeQueryMutation = useMutation({
        mutationFn: (query: string) => {
            if (dbType === "bunny") return ipc.bunny.executeQuery({ appId, query });
            if (dbType === "pocketbase") return ipc.pocketbase.executeQuery({ appId, query });
            return ipc.supabase.executeQuery({ appId, query });
        },
        onError: (error) => {
            showError(`Error SQL: ${error.message}`);
        },
    });

    // Insert row
    const insertRowMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => {
            const params = { appId, table: selectedTable!, data };
            if (dbType === "bunny") return ipc.bunny.insertRow(params);
            if (dbType === "pocketbase") return ipc.pocketbase.insertRow(params);
            return ipc.supabase.insertRow(params);
        },
        onSuccess: () => {
            showSuccess("Fila insertada");
            refreshTableData();
        },
        onError: (error) => {
            showError(`Error al insertar: ${error.message}`);
        },
    });

    // Update row
    const updateRowMutation = useMutation({
        mutationFn: ({
            primaryKey,
            data,
        }: {
            primaryKey: Record<string, unknown>;
            data: Record<string, unknown>;
        }) => {
            const params = { appId, table: selectedTable!, primaryKey, data };
            if (dbType === "bunny") return ipc.bunny.updateRow(params);
            if (dbType === "pocketbase") return ipc.pocketbase.updateRow(params);
            return ipc.supabase.updateRow(params);
        },
        onSuccess: () => {
            showSuccess("Fila actualizada");
            refreshTableData();
        },
        onError: (error) => {
            showError(`Error al actualizar: ${error.message}`);
        },
    });

    // Delete rows
    const deleteRowsMutation = useMutation({
        mutationFn: (primaryKeys: Record<string, unknown>[]) => {
            const params = { appId, table: selectedTable!, primaryKeys };
            if (dbType === "bunny") return ipc.bunny.deleteRows(params);
            if (dbType === "pocketbase") return ipc.pocketbase.deleteRows(params);
            return ipc.supabase.deleteRows(params);
        },
        onSuccess: (result) => {
            showSuccess(`${result.deletedCount} fila(s) eliminada(s)`);
            refreshTableData();
        },
        onError: (error) => {
            showError(`Error al eliminar: ${error.message}`);
        },
    });

    const selectTable = useCallback(
        (tableName: string) => {
            setSelectedTable(tableName);
            setPage(1);
            setOrderBy(undefined);
            setOrderDir("asc");
            setFilters([]);
        },
        [],
    );

    const toggleSort = useCallback(
        (column: string) => {
            if (orderBy === column) {
                setOrderDir((prev) => (prev === "asc" ? "desc" : "asc"));
            } else {
                setOrderBy(column);
                setOrderDir("asc");
            }
            setPage(1);
        },
        [orderBy],
    );

    const refreshTableData = useCallback(() => {
        if (selectedTable) {
            const queryKey = dbType === "bunny"
                ? queryKeys.bunny.dbTableData(appId, selectedTable, page, pageSize, orderBy, orderDir)
                : dbType === "pocketbase"
                    ? queryKeys.pocketbase.dbTableData(appId, selectedTable, page, pageSize, orderBy, orderDir)
                    : queryKeys.supabase.dbTableData(appId, selectedTable, page, pageSize, orderBy, orderDir);

            queryClient.invalidateQueries({ queryKey });
        }

        const tablesKey = dbType === "bunny"
            ? queryKeys.bunny.dbTables(appId)
            : dbType === "pocketbase"
                ? queryKeys.pocketbase.dbTables(appId)
                : queryKeys.supabase.dbTables(appId);

        queryClient.invalidateQueries({ queryKey: tablesKey });
    }, [selectedTable, appId, page, pageSize, orderBy, orderDir, queryClient, dbType]);

    const totalPages = useMemo(() => {
        if (!tableDataQuery.data) return 0;
        return Math.ceil(tableDataQuery.data.totalCount / pageSize);
    }, [tableDataQuery.data, pageSize]);

    // Build primary key for a row
    const getPrimaryKey = useCallback(
        (row: Record<string, unknown>) => {
            const pk: Record<string, unknown> = {};
            for (const col of primaryKeyColumns) {
                pk[col] = row[col];
            }
            return pk;
        },
        [primaryKeyColumns],
    );

    return {
        // State
        isConnected,
        dbType,
        selectedTable,
        page,
        pageSize,
        orderBy,
        orderDir,
        filters,
        totalPages,
        primaryKeyColumns,
        selectedTableInfo,

        // Data
        tables: tablesQuery.data?.tables ?? [],
        rows: tableDataQuery.data?.rows ?? [],
        columns: tableDataQuery.data?.columns ?? [],
        totalCount: tableDataQuery.data?.totalCount ?? 0,

        // Loading states
        isLoadingTables: tablesQuery.isLoading,
        isLoadingData: tableDataQuery.isLoading,
        isFetchingData: tableDataQuery.isFetching,
        isExecutingQuery: executeQueryMutation.isPending,
        isInserting: insertRowMutation.isPending,
        isUpdating: updateRowMutation.isPending,
        isDeleting: deleteRowsMutation.isPending,

        // Actions
        selectTable,
        setPage,
        setPageSize,
        toggleSort,
        setFilters,
        refreshTableData,
        getPrimaryKey,
        executeQuery: executeQueryMutation.mutateAsync,
        insertRow: insertRowMutation.mutateAsync,
        updateRow: updateRowMutation.mutateAsync,
        deleteRows: deleteRowsMutation.mutateAsync,

        // Raw SQL result
        queryResult: executeQueryMutation.data,
    };
}
