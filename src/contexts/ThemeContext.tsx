import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { ipc } from "@/ipc/types";
import {
  getColorById,
  adjustChroma,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_DARK_COLOR,
} from "@/components/PrimaryColorPicker";
import {
  getFontById,
  getGoogleFontsUrl,
  DEFAULT_FONT_ID,
  type FontOption,
} from "@/shared/fonts";

type Theme = "system" | "light" | "dark";

/** Font-scale group identifiers */
export type FontScaleGroup = "ui" | "sidebar" | "chat";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  intensity: number;
  setIntensity: (intensity: number) => void;
  applyPrimaryColors: (
    lightColorId?: string,
    darkColorId?: string,
    lightChroma?: number,
    darkChroma?: number,
  ) => void;
  applyFont: (fontId: string) => void;
  applyChatFont: (fontId: string) => void;
  applyFontScale: (group: FontScaleGroup, scale: number) => void;
  applyBubbleWidth: (pct: number) => void;
  currentFontId: string;
  currentChatFontId: string;
  fontScales: Record<FontScaleGroup, number>;
  bubbleWidthPct: number;
  themeFlavorDark: string;
  setThemeFlavorDark: (flavor: string) => void;
  themeFlavorLight: string;
  setThemeFlavorLight: (flavor: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Apply the selected primary color CSS variables to the document root.
 * We set both light and dark values so the correct one is picked
 * by the existing :root / .dark rule cascade.
 */
function applyColorToDOM(
  lightColorId?: string,
  darkColorId?: string,
  lightChroma?: number,
  darkChroma?: number,
) {
  const lightColor = getColorById(lightColorId || DEFAULT_LIGHT_COLOR);
  const darkColor = getColorById(darkColorId || DEFAULT_DARK_COLOR);

  const lightFactor = (lightChroma ?? 100) / 100;
  const darkFactor = (darkChroma ?? 100) / 100;

  const root = document.documentElement;

  if (lightColor) {
    root.style.setProperty(
      "--primary-color-light",
      adjustChroma(lightColor.light, lightFactor),
    );
  }
  if (darkColor) {
    root.style.setProperty(
      "--primary-color-dark",
      adjustChroma(darkColor.dark, darkFactor),
    );
  }
}

/**
 * Google Font links are injected on demand and reference-counted so that
 * switching fonts removes the previous stylesheet from the DOM instead of
 * accumulating stale <link> nodes (card #103 Slice 6).
 *
 * Two independent slots consume fonts (UI font + chat font). A single Google
 * Fonts <link> may serve both slots when they pick the same font, so we count
 * references per font id and only remove the element when the count hits zero.
 */
const fontLinkRefCount = new Map<string, number>();
const fontLinkElements = new Map<string, HTMLLinkElement>();

/** Currently applied font id per slot (to release the previous one on switch). */
let currentUiFontId: string | null = null;
let currentChatFontId: string | null = null;

/** Add one reference to a font, injecting its Google Fonts stylesheet if needed. */
function acquireFontLink(font: FontOption) {
  const count = (fontLinkRefCount.get(font.id) ?? 0) + 1;
  fontLinkRefCount.set(font.id, count);

  // Only inject on the first reference; bundled fonts have no URL.
  if (count === 1) {
    const url = getGoogleFontsUrl(font);
    if (url) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.id = `font-${font.id}`;
      document.head.appendChild(link);
      fontLinkElements.set(font.id, link);
    }
  }
}

/** Drop one reference to a font, removing its stylesheet when the count hits zero. */
function releaseFontLink(fontId: string) {
  const count = fontLinkRefCount.get(fontId) ?? 0;
  if (count <= 0) return;

  const next = count - 1;
  if (next <= 0) {
    fontLinkRefCount.delete(fontId);
    const link = fontLinkElements.get(fontId);
    if (link && link.parentNode === document.head) {
      document.head.removeChild(link);
    }
    fontLinkElements.delete(fontId);
  } else {
    fontLinkRefCount.set(fontId, next);
  }
}

