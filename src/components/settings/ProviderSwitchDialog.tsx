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
import { resolveDisplayNames } from "@/ipc/utils/model_id_humanizer";
import { parseModelsResponse } from "@/ipc/utils/openai_compatible_models_parser";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
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
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
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
        const parsed = parseModelsResponse(data);

        const ids = parsed.map((m) => m.id);
        const displayNames = resolveDisplayNames(ids);

        const fetched: FetchedModel[] = parsed
          .map((m) => ({
            id: m.id,
            name: m.id,
            displayName: displayNames.get(m.id) ?? m.id,
          }))
          .sort((a: FetchedModel, b: FetchedModel) =>
            a.displayName.localeCompare(b.displayName),
          );

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
          <DialogTitle>{t("settings.configureProvider", { name: provider.name })}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="typo-caption">{t("chat.loading")}</p>
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
              El endpoint responde pero no devuelve modelos.
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
              Se han detectado <strong>{models.length} modelos</strong>. Asigna
              un modelo a cada slot:
            </p>

            <ModelSlot
              label={t("settingsItems.modelo_principal_del_chat")}
              value={chatModel}
              onChange={setChatModel}
              models={models}
            />

            <ModelSlot
              label={t("settingsItems.modelo_para_tareas_internas")}
              description={t("settingsItems.modelo_para_tareas_internasDesc")}
              value={executorModel}
              onChange={setExecutorModel}
              models={models}
            />

            <ModelSlot
              label={t("settingsItems.modelo_de_razonamiento")}
              description={t("settingsItems.modelo_de_razonamientoDesc")}
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
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <Label className="typo-label">{label}</Label>
      {description && <p className="typo-caption">{description}</p>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 bg-background">
          <SelectValue placeholder={t("models.selectModel")} />
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
