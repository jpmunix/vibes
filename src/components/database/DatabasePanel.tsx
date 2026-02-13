import { useState, useCallback, useRef, useEffect } from "react";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useDatabase } from "@/hooks/useDatabase";
import { ipc } from "@/ipc/types";
import { cn } from "@/lib/utils";
import {
    Table,
    Database,
    ChevronLeft,
    ChevronRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Plus,
    Trash2,
    Play,
    RefreshCw,
    Search,
    X,
    Check,
    Terminal,
    Loader2,
    ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Inline Cell Editor ──
function CellEditor({
    value,
    onSave,
    onCancel,
}: {
    value: unknown;
    onSave: (newValue: string) => void;
    onCancel: () => void;
}) {
    const displayValue =
        value === null
            ? ""
            : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);

    const [editValue, setEditValue] = useState(displayValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    return (
        <div className="flex items-center gap-1">
            <Input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") onSave(editValue);
                    if (e.key === "Escape") onCancel();
                }}
                className="h-6 px-1 text-xs min-w-[80px] bg-background"
            />
            <button
                onClick={() => onSave(editValue)}
                className="p-0.5 hover:text-green-500 transition-colors"
            >
                <Check size={12} />
            </button>
            <button
                onClick={onCancel}
                className="p-0.5 hover:text-red-500 transition-colors"
            >
                <X size={12} />
            </button>
        </div>
    );
}

// ── Cell Display ──
function CellValue({ value }: { value: unknown }) {
    if (value === null || value === undefined) {
        return (
            <span className="text-muted-foreground/50 italic text-[10px]">NULL</span>
        );
    }
    if (typeof value === "boolean") {
        return (
            <span
                className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    value
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
                )}
            >
                {value ? "true" : "false"}
            </span>
        );
    }
    if (typeof value === "object") {
        const json = JSON.stringify(value);
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="text-amber-600 dark:text-amber-400 cursor-help max-w-[200px] truncate block text-xs">
                        {json.length > 50 ? json.slice(0, 50) + "…" : json}
                    </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[400px]">
                    <pre className="text-[10px] whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
                        {JSON.stringify(value, null, 2)}
                    </pre>
                </TooltipContent>
            </Tooltip>
        );
    }
    const str = String(value);
    if (str.length > 100) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="cursor-help max-w-[200px] truncate block text-xs">
                        {str.slice(0, 100)}…
                    </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[400px]">
                    <p className="text-xs whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
                        {str}
                    </p>
                </TooltipContent>
            </Tooltip>
        );
    }
    return <span className="text-xs">{str}</span>;
}

