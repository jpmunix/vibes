import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModelItemContent } from "./ModelItemContent";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";

export function AutoFixModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.autoFixModel?.name === "SAME_AS_CHAT"
      ? SAME_AS_CHAT_VALUE
      : (settings?.autoFixModel?.name ?? "");

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({
        autoFixModel: {
          name: "SAME_AS_CHAT",
          provider: "openrouter",
        },
      });
    } else {
      await updateSettings({
        autoFixModel: {
          name: value,
          provider: "openrouter",
        },
      });
    }
  };

  return (
    <div className="space-y-1">
      {/*<Label className="text-xs text-muted-foreground">Modelo (auto-fix)</Label>*/}
      <Select
        value={currentValue}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecciona un modelo" />
        </SelectTrigger>
        <SelectContent className="max-h-[280px] w-72">
          <SelectItem value={SAME_AS_CHAT_VALUE} className="py-1.5 px-3">
            <div className="flex flex-col gap-0">
              <span className="font-semibold text-[13px]">El mismo del chat</span>
              <span className="text-[10px] text-muted-foreground/60">Sigue la selección principal del chat</span>
            </div>
          </SelectItem>
          {openRouterModels?.map((model) => (
            <SelectItem key={model.apiName} value={model.apiName} className="py-1 px-3">
              <ModelItemContent model={model} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
