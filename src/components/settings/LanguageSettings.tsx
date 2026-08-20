import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import type { ChatLanguage } from "@/lib/schemas";

// ─── Language options ───
const languageOptions: { value: ChatLanguage; label: string }[] = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

/**
 * Idioma de la app (interfaz + comunicación con el agente). Solo renderiza el
 * control (pills es/en); el wrapper (label/descripción) lo aporta el host
 * (SettingItem / SettingRow) para mantener coherencia visual con cada sección.
 */
export function LanguageSelector() {
  const { settings, updateSettings } = useSettings();
  const currentLang = settings?.chatLanguage || "es";

  return (
    <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
      {languageOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => updateSettings({ chatLanguage: option.value })}
          className={cn(
            "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
            currentLang === option.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "hover:bg-primary/10",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
