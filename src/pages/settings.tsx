import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTheme } from "../contexts/ThemeContext";
import {
  PrimaryColorPicker,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_DARK_COLOR,
  getColorById,
} from "@/components/PrimaryColorPicker";
import { AIBehaviorSettings } from "@/components/settings/AIBehaviorSettings";
import { LanguageSelector } from "@/components/settings/LanguageSettings";
import { FONT_OPTIONS } from "@/shared/fonts";

import { ModelsAndConnectivity } from "@/components/settings/ModelsAndConnectivity";

import ConfirmationDialog from "@/components/ConfirmationDialog";
import { ipc } from "@/ipc/types";
import { showSuccess, showError } from "@/lib/toast";
import { AutoApproveSwitch } from "@/components/AutoApproveSwitch";
import { MaxChatTurnsSelector } from "@/components/MaxChatTurnsSelector";

import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useAppVersion } from "@/hooks/useAppVersion";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Sparkles,
  Search,
  X,
  Database,
  Download,
  Upload,
  Info,
  FileText,
  MoreHorizontal,
  Volume2,
} from "@/components/ui/icons";
import { ChevronRight, Plus } from "@/components/ui/icons";
import { useRouter, useNavigate } from "@tanstack/react-router";
import { GitHubIntegration } from "@/components/GitHubIntegration";
import { VercelIntegration } from "@/components/VercelIntegration";
import { SupabaseIntegration } from "@/components/SupabaseIntegration";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AutoExpandPreviewSwitch } from "@/components/AutoExpandPreviewSwitch";
import { NeonIntegration } from "@/components/NeonIntegration";
import { McpServersSettings } from "@/components/settings/McpServersSettings";
import { SkillsSettings } from "@/components/settings/SkillsSettings";
import { MemorySettings } from "@/components/settings/MemorySettings";
import { PromptsSection } from "@/components/settings/PromptsSection";

