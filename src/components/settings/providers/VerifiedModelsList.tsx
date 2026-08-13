import React, { useMemo, useState } from "react";
import { Search, Package } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

// Listado de modelos devueltos por la verificación de un proveedor
// OpenAI-compatible. Scrollable, IDs en monospace, búsqueda si la lista es
// grande (N>20). Empty state claro cuando el endpoint responde pero no
// devuelve modelos.
export function VerifiedModelsList({ models }: { models: { id: string }[] }) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.id.toLowerCase().includes(q));
  }, [models, filter]);

  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 rounded-lg border border-dashed border-border bg-muted/20">
        <Package className="h-4 w-4 text-muted-foreground" />
        <p className="typo-caption text-muted-foreground text-center">
          El endpoint responde pero no devuelve modelos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="typo-caption text-muted-foreground">
        {models.length === 1
          ? "1 modelo disponible"
          : `${models.length} modelos disponibles`}
      </p>

      {models.length > 20 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Buscar en ${models.length} modelos…`}
            className="h-8 pl-8 bg-background typo-input"
          />
        </div>
      )}

      <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-background">
        {visible.length === 0 ? (
          <p className="typo-caption text-muted-foreground text-center py-3">
            Sin resultados para "{filter}"
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((m) => (
              <li
                key={m.id}
                className="px-3 py-1.5 font-mono text-xs text-foreground/90 truncate"
                title={m.id}
              >
                {m.id}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
