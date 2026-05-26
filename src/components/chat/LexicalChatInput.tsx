import React, { useCallback, useEffect, useState } from "react";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  EditorState,
  KEY_ENTER_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isLineBreakNode,
  $isElementNode,
  type LexicalNode,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
  BeautifulMentionsPlugin,
  BeautifulMentionNode,
  $createBeautifulMentionNode,
  type BeautifulMentionsTheme,
  type BeautifulMentionsMenuItemProps,
} from "lexical-beautiful-mentions";
import { usePrompts } from "@/hooks/usePrompts";
import { forwardRef } from "react";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { MENTION_REGEX } from "@/shared/parse_mention_apps";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useCustomAgents } from "@/hooks/useCustomAgents";
import { useChatArtifacts } from "@/hooks/useChatArtifacts";
import { FileText, Database, Code, Search } from "@/components/ui/icons";

// Define the theme for mentions
const beautifulMentionsTheme: BeautifulMentionsTheme = {
  "@": "px-2 py-0.5 mx-0.5 bg-accent text-accent-foreground rounded-md cursor-text",
  "@Focused": "outline-none ring-2 ring-ring cursor-text",
  "/": "px-2 py-0.5 mx-0.5 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 font-semibold rounded-md cursor-text",
  "/Focused": "outline-none ring-2 ring-emerald-500 cursor-text",
};

// Custom menu item component
const CustomMenuItem = forwardRef<
  HTMLLIElement,
  BeautifulMentionsMenuItemProps
>(({ selected, item, ...props }, ref) => {
  const isPrompt = item.data?.type === "prompt";
  const isApp = item.data?.type === "app";
  const isSlash = item.data?.type === "slash-command";
  const isArtifact = item.data?.type === "artifact";
  const label = isPrompt ? "Prompt" : isApp ? "App" : isSlash ? "Comando" : isArtifact ? "Plan/Artifact" : "Archivo";
  const value = (item as any)?.value;

  return (
    <li
      className={`relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }`}
      {...props}
      ref={ref}
    >
      <div className="flex items-center gap-2 w-full overflow-hidden">
        {isArtifact ? (
          <FileText size={14} className="text-primary shrink-0" />
        ) : isPrompt ? (
          <Database size={14} className="text-purple-500 shrink-0" />
        ) : isApp ? (
          <Database size={14} className="text-blue-500 shrink-0" />
        ) : isSlash ? (
          <Code size={14} className="text-emerald-500 shrink-0" />
        ) : (
          <FileText size={14} className="text-zinc-500 shrink-0" />
        )}
        <span className="truncate flex-1 font-semibold">
          {value}
          {item.data?.description && (
            <span className="text-muted-foreground font-normal text-xs ml-1.5 opacity-80">
              — {item.data.description}
            </span>
          )}
        </span>
        <span className={`text-[10px] tracking-wider text-muted-foreground/50 shrink-0 ml-2 ${isSlash ? "lowercase" : "uppercase"}`}>
          {isSlash ? `/${value}` : label}
        </span>
      </div>
    </li>
  );
});

// Custom menu component (Styled like shadcn Command menu)
function CustomMenu({ loading: _loading, ...props }: any) {
  return (
    <div
      className="z-50 min-w-[300px] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: "8px",
      }}
      data-mentions-menu="true"
    >
      <div
        className="flex items-center border-b border-border px-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <span className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-none text-muted-foreground opacity-70">
          Escribe para buscar...
        </span>
      </div>
      <ul
        className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1"
        {...props}
      />
    </div>
  );
}

// Helper to get all leaf nodes of a node recursively
function getLeafNodes(node: LexicalNode): LexicalNode[] {
  if ($isElementNode(node)) {
    const children = node.getChildren();
    return children.flatMap(getLeafNodes);
  }
  return [node];
}

// Plugin to handle keyboard shortcuts
function KeyboardHandlersPlugin({
  onSubmit,
  disableSendButton,
}: {
  onSubmit: () => void;
  disableSendButton: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent) => {
        // Check if mentions menu is open by looking for our custom menu element
        const mentionsMenu = document.querySelector(
          '[data-mentions-menu="true"]',
        );
        const hasVisibleItems =
          mentionsMenu && mentionsMenu.children.length > 0;

        if (hasVisibleItems) {
          // If mentions menu is open with items, let the mentions plugin handle the Enter key
          return false;
        }

        // Support Ctrl+Enter (or Cmd+Enter) for line break
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          return true;
        }

        if (!event.shiftKey && !disableSendButton) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH, // Use higher priority to catch before mentions plugin
    );

    const unregisterArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const mentionsMenu = document.querySelector(
          '[data-mentions-menu="true"]',
        );
        const hasVisibleItems =
          mentionsMenu && mentionsMenu.children.length > 0;

        if (hasVisibleItems) {
          return false;
        }

        let isLastLine = false;
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();
            const root = $getRoot();
            const leaves = getLeafNodes(root);

            let cursorOffset = 0;
            for (const leaf of leaves) {
              if (leaf.getKey() === anchorNode.getKey()) {
                cursorOffset += anchor.offset;
                break;
              }
              if ($isLineBreakNode(leaf)) {
                cursorOffset += 1;
              } else {
                cursorOffset += leaf.getTextContent().length;
              }
            }

            const textContent = root.getTextContent();
            const textAfter = textContent.slice(cursorOffset);
            isLastLine = !textAfter.includes("\n");
          }
        });

        if (isLastLine) {
          event.preventDefault();
          editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterEnter();
      unregisterArrowDown();
    };
  }, [editor, onSubmit, disableSendButton]);

  return null;
}

