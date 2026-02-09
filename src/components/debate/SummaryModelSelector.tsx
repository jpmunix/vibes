import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";

export function SummaryModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.summaryModel === "SAME_AS_CHAT" ||
    !settings?.summaryModel ||
    settings?.summaryModel === ""
      ? SAME_AS_CHAT_VALUE
      : settings?.summaryModel;

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({ summaryModel: "SAME_AS_CHAT" });
    } else {
      await updateSettings({ summaryModel: value });
    }
  };

  return (
    <div className="space-y-3">
      <Select
        value={currentValue}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger id="summaryModel">
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
    </div>
  );
}
