import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getColorById,
  adjustChroma,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_DARK_COLOR,
} from "@/components/PrimaryColorPicker";
import { getFontById, getGoogleFontsUrl, DEFAULT_FONT_ID, type FontOption } from "@/shared/fonts";

type Theme = "system" | "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  intensity: number;
  setIntensity: (intensity: number) => void;
  applyPrimaryColors: (lightColorId?: string, darkColorId?: string, lightChroma?: number, darkChroma?: number) => void;
  applyFont: (fontId: string) => void;
  applyChatFont: (fontId: string) => void;
  currentFontId: string;
  currentChatFontId: string;
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

/** Track which Google Font link elements have been injected to avoid duplicates */
const loadedFontLinks = new Set<string>();

/**
 * Ensure that the CSS for a Google Font is loaded in the document.
 * For bundled fonts (Geist) this is a no-op.
 */
function ensureFontLoaded(font: FontOption) {
  const url = getGoogleFontsUrl(font);
  if (!url || loadedFontLinks.has(font.id)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.id = `font-${font.id}`;
  document.head.appendChild(link);
  loadedFontLinks.add(font.id);
}

/**
 * Apply the selected font to the document by updating the CSS custom property.
 */
function applyFontToDOM(fontId: string) {
  const font = getFontById(fontId);
  ensureFontLoaded(font);
  document.documentElement.style.setProperty("--default-font-family", font.family);
}

function applyChatFontToDOM(fontId: string) {
  const font = getFontById(fontId);
  ensureFontLoaded(font);
  document.documentElement.style.setProperty("--default-chat-font-family", font.family);
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

  const [currentFontId, setCurrentFontId] = useState<string>(() => {
    return window.localStorage?.getItem("selected-font") || DEFAULT_FONT_ID;
  });

  const [currentChatFontId, setCurrentChatFontId] = useState<string>(() => {
    return window.localStorage?.getItem("selected-chat-font") || "jetbrains-mono"; // matches DEFAULT_CHAT_FONT_ID
  });

  const applyPrimaryColors = useCallback(
    (lightColorId?: string, darkColorId?: string, lightChroma?: number, darkChroma?: number) => {
      applyColorToDOM(lightColorId, darkColorId, lightChroma, darkChroma);
    },
    [],
  );

  const applyFont = useCallback((fontId: string) => {
    setCurrentFontId(fontId);
    localStorage.setItem("selected-font", fontId);
    applyFontToDOM(fontId);
  }, []);

  const applyChatFont = useCallback((fontId: string) => {
    setCurrentChatFontId(fontId);
    localStorage.setItem("selected-chat-font", fontId);
    applyChatFontToDOM(fontId);
  }, []);

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

  // Apply font on mount from localStorage (instant, before settings load)
  useEffect(() => {
    applyFontToDOM(currentFontId);
    applyChatFontToDOM(currentChatFontId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global hotkey to toggle theme (Ctrl+T or Cmd+T)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTheme((prevTheme) => {
          let nextTheme: Theme = "light";
          if (prevTheme === "light") nextTheme = "dark";
          else if (prevTheme === "dark") nextTheme = "light";
          else {
            // If system, toggle based on current system preference
            const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            nextTheme = isDark ? "light" : "dark";
          }
          return nextTheme;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, intensity, setIntensity, applyPrimaryColors, applyFont, applyChatFont, currentFontId, currentChatFontId }}
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
  const { theme, setTheme, intensity, setIntensity, applyPrimaryColors, applyFont, applyChatFont, currentFontId, currentChatFontId } =
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
    applyFont,
    applyChatFont,
    currentFontId,
    currentChatFontId,
  };
}
