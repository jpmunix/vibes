import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
import { useAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";

type SettingsSection = {
  id: string;
  label: string;
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "general-settings", label: "General" },
  { id: "models-connectivity", label: "Modelos y Conectividad" },
  { id: "ai-behavior", label: "Configuración Asistente" },
  { id: "automation-settings", label: "Automatización" },
  { id: "workflow-settings", label: "Flujo de trabajo" },
  { id: "integrations", label: "Integraciones" },
  { id: "agent-permissions", label: "Permisos del agente" },
  { id: "stats-settings", label: "Estadísticas" },
  { id: "experiments", label: "Experimentos" },
  { id: "danger-zone", label: "Zona peligrosa" },
];

export function SettingsList({ show }: { show: boolean }) {
  const [activeSection, setActiveSection] = useAtom(activeSettingsSectionAtom);

  const scrollAndNavigateTo = useScrollAndNavigateTo("/settings", {
    behavior: "smooth",
    block: "start",
  });

  const settingsSections = SETTINGS_SECTIONS;

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let scrollHandler: (() => void) | null = null;
    let scrollContainer: HTMLElement | null = null;

    const calculateActiveSection = () => {
      if (!scrollContainer) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const containerTop = containerRect.top;
      const targetLine = containerTop + containerRect.height * 0.25; // 25% from top of container

      let closestSection: string | null = null;
      let closestDistance = Infinity;

      for (const section of settingsSections) {
        const el = document.getElementById(section.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          const distance = Math.abs(rect.top - targetLine);

          // Check if section is at or above the target line (scrolled into view)
          if (rect.top <= targetLine && distance < closestDistance) {
            closestDistance = distance;
            closestSection = section.id;
          }
        }
      }

      // Fallback: if nothing is above the line, select the first visible section
      if (!closestSection) {
        for (const section of settingsSections) {
          const el = document.getElementById(section.id);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.bottom > containerTop) {
              closestSection = section.id;
              break;
            }
          }
        }
      }

      if (closestSection) {
        setActiveSection(closestSection);
      }
    };

    const initScrollListener = () => {
      scrollContainer = document.getElementById("settings-scroll-container");

      if (!scrollContainer) {
        return false;
      }

      // Remove previous listener if exists
      if (scrollHandler) {
        scrollContainer.removeEventListener("scroll", scrollHandler);
      }

      scrollHandler = () => {
        requestAnimationFrame(calculateActiveSection);
      };

      scrollContainer.addEventListener("scroll", scrollHandler, { passive: true });

      // Calculate initial active section
      calculateActiveSection();

      return true;
    };

    // Try immediately
    const success = initScrollListener();

    // If not successful, poll until we find the container
    if (!success) {
      let attempts = 0;
      pollInterval = setInterval(() => {
        attempts++;
        if (initScrollListener() || attempts >= 40) {
          if (pollInterval) clearInterval(pollInterval);
        }
      }, 250);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (scrollContainer && scrollHandler) {
        scrollContainer.removeEventListener("scroll", scrollHandler);
      }
    };
  }, [settingsSections, setActiveSection]);

  if (!show) {
    return null;
  }

  const handleScrollAndNavigateTo = scrollAndNavigateTo;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4">
        <h2 className="text-lg font-semibold tracking-tight">Ajustes</h2>
      </div>
      <ScrollArea className="flex-grow">
        <div className="space-y-1 p-4 pt-0">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              onClick={() => handleScrollAndNavigateTo(section.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                activeSection === section.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "hover:bg-sidebar-accent",
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
