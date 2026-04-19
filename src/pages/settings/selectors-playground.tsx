import React, { useState } from "react";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  GitBranch,
  Check,
  Info,
  X,
  Sparkles,
  Zap,
  Brain,
  Search,
  MessageSquare,
  Code,
  HelpCircle,
  Globe,
  ChevronDown,
  Trash2,
  Plus,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
 * Demo data
 * ──────────────────────────────────────────────────────────────────────────── */

const MODEL_OPTIONS: SelectorOption[] = [
  {
    value: "auto",
    label: "Auto Router",
    description: "Gestión automática",
    leftIcon: <Sparkles size={14} className="text-amber-500" />,
    keywords: ["auto", "router"],
  },
  {
    value: "claude-sonnet-4",
    label: "Claude Sonnet 4",
    description: "200K context",
    keywords: ["anthropic", "claude", "sonnet"],
    rightIcon: (
      <button className="p-0.5 hover:bg-muted rounded text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
        <Info size={13} />
      </button>
    ),
  },
  {
    value: "gpt-4.1",
    label: "GPT 4.1",
    description: "128K context",
    keywords: ["openai", "gpt"],
    rightIcon: (
      <button className="p-0.5 hover:bg-muted rounded text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
        <Info size={13} />
      </button>
    ),
  },
  {
    value: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "1M context",
    keywords: ["google", "gemini"],
    rightIcon: (
      <button className="p-0.5 hover:bg-muted rounded text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
        <Info size={13} />
      </button>
    ),
  },
  {
    value: "deepseek-r1",
    label: "DeepSeek R1",
    description: "64K context",
    keywords: ["deepseek"],
  },
];

const CHAT_MODE_OPTIONS: SelectorOption[] = [
  {
    value: "agent",
    label: "Agente",
    description: "Desarrolla, edita y depura con herramientas avanzadas",
    leftIcon: <Code size={14} />,
  },
  {
    value: "mockup",
    label: "Turbo",
    description: "Velocidad máxima para desarrollar y editar código al instante",
    leftIcon: <Zap size={14} />,
  },
  {
    value: "plan",
    label: "Planificar",
    description: "Diseña un plan de acción antes de implementar",
    leftIcon: <Brain size={14} />,
  },
  {
    value: "ask",
    label: "Preguntar",
    description: "Consulta sobre tu código sin realizar cambios",
    leftIcon: <HelpCircle size={14} />,
  },
];

const REASONING_OPTIONS: SelectorOption[] = [
  {
    value: "low",
    label: "Bajo",
    description: "Razonamiento ligero. Para tareas simples y directas.",
  },
  {
    value: "medium",
    label: "Medio",
    description: "Equilibrio entre velocidad y profundidad. Recomendado.",
  },
  {
    value: "high",
    label: "Alto",
    description: "Análisis profundo. Para problemas complejos.",
  },
];

const BRANCH_OPTIONS: SelectorOption[] = [
  {
    value: "main",
    label: "main",
    leftIcon: <GitBranch size={12} className="opacity-80" />,
  },
  {
    value: "develop",
    label: "develop",
    leftIcon: <GitBranch size={12} className="opacity-80" />,
  },
  {
    value: "feature/unified-selectors",
    label: "feature/unified-selectors",
    leftIcon: <GitBranch size={12} className="opacity-80" />,
  },
  {
    value: "fix/layout-bug",
    label: "fix/layout-bug",
    leftIcon: <GitBranch size={12} className="opacity-80" />,
  },
];

const LANGUAGE_OPTIONS: SelectorOption[] = [
  { value: "es", label: "Español", description: "El agente responderá en español" },
  { value: "en", label: "English", description: "The agent will respond in English" },
];

const VERBOSITY_OPTIONS: SelectorOption[] = [
  { value: "low", label: "Conciso", description: "Respuestas breves y directas." },
  { value: "medium", label: "Equilibrado", description: "Explicaciones moderadas cuando son relevantes." },
  { value: "high", label: "Detallado", description: "Explicaciones completas y contexto adicional." },
];

const TURNS_OPTIONS: SelectorOption[] = [
  { value: "2", label: "Económico (2)", description: "Contexto mínimo" },
  { value: "3", label: "Por defecto (3)", description: "Equilibrado" },
  { value: "5", label: "Plus (5)", description: "Contexto extendido" },
  { value: "10", label: "Alto (10)", description: "Para conversaciones complejas" },
  { value: "100", label: "Máximo (100)", description: "No recomendado" },
];

