/**
 * LanguageBadge — Shows a tiny colored language indicator next to the app name.
 * Only renders if primaryLanguage is known and not "unknown".
 */

const LANG_CONFIG: Record<string, { label: string; color: string }> = {
  typescript: { label: "TS", color: "#3178c6" },
  javascript: { label: "JS", color: "#f7df1e" },
  php: { label: "PHP", color: "#777bb4" },
  python: { label: "PY", color: "#3776ab" },
  rust: { label: "RS", color: "#dea584" },
  go: { label: "GO", color: "#00add8" },
  java: { label: "JV", color: "#ed8b00" },
  ruby: { label: "RB", color: "#cc342d" },
  dart: { label: "DT", color: "#00b4ab" },
  csharp: { label: "C#", color: "#68217a" },
  kotlin: { label: "KT", color: "#7f52ff" },
  swift: { label: "SW", color: "#f05138" },
};

export function LanguageBadge({ language }: { language?: string | null }) {
  if (!language || language === "unknown" || language === "javascript" || language === "typescript") return null;

  const config = LANG_CONFIG[language];
  if (!config) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "8.5px",
        fontWeight: 700,
        letterSpacing: "0.03em",
        lineHeight: 1,
        padding: "1.5px 4px",
        borderRadius: "4px",
        backgroundColor: `${config.color}20`,
        color: config.color,
        border: `1px solid ${config.color}30`,
        flexShrink: 0,
        whiteSpace: "nowrap" as const,
      }}
      title={language}
    >
      {config.label}
    </span>
  );
}