/**
 * Apply the selected UI font to the document by updating the CSS custom
 * property, releasing the previous font's stylesheet if nothing else uses it.
 */
function applyFontToDOM(fontId: string) {
  const font = getFontById(fontId);
  // No-op if already applied — avoids refcount drift on repeated calls.
  if (currentUiFontId === font.id) return;
  if (currentUiFontId) {
    releaseFontLink(currentUiFontId);
  }
  acquireFontLink(font);
  currentUiFontId = font.id;
  document.documentElement.style.setProperty(
    "--default-font-family",
    font.family,
  );
}

function applyChatFontToDOM(fontId: string) {
  const font = getFontById(fontId);
  // No-op if already applied — avoids refcount drift on repeated calls.
  if (currentChatFontId === font.id) return;
  if (currentChatFontId) {
    releaseFontLink(currentChatFontId);
  }
  acquireFontLink(font);
  currentChatFontId = font.id;
  document.documentElement.style.setProperty(
    "--default-chat-font-family",
    font.family,
  );
}

/** CSS variable name for each font-scale group */
const SCALE_CSS_VAR: Record<FontScaleGroup, string> = {
  ui: "--scale-ui",
  sidebar: "--scale-sidebar",
  chat: "--scale-chat",
};

function applyBubbleWidthToDOM(pct: number) {
  document.documentElement.style.setProperty("--bubble-width", `${pct}%`);
}

function applyFontScaleToDOM(group: FontScaleGroup, scale: number) {
  document.documentElement.style.setProperty(
    SCALE_CSS_VAR[group],
    scale.toString(),
  );
}

