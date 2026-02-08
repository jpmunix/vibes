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
import { Sparkles } from "lucide-react";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";

export function AppTitleModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.appTitleGenerationModel === "SAME_AS_CHAT" ||
    !settings?.appTitleGenerationModel ||
    settings?.appTitleGenerationModel === ""
      ? SAME_AS_CHAT_VALUE
      : settings?.appTitleGenerationModel;

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({ appTitleGenerationModel: "SAME_AS_CHAT" });
    } else {
      await updateSettings({ appTitleGenerationModel: value });
    }
  };

  return (
    <div className="space-y-3 p-5">
      {/*<Label*/}
      {/*  htmlFor="appTitleGenerationModel"*/}
      {/*  className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2"*/}
      {/*>*/}
      {/*  <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400" />*/}
      {/*  Modelo para generación de Títulos*/}
      {/*</Label>*/}
      <Select
        value={currentValue}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger id="appTitleGenerationModel">
          <SelectValue placeholder="Selecciona un modelo" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          <SelectItem value={SAME_AS_CHAT_VALUE}>El mismo del chat</SelectItem>
          {openRouterModels?.map((model) => (
            <SelectItem key={model.apiName} value={model.apiName}>
              {model.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Configura el modelo que OpenRouter utilizará para generar el título de
        la aplicación a partir de tu prompt inicial. Por defecto:{" "}
        <code className="bg-muted px-1 rounded">openai/gpt-4.1-nano</code>
      </p>
    </div>
  );
}
