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

export function DebateModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        settings?.debateModel === "SAME_AS_CHAT" ||
            !settings?.debateModel ||
            settings?.debateModel === ""
            ? SAME_AS_CHAT_VALUE
            : settings?.debateModel;

    const handleChange = async (value: string) => {
        if (value === SAME_AS_CHAT_VALUE) {
            await updateSettings({ debateModel: "SAME_AS_CHAT" });
        } else {
            await updateSettings({ debateModel: value });
        }
    };

    return (
        <div className="space-y-3">
            <Select
                value={currentValue}
                onValueChange={handleChange}
                disabled={isLoading}
            >
                <SelectTrigger id="debateModel">
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
