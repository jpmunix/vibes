import React from "react";
import { useSettings } from "@/hooks/useSettings";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { localTemplatesData, DEFAULT_TEMPLATE_ID } from "@/shared/templates";

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
            return (
                <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="2.5" fill="#61DAFB" />
                    <ellipse
                        cx="12"
                        cy="12"
                        rx="10"
                        ry="4"
                        fill="none"
                        stroke="#61DAFB"
                        strokeWidth="1.5"
                    />
                    <ellipse
                        cx="12"
                        cy="12"
                        rx="10"
                        ry="4"
                        fill="none"
                        stroke="#61DAFB"
                        strokeWidth="1.5"
                        transform="rotate(60 12 12)"
                    />
                    <ellipse
                        cx="12"
                        cy="12"
                        rx="10"
                        ry="4"
                        fill="none"
                        stroke="#61DAFB"
                        strokeWidth="1.5"
                        transform="rotate(120 12 12)"
                    />
                </svg>
            );
        case "next":
            return (
                <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                    <path
                        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.77 14.358L10 7.5V16h1.5V10.08l5.467 7.158a9.955 9.955 0 01-4.967 1.262C7.03 18.5 3.5 14.97 3.5 10S7.03 1.5 12 1.5 20.5 5.03 20.5 10a9.96 9.96 0 01-3.73 7.858z"
                        fill="currentColor"
                    />
                </svg>
            );
        case "vue":
            return (
                <svg className={className} viewBox="0 0 24 24" fill="none">
                    <path d="M2 3h4l6 10.5L18 3h4L12 21 2 3z" fill="#41B883" />
                    <path d="M7 3h4l1 1.73L13 3h4l-5 8.66L7 3z" fill="#35495E" />
                </svg>
            );
        case "astro":
            return (
                <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                    <path
                        d="M16.074 16.86c-.72.616-2.157 1.035-3.812 1.035-2.032 0-3.735-.632-4.187-1.483-.161.55-.198 1.176-.198 1.68 0 0-.107 1.745 1.137 2.908 0-.63.51-1.14 1.14-1.14 1.075 0 1.074.94 1.074 1.14v.113c0 .783.478 1.456 1.157 1.737a1.89 1.89 0 01-.157-.764c0-1.052.72-1.443 1.589-1.92l.087-.049c.94-.525 2.04-1.132 2.04-2.85 0-.277-.036-.55-.107-.813a3.822 3.822 0 01-.763.406z"
                        fill="#FF5D01"
                    />
                    <path
                        d="M16.074 16.86c-.72.616-2.157 1.035-3.812 1.035-2.032 0-3.735-.632-4.187-1.483-.161.55-.198 1.176-.198 1.68 0 0-.107 1.745 1.137 2.908 0-.63.51-1.14 1.14-1.14 1.075 0 1.074.94 1.074 1.14v.113c0 .783.478 1.456 1.157 1.737a1.89 1.89 0 01-.157-.764c0-1.052.72-1.443 1.589-1.92l.087-.049c.94-.525 2.04-1.132 2.04-2.85 0-.277-.036-.55-.107-.813a3.822 3.822 0 01-.763.406z"
                        fill="#FF5D01"
                    />
                    <path
                        d="M15.645 2.4L12.29 13.581a.4.4 0 01-.757.043L8.78 7.564a.4.4 0 00-.73-.02L5.327 13.38a.4.4 0 01-.718.012L2.4 9.2M18 2.4l-2.063 6.875"
                        stroke="#17191E"
                        strokeWidth="1.2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0"
                    />
                    <path
                        d="M8.438 2.693c.057-.175.31-.175.367 0l2.665 8.197a.19.19 0 01-.18.248H5.953a.19.19 0 01-.18-.248l2.665-8.197z"
                        fill="#17191E"
                        className="dark:fill-white"
                    />
                </svg>
            );
        case "svelte":
            return (
                <svg className={className} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M19.58 4.01a6.44 6.44 0 00-8.88-1.66L6.22 5.65a5.34 5.34 0 00-2.37 3.54 5.56 5.56 0 00.54 3.63 5.07 5.07 0 00-.76 1.89 5.65 5.65 0 00.96 4.27 6.44 6.44 0 008.88 1.66l4.48-3.3a5.34 5.34 0 002.37-3.54 5.56 5.56 0 00-.54-3.63 5.07 5.07 0 00.76-1.89 5.65 5.65 0 00-.96-4.27z"
                        fill="#FF3E00"
                    />
                    <path
                        d="M9.77 19.64a3.92 3.92 0 01-4.21-1.54 3.43 3.43 0 01-.59-2.6 3.3 3.3 0 01.11-.47l.12-.34.31.23a6.2 6.2 0 001.9 1.05l.18.06-.02.18a1.04 1.04 0 00.19.67 1.2 1.2 0 001.28.47 1.12 1.12 0 00.32-.15l4.48-3.3a.93.93 0 00.41-.62 1.05 1.05 0 00-.18-.8 1.2 1.2 0 00-1.28-.47 1.12 1.12 0 00-.32.15l-1.71 1.26a3.67 3.67 0 01-1.05.5 3.92 3.92 0 01-4.21-1.54 3.43 3.43 0 01-.59-2.6 3.07 3.07 0 011.36-2.03l4.48-3.3a3.67 3.67 0 011.05-.5 3.92 3.92 0 014.21 1.54 3.43 3.43 0 01.59 2.6 3.3 3.3 0 01-.11.47l-.12.34-.31-.23a6.2 6.2 0 00-1.9-1.05l-.18-.06.02-.18a1.04 1.04 0 00-.19-.67 1.2 1.2 0 00-1.28-.47 1.12 1.12 0 00-.32.15l-4.48 3.3a.93.93 0 00-.41.62 1.05 1.05 0 00.18.8 1.2 1.2 0 001.28.47 1.12 1.12 0 00.32-.15l1.71-1.26a3.67 3.67 0 011.05-.5 3.92 3.92 0 014.21 1.54 3.43 3.43 0 01.59 2.6 3.07 3.07 0 01-1.36 2.03l-4.48 3.3a3.67 3.67 0 01-1.05.5z"
                        fill="#fff"
                    />
                </svg>
            );
        default:
            return (
                <svg
                    className={className}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 9l6 6M15 9l-6 6" />
                </svg>
            );
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

    // Only show non-experimental official templates in the compact picker
    const templates = localTemplatesData.filter(
        (t) => t.isOfficial && !t.isExperimental,
    );

    const currentTemplate =
        templates.find((t) => t.id === currentValue) || templates[0];

    if (variant === "compact") {
        return (
            <Select value={currentValue} onValueChange={handleValueChange}>
                <SelectTrigger
                    className="flex items-center justify-between !h-6 w-fit min-w-[100px] px-2 py-0 text-xs-sm font-medium rounded-md shadow-none gap-0.5 border border-input bg-transparent hover:bg-muted/50 focus:bg-muted/50 transition-colors cursor-pointer"
                    id="template-picker-compact"
                >
                    <div className="flex items-center gap-1 whitespace-nowrap">
                        <FrameworkIcon id={currentTemplate.id} className="w-3.5 h-3.5" />
                        <span className="font-medium">
                            {currentTemplate.title.replace(" Template", "")}
                        </span>
                        <div className="hidden">
                            <SelectValue />
                        </div>
                    </div>
                </SelectTrigger>
                <SelectContent
                    className="w-56 overflow-y-auto"
                    align="start"
                    side="top"
                >
                    {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                            <div className="flex items-center gap-2">
                                <FrameworkIcon id={template.id} className="w-4 h-4 shrink-0" />
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-medium">
                                        {template.title.replace(" Template", "")}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground whitespace-normal leading-tight">
                                        {template.description}
                                    </span>
                                </div>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    // Default variant (full width)
    return (
        <Select value={currentValue} onValueChange={handleValueChange}>
            <SelectTrigger className="w-[200px]" id="template-picker">
                <SelectValue placeholder="Selecciona plantilla" />
            </SelectTrigger>
            <SelectContent>
                {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                            <FrameworkIcon id={template.id} className="w-4 h-4" />
                            {template.title}
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