// Plugin to clear editor content
function ClearEditorPlugin({
  shouldClear,
  onCleared,
}: {
  shouldClear: boolean;
  onCleared: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (shouldClear) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        paragraph.select();
      });
      onCleared();
    }
  }, [editor, shouldClear, onCleared]);

  return null;
}

// Plugin to sync external value prop into the editor
function ExternalValueSyncPlugin({
  value,
  promptsById,
  customAgents,
}: {
  value: string;
  promptsById: Record<number, string>;
  customAgents?: any[];
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Derive the display text that should appear in the editor (@Name) from the
    // internal value representation (@app:Name)
    let displayText = (value || "").replace(MENTION_REGEX, "@$1");
    displayText = displayText.replace(/@prompt:(\d+)/g, (_m, idStr) => {
      const id = Number(idStr);
      const title = promptsById[id];
      return title ? `@${title}` : _m;
    });

    const currentText = editor.getEditorState().read(() => {
      const root = $getRoot();
      return root.getTextContent();
    });

    // If the editor already reflects the same display text, do nothing to avoid loops
    if (currentText === displayText) return;
    editor.update(() => {
      const root = $getRoot();
      root.clear();

      const paragraph = $createParagraphNode();

      // Build nodes from internal value, turning @app:Name and @prompt:<id> into mention nodes
      let lastIndex = 0;
      
      // Parse slash command at the very start if present
      const knownSlashCommands = [
        "agent", "build", "plan", "ask", "explore",
        ...(customAgents || []).map((a) => a.slashCommand),
      ];
      for (const cmd of knownSlashCommands) {
        if (value.startsWith(`/${cmd} `) || value === `/${cmd}`) {
          paragraph.append($createBeautifulMentionNode("/", cmd));
          lastIndex = cmd.length + 1; // length of "/" + cmd
          if (value.startsWith(`/${cmd} `)) {
            lastIndex += 1; // plus space
          }
          break;
        }
      }

      let match: RegExpExecArray | null;
      const combined = /@app:([a-zA-Z0-9_-]+)|@prompt:(\d+)|@file:([^\s]+)/g;
      while ((match = combined.exec(value)) !== null) {
        const start = match.index;
        const full = match[0];
        // Ensure we don't grab text before the match that was already consumed by slash command
        if (start > lastIndex) {
          const textBefore = value.slice(lastIndex, start);
          if (textBefore) paragraph.append($createTextNode(textBefore));
        }
        if (match[1]) {
          const appName = match[1];
          paragraph.append($createBeautifulMentionNode("@", appName));
        } else if (match[2]) {
          const id = Number(match[2]);
          const title = promptsById[id] || `prompt:${id}`;
          paragraph.append($createBeautifulMentionNode("@", title));
        } else if (match[3]) {
          const filePath = match[3];
          paragraph.append($createBeautifulMentionNode("@", filePath));
        }
        lastIndex = Math.max(lastIndex, start + full.length);
      }
      if (lastIndex < value.length) {
        const trailing = value.slice(lastIndex);
        if (trailing) paragraph.append($createTextNode(trailing));
      }

      if (value && paragraph.getTextContent() === "") {
        paragraph.append($createTextNode(value));
      }

      root.append(paragraph);
      paragraph.selectEnd();
    });
  }, [editor, value, promptsById, customAgents]);

  return null;
}

interface LexicalChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeCurrentApp: boolean;
  disableSendButton: boolean;
  /** When true, start with 1-line height (max 8 lines) for a more compact appearance */
  compact?: boolean;
}

function onError(error: Error) {
  console.error(error);
}

