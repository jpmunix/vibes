import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";
import { localTemplatesData, DEFAULT_TEMPLATE_ID } from "@/shared/templates";
import { ReactIcon, NextIcon, VueIcon, AstroIcon, SvelteIcon, XSquare, Server } from "@/components/ui/icons";

interface TemplatePickerProps {
    variant?: "compact" | "default";
}

// SVG framework icons (16x16) for the selector
const FrameworkIcon: React.FC<{ id: string; className?: string }> = ({
    id,
    className = "w-4 h-4",
}) => {
    switch (id) {
        case "react":
        case "react19":
            return <ReactIcon className={className} />;
        case "next":
            return <NextIcon className={className} />;
        case "vue":
            return <VueIcon className={className} />;
        case "astro":
            return <AstroIcon className={className} />;
        case "svelte":
            return <SvelteIcon className={className} />;
        case "express":
            return <Server className={className} />;
        default:
            return <XSquare className={className} />;
    }
};

export const TemplatePicker: React.FC<TemplatePickerProps> = ({
    variant = "compact",
}) => {
    const { settings, updateSettings } = useSettings();

    const handleValueChange = (value: string) => {
        updateSettings({ selectedTemplateId: value });
    };

    const currentValue = settings?.selectedTemplateId || DEFAULT_TEMPLATE_ID;

    // Only show enabled templates in the compact picker
    const ENABLED_TEMPLATE_IDS = new Set(["react", "react19", "express", "next"]);
    const templates = localTemplatesData.filter(
        (t) => t.isOfficial && !t.isExperimental && ENABLED_TEMPLATE_IDS.has(t.id),
    );

    const currentTemplate =
        templates.find((t) => t.id === currentValue) || templates[0];

    const selectorOptions: SelectorOption[] = templates.map((template) => ({
        value: template.id,
        label: variant === "compact" ? template.title.replace(" Template", "") : template.title,
        description: variant === "compact" ? template.description : undefined,
        leftIcon: <FrameworkIcon id={template.id} className="w-4 h-4 shrink-0" />,
    }));

    if (variant === "compact") {
        return (
            <UnifiedSelector
                value={currentValue}
                onChange={handleValueChange}
                options={selectorOptions}
                triggerVariant="minimal"
                triggerSize="sm"
                triggerRightIcon={null}
                triggerClassName="!px-1.5 min-h-[28px]"
                customTriggerLabel={
                    <div className="flex items-center justify-center">
                        <FrameworkIcon id={currentTemplate.id} className="w-4 h-4" />
                    </div>
                }
                popoverWidth="w-56"
                side="top"
                align="start"
                itemLayout="default"
                data-testid="template-picker-compact"
            />
        );
    }

    // Default variant (full width)
    return (
        <UnifiedSelector
            value={currentValue}
            onChange={handleValueChange}
            options={selectorOptions}
            triggerVariant="outline"
            triggerSize="md"
            triggerClassName="w-[200px]"
            data-testid="template-picker"
        />
    );
};
