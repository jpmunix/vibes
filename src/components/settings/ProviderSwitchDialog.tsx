import { useState, useEffect } from "react";
import type { CustomProviderConfig, LargeLanguageModel } from "@/lib/schemas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface FetchedModel {
  id: string;
  name: string;
  displayName: string;
}

interface ProviderSwitchConfig {
  selectedModel: LargeLanguageModel;
  strategistModel: string;
  executorModel: string;
}

interface ProviderSwitchDialogProps {
  provider: CustomProviderConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: ProviderSwitchConfig) => void;
}

export function ProviderSwitchDialog({
  provider,
  open,
  onOpenChange,
  onConfirm,
}: ProviderSwitchDialogProps) {
  const [models, setModels] = useState<FetchedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState("");
  const [strategistModel, setStrategistModel] = useState("");
  const [executorModel, setExecutorModel] = useState("");

  // Fetch models from the provider on mount
  useEffect(() => {
    if (!open) return;

    async function fetchModels() {
      setLoading(true);
      setError(null);

      try {
        const normalizedUrl = provider.apiBaseUrl.replace(/\/+$/, "");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (provider.apiKey?.value) {
          headers["Authorization"] = `Bearer ${provider.apiKey.value}`;
        }

        const response = await fetch(`${normalizedUrl}/models`, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data?.data || !Array.isArray(data.data)) {
          throw new Error("Formato de respuesta inválido");
        }

        const fetched: FetchedModel[] = data.data
          .map((m: any) => ({
            id: m.id,
            name: m.id,
            displayName: humanize(m.id),
          }))
          .sort((a: FetchedModel, b: FetchedModel) => a.displayName.localeCompare(b.displayName));

        setModels(fetched);

        // Auto-select first model for all slots
        if (fetched.length > 0) {
          setChatModel(fetched[0].id);
          setStrategistModel(fetched[0].id);
          setExecutorModel(fetched[0].id);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchModels();
  }, [open, provider.apiBaseUrl, provider.apiKey?.value]);

  const handleConfirm = () => {
    if (!chatModel) return;

    onConfirm({
      selectedModel: {
        name: chatModel,
        provider: provider.id,
      },
      strategistModel: strategistModel || chatModel,
      executorModel: executorModel || chatModel,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            Configurar "{provider.name}"
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="typo-caption">Detectando modelos...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="typo-caption text-destructive text-center max-w-xs">
              No se pudieron obtener los modelos: {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="mt-2"
            >
              Cerrar
            </Button>
          </div>
        ) : models.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="typo-caption text-center max-w-xs">
              No se encontraron modelos en este endpoint. Asegúrate de que la URL y la key son correctas.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="mt-2"
            >
              Cerrar
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="typo-caption">
              Se han detectado <strong>{models.length} modelos</strong>. Asigna un modelo a cada slot:
            </p>

            <ModelSlot
              label="Modelo principal del chat"
              value={chatModel}
              onChange={setChatModel}
              models={models}
            />

            <ModelSlot
              label="Modelo para tareas internas"
              description="Títulos, resúmenes y mantenimiento"
              value={executorModel}
              onChange={setExecutorModel}
              models={models}
            />

            <ModelSlot
              label="Modelo de razonamiento"
              description="Agentes de planificación y análisis"
              value={strategistModel}
              onChange={setStrategistModel}
              models={models}
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-10 px-4"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!chatModel}
                className="h-10 px-6 font-bold"
              >
                Activar proveedor
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Internal Components ───

function ModelSlot({
  label,
  description,
  value,
  onChange,
  models,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  models: FetchedModel[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="typo-label">{label}</Label>
      {description && <p className="typo-caption">{description}</p>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 bg-background">
          <SelectValue placeholder="Seleccionar modelo" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Utils ───

/** Convert model ID to human-readable name */
function humanize(modelId: string): string {
  let name = modelId;
  // Strip provider prefix
  const slash = name.lastIndexOf("/");
  if (slash !== -1) name = name.substring(slash + 1);
  // Replace separators, title-case
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