function applyAllFontScalesToDOM(scales: Record<FontScaleGroup, number>) {
  for (const group of Object.keys(scales) as FontScaleGroup[]) {
    applyFontScaleToDOM(group, scales[group]);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Try to get the saved theme from localStorage
    const savedTheme = localStorage.getItem("theme") as Theme;
    return savedTheme || "system";
  });

  const intensity = 0.58;
  const setIntensity = useCallback((_intensity: number) => {}, []);

  const [themeFlavorDark, setThemeFlavorDarkState] = useState<string>(() => {
    return localStorage.getItem("theme-flavor-dark") || "default";
  });

  const [themeFlavorLight, setThemeFlavorLightState] = useState<string>(() => {
    return localStorage.getItem("theme-flavor-light") || "default";
  });

  const [currentFontId, setCurrentFontId] = useState<string>(() => {
    return window.localStorage?.getItem("selected-font") || DEFAULT_FONT_ID;
  });

  const [currentChatFontId, setCurrentChatFontId] = useState<string>(() => {
    return (
      window.localStorage?.getItem("selected-chat-font") || "jetbrains-mono"
    ); // matches DEFAULT_CHAT_FONT_ID
  });

  const [fontScales, setFontScales] = useState<Record<FontScaleGroup, number>>(
    () => {
      const parse = (key: string) => {
        const v = window.localStorage?.getItem(key);
        return v ? parseFloat(v) : 1;
      };
      return {
        ui: parse("font-scale-ui"),
        sidebar: parse("font-scale-sidebar"),
        chat: parse("font-scale-chat"),
      };
    },
  );

  const [bubbleWidthPct, setBubbleWidthPct] = useState<number>(() => {
    const v = window.localStorage?.getItem("bubble-width-pct");
    return v ? parseFloat(v) : 65;
  });

  const applyPrimaryColors = useCallback(
    (
      lightColorId?: string,
      darkColorId?: string,
      lightChroma?: number,
      darkChroma?: number,
    ) => {
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

  const applyFontScale = useCallback((group: FontScaleGroup, scale: number) => {
    setFontScales((prev) => ({ ...prev, [group]: scale }));
    localStorage.setItem(`font-scale-${group}`, scale.toString());
    applyFontScaleToDOM(group, scale);
  }, []);

  const applyBubbleWidth = useCallback((pct: number) => {
    setBubbleWidthPct(pct);
    localStorage.setItem("bubble-width-pct", pct.toString());
    applyBubbleWidthToDOM(pct);
  }, []);

  const setThemeFlavorDark = useCallback((flavor: string) => {
    setThemeFlavorDarkState(flavor);
    localStorage.setItem("theme-flavor-dark", flavor);
    if (themeBootedRef.current) {
      ipc.settings.setUserSettings({ themeFlavorDark: flavor }).catch(() => {});
    }
  }, []);

  const setThemeFlavorLight = useCallback((flavor: string) => {
    setThemeFlavorLightState(flavor);
    localStorage.setItem("theme-flavor-light", flavor);
    if (themeBootedRef.current) {
      ipc.settings
        .setUserSettings({ themeFlavorLight: flavor })
        .catch(() => {});
    }
  }, []);

  // Track whether the initial settings-driven theme has been loaded.
  // Prevents persisting the localStorage default back to BunnyDB on first mount.
  const themeBootedRef = useRef(false);
  useEffect(() => {
    // Allow settings hydration to complete before enabling writes
    const timer = setTimeout(() => {
      themeBootedRef.current = true;
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Save theme preference to localStorage
    localStorage.setItem("theme", theme);

    // Persist to BunnyDB via standard settings path (fire-and-forget)
    if (themeBootedRef.current) {
      ipc.settings.setUserSettings({ theme }).catch(() => {});
    }

    // Handle system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const root = window.document.documentElement;
      const isDark =
        theme === "dark" || (theme === "system" && mediaQuery.matches);

      root.classList.remove("light", "dark");
      root.classList.add(isDark ? "dark" : "light");

      // Remove existing flavor classes (starting with theme-)
      const classesToRemove: string[] = [];
      root.classList.forEach((cls) => {
        if (cls.startsWith("theme-")) {
          classesToRemove.push(cls);
        }
      });
      classesToRemove.forEach((cls) => root.classList.remove(cls));

      const activeFlavor = isDark ? themeFlavorDark : themeFlavorLight;
      if (activeFlavor && activeFlavor !== "default") {
        root.classList.add(`theme-${activeFlavor}`);
      }
    };

    applyTheme();

    // Listen for system theme changes
    const listener = () => applyTheme();
    mediaQuery.addEventListener("change", listener);

    return () => mediaQuery.removeEventListener("change", listener);
  }, [theme, themeFlavorDark, themeFlavorLight]);

  useEffect(() => {
    localStorage.setItem("theme-intensity", "0.58");
    window.document.documentElement.style.setProperty(
      "--theme-intensity",
      "0.58",
    );
  }, []);

  // Apply font on mount from localStorage (instant, before settings load)
  useEffect(() => {
    applyFontToDOM(currentFontId);
    applyChatFontToDOM(currentChatFontId);
    applyAllFontScalesToDOM(fontScales);
    applyBubbleWidthToDOM(bubbleWidthPct);
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
            const isDark = window.matchMedia(
              "(prefers-color-scheme: dark)",
            ).matches;
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
      value={{
        theme,
        setTheme,
        intensity,
        setIntensity,
        applyPrimaryColors,
        applyFont,
        applyChatFont,
        applyFontScale,
        applyBubbleWidth,
        currentFontId,
        currentChatFontId,
        fontScales,
        bubbleWidthPct,
        themeFlavorDark,
        setThemeFlavorDark,
        themeFlavorLight,
        setThemeFlavorLight,
      }}
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
  const {
    theme,
    setTheme,
    intensity,
    setIntensity,
    applyPrimaryColors,
    applyFont,
    applyChatFont,
    applyFontScale,
    applyBubbleWidth,
    currentFontId,
    currentChatFontId,
    fontScales,
    bubbleWidthPct,
    themeFlavorDark,
    setThemeFlavorDark,
    themeFlavorLight,
    setThemeFlavorLight,
  } = context;

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
    applyFontScale,
    applyBubbleWidth,
    currentFontId,
    currentChatFontId,
    fontScales,
    bubbleWidthPct,
    themeFlavorDark,
    setThemeFlavorDark,
    themeFlavorLight,
    setThemeFlavorLight,
  };
}
