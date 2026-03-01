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
        return null;
    }, [currentApp]);

    const isConnected = Boolean(dbType);

    // Fetch tables
    const tablesQuery = useQuery({
        queryKey: dbType === "bunny" ? queryKeys.bunny.dbTables(appId) : queryKeys.supabase.dbTables(appId),
        queryFn: () => dbType === "bunny" ? ipc.bunny.listTables({ appId }) : ipc.supabase.listTables({ appId }),
        enabled: isConnected && appId > 0,
        staleTime: 30_000,
    });

    // Fetch table data
    const tableDataQuery = useQuery({
        queryKey: dbType === "bunny"
            ? queryKeys.bunny.dbTableData(appId, selectedTable ?? "", page, pageSize, orderBy, orderDir)
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
            return dbType === "bunny" ? ipc.bunny.queryTable(params) : ipc.supabase.queryTable(params);
        },
        enabled: isConnected && appId > 0 && !!selectedTable,
        staleTime: 10_000,
    });

    // Selected table info
    const selectedTableInfo = useMemo(() => {
        if (!selectedTable || !tablesQuery.data) return null;
        return tablesQuery.data.tables.find((t) => t.name === selectedTable) ?? null;
    }, [selectedTable, tablesQuery.data]);

    // Primary key columns for the selected table
    const primaryKeyColumns = useMemo(() => {
        if (!selectedTableInfo) return [];
        return selectedTableInfo.columns
            .filter((c) => c.isPrimaryKey)
            .map((c) => c.name);
    }, [selectedTableInfo]);

    // Execute raw SQL
    const executeQueryMutation = useMutation({
        mutationFn: (query: string) =>
            dbType === "bunny"
                ? ipc.bunny.executeQuery({ appId, query })
                : ipc.supabase.executeQuery({ appId, query }),
        onError: (error) => {
            showError(`Error SQL: ${error.message}`);
        },
    });

    // Insert row
    const insertRowMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => {
            const params = { appId, table: selectedTable!, data };
            return dbType === "bunny" ? ipc.bunny.insertRow(params) : ipc.supabase.insertRow(params);
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
            return dbType === "bunny" ? ipc.bunny.updateRow(params) : ipc.supabase.updateRow(params);
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
            return dbType === "bunny" ? ipc.bunny.deleteRows(params) : ipc.supabase.deleteRows(params);
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
                : queryKeys.supabase.dbTableData(appId, selectedTable, page, pageSize, orderBy, orderDir);

            queryClient.invalidateQueries({ queryKey });
        }

        const tablesKey = dbType === "bunny"
            ? queryKeys.bunny.dbTables(appId)
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
