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
                <SelectTrigger id="knowledgeExtractionModel" className="h-[60px] w-full max-w-[380px] px-6 py-4 rounded-xl">
                    <SelectValue placeholder="Selecciona un modelo" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px] w-72">
                    {openRouterModels?.find(m => m.apiName === DEFAULT_VALUE) ? (
                        <SelectItem value={DEFAULT_VALUE} className="py-1 px-3">
                            <ModelItemContent
                                model={openRouterModels.find(m => m.apiName === DEFAULT_VALUE)!}
                            />
                        </SelectItem>
                    ) : (
                        <SelectItem value={DEFAULT_VALUE} className="py-1.5 px-3">
                            <span className="font-semibold text-[13px]">GPT-4.1 Mini (recomendado)</span>
                        </SelectItem>
                    )}
                    {openRouterModels
                        ?.filter((model) => model.apiName !== DEFAULT_VALUE)
                        .map((model) => (
                            <SelectItem key={model.apiName} value={model.apiName} className="py-1 px-3">
                                <ModelItemContent model={model} />
                            </SelectItem>
                        ))}
                </SelectContent>
            </Select>
        </div>
    );
}
