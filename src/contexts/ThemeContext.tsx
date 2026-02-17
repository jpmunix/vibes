import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getColorById,
  adjustChroma,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_DARK_COLOR,
} from "@/components/PrimaryColorPicker";

type Theme = "system" | "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  intensity: number;
  setIntensity: (intensity: number) => void;
  applyPrimaryColors: (lightColorId?: string, darkColorId?: string, lightChroma?: number, darkChroma?: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Apply the selected primary color CSS variables to the document root.
 * We set both light and dark values so the correct one is picked
 * by the existing :root / .dark rule cascade.
 */
function applyColorToDOM(lightColorId?: string, darkColorId?: string, lightChroma?: number, darkChroma?: number) {
  const lightColor = getColorById(lightColorId || DEFAULT_LIGHT_COLOR);
  const darkColor = getColorById(darkColorId || DEFAULT_DARK_COLOR);

  const lightFactor = (lightChroma ?? 100) / 100;
  const darkFactor = (darkChroma ?? 100) / 100;

  const root = document.documentElement;

  if (lightColor) {
    root.style.setProperty("--primary-color-light", adjustChroma(lightColor.light, lightFactor));
  }
  if (darkColor) {
    root.style.setProperty("--primary-color-dark", adjustChroma(darkColor.dark, darkFactor));
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Try to get the saved theme from localStorage
    const savedTheme = localStorage.getItem("theme") as Theme;
    return savedTheme || "system";
  });

  const [intensity, setIntensity] = useState<number>(() => {
    const savedIntensity = localStorage.getItem("theme-intensity");
    return savedIntensity ? parseFloat(savedIntensity) : 0.58;
  });

  const applyPrimaryColors = useCallback(
    (lightColorId?: string, darkColorId?: string, lightChroma?: number, darkChroma?: number) => {
      applyColorToDOM(lightColorId, darkColorId, lightChroma, darkChroma);
    },
    [],
  );

  useEffect(() => {
    // Save theme preference to localStorage
    localStorage.setItem("theme", theme);

    // Handle system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const root = window.document.documentElement;
      const isDark =
        theme === "dark" || (theme === "system" && mediaQuery.matches);

      root.classList.remove("light", "dark");
      root.classList.add(isDark ? "dark" : "light");
    };

    applyTheme();

    // Listen for system theme changes
    const listener = () => applyTheme();
    mediaQuery.addEventListener("change", listener);

    return () => mediaQuery.removeEventListener("change", listener);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("theme-intensity", intensity.toString());
    window.document.documentElement.style.setProperty(
      "--theme-intensity",
      intensity.toString(),
    );
  }, [intensity]);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, intensity, setIntensity, applyPrimaryColors }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { theme, setTheme, intensity, setIntensity, applyPrimaryColors } =
    context;

  // Determine if dark mode is active when component mounts or theme changes
  useEffect(() => {
    const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      setIsDarkMode(
        theme === "dark" || (theme === "system" && darkModeQuery.matches),
      );
    };

    updateTheme();
    darkModeQuery.addEventListener("change", updateTheme);

    return () => {
      darkModeQuery.removeEventListener("change", updateTheme);
    };
  }, [theme]);
  return {
    theme,
    isDarkMode,
    setTheme,
    intensity,
    setIntensity,
    applyPrimaryColors,
  };
}
