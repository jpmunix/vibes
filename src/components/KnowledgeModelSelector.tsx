import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const DEFAULT_VALUE = "openai/gpt-4.1-mini";

export function KnowledgeModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.knowledgeExtractionModel ||
            settings?.knowledgeExtractionModel === ""
            ? DEFAULT_VALUE
            : settings?.knowledgeExtractionModel;

    const handleChange = async (value: string) => {
        await updateSettings({ knowledgeExtractionModel: value });
    };

    return (
        <div className="space-y-3">
            <Select
                value={currentValue}
                onValueChange={handleChange}
                disabled={isLoading}
            >
                <SelectTrigger id="knowledgeExtractionModel">
                    <SelectValue placeholder="Selecciona un modelo" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                    <SelectItem value={DEFAULT_VALUE}>
                        GPT-4.1 Mini (recomendado)
                    </SelectItem>
                    {openRouterModels
                        ?.filter((model) => model.apiName !== DEFAULT_VALUE)
                        .map((model) => (
                            <SelectItem key={model.apiName} value={model.apiName}>
                                {model.displayName}
                            </SelectItem>
                        ))}
                </SelectContent>
            </Select>
        </div>
    );
}