// ── Main Component ──
export function DatabasePanel() {
    const db = useDatabase();
    const selectedAppId = useAtomValue(selectedAppIdAtom);
    const [tableSearch, setTableSearch] = useState("");
    const [showSqlEditor, setShowSqlEditor] = useState(false);
    const [sqlQuery, setSqlQuery] = useState("");
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [editingCell, setEditingCell] = useState<{
        rowIdx: number;
        column: string;
    } | null>(null);

    // Add new row state
    const [showNewRow, setShowNewRow] = useState(false);
    const [newRowData, setNewRowData] = useState<Record<string, string>>({});

    const filteredTables = db.tables.filter((t) =>
        t.name.toLowerCase().includes(tableSearch.toLowerCase()),
    );

    const handleCellSave = useCallback(
        (rowIdx: number, column: string, newValue: string) => {
            const row = db.rows[rowIdx] as Record<string, unknown>;
            if (!row) return;

            const pk = db.getPrimaryKey(row);
            if (Object.keys(pk).length === 0) return;

            // Parse value
            let parsedValue: unknown = newValue;
            if (newValue === "") parsedValue = null;
            else if (newValue === "true") parsedValue = true;
            else if (newValue === "false") parsedValue = false;
            else if (!isNaN(Number(newValue)) && newValue.trim() !== "")
                parsedValue = Number(newValue);

            db.updateRow({ primaryKey: pk, data: { [column]: parsedValue } });
            setEditingCell(null);
        },
        [db],
    );

    const handleDeleteSelected = useCallback(() => {
        const pks = Array.from(selectedRows).map((idx) => {
            const row = db.rows[idx] as Record<string, unknown>;
            return db.getPrimaryKey(row);
        });
        if (pks.length === 0) return;
        db.deleteRows(pks);
        setSelectedRows(new Set());
    }, [selectedRows, db]);

    const handleInsertRow = useCallback(() => {
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(newRowData)) {
            if (value === "") continue;
            if (value === "null") {
                data[key] = null;
                continue;
            }
            if (value === "true") {
                data[key] = true;
                continue;
            }
            if (value === "false") {
                data[key] = false;
                continue;
            }
            if (!isNaN(Number(value)) && value.trim() !== "") {
                data[key] = Number(value);
                continue;
            }
            data[key] = value;
        }
        db.insertRow(data);
        setShowNewRow(false);
        setNewRowData({});
    }, [newRowData, db]);

    const handleExecuteSql = useCallback(() => {
        if (!sqlQuery.trim()) return;
        db.executeQuery(sqlQuery.trim());
    }, [sqlQuery, db]);

    if (!db.isConnected) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                <Database size={48} className="text-muted-foreground/30" />
                <h3 className="text-sm font-medium text-muted-foreground">
                    No hay conexión a Supabase
                </h3>
                <p className="text-xs text-muted-foreground/70 max-w-[300px]">
                    Conecta este proyecto a Supabase desde la configuración para ver y
                    gestionar las tablas de la base de datos.
                </p>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <div className="flex flex-col h-full overflow-hidden">
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
                    <div className="flex items-center gap-2">
                        <Database size={14} className="text-blue-500" />
                        <span className="text-xs font-medium">Base de datos</span>
                        {db.selectedTable && (
                            <span className="text-[10px] text-muted-foreground">
                                / {db.selectedTable}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setShowSqlEditor(!showSqlEditor)}
                                >
                                    <Terminal
                                        size={13}
                                        className={cn(showSqlEditor && "text-blue-500")}
                                    />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>SQL Editor</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={db.refreshTableData}
                                >
                                    <RefreshCw
                                        size={13}
                                        className={cn(db.isFetchingData && "animate-spin")}
                                    />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Actualizar</TooltipContent>
                        </Tooltip>
                        {selectedAppId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() =>
                                            ipc.system.openDatabaseWindow({ appId: selectedAppId })
                                        }
                                    >
                                        <ExternalLink size={13} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Abrir en ventana</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </div>

                {/* ── Content ── */}
                <div className="flex flex-1 overflow-hidden">
                    {/* ── Table sidebar ── */}
                    <div className="w-[180px] border-r border-border flex flex-col shrink-0 overflow-hidden">
                        <div className="p-2 border-b border-border">
                            <div className="relative">
                                <Search
                                    size={12}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    placeholder="Buscar tabla..."
                                    value={tableSearch}
                                    onChange={(e) => setTableSearch(e.target.value)}
                                    className="h-7 pl-7 text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {db.isLoadingTables ? (
                                <div className="flex items-center justify-center p-4">
                                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                                </div>
                            ) : filteredTables.length === 0 ? (
                                <p className="text-xs text-muted-foreground p-3 text-center">
                                    Sin tablas
                                </p>
                            ) : (
                                filteredTables.map((table) => (
                                    <button
                                        key={table.name}
                                        onClick={() => db.selectTable(table.name)}
                                        className={cn(
                                            "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors",
                                            db.selectedTable === table.name &&
                                            "bg-accent text-accent-foreground",
                                        )}
                                    >
                                        <Table size={12} className="shrink-0 text-muted-foreground" />
                                        <span className="truncate flex-1">{table.name}</span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {table.rowCount}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ── Data area ── */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {!db.selectedTable ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                                <Table size={32} className="opacity-20" />
                                <p className="text-xs">Selecciona una tabla</p>
                            </div>
                        ) : (
                            <>
                                {/* Toolbar */}
                                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground">
                                            {db.totalCount} filas
                                        </span>
                                        {selectedRows.size > 0 && (
                                            <span className="text-[10px] text-blue-500">
                                                ({selectedRows.size} seleccionadas)
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {selectedRows.size > 0 && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                                                        onClick={handleDeleteSelected}
                                                        disabled={db.isDeleting}
                                                    >
                                                        <Trash2 size={13} />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Eliminar seleccionadas</TooltipContent>
                                            </Tooltip>
                                        )}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => {
                                                        setShowNewRow(true);
                                                        setNewRowData({});
                                                    }}
                                                >
                                                    <Plus size={13} />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Insertar fila</TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>

                                {/* Data grid */}
                                <div className="flex-1 overflow-auto">
                                    {db.isLoadingData ? (
                                        <div className="flex items-center justify-center h-full">
                                            <Loader2
                                                size={20}
                                                className="animate-spin text-muted-foreground"
                                            />
                                        </div>
                                    ) : (
                                        <table className="w-full text-xs border-collapse">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-muted/50 backdrop-blur-sm">
                                                    <th className="w-8 px-2 py-1.5 border-b border-r border-border text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                selectedRows.size > 0 &&
                                                                selectedRows.size === db.rows.length
                                                            }
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedRows(
                                                                        new Set(db.rows.map((_, i) => i)),
                                                                    );
                                                                } else {
                                                                    setSelectedRows(new Set());
                                                                }
                                                            }}
                                                            className="w-3 h-3"
                                                        />
                                                    </th>
                                                    {db.columns.map((col) => (
                                                        <th
                                                            key={col}
                                                            onClick={() => db.toggleSort(col)}
                                                            className="px-2 py-1.5 border-b border-r border-border text-left font-medium cursor-pointer hover:bg-muted/80 transition-colors select-none whitespace-nowrap"
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                <span
                                                                    className={cn(
                                                                        db.primaryKeyColumns.includes(col) &&
                                                                        "text-amber-600 dark:text-amber-400",
                                                                    )}
                                                                >
                                                                    {col}
                                                                </span>
                                                                {db.orderBy === col ? (
                                                                    db.orderDir === "asc" ? (
                                                                        <ArrowUp size={10} />
                                                                    ) : (
                                                                        <ArrowDown size={10} />
                                                                    )
                                                                ) : (
                                                                    <ArrowUpDown
                                                                        size={10}
                                                                        className="opacity-20"
                                                                    />
                                                                )}
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* New row form */}
                                                {showNewRow && (
                                                    <tr className="bg-green-50 dark:bg-green-950/20">
                                                        <td className="px-2 py-1 border-b border-r border-border text-center">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={handleInsertRow}
                                                                    className="p-0.5 hover:text-green-500"
                                                                    disabled={db.isInserting}
                                                                >
                                                                    <Check size={12} />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setShowNewRow(false);
                                                                        setNewRowData({});
                                                                    }}
                                                                    className="p-0.5 hover:text-red-500"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        {db.columns.map((col) => (
                                                            <td
                                                                key={col}
                                                                className="px-1 py-1 border-b border-r border-border"
                                                            >
                                                                <Input
                                                                    placeholder={col}
                                                                    value={newRowData[col] ?? ""}
                                                                    onChange={(e) =>
                                                                        setNewRowData((prev) => ({
                                                                            ...prev,
                                                                            [col]: e.target.value,
                                                                        }))
                                                                    }
                                                                    className="h-6 px-1 text-xs bg-transparent border-0 focus-visible:ring-0"
                                                                />
                                                            </td>
                                                        ))}
                                                    </tr>
                                                )}

                                                {/* Data rows */}
                                                {db.rows.map((row, rowIdx) => (
                                                    <tr
                                                        key={rowIdx}
                                                        className={cn(
                                                            "hover:bg-accent/50 transition-colors",
                                                            selectedRows.has(rowIdx) && "bg-blue-50 dark:bg-blue-950/20",
                                                        )}
                                                    >
                                                        <td className="w-8 px-2 py-1 border-b border-r border-border text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedRows.has(rowIdx)}
                                                                onChange={(e) => {
                                                                    const next = new Set(selectedRows);
                                                                    if (e.target.checked) next.add(rowIdx);
                                                                    else next.delete(rowIdx);
                                                                    setSelectedRows(next);
                                                                }}
                                                                className="w-3 h-3"
                                                            />
                                                        </td>
                                                        {db.columns.map((col) => (
                                                            <td
                                                                key={col}
                                                                className="px-2 py-1 border-b border-r border-border whitespace-nowrap"
                                                                onDoubleClick={() =>
                                                                    setEditingCell({ rowIdx, column: col })
                                                                }
                                                            >
                                                                {editingCell?.rowIdx === rowIdx &&
                                                                    editingCell?.column === col ? (
                                                                    <CellEditor
                                                                        value={
                                                                            (row as Record<string, unknown>)[col]
                                                                        }
                                                                        onSave={(v) =>
                                                                            handleCellSave(rowIdx, col, v)
                                                                        }
                                                                        onCancel={() => setEditingCell(null)}
                                                                    />
                                                                ) : (
                                                                    <CellValue
                                                                        value={
                                                                            (row as Record<string, unknown>)[col]
                                                                        }
                                                                    />
                                                                )}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}

                                                {db.rows.length === 0 && (
                                                    <tr>
                                                        <td
                                                            colSpan={db.columns.length + 1}
                                                            className="text-center py-8 text-muted-foreground text-xs"
                                                        >
                                                            Sin datos
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Pagination */}
                                {db.totalPages > 1 && (
                                    <div className="flex items-center justify-between px-3 py-1.5 border-t border-border shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground">
                                                Página {db.page} de {db.totalPages}
                                            </span>
                                            <select
                                                value={db.pageSize}
                                                onChange={(e) => {
                                                    db.setPageSize(Number(e.target.value));
                                                    db.setPage(1);
                                                }}
                                                className="h-6 text-[10px] bg-transparent border border-border rounded px-1"
                                            >
                                                <option value={25}>25</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                disabled={db.page <= 1}
                                                onClick={() => db.setPage(db.page - 1)}
                                            >
                                                <ChevronLeft size={13} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                disabled={db.page >= db.totalPages}
                                                onClick={() => db.setPage(db.page + 1)}
                                            >
                                                <ChevronRight size={13} />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* ── SQL Editor ── */}
                {showSqlEditor && (
                    <div className="border-t border-border shrink-0">
                        <div className="flex items-center justify-between px-3 py-1 border-b border-border">
                            <span className="text-[10px] font-medium text-muted-foreground">
                                SQL Editor
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => setShowSqlEditor(false)}
                            >
                                <X size={11} />
                            </Button>
                        </div>
                        <div className="flex gap-2 p-2">
                            <textarea
                                value={sqlQuery}
                                onChange={(e) => setSqlQuery(e.target.value)}
                                placeholder="SELECT * FROM ..."
                                className="flex-1 h-20 p-2 text-xs font-mono bg-muted/30 border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                        handleExecuteSql();
                                    }
                                }}
                            />
                            <Button
                                variant="default"
                                size="sm"
                                className="self-end h-7"
                                onClick={handleExecuteSql}
                                disabled={db.isExecutingQuery || !sqlQuery.trim()}
                            >
                                {db.isExecutingQuery ? (
                                    <Loader2 size={13} className="animate-spin" />
                                ) : (
                                    <Play size={13} />
                                )}
                                <span className="ml-1 text-xs">Ejecutar</span>
                            </Button>
                        </div>

                        {/* SQL Results */}
                        {db.queryResult && (
                            <div className="border-t border-border max-h-[200px] overflow-auto">
                                {db.queryResult.error ? (
                                    <div className="p-3 text-xs text-red-500">
                                        {db.queryResult.error}
                                    </div>
                                ) : db.queryResult.rows.length === 0 ? (
                                    <div className="p-3 text-xs text-muted-foreground">
                                        Query ejecutada ({db.queryResult.rowCount} filas afectadas)
                                    </div>
                                ) : (
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-muted/50">
                                                {db.queryResult.columns.map((col) => (
                                                    <th
                                                        key={col}
                                                        className="px-2 py-1 border-b border-r border-border text-left font-medium"
                                                    >
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {db.queryResult.rows.map((row, i) => (
                                                <tr key={i} className="hover:bg-accent/50">
                                                    {db.queryResult!.columns.map((col) => (
                                                        <td
                                                            key={col}
                                                            className="px-2 py-1 border-b border-r border-border whitespace-nowrap"
                                                        >
                                                            <CellValue
                                                                value={
                                                                    (row as Record<string, unknown>)[col]
                                                                }
                                                            />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}