const FRAMEWORK_OPTIONS: SelectorOption[] = [
  {
    value: "react",
    label: "React",
    description: "SPA con Vite y React",
    leftIcon: <span className="text-[#61DAFB] text-sm font-bold">⚛</span>,
  },
  {
    value: "next",
    label: "Next.js",
    description: "Full-stack con SSR",
    leftIcon: <span className="text-sm font-bold">▲</span>,
  },
  {
    value: "vue",
    label: "Vue",
    description: "Progressive framework",
    leftIcon: <span className="text-[#41B883] text-sm font-bold">V</span>,
  },
  {
    value: "astro",
    label: "Astro",
    description: "Content-focused sites",
    leftIcon: <span className="text-[#FF5D01] text-sm font-bold">🚀</span>,
  },
];

const GROUPED_OPTIONS: SelectorOption[] = [
  { value: "auto", label: "Auto Router", description: "Gestión automática", group: "special" },
  { value: "claude-sonnet-4", label: "Claude Sonnet 4", description: "200K context", group: "models" },
  { value: "gpt-4.1", label: "GPT 4.1", description: "128K context", group: "models" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "1M context", group: "models" },
];

const API_KEY_OPTIONS: SelectorOption[] = [
  {
    value: "key-1",
    label: "Personal",
    description: "sk-or-v1…58b7",
    rightIcon: (
      <button className="p-1 rounded-md text-muted-foreground/40 hover:!text-red-600 hover:!bg-red-100 dark:hover:!bg-red-900/20 transition-colors cursor-pointer">
        <Trash2 size={13} />
      </button>
    ),
  },
  {
    value: "key-2",
    label: "minube",
    description: "sk-or-v1…0dd9",
    rightIcon: (
      <button className="p-1 rounded-md text-muted-foreground/40 hover:!text-red-600 hover:!bg-red-100 dark:hover:!bg-red-900/20 transition-colors cursor-pointer">
        <Trash2 size={13} />
      </button>
    ),
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Section wrapper
 * ──────────────────────────────────────────────────────────────────────────── */

function DemoSection({
  title,
  subtitle,
  replicates,
  children,
}: {
  title: string;
  subtitle: string;
  replicates?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div>
        <h3 className="typo-subsection-title">{title}</h3>
        <p className="typo-caption mt-0.5">{subtitle}</p>
        {replicates && (
          <p className="mt-1 px-2 py-0.5 rounded-md bg-primary/10 inline-block typo-badge">
            Replica → {replicates}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </div>
  );
}

function DemoItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="typo-caption font-semibold uppercase tracking-wider">
        {label}
      </span>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────── */

export default function SelectorsPlayground() {
  const navigate = useNavigate();

  // Demo state
  const [model, setModel] = useState("claude-sonnet-4");
  const [chatMode, setChatMode] = useState("agent");
  const [reasoning, setReasoning] = useState("medium");
  const [branch, setBranch] = useState("main");
  const [language, setLanguage] = useState("es");
  const [verbosity, setVerbosity] = useState("low");
  const [turns, setTurns] = useState("3");
  const [framework, setFramework] = useState("react");
  const [grouped, setGrouped] = useState("claude-sonnet-4");
  const [apiKey, setApiKey] = useState("key-2");

  return (
    <div className="flex flex-col h-full w-full bg-muted/30 text-foreground overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-(--sidebar) border-b border-border">
        <div className="w-full mx-auto px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate({ to: "/settings" })}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="typo-page-title">
                Selector Playground
              </h1>
              <p className="typo-caption mt-0.5">
                Todos los selectores unificados — prueba cada variante antes de migrar
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full mx-auto px-8 pt-8 pb-24 space-y-8">

        {/* ── 1. Model Picker (with search) ────────────────────────────── */}
        <DemoSection
          title="Model Picker"
          subtitle="Selector con búsqueda, subtítulos (context size), iconos de acción (Info) a la derecha."
          replicates="ModelPicker.tsx"
        >
          <DemoItem label="Default (searchable)">
            <UnifiedSelector
              value={model}
              onChange={setModel}
              options={MODEL_OPTIONS}
              searchable
              searchPlaceholder="Buscar modelos…"
              popoverWidth="w-[320px]"
              triggerSize="sm"
              triggerVariant="default"
              side="bottom"
            />
          </DemoItem>

          <DemoItem label="Pill variant">
            <UnifiedSelector
              value={model}
              onChange={setModel}
              options={MODEL_OPTIONS}
              searchable
              searchPlaceholder="Buscar modelos…"
              popoverWidth="w-[320px]"
              triggerVariant="pill"
              triggerSize="md"
              triggerRightIcon={<ChevronDown size={14} className="opacity-70" />}
            />
          </DemoItem>
        </DemoSection>

        {/* ── 2. Chat Mode ─────────────────────────────────────────────── */}
        <DemoSection
          title="Chat Mode Selector"
          subtitle="Selector con subtítulos explicativos, sin búsqueda, con iconos a la izquierda."
          replicates="ChatModeSelector.tsx / DefaultChatModeSelector.tsx"
        >
          <DemoItem label="Compact (home bar)">
            <UnifiedSelector
              value={chatMode}
              onChange={setChatMode}
              options={CHAT_MODE_OPTIONS}
              triggerVariant="default"
              triggerSize="sm"
              popoverWidth="w-[280px]"
              triggerClassName={cn(
                chatMode !== "agent" && "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20",
              )}
            />
          </DemoItem>

          <DemoItem label="Settings pill">
            <UnifiedSelector
              value={chatMode}
              onChange={setChatMode}
              options={CHAT_MODE_OPTIONS}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[280px]"
              triggerRightIcon={<ChevronDown size={14} className="opacity-70" />}
            />
          </DemoItem>
        </DemoSection>

        {/* ── 3. Reasoning Effort ──────────────────────────────────────── */}
        <DemoSection
          title="Reasoning Effort Selector"
          subtitle="Selector con subtítulos, sin búsqueda. Variante compact con Popover y header."
          replicates="ReasoningEffortSelector.tsx"
        >
          <DemoItem label="Compact">
            <UnifiedSelector
              value={reasoning}
              onChange={setReasoning}
              options={REASONING_OPTIONS}
              triggerVariant="default"
              triggerSize="sm"
              popoverWidth="w-[220px]"
              showCheckmark
              header={
                <span className="typo-caption uppercase tracking-wider font-bold opacity-80">
                  Razonamiento
                </span>
              }
            />
          </DemoItem>

          <DemoItem label="Settings pill">
            <UnifiedSelector
              value={reasoning}
              onChange={setReasoning}
              options={REASONING_OPTIONS}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[280px]"
              triggerRightIcon={<ChevronDown size={14} className="opacity-70" />}
            />
          </DemoItem>
        </DemoSection>

        {/* ── 4. Branch Switcher ───────────────────────────────────────── */}
        <DemoSection
          title="Branch Switcher"
          subtitle="Selector compacto con icono izquierdo, checkmark en la opción seleccionada, layout compact sin subtítulos."
          replicates="BranchSwitcher.tsx / AgentBranchSelector.tsx"
        >
          <DemoItem label="Branch pill">
            <UnifiedSelector
              value={branch}
              onChange={setBranch}
              options={BRANCH_OPTIONS.map((o) => ({
                ...o,
                leftIcon:
                  o.value === branch ? (
                    <Check size={12} className="text-primary" />
                  ) : (
                    o.leftIcon
                  ),
              }))}
              triggerVariant="ghost"
              triggerSize="sm"
              triggerLeftIcon={<GitBranch size={12} />}
              triggerClassName="bg-primary/10 text-primary hover:bg-primary/20 rounded-md px-2"
              popoverWidth="w-[220px]"
              itemLayout="compact"
              showCheckmark={false}
              header={
                <span className="typo-caption uppercase tracking-wider font-bold opacity-80">
                  Cambiar de rama
                </span>
              }
              footer={
                <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm typo-badge transition-colors text-left hover:bg-muted cursor-pointer">
                  <span>+ Crear nueva rama…</span>
                </button>
              }
            />
          </DemoItem>
        </DemoSection>

        {/* ── 5. Language ──────────────────────────────────────────────── */}
        <DemoSection
          title="Language Selector"
          subtitle="Selector sencillo con subtítulo."
          replicates="ChatLanguageSelector.tsx"
        >
          <DemoItem label="Default">
            <UnifiedSelector
              value={language}
              onChange={setLanguage}
              options={LANGUAGE_OPTIONS}
              triggerVariant="default"
              triggerSize="md"
              popoverWidth="w-[240px]"
              triggerLeftIcon={<Globe size={14} />}
            />
          </DemoItem>

          <DemoItem label="Settings pill">
            <UnifiedSelector
              value={language}
              onChange={setLanguage}
              options={LANGUAGE_OPTIONS}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[240px]"
              triggerRightIcon={<ChevronDown size={14} className="opacity-70" />}
            />
          </DemoItem>
        </DemoSection>

        {/* ── 6. Text Verbosity ────────────────────────────────────────── */}
        <DemoSection
          title="Verbosity Selector"
          subtitle="Selector con pill settings, subtítulos en cada opción."
          replicates="TextVerbositySelector.tsx"
        >
          <DemoItem label="Settings pill">
            <UnifiedSelector
              value={verbosity}
              onChange={setVerbosity}
              options={VERBOSITY_OPTIONS}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[280px]"
              triggerRightIcon={<ChevronDown size={14} className="opacity-70" />}
            />
          </DemoItem>
        </DemoSection>

        {/* ── 7. Max Chat Turns ────────────────────────────────────────── */}
        <DemoSection
          title="Max Chat Turns"
          subtitle="Selector compacto sin subtítulo visible en la lista."
          replicates="MaxChatTurnsSelector.tsx"
        >
          <DemoItem label="Default">
            <UnifiedSelector
              value={turns}
              onChange={setTurns}
              options={TURNS_OPTIONS}
              triggerVariant="default"
              triggerSize="md"
              popoverWidth="w-[240px]"
            />
          </DemoItem>
        </DemoSection>

        {/* ── 8. Template / Framework ──────────────────────────────────── */}
        <DemoSection
          title="Template Picker"
          subtitle="Selector con iconos de framework a la izquierda y subtítulo debajo."
          replicates="TemplatePicker.tsx"
        >
          <DemoItem label="Compact (icon trigger)">
            <UnifiedSelector
              value={framework}
              onChange={setFramework}
              options={FRAMEWORK_OPTIONS}
              triggerVariant="minimal"
              triggerSize="sm"
              triggerRightIcon={null}
              triggerClassName="!px-1.5 min-h-[28px]"
              side="top"
              customTriggerLabel={
                <span className="flex items-center justify-center">
                  {FRAMEWORK_OPTIONS.find((o) => o.value === framework)?.leftIcon}
                </span>
              }
              popoverWidth="w-[240px]"
            />
          </DemoItem>

          <DemoItem label="Full (with label)">
            <UnifiedSelector
              value={framework}
              onChange={setFramework}
              options={FRAMEWORK_OPTIONS}
              triggerVariant="default"
              triggerSize="md"
              popoverWidth="w-[260px]"
            />
          </DemoItem>
        </DemoSection>

        {/* ── 9. Grouped example ───────────────────────────────────────── */}
        <DemoSection
          title="Grouped Items"
          subtitle="Ejemplo con opciones separadas en grupos con encabezados."
          replicates="Patrón genérico con secciones"
        >
          <DemoItem label="Searchable + groups">
            <UnifiedSelector
              value={grouped}
              onChange={setGrouped}
              options={GROUPED_OPTIONS}
              groups={[
                { id: "special", heading: "Especial" },
                { id: "models", heading: "Modelos" },
              ]}
              searchable
              searchPlaceholder="Buscar…"
              triggerVariant="default"
              triggerSize="md"
              popoverWidth="w-[300px]"
              showCheckmark
            />
          </DemoItem>
        </DemoSection>

        {/* ── 10. API Key Selector ─────────────────────────────────────── */}
        <DemoSection
          title="API Key Selector"
          subtitle="Selector pill con título + subtítulo (clave truncada), icono papelera a la derecha y footer para añadir."
          replicates="OpenRouterSettings.tsx (API keys dropdown)"
        >
          <DemoItem label="Pill (settings)">
            <UnifiedSelector
              value={apiKey}
              onChange={setApiKey}
              options={API_KEY_OPTIONS}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[280px]"
              triggerRightIcon={<ChevronDown size={14} className="opacity-70" />}
              footer={
                <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm typo-badge transition-colors text-left hover:bg-muted cursor-pointer">
                  <Plus size={14} />
                  <span>Añadir nueva…</span>
                </button>
              }
            />
          </DemoItem>
        </DemoSection>

        {/* ── State debug ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="typo-subsection-title mb-3">Estado actual</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[
              ["Modelo", model],
              ["Chat Mode", chatMode],
              ["Reasoning", reasoning],
              ["Branch", branch],
              ["Language", language],
              ["Verbosity", verbosity],
              ["Turns", turns],
              ["Framework", framework],
              ["Grouped", grouped],
              ["API Key", apiKey],
            ].map(([k, v]) => (
              <div key={k} className="bg-muted/50 rounded-lg px-3 py-2">
                <span className="typo-caption font-semibold block">{k}</span>
                <span className="typo-mono-xs text-primary">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