import { DefaultChatModeSelector } from "@/components/DefaultChatModeSelector";
import { useSetAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";
import { ChatLanguageSelector } from "@/components/ChatLanguageSelector";
import { CustomAgentsSection } from "@/components/settings/CustomAgentsSection";
import { ActiveLoader, LoaderStyles } from "@/components/chat/StreamingLoadingAnimation";

import { Input } from "@/components/ui/input";
import { ChatCompletionNotificationSwitch } from "@/components/ChatCompletionNotificationSwitch";
import { sendAppNotification } from "@/lib/notification-sound";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "@/components/ui/icons";

import { cn } from "@/lib/utils";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import {
  buildSettingsSearchIndex,
  type SettingsSearchItem,
} from "@/lib/i18n/settingsSearch";

// Settings search index (i18n-aware, see lib/i18n/settingsSearch.ts)

/**
 * In-house weighted search for the settings index (replaces fuse.js).
 * The index is small (~31 items), so a plain substring match over the
 * weighted fields is plenty — no fuzzy-matching library needed.
 * The index is localized (see buildSettingsSearchIndex in lib/i18n/settingsSearch).
 */
function searchSettings(
  query: string,
  index: SettingsSearchItem[],
): SettingsSearchItem[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return [];

  const scored = index.map((item) => {
    const haystacks: Array<[string, number]> = [
      [item.label.toLowerCase(), 2],
      [item.description.toLowerCase(), 1],
      [item.keywords.join(" ").toLowerCase(), 1.5],
      [item.section.toLowerCase(), 0.5],
    ];
    let score = 0;
    for (const term of terms) {
      let termHit = false;
      for (const [haystack, weight] of haystacks) {
        if (haystack.includes(term)) {
          score += weight;
          termHit = true;
          break; // count each term once (best-weight field wins)
        }
      }
      if (!termHit) return { item, score: -1 }; // any unmatched term excludes
    }
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}

// Search index lives in src/lib/i18n/settingsSearch.ts (i18n-aware).
// Build it per language with buildSettingsSearchIndex() and memoize in the
// component: the visible strings are localized, keywords stay bilingual.

function SettingItem({
  label,
  description,
  control,
  onClick,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center",
        onClick ? "cursor-pointer" : "",
      )}
    >
      <div className="flex-1">
        <h3 className="typo-label">{label}</h3>
        {description && <p className="typo-caption mt-1">{description}</p>}
      </div>
      <div onClick={(e) => e.stopPropagation()}>{control}</div>
    </div>
  );
}

function TogglePill({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          onClick={() => onCheckedChange(value)}
          className={cn(
            "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
            checked === value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "hover:bg-primary/10",
          )}
        >
          {value ? t("common.enabled") : t("common.disabled")}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedSection, setHighlightedSection] = useState<string | null>(
    null,
  );
  const [agentPermissionsExpanded, setAgentPermissionsExpanded] =
    useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Prompts — creación de categoría (botón en el header, form inline)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [promptsRefreshKey, setPromptsRefreshKey] = useState(0);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await ipc.prompt.createCategory({
        name: newCategoryName,
        description: "",
      });
      setNewCategoryName("");
      setIsCreatingCategory(false);
      setPromptsRefreshKey((k) => k + 1); // fuerza reload de PromptsSection
    } catch {
      showError(t("toasts.createCategoryError"));
    }
  };

  const { theme, intensity } = useTheme();
  const appVersion = useAppVersion();
  const { settings, updateSettings, refreshSettings } = useSettings();
  const { t, language } = useI18n();

  // Localized settings search index (rebuilds when language changes)
  const searchIndex = useMemo(
    () => buildSettingsSearchIndex(language),
    [language],
  );
  const router = useRouter();
  const navigate = useNavigate();
  const setActiveSettingsSection = useSetAtom(activeSettingsSectionAtom);

  // Version info for popover
  const [versionInfo, setVersionInfo] = useState<{
    vibes: string;
    opencode: string | null;
    node: string;
    electron: string;
    platform: string;
    arch: string;
  } | null>(null);

  const fetchVersionInfo = useCallback(async () => {
    try {
      const info = await ipc.system.getVersionInfo();
      setVersionInfo(info);
    } catch {
      /* ignore */
    }
  }, []);

  // Pre-fetch version info on mount (backend returns cached data instantly)
  useEffect(() => {
    fetchVersionInfo();
  }, [fetchVersionInfo]);

  useEffect(() => {
    setActiveSettingsSection("general-settings");
  }, [setActiveSettingsSection]);

  // Track scroll position for sticky header fade
  useEffect(() => {
    const container = document.getElementById("settings-scroll-container");
    if (!container) return;
    const handleScroll = () => setIsScrolled(container.scrollTop > 8);
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Check if release notes file has content removed (now using static new documentation system)

  // Search results (in-house weighted substring search, card #103 Slice 5)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchSettings(searchQuery, searchIndex);
  }, [searchQuery, searchIndex]);

  // Handle search result click
  const handleSearchResultClick = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightedSection(sectionId);
      setTimeout(() => setHighlightedSection(null), 2000);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery("");
  };

  // Card #200: reset SOLO de settings (user_preferences + prompts custom +
  // overrides). No toca apps, chats, sesiones ni archivos de apps.
  const handleResetEverything = async () => {
    setIsResetting(true);
    try {
      await ipc.system.resetSettings();
      // Refrescar settings (vuelven los defaults) y prompts (re-sintetiza los
      // defaults de código sin overrides).
      await refreshSettings();
      setPromptsRefreshKey((k) => k + 1);
      showSuccess(t("toasts.resetSettingsSuccess"));
    } catch (error) {
      console.error("Error resetting:", error);
      showError(
        error instanceof Error ? error.message : t("toasts.unknownError"),
      );
    } finally {
      setIsResetting(false);
      setIsResetDialogOpen(false);
    }
  };

  const handleExportSettings = () => {
    try {
      if (!settings) {
        showError(t("toasts.noConfigToExport"));
        return;
      }

      const dataToExport = {
        settings: settings,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vibes-settings-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(t("toasts.configExported"));
    } catch (err) {
      console.error("Export error:", err);
      showError(t("toasts.exportConfigError"));
    }
  };

  const handleImportSettings = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate the imported data
        if (!data.settings || typeof data.settings !== "object") {
          showError(t("toasts.invalidFileFormat"));
          return;
        }

        // Update all settings
        await updateSettings(data.settings);

        showSuccess(t("toasts.configImported"));
      } catch (err) {
        console.error("Import error:", err);
        showError(t("toasts.importConfigError"));
      }
    };

    input.click();
  };

  const handleOpenLogs = async () => {
    try {
      const logPath = await ipc.system.getLogFilePath();
      await ipc.system.showItemInFolder(logPath);
    } catch (err) {
      console.error("Error opening logs:", err);
      showError(t("toasts.openLogsError"));
    }
  };

  return (
    <div
      id="settings-scroll-container"
      className="flex flex-col h-full w-full bg-muted/30 text-foreground overflow-y-auto"
    >
      {/* Header Pill — sticky */}
      <div className="sticky top-0 z-50 w-full pt-6 pb-4 pointer-events-none">
        {/* Solid background behind the pill */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-muted/30" />
        </div>

        {/* Aggressive fade overlay — only visible when scrolled */}
        <div
          className="absolute left-0 right-0 -z-10 h-8"
          style={{
            top: "100%",
            opacity: isScrolled ? 1 : 0,
            background:
              "linear-gradient(to bottom, var(--color-background), transparent)",
            maskImage: "linear-gradient(to bottom, black 20%, transparent)",
          }}
        >
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-muted/30" />
        </div>

        <div className="relative w-full mx-auto px-8 pointer-events-auto">
          <div className="flex justify-between items-center gap-4 bg-card border border-border rounded-2xl p-4 shadow-sm transition-[border-color,box-shadow] duration-300">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                type="text"
                placeholder={t("settingsItems.buscar_ajustes")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-10 bg-muted/50 border border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl typo-input transition-colors hover:bg-muted/70"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 pr-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-4 cursor-pointer text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors rounded-xl"
                  >
                    <Info className="h-4 w-4 mr-2 opacity-70" />
                    {appVersion ? `v${appVersion}` : t("docsWindow.versionInfo")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[300px] p-4 rounded-xl border border-border shadow-2xl bg-card"
                >
                  {versionInfo ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2.5 px-1">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {t("docsWindow.system")}
                        </h4>
                        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
                          <span className="text-muted-foreground">{t("docsWindow.vibes")}</span>
                          <span className="font-mono font-medium text-primary">
                            v{versionInfo.vibes}
                          </span>
                          <span className="text-muted-foreground">
                            {t("docsWindow.runtime")}
                          </span>
                          <span className="font-mono">
                            {versionInfo.opencode
                              ? `v${versionInfo.opencode}`
                              : t("docsWindow.notAvailable")}
                          </span>
                          <div className="col-span-2 h-px bg-border/50 my-1" />
                          <span className="text-muted-foreground">{t("docsWindow.nodejs")}</span>
                          <span className="font-mono opacity-80">
                            v{versionInfo.node}
                          </span>
                          <span className="text-muted-foreground">
                            {t("docsWindow.electron")}
                          </span>
                          <span className="font-mono opacity-80">
                            v{versionInfo.electron}
                          </span>
                          <span className="text-muted-foreground">
                            {t("docsWindow.architecture")}
                          </span>
                          <span className="font-mono opacity-80">
                            {versionInfo.platform}/{versionInfo.arch}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-border/50">
                        <Button
                          onClick={() => {
                            ipc.system.openReleaseNotesWindow({
                              theme: theme as "light" | "dark" | "system",
                              themeIntensity: intensity,
                            });
                          }}
                          className="w-full cursor-pointer bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-lg"
                          variant="ghost"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          {t("docsWindow.releaseNotesButton")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 flex justify-center text-sm text-muted-foreground">
                      {t("docsWindow.loading")}
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <div className="w-px h-5 bg-border/60 mx-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-3 cursor-pointer text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors rounded-xl"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={handleImportSettings}
                    className="cursor-pointer gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {t("search.import")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleExportSettings}
                    className="cursor-pointer gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {t("search.export")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleOpenLogs}
                    className="cursor-pointer gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    {t("search.viewLogs")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      sendAppNotification({
                        title: "Test",
                        body: t("search.testNotificationBody"),
                        settings: settings ?? null,
                      })
                    }
                    className="cursor-pointer gap-2"
                  >
                    <Volume2 className="h-4 w-4" />
                    {t("search.testNotification")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsResetDialogOpen(true)}
                    disabled={isResetting}
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  >
                    {isResetting
                      ? t("search.resetting")
                      : t("search.resetSettings")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && (
            <div className="mt-4 bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
              {searchResults.length > 0 ? (
                <div className="p-2">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => {
                        handleSearchResultClick(result.sectionId);
                        clearSearch();
                      }}
                      className="w-full text-left p-4 rounded-xl hover:bg-muted transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-medium text-foreground">
                            {result.label}
                          </div>
                          <div className="typo-caption mt-1">
                            {result.description}
                          </div>
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-primary/60 whitespace-nowrap">
                          {result.section}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Search className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="typo-subsection-title">
                    {t("search.noResults")}
                  </p>
                  <p className="typo-caption mt-1">
                    {t("search.noResultsHint")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full mx-auto px-8 pt-4 pb-12 flex-1">
        <div className="space-y-12 pb-24">
          <GeneralSettings
            appVersion={appVersion}
            isHighlighted={highlightedSection === "general-settings"}
          />

          <ModelsAndConnectivity
            isHighlighted={highlightedSection === "models-connectivity"}
          />

          <AIBehaviorSettings
            isHighlighted={
              highlightedSection === "ai-behavior" ||
              highlightedSection === "embeddings-settings"
            }
          />

          {/* Custom Agents Section */}
          <div
            id="custom-agents-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${
              highlightedSection === "custom-agents-settings"
                ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
                : ""
            }`}
          >
            <h2 className="typo-section-title mb-2">{t("settings.sections.customAgents")}</h2>
            <p className="typo-caption mb-8">{" "}{t("settings.sections.customAgentsDesc")}</p>
            <CustomAgentsSection />
          </div>

          {/* Prompts Section */}
          <div
            id="prompts-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${
              highlightedSection === "prompts-settings"
                ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
                : ""
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="typo-section-title">{t("settings.sections.prompts")}</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCreatingCategory(true)}
                className="gap-2"
              >
                <Plus className="h-3.5 w-3.5" /> {t("settings.sections.newCategory")}
              </Button>
            </div>
            <p className="typo-caption mb-8">{" "}{t("settings.sections.promptsDesc")}</p>

            {isCreatingCategory && (
              <div className="flex gap-2 p-3 bg-muted/20 rounded-xl border border-border mb-4">
                <Input
                  autoFocus
                  placeholder={t("settingsItems.nueva_categoria")}
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateCategory();
                    if (e.key === "Escape") setIsCreatingCategory(false);
                  }}
                  className="h-9"
                />
                <Button onClick={handleCreateCategory}>{t("common.create")}</Button>
                <Button
                  variant="ghost"
                  onClick={() => setIsCreatingCategory(false)}
                >
                  {t("prompts.cancel")}
                </Button>
              </div>
            )}

            <PromptsSection refreshKey={promptsRefreshKey} />
          </div>

          <div
            id="memory-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${
              highlightedSection === "memory-settings"
                ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
                : ""
            }`}
          >
            <h2 className="typo-section-title mb-2">{t("settings.sections.guidelines")}</h2>
            <p className="typo-caption mb-8">{" "}{t("settings.sections.guidelinesDesc")}</p>
            <MemorySettings />
          </div>

          <WorkflowSettings
            isHighlighted={highlightedSection === "workflow-settings"}
          />

          {/* Integrations Section */}
          <div
            id="integrations"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${
              highlightedSection === "integrations"
                ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
                : ""
            }`}
          >
            <h2 className="typo-section-title mb-2">{t("settings.sections.integrations")}</h2>
            <p className="typo-caption mb-8">{" "}{t("settings.sections.integrationsDesc")}</p>
            <div className="space-y-6">
              <GitHubIntegration />
              <VercelIntegration />
              <SupabaseIntegration />
              <NeonIntegration />
            </div>
          </div>

          {/* MCP Tools Section */}
          <div
            id="tools-mcp"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${
              highlightedSection === "tools-mcp"
                ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
                : ""
            }`}
          >
            <h2 className="typo-section-title mb-6">{t("settings.sections.mcp")}</h2>
            <McpServersSettings />
          </div>

          <div
            id="tools-skills"
            className="bg-card rounded-2xl shadow-sm p-8 border border-border mt-8"
          >
            <h2 className="typo-section-title mb-2">{t("settings.sections.skills")}</h2>
            <p className="typo-caption mb-8">{" "}{t("settings.sections.skillsDesc")}</p>
            <SkillsSettings />
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={isResetDialogOpen}
        title={t("dialogs.resetDefaultsTitle")}
        message={t("dialogs.resetDefaultsMessage")}
        confirmText={t("dialogs.resetDefaultsConfirm")}
        cancelText={t("dialogs.cancel")}
        onConfirm={handleResetEverything}
        onCancel={() => setIsResetDialogOpen(false)}
      />
    </div>
  );
}

export function GeneralSettings({
  appVersion,
  isHighlighted,
}: {
  appVersion: string | null;
  isHighlighted?: boolean;
}) {
  const {
    theme,
    setTheme,
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
    isDarkMode,
  } = useTheme();
  const [fontScaleExpanded, setFontScaleExpanded] = useState(false);
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const activeColorId = isDarkMode
    ? settings?.primaryColorDark || DEFAULT_DARK_COLOR
    : settings?.primaryColorLight || DEFAULT_LIGHT_COLOR;
  const activeColorHex =
    getColorById(activeColorId)?.[isDarkMode ? "dark" : "light"] || "#7c3aed";

  useEffect(() => {
    if (settings?.theme !== undefined && settings.theme !== theme) {
      setTheme(settings.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.theme, setTheme]);

  useEffect(() => {
    if (
      settings?.themeFlavorDark !== undefined &&
      settings.themeFlavorDark !== themeFlavorDark
    ) {
      setThemeFlavorDark(settings.themeFlavorDark);
    }
  }, [settings?.themeFlavorDark, setThemeFlavorDark, themeFlavorDark]);

  useEffect(() => {
    if (
      settings?.themeFlavorLight !== undefined &&
      settings.themeFlavorLight !== themeFlavorLight
    ) {
      setThemeFlavorLight(settings.themeFlavorLight);
    }
  }, [settings?.themeFlavorLight, setThemeFlavorLight, themeFlavorLight]);

  // ── Modal escaparate de loaders (#VIBES-202) ─────────────────
  const [showcaseOpen, setShowcaseOpen] = useState(false);

  const handleShowcaseSelect = async (value: string) => {
    await updateSettings({ loaderStyle: value }, { showToast: true });
    setShowcaseOpen(false);
  };

  // Apply primary colors from settings on load
  useEffect(() => {
    if (settings) {
      applyPrimaryColors(
        settings.primaryColorLight,
        settings.primaryColorDark,
        settings.primaryChromaLight,
        settings.primaryChromaDark,
      );
    }
  }, [
    settings?.primaryColorLight,
    settings?.primaryColorDark,
    settings?.primaryChromaLight,
    settings?.primaryChromaDark,
    applyPrimaryColors,
  ]);

  // Apply fonts from settings on load
  useEffect(() => {
    if (settings?.selectedFont && settings.selectedFont !== currentFontId) {
      applyFont(settings.selectedFont);
    }
    if (
      settings?.selectedChatFont &&
      settings.selectedChatFont !== currentChatFontId
    ) {
      applyChatFont(settings.selectedChatFont);
    }
  }, [settings?.selectedFont, settings?.selectedChatFont]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply font scales from settings on load
  useEffect(() => {
    if (
      settings?.fontScaleUI !== undefined &&
      settings.fontScaleUI !== fontScales.ui
    ) {
      applyFontScale("ui", settings.fontScaleUI);
    }
    if (
      settings?.fontScaleSidebar !== undefined &&
      settings.fontScaleSidebar !== fontScales.sidebar
    ) {
      applyFontScale("sidebar", settings.fontScaleSidebar);
    }
    if (
      settings?.fontScaleChat !== undefined &&
      settings.fontScaleChat !== fontScales.chat
    ) {
      applyFontScale("chat", settings.fontScaleChat);
    }
    if (
      settings?.fontScaleBubbleWidth !== undefined &&
      settings.fontScaleBubbleWidth !== bubbleWidthPct
    ) {
      applyBubbleWidth(settings.fontScaleBubbleWidth);
    }
  }, [
    settings?.fontScaleUI,
    settings?.fontScaleSidebar,
    settings?.fontScaleChat,
    settings?.fontScaleBubbleWidth,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      id="general-settings"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <h2 className="typo-section-title mb-8">{t("settings.sections.general")}</h2>

      <div className="space-y-4">
        <SettingItem
          label={t("settingsItems.idioma")}
          description={t("settingsItems.idiomaDesc")}
          control={<LanguageSelector />}
        />
        <SettingItem
          label={t("settingsItems.apariencia")}
          description={t("settingsItems.aparienciaDesc")}
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              {(["light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setTheme(option);
                    updateSettings({ theme: option });
                  }}
                  className={cn(
                    "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                    (option === "dark" ? isDarkMode : !isDarkMode)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-primary/10",
                  )}
                >
                  {option === "light" ? t("settingsItems.claro") : t("settingsItems.oscuro")}
                </button>
              ))}
            </div>
          }
        />

        {!isDarkMode ? (
          <SettingItem
            label={t("settingsItems.variante_del_tema_claro")}
            description={t("settingsItems.variante_del_tema_claroDesc")}
            control={
              <UnifiedSelector
                value={themeFlavorLight || "default"}
                onChange={async (value) => {
                  setThemeFlavorLight(value);
                  await updateSettings(
                    { themeFlavorLight: value },
                    { showToast: true },
                  );
                }}
                options={[
                  {
                    value: "default",
                    label: t("themeVariants.claro_classico"),
                    description: t("themeVariants.claro_classicoDesc"),
                  },
                  {
                    value: "github-light",
                    label: t("themeVariants.github_light"),
                    description: t("themeVariants.github_lightDesc"),
                  },
                  {
                    value: "solarized-light",
                    label: t("themeVariants.solarized_light"),
                    description: t("themeVariants.solarized_lightDesc"),
                  },
                  {
                    value: "gruvbox-light",
                    label: t("themeVariants.gruvbox_light"),
                    description: t("themeVariants.gruvbox_lightDesc"),
                  },
                  {
                    value: "nord-light",
                    label: t("themeVariants.nord_light"),
                    description: t("themeVariants.nord_lightDesc"),
                  },
                  {
                    value: "cupcake",
                    label: t("themeVariants.cupcake"),
                    description: t("themeVariants.cupcakeDesc"),
                  },
                  {
                    value: "one-light",
                    label: t("themeVariants.one_light"),
                    description: t("themeVariants.one_lightDesc"),
                  },
                  {
                    value: "forest-light",
                    label: t("themeVariants.forest_light"),
                    description: t("themeVariants.forest_lightDesc"),
                  },
                  {
                    value: "papercolor-light",
                    label: t("themeVariants.papercolor_light"),
                    description: t("themeVariants.papercolor_lightDesc"),
                  },
                  {
                    value: "catppuccin-latte",
                    label: t("themeVariants.catppuccin_latte"),
                    description: t("themeVariants.catppuccin_latteDesc"),
                  },
                ]}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[280px]"
                data-testid="theme-flavor-light-selector"
              />
            }
          />
        ) : (
          <SettingItem
            label={t("settingsItems.variante_del_tema_oscuro")}
            description={t("settingsItems.variante_del_tema_oscuroDesc")}
            control={
              <UnifiedSelector
                value={themeFlavorDark || "default"}
                onChange={async (value) => {
                  setThemeFlavorDark(value);
                  await updateSettings(
                    { themeFlavorDark: value },
                    { showToast: true },
                  );
                }}
                options={[
                  {
                    value: "default",
                    label: t("themeVariants.oscuro_classico"),
                    description: t("themeVariants.oscuro_classicoDesc"),
                  },
                  {
                    value: "dracula",
                    label: t("themeVariants.dracula"),
                    description: t("themeVariants.draculaDesc"),
                  },
                  {
                    value: "one-dark",
                    label: t("themeVariants.one_dark"),
                    description: t("themeVariants.one_darkDesc"),
                  },
                  {
                    value: "nord",
                    label: t("themeVariants.nord_dark"),
                    description: t("themeVariants.nord_darkDesc"),
                  },
                  {
                    value: "monokai",
                    label: t("themeVariants.monokai"),
                    description: t("themeVariants.monokaiDesc"),
                  },
                  {
                    value: "solarized-dark",
                    label: t("themeVariants.solarized_dark"),
                    description: t("themeVariants.solarized_darkDesc"),
                  },
                  {
                    value: "gruvbox-dark",
                    label: t("themeVariants.gruvbox_dark"),
                    description: t("themeVariants.gruvbox_darkDesc"),
                  },
                  {
                    value: "synthwave84",
                    label: t("themeVariants.synthwave84"),
                    description: t("themeVariants.synthwave84Desc"),
                  },
                  {
                    value: "night-owl",
                    label: t("themeVariants.night_owl"),
                      description: t("themeVariants.night_owlDesc"),
                  },
                  {
                    value: "tokyo-night",
                    label: t("themeVariants.tokyo_night"),
                    description: t("themeVariants.tokyo_nightDesc"),
                  },
                ]}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[280px]"
                data-testid="theme-flavor-dark-selector"
              />
            }
          />
        )}

        {/* Primary Color Picker */}
        <SettingItem
          label={t("settingsItems.color_primario")}
          description={t("settingsItems.color_primarioDesc")}
          control={
            <div className="flex w-fit">
              <PrimaryColorPicker
                label={t("settingsItems.claro")}
                pillPosition="first"
                defaultColor={DEFAULT_LIGHT_COLOR}
                selectedColor={
                  settings?.primaryColorLight || DEFAULT_LIGHT_COLOR
                }
                chroma={settings?.primaryChromaLight ?? 100}
                onColorSelect={async (colorId) => {
                  await updateSettings(
                    { primaryColorLight: colorId },
                    { showToast: true },
                  );
                  applyPrimaryColors(
                    colorId,
                    settings?.primaryColorDark,
                    settings?.primaryChromaLight,
                    settings?.primaryChromaDark,
                  );
                }}
                onChromaChange={async (value) => {
                  await updateSettings({ primaryChromaLight: value });
                  applyPrimaryColors(
                    settings?.primaryColorLight,
                    settings?.primaryColorDark,
                    value,
                    settings?.primaryChromaDark,
                  );
                }}
              />
              <PrimaryColorPicker
                label={t("settingsItems.oscuro")}
                variant="dark"
                pillPosition="last"
                defaultColor={DEFAULT_DARK_COLOR}
                selectedColor={settings?.primaryColorDark || DEFAULT_DARK_COLOR}
                chroma={settings?.primaryChromaDark ?? 100}
                onColorSelect={async (colorId) => {
                  await updateSettings(
                    { primaryColorDark: colorId },
                    { showToast: true },
                  );
                  applyPrimaryColors(
                    settings?.primaryColorLight,
                    colorId,
                    settings?.primaryChromaLight,
                    settings?.primaryChromaDark,
                  );
                }}
                onChromaChange={async (value) => {
                  await updateSettings({ primaryChromaDark: value });
                  applyPrimaryColors(
                    settings?.primaryColorLight,
                    settings?.primaryColorDark,
                    settings?.primaryChromaLight,
                    value,
                  );
                }}
              />
            </div>
          }
        />

        {/* Loader Style Selector — fila con tab selector + modal escaparate */}
        <SettingItem
          label={t("settingsItems.estilo_de_animacion_de_carga")}
          description={t("settingsItems.estilo_de_animacion_de_cargaDesc")}
          onClick={() => setShowcaseOpen(true)}
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowcaseOpen(true);
                }}
                className="px-4 py-1.5 typo-select rounded-lg hover:bg-primary/10 transition-colors duration-200 cursor-pointer flex items-center gap-2"
              >
                <span>
                  {t(`loadersLabels.${settings?.loaderStyle || "orbital"}`)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 opacity-60" />
              </button>
            </div>
          }
        />

        {/* Modal escaparate — todos los loaders animados (forceAnimate) */}
        <Dialog open={showcaseOpen} onOpenChange={setShowcaseOpen}>
          <DialogContent className="max-w-[78rem] w-[96vw] sm:max-w-[78rem] max-h-[88vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{t("settingsItems.estilo_de_animacion_de_carga")}</DialogTitle>
            </DialogHeader>
            <LoaderShowcaseGrid
              activeValue={settings?.loaderStyle || "orbital"}
              color={activeColorHex}
              onSelect={handleShowcaseSelect}
              getLabel={(id) => t(`loadersLabels.${id}`)}
            />
          </DialogContent>
        </Dialog>

        {/* Font Selector */}
        <SettingItem
          label={t("settingsItems.tipografia_de_la_interfaz")}
          description={t("settingsItems.tipografia_de_la_interfazDesc")}
          control={
            <UnifiedSelector
              value={currentFontId}
              onChange={async (value) => {
                applyFont(value);
                await updateSettings({ selectedFont: value });
              }}
              options={FONT_OPTIONS.map((font) => ({
                value: font.id,
                label: font.name,
              }))}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[200px]"
              itemLayout="compact"
              data-testid="font-selector"
            />
          }
        />

        {/* Chat Font Selector */}
        <SettingItem
          label={t("settingsItems.tipografia_del_chat")}
          description={t("settingsItems.tipografia_del_chatDesc")}
          control={
            <UnifiedSelector
              value={currentChatFontId}
              onChange={async (value) => {
                applyChatFont(value);
                await updateSettings({ selectedChatFont: value });
              }}
              options={FONT_OPTIONS.map((font) => ({
                value: font.id,
                label: font.name,
              }))}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[200px]"
              itemLayout="compact"
              data-testid="chat-font-selector"
            />
          }
          />

          {/* Vista del chat: Max / Flow / Zen */}
          <SettingItem
            label={t("settingsItems.vista_del_chat")}
            description={
              (settings?.chatRenderMode ?? "zen") === "zen"
                ? t("agentSection.chatViewZen")
                : settings?.chatRenderMode === "flow"
                  ? t("agentSection.chatViewFlow")
                  : t("agentSection.chatViewFull")
            }
            control={
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {[
                  { value: "full" as const, label: "Max" },
                  { value: "flow" as const, label: "Flow" },
                  { value: "zen" as const, label: "Zen" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      updateSettings({ chatRenderMode: option.value })
                    }
                    className={cn(
                      "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
                      (settings?.chatRenderMode ?? "zen") === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-primary/10",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />

        {/* Font Scale — collapsible */}
        <div className="space-y-0">
          <div
            className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
            onClick={() => setFontScaleExpanded((e) => !e)}
          >
            <div className="flex-1">
              <h3 className="typo-label">{t("settingsItems.tamano_de_fuente")}</h3>
              <p className="typo-caption mt-1">
                {t("settingsItems.tamano_de_fuenteDesc")}
              </p>
            </div>
            <ChevronRight
              className={cn(
                "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                fontScaleExpanded && "rotate-90",
              )}
            />
          </div>

          {fontScaleExpanded && (
            <div className="pl-4 space-y-0">
              <SettingItem
                label={t("settingsItems.interfaz")}
                description={t("settingsItems.interfazDesc")}
                control={
                  <UnifiedSelector
                    value={String(fontScales.ui)}
                    onChange={async (value) => {
                      const scale = parseFloat(value);
                      applyFontScale("ui", scale);
                      await updateSettings({ fontScaleUI: scale });
                    }}
                    options={[
                      { value: "1", label: "100%" },
                      { value: "1.05", label: "105%" },
                      { value: "1.1", label: "110%" },
                      { value: "1.15", label: "115%" },
                      { value: "1.2", label: "120%" },
                      { value: "1.25", label: "125%" },
                      { value: "1.3", label: "130%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-ui-selector"
                  />
                }
              />
              <SettingItem
                label={t("settingsItems.sidebar")}
                description={t("settingsItems.sidebarDesc")}
                control={
                  <UnifiedSelector
                    value={String(fontScales.sidebar)}
                    onChange={async (value) => {
                      const scale = parseFloat(value);
                      applyFontScale("sidebar", scale);
                      await updateSettings({ fontScaleSidebar: scale });
                    }}
                    options={[
                      { value: "1", label: "100%" },
                      { value: "1.05", label: "105%" },
                      { value: "1.1", label: "110%" },
                      { value: "1.15", label: "115%" },
                      { value: "1.2", label: "120%" },
                      { value: "1.25", label: "125%" },
                      { value: "1.3", label: "130%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-sidebar-selector"
                  />
                }
              />
              <SettingItem
                label={t("settingsItems.chat")}
                description={t("settingsItems.chatDesc")}
                control={
                  <UnifiedSelector
                    value={String(fontScales.chat)}
                    onChange={async (value) => {
                      const scale = parseFloat(value);
                      applyFontScale("chat", scale);
                      await updateSettings({ fontScaleChat: scale });
                    }}
                    options={[
                      { value: "0.9", label: "90%" },
                      { value: "0.95", label: "95%" },
                      { value: "1", label: "100%" },
                      { value: "1.05", label: "105%" },
                      { value: "1.1", label: "110%" },
                      { value: "1.15", label: "115%" },
                      { value: "1.2", label: "120%" },
                      { value: "1.25", label: "125%" },
                      { value: "1.3", label: "130%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-chat-selector"
                  />
                }
              />
              <SettingItem
                label={t("settingsItems.ancho_de_burbuja")}
                description={t("settingsItems.ancho_de_burbujaDesc")}
                control={
                  <UnifiedSelector
                    value={String(bubbleWidthPct)}
                    onChange={async (value) => {
                      const pct = parseFloat(value);
                      applyBubbleWidth(pct);
                      await updateSettings({ fontScaleBubbleWidth: pct });
                    }}
                    options={[
                      { value: "60", label: "60%" },
                      { value: "65", label: "65%" },
                      { value: "70", label: "70%" },
                      { value: "75", label: "75%" },
                      { value: "85", label: "85%" },
                      { value: "95", label: "95%" },
                      { value: "100", label: "100%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-bubble-width-selector"
                  />
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkflowSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();

  return (
    <div
      id="workflow-settings"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <h2 className="typo-section-title mb-2">{t("settings.sections.workflow")}</h2>
      <p className="typo-caption mb-8">{" "}{t("settings.sections.workflowDesc")}</p>

      <div className="space-y-12">
        <div className="space-y-4">
          <SettingItem
            label={t("settingsItems.modo_de_chat_predeterminado")}
            description={t("settingsItems.modo_de_chat_predeterminadoDesc")}
            control={<DefaultChatModeSelector />}
          />

          {/* Git nativo — hardcoded to always enabled */}

          <SettingItem
            label={t("settingsItems.confirmar_cambios_en_git")}
            description={t("settingsItems.confirmar_cambios_en_gitDesc")}
            onClick={() =>
              updateSettings({
                autoApproveChanges: !settings?.autoApproveChanges,
              })
            }
            control={
              <TogglePill
                checked={!!settings?.autoApproveChanges}
                onCheckedChange={(checked) =>
                  updateSettings({ autoApproveChanges: checked })
                }
              />
            }
          />

          <SettingItem
            label={t("settingsItems.expandir_vista_previa")}
            description={t("settingsItems.expandir_vista_previaDesc")}
            control={
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {(["off", "right", "left"] as const).map((option) => {
                  const isActive =
                    option === "off"
                      ? !settings?.autoExpandPreviewPanel
                      : !!settings?.autoExpandPreviewPanel &&
                        (settings?.previewPosition ?? "right") === option;
                  return (
                    <button
                      key={option}
                      onClick={() => {
                        if (option === "off") {
                          updateSettings({ autoExpandPreviewPanel: false });
                        } else {
                          updateSettings({
                            autoExpandPreviewPanel: true,
                            previewPosition: option,
                          });
                        }
                      }}
                      className={cn(
                        "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "hover:bg-primary/10",
                      )}
                    >
                      {option === "off"
                        ? t("common.disabled")
                        : option === "right"
                          ? t("settingsItems.vista_previa_posicion_derecha")
                          : t("settingsItems.vista_previa_posicion_izquierda")}
                    </button>
                  );
                })}
              </div>
            }
          />

          <SettingItem
            label={t("settingsItems.notificaciones_de_respuesta")}
            description={t("settingsItems.notificaciones_de_respuestaDesc")}
            onClick={() =>
              updateSettings({
                enableChatCompletionNotifications:
                  !settings?.enableChatCompletionNotifications,
              })
            }
            control={
              <TogglePill
                checked={!!settings?.enableChatCompletionNotifications}
                onCheckedChange={(checked) =>
                  updateSettings({ enableChatCompletionNotifications: checked })
                }
              />
            }
          />

          <SettingItem
            label={t("settingsItems.reproducir_sonido")}
            description={t("settingsItems.reproducir_sonidoDesc")}
            onClick={() =>
              updateSettings({
                enableNotificationSound:
                  settings?.enableNotificationSound === false,
              })
            }
            control={
              <TogglePill
                checked={settings?.enableNotificationSound !== false}
                onCheckedChange={(checked) =>
                  updateSettings({ enableNotificationSound: checked })
                }
              />
            }
          />

          <SettingItem
            label={t("settingsItems.busqueda_web")}
            description={t("settingsItems.busqueda_webDesc")}
            onClick={() =>
              updateSettings({
                enableWebSearch: !settings?.enableWebSearch,
              })
            }
            control={
              <TogglePill
                checked={settings?.enableWebSearch !== false}
                onCheckedChange={(checked) =>
                  updateSettings({ enableWebSearch: checked })
                }
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

// ── Escaparate de loaders (modal) ─────────────────────────────
function LoaderShowcaseGrid({
  activeValue,
  color,
  onSelect,
  getLabel,
}: {
  activeValue: string;
  color: string;
  onSelect: (v: string) => void;
  getLabel: (id: string) => string;
}) {
  const STYLES = [
    "orbital","aurora","wave","jelly","spark","equalizer","infinity","grid","brackets","terminal","server","morph","matrix","glow","voice","packet","sonar","blocks","nodes","glowring",
    "m-dots","m-radar","m-sine","m-orbit","m-eq","m-pulse","m-cross","m-flip","m-blink","m-breathe","m-swap","m-sonar","m-pie","m-scan","m-hour","m-yin","m-diamond","m-clock","m-expand",
  ];
  return (
    <>
      <LoaderStyles />
      <div className="grid w-full grid-cols-3 gap-4 pt-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {STYLES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            title={getLabel(value)}
            className={
              "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-xs transition " +
              (activeValue === value
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted/40")
            }
          >
            <ActiveLoader style={value} color={color} size={20} forceAnimate />
            <span className="text-muted-foreground">{getLabel(value)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
