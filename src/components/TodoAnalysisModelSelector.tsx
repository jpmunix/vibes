import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModelItemContent } from "./ModelItemContent";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

export function TodoAnalysisModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.todoAnalysisModel === "SAME_AS_CHAT" ||
      !settings?.todoAnalysisModel ||
      settings?.todoAnalysisModel === ""
      ? SAME_AS_CHAT_VALUE
      : settings?.todoAnalysisModel;

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({ todoAnalysisModel: "SAME_AS_CHAT" });
    } else {
      await updateSettings({ todoAnalysisModel: value });
    }
  };

  return (
    <div className="space-y-3">
      <Select
        value={currentValue}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger id="todoAnalysisModel" className="h-[60px] w-full max-w-[380px] px-6 py-4 rounded-xl">
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