export function LexicalChatInput({
  value,
  onChange,
  onSubmit,
  onPaste,
  excludeCurrentApp,
  placeholder = "Pídele a vibes que haga...",
  disabled = false,
  disableSendButton,
  compact = false,
}: LexicalChatInputProps) {
  const { prompts } = usePrompts();
  const [shouldClear, setShouldClear] = useState(false);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const { app } = useLoadApp(selectedAppId);
  const { artifacts } = useChatArtifacts(selectedChatId);
  const appFiles = app?.files;
  const { customAgents } = useCustomAgents();

  // Prepare mention items
  const mentionItems = React.useMemo(() => {
    // 1. Artifacts first
    const artifactItems = (artifacts || []).map((a) => ({
      value: a.path,
      type: "artifact",
    }));

    // 2. Regular files (excluding .vibes/ since they are artifacts)
    const fileItems = (appFiles || [])
      .filter((f) => !f.startsWith(".vibes/"))
      .map((item) => ({
        value: item,
        type: "file",
      }));

    // 3. Prompts
    const promptItems = (prompts || []).map((p) => ({
      value: p.title,
      type: "prompt",
      id: p.id,
    }));

    const nativeSlashCommands = [
      { value: "agent", type: "slash-command", description: "Agente de desarrollo estándar (Build)" },
      { value: "build", type: "slash-command", description: "Agente de desarrollo estándar (Build)" },
      { value: "plan", type: "slash-command", description: "Planificador interactivo" },
      { value: "ask", type: "slash-command", description: "Explorador de código (solo lectura)" },
      { value: "explore", type: "slash-command", description: "Explorador de código (solo lectura)" },
    ];

    const customSlashCommands = (customAgents || []).map((agent) => ({
      value: agent.slashCommand,
      type: "slash-command",
      description: agent.description || "",
    }));

    return {
      "@": [...artifactItems, ...fileItems, ...promptItems],
      "/": [...nativeSlashCommands, ...customSlashCommands],
    };
  }, [artifacts, appFiles, prompts, customAgents]);

  const initialConfig = {
    namespace: "ChatInput",
    theme: {
      beautifulMentions: beautifulMentionsTheme,
    },
    onError,
    nodes: [BeautifulMentionNode],
    editable: !disabled,
  };

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const root = $getRoot();
        let textContent = root.getTextContent();

        // Strip zero-width characters injected by Beautiful Mentions around mention nodes.
        // These invisible chars break slash command detection on the backend.
        textContent = textContent.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

        // If the text starts with a slash command but is immediately followed by text (no space),
        // we inject a space so the backend can parse it correctly (e.g. "/plancuando" -> "/plan cuando").
        const knownSlashCommands = [
          "agent", "build", "plan", "ask", "explore",
          ...(customAgents || []).map((a) => a.slashCommand),
        ];
        for (const cmd of knownSlashCommands) {
          if (
            textContent.startsWith(`/${cmd}`) &&
            textContent.length > `/${cmd}`.length &&
            !textContent.startsWith(`/${cmd} `)
          ) {
            textContent = `/${cmd} ` + textContent.slice(`/${cmd}`.length);
            break; // Only match the first (valid) command
          }
        }

        // Check if user has selected or typed a custom agent command, and append its default prompt
        for (const agent of customAgents || []) {
          const cmd = `/${agent.slashCommand}`;
          if ((textContent === cmd || textContent === `${cmd} `) && agent.prompt) {
            textContent = `${cmd} ${agent.prompt}`;
            break;
          }
        }

        // Transform @AppName mentions to @app:AppName format
        // This regex matches @AppName where AppName is one of our actual app names

        // Short-circuit if there's no "@" symbol in the text
        if (textContent.includes("@")) {
          // Convert @PromptTitle to @prompt:<id>
          const map = new Map((prompts || []).map((p) => [p.title, p.id]));
          for (const [title, id] of map.entries()) {
            const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`@(${escapedTitle})(?![\\w-])`, "g");
            textContent = textContent.replace(regex, `@prompt:${id}`);
          }

          for (const fullPath of appFiles || []) {
            const escapedDisplay = fullPath.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&",
            );
            const fileRegex = new RegExp(`@(${escapedDisplay})(?![\\w-])`, "g");
            textContent = textContent.replace(fileRegex, `@file:${fullPath}`);
          }
        }
        onChange(textContent);
      });
    },
    [onChange, prompts, appFiles, customAgents],
  );

  const handleSubmit = useCallback(() => {
    onSubmit();
    setShouldClear(true);
  }, [onSubmit]);

  const handleCleared = useCallback(() => {
    setShouldClear(false);
  }, []);

  // Update editor content when value changes externally (like clearing)
  useEffect(() => {
    if (value === "") {
      setShouldClear(true);
    }
  }, [value]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative flex-1 cursor-text">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className={`flex-1 p-4 focus:outline-none overflow-y-auto resize-none cursor-text ${
                compact
                  ? "min-h-[38px] max-h-[192px]"
                  : "min-h-[96px] max-h-[216px]"
              }`}
              aria-placeholder={placeholder}
              placeholder={
                <div className="absolute top-4 left-4 typo-body text-muted-foreground pointer-events-none select-none">
                  {placeholder}
                </div>
              }
              onPaste={onPaste}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <BeautifulMentionsPlugin
          items={mentionItems}
          menuComponent={CustomMenu}
          menuItemComponent={CustomMenuItem}
          creatable={false}
          insertOnBlur={false}
          menuItemLimit={10}
          autoSpace={true}
        />
        <OnChangePlugin onChange={handleEditorChange} />
        <HistoryPlugin />
        <KeyboardHandlersPlugin
          onSubmit={handleSubmit}
          disableSendButton={disableSendButton}
        />
        <ExternalValueSyncPlugin
          value={value}
          promptsById={Object.fromEntries(
            (prompts || []).map((p) => [p.id, p.title]),
          )}
          customAgents={customAgents}
        />
        <ClearEditorPlugin
          shouldClear={shouldClear}
          onCleared={handleCleared}
        />
      </div>
    </LexicalComposer>
  );
}
