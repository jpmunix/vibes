import React, { useEffect, useState, useRef, useCallback } from "react";
import { ipc } from "@/ipc/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AiStrategistAssistant } from "./AiStrategistAssistant";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  Loader2,
  Check,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
} from "@/components/ui/icons";
import { toast } from "sonner";
import type { PromptDto, PromptCategoryDto } from "@/ipc/types";
import { SYSTEM_PROMPT_GROUPS } from "@/prompts/index";
import {
  getPromptEditorLock,
  isAgentCorePrompt,
} from "./prompt_guard";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type TFunc = (key: string, params?: Record<string, string | number>) => string;

/**
 * i18n: resuelve el nombre visible de una categoría. Las del sistema llevan
 * nameKey (clave de traducción); se traduce con t() y se cae al texto libre
 * de la DB si la clave no existe (o si es categoría de usuario, nameKey null).
 */
function resolveCategoryName(c: PromptCategoryDto, t: TFunc): string {
  if (c.nameKey) {
    const key = `prompts.categories.${c.nameKey}`;
    const translated = t(key);
    return translated === key ? c.name : translated;
  }
  return c.name;
}

function PromptEditor({
  prompt,
  categories,
  onUpdate,
  onDelete,
}: {
  prompt: PromptDto;
  categories: PromptCategoryDto[];
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [localTitle, setLocalTitle] = useState(prompt.title);
  const [localDesc, setLocalDesc] = useState(prompt.description || "");
  const [localContent, setLocalContent] = useState(prompt.content);
  const [localCategoryId, setLocalCategoryId] = useState<number | null>(
    prompt.categoryId ?? null,
  );
  const [localScope, setLocalScope] = useState<string>(prompt.scope || "all");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Card #195+: los prompts del sistema siempre están activos — sin switches
  // ni candados. La enabled flag existe en la DB por compat pero se fuerza a 1.

  // Card #183: para el prompt del sistema solo se deja editar el contenido;
  // los demás campos (categoría, scope, título, descripción, Generar con IA)
  // quedan ocultos o en solo lectura.
  const editorLock = getPromptEditorLock(prompt.systemId);

  // i18n: los prompts del sistema tienen label/desc en DB en el idioma con el
  // que se crearon (español). Si el systemId tiene key de traducción, resolver
  // el texto visible con t(); fallback al valor que trae el handler.
  const getSystemLabel = (): string => {
    if (!prompt.systemId) return prompt.title;
    const key = `prompts.system.labels.${prompt.systemId}`;
    const translated = t(key);
    return translated === key ? prompt.title : translated;
  };

  const getSystemDesc = (): string | null => {
    const fallback = prompt.description;
    if (!prompt.systemId) return fallback;
    const key = `prompts.system.descs.${prompt.systemId}`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  // i18n: las categorías del sistema llevan nameKey. Traducir el nombre
  // visible para dropdowns y botones; las de usuario usan su texto libre.
  const getCategoryDisplayName = (c: PromptCategoryDto): string =>
    resolveCategoryName(c, t);

  // Title/Description en el diálogo: si son readonly (prompt del sistema),
  // mostrar el valor traducido — no el crudo de la DB. En el resto, el
  // valor editable del usuario (localTitle/localDesc).
  const displayTitle = editorLock.titleReadonly ? getSystemLabel() : localTitle;
  const displayDesc = editorLock.descriptionReadonly
    ? (getSystemDesc() ?? "")
    : localDesc;

  const hasUnsavedChanges =
    localTitle !== prompt.title ||
    localDesc !== (prompt.description || "") ||
    localContent !== prompt.content ||
    localCategoryId !== prompt.categoryId ||
    localScope !== (prompt.scope || "all");

  const activeScopes =
    localScope === "all"
      ? new Set<string>()
      : new Set(localScope.split(",").filter(Boolean));

  const handleToggleScope = (scopeKey: string) => {
    if (scopeKey === "all") {
      setLocalScope("all");
      return;
    }

    const next = new Set(activeScopes);
    if (next.has(scopeKey)) {
      next.delete(scopeKey);
    } else {
      next.add(scopeKey);
    }

    if (next.size === 0 || next.size === 3) {
      setLocalScope("all");
    } else {
      setLocalScope(Array.from(next).join(","));
    }
  };

  const getScopeLabel = (scopeStr: string) => {
    if (scopeStr === "all") return t("prompts.scope.all");
    const parts = scopeStr.split(",").filter(Boolean);
    const labels: string[] = [];
    if (parts.includes("agent")) labels.push(t("prompts.scope.agent"));
    if (parts.includes("plan")) labels.push(t("prompts.scope.plan"));
    if (parts.includes("ask")) labels.push(t("prompts.scope.ask"));
    return labels.join(", ");
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [localContent, isOpen]);

  const handleSave = async () => {
    if (!localCategoryId) {
      toast.error(t("prompts.needCategory"));
      return;
    }
    setIsSaving(true);
    try {
      if (prompt.id !== null) {
        // Override existente: actualizar fila — siempre habilitado (sin switches).
        await ipc.prompt.update({
          id: prompt.id,
          title: localTitle,
          description: localDesc,
          content: localContent,
          enabled: true,
          categoryId: localCategoryId,
          scope: localScope,
        });
      } else {
        // id === null: prompt del sistema sin override. Crear fila con systemId
        // (la crea el handler de forma idempotente: si ya existe la actualiza).
        await ipc.prompt.create({
          title: localTitle,
          description: localDesc,
          content: localContent,
          categoryId: localCategoryId,
          systemId: prompt.systemId ?? undefined,
          enabled: true,
          scope: localScope,
        });
      }
      toast.success(`Prompt guardado`);
      onUpdate();
    } catch {
      toast.error(t("prompts.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    // Solo se llama desde la UI para prompts custom (no-system). En ese caso
    // prompt.id siempre existe. Guard explícito para que TS narrowee.
    if (prompt.id === null) return;
    setIsDeleting(true);
    try {
      await ipc.prompt.delete(prompt.id);
      toast.success(t("prompts.deleted"));
      onDelete();
    } catch {
      toast.error(t("prompts.deleteError"));
      setIsDeleting(false);
    }
  };

  const handleRestoreDefault = async () => {
    if (!prompt.systemId) return;
    // Si no hay override (id === null), el prompt ya está en su valor de fábrica.
    if (prompt.id === null) return;
    setIsRestoring(true);
    try {
      await ipc.prompt.restoreDefault({
        id: prompt.id,
        systemId: prompt.systemId,
      });
      toast.success(t("prompts.restored"));
      onUpdate();
    } catch {
      toast.error(t("prompts.restoreError"));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex-1 flex items-center gap-3">
          <div>
            <h3 className="typo-label flex items-center gap-2 text-sm font-medium">
              {getSystemLabel()}
              {prompt.hasDefault && prompt.isModified && (
                <span
                  className="inline-flex items-center gap-1.5 typo-micro px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20"
                  title={t("prompts.modifiedNote")}
                >
                  <span className="inline-block size-1.5 rounded-full bg-primary" />
                  {t("prompts.modified")}
                </span>
              )}
            </h3>
            <p className="typo-caption mt-1 text-xs text-muted-foreground">
              {getSystemDesc()}
            </p>
          </div>
        </div>
        {prompt.hasDefault && prompt.isModified && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg h-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              handleRestoreDefault();
            }}
            disabled={isRestoring}
            title={t("prompts.restoreTitle")}
          >
            {isRestoring ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {t("prompts.restoreDefaults")}
          </Button>
        )}
        <ChevronRight className="size-5 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[975px] max-h-[85vh] flex flex-col p-6 rounded-2xl shadow-2xl bg-popover border border-border">
          <DialogHeader className="pb-4 border-b border-border/50">
            <DialogTitle className="text-base font-bold text-foreground">
              {t("prompts.editPrompt")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 custom-scrollbar">
            <div className="grid grid-cols-3 gap-4">
              <div
                className={cn(
                  "space-y-1.5",
                  editorLock.hideCategory && editorLock.hideScope && "col-span-3",
                )}
              >
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("prompts.title")}
                </label>
                <Input
                  value={displayTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  placeholder={t("prompts.promptTitlePlaceholder")}
                  readOnly={editorLock.titleReadonly}
                  disabled={editorLock.titleReadonly}
                  className={cn(
                    "h-9 rounded-lg",
                    editorLock.titleReadonly && "cursor-not-allowed",
                  )}
                />
              </div>

              {!editorLock.hideCategory && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("prompts.categoryLabel")}
                  </label>
                  <Select
                    value={localCategoryId ? String(localCategoryId) : undefined}
                    onValueChange={(val) => setLocalCategoryId(Number(val))}
                  >
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue placeholder={t("prompts.selectCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {getCategoryDisplayName(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!editorLock.hideScope && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("prompts.scope.label")}
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-9 rounded-lg justify-between font-normal bg-background px-3 border-border hover:bg-background/80"
                      >
                        <span className="truncate">
                          {getScopeLabel(localScope)}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="start">
                      <DropdownMenuCheckboxItem
                        checked={localScope === "all"}
                        onCheckedChange={() => handleToggleScope("all")}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {t("prompts.scope.all")}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem
                        checked={
                          localScope !== "all" && activeScopes.has("agent")
                        }
                        onCheckedChange={() => handleToggleScope("agent")}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {t("prompts.scope.agent")}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={
                          localScope !== "all" && activeScopes.has("plan")
                        }
                        onCheckedChange={() => handleToggleScope("plan")}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {t("prompts.scope.plan")}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={
                          localScope !== "all" && activeScopes.has("ask")
                        }
                        onCheckedChange={() => handleToggleScope("ask")}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {t("prompts.scope.ask")}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t("prompts.descriptionLabel")}
              </label>
              <Input
                value={displayDesc}
                onChange={(e) => setLocalDesc(e.target.value)}
                placeholder={t("prompts.descriptionOptional")}
                readOnly={editorLock.descriptionReadonly}
                disabled={editorLock.descriptionReadonly}
                className={cn(
                  "h-9 rounded-lg",
                  editorLock.descriptionReadonly && "cursor-not-allowed",
                )}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("prompts.content")}
                </label>
                {!editorLock.hideAiGenerate && (
                  <AiStrategistAssistant
                    type="prompt"
                    currentContent={localContent}
                    onAccept={setLocalContent}
                  />
                )}
              </div>

              <div className="rounded-xl border border-border overflow-hidden bg-muted/10 focus-within:ring-2 focus-within:ring-primary/30 transition-all duration-200">
                <textarea
                  className="w-full min-h-[380px] p-4 typo-mono-xs leading-relaxed resize-y border-0 bg-transparent focus:outline-none custom-scrollbar"
                  spellCheck={false}
                  value={localContent}
                  onChange={(e) => setLocalContent(e.target.value)}
                />
              </div>

              {isAgentCorePrompt(prompt.systemId) && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5 px-1">
                  <span aria-hidden="true">ℹ️</span>
                  {t("prompts.verbosityNotice")}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/50 flex flex-row justify-between sm:justify-between items-center gap-2 w-full">
            {prompt.hasDefault ? (
              <div className="flex items-center gap-2 typo-caption text-muted-foreground">
                {t("prompts.noDelete")}
              </div>
            ) : (
              <DeleteConfirmationDialog
                itemName={prompt.title || "prompt"}
                itemType="prompt"
                onDelete={async () => {
                  await handleDelete();
                  setIsOpen(false);
                }}
                isDeleting={isDeleting}
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg h-9"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("prompts.delete")}
                  </Button>
                }
              />
            )}

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg h-9"
                onClick={() => {
                  setLocalTitle(prompt.title);
                  setLocalDesc(prompt.description || "");
                  setLocalContent(prompt.content);
                  setLocalCategoryId(prompt.categoryId ?? null);
                  setLocalScope(prompt.scope || "all");
                  setIsOpen(false);
                }}
              >
                {t("prompts.cancel")}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 rounded-lg h-9 font-medium"
                onClick={async () => {
                  await handleSave();
                  setIsOpen(false);
                }}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {t("prompts.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PromptGroup({
  category,
  prompts,
  categories,
  onRefresh,
}: {
  category: PromptCategoryDto | null;
  prompts: PromptDto[];
  categories: PromptCategoryDto[];
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editCategoryName, setEditCategoryName] = useState(
    category?.name || "",
  );
  const [editCategoryDesc, setEditCategoryDesc] = useState(
    category?.description || "",
  );

  const handleCreatePrompt = async () => {
    if (!newPromptTitle.trim()) return;
    try {
      await ipc.prompt.create({
        title: newPromptTitle,
        description: "",
        content: t("prompts.writePrompt"),
        categoryId: category?.id,
      });
      setNewPromptTitle("");
      setIsCreatingPrompt(false);
      onRefresh();
    } catch {
      toast.error(t("prompts.createError"));
    }
  };

  const handleDeleteCategory = async () => {
    if (!category) return;
    try {
      await ipc.prompt.deleteCategory(category.id);
      toast.success(t("prompts.categoryDeleted"));
      onRefresh();
    } catch {
      toast.error(t("prompts.categoryDeleteError"));
    }
  };

  const handleUpdateCategory = async () => {
    if (!category) return;
    if (!editCategoryName.trim()) return;
    try {
      await ipc.prompt.updateCategory({
        id: category.id,
        name: editCategoryName,
        description: editCategoryDesc,
      });
      toast.success(t("prompts.categoryUpdated"));
      setIsEditingCategory(false);
      onRefresh();
    } catch {
      toast.error(t("prompts.categoryUpdateError"));
    }
  };

  // i18n: las categorías del sistema llevan nameKey (clave de traducción).
  // El nombre/descripción visibles se resuelven con t(); las de usuario
  // usan su texto libre de la DB.
  const getCategoryName = (): string => {
    if (!category) return t("prompts.noCategory");
    return resolveCategoryName(category, t);
  };

  const getCategoryDesc = (): string | null => {
    if (!category) return null;
    if (category.nameKey) {
      const key = `prompts.categories.${category.nameKey}Desc`;
      const translated = t(key);
      return translated === key ? category.description : translated;
    }
    return category.description;
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between cursor-pointer group p-4 rounded-xl border transition-colors gap-4 bg-muted/20",
          category?.isSystem
            ? "border-border hover:bg-muted/50"
            : "border-border hover:bg-muted/50",
        )}
        onClick={() => !isEditingCategory && setExpanded((e) => !e)}
      >
        <div className="flex-1">
          {isEditingCategory && category ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <Input
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                placeholder={t("prompts.categoryNamePlaceholder")}
                className="h-8"
              />
              <Input
                value={editCategoryDesc}
                onChange={(e) => setEditCategoryDesc(e.target.value)}
                placeholder={t("prompts.descriptionOptional")}
                className="h-8"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpdateCategory}>
                  {t("prompts.save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditCategoryName(category.name);
                    setEditCategoryDesc(category.description || "");
                    setIsEditingCategory(false);
                  }}
                >
                  {t("prompts.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="typo-label flex items-center gap-2">
                {getCategoryName()}
                <span className="text-muted-foreground typo-caption">
                  ({prompts.length})
                </span>
              </h3>
              {getCategoryDesc() && (
                <p className="typo-caption mt-1">{getCategoryDesc()}</p>
              )}
            </>
          )}
        </div>
        {!isEditingCategory && (
          <div className="flex items-center gap-2">
            {category && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingCategory(true);
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <div onClick={(e) => e.stopPropagation()}>
                  {category.isSystem ? null : (
                    <DeleteConfirmationDialog
                      itemName={category.name}
                      itemType={t("prompts.categoryType")}
                      onDelete={handleDeleteCategory}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      }
                    />
                  )}
                </div>
              </>
            )}
            <ChevronRight
              className={cn(
                "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                expanded && "rotate-90",
              )}
            />
          </div>
        )}
      </div>

      {expanded && (
        <div className="pl-4 space-y-2">
          {prompts.map((p) => (
            <PromptEditor
              key={p.id ?? `default-${p.systemId}`}
              prompt={p}
              categories={categories}
              onUpdate={onRefresh}
              onDelete={onRefresh}
            />
          ))}

          {category ? (
            isCreatingPrompt ? (
              <div className="flex gap-2 p-2 bg-muted/20 rounded-xl border border-border mt-2">
                <Input
                  autoFocus
                  placeholder={t("prompts.newPromptPlaceholder")}
                  value={newPromptTitle}
                  onChange={(e) => setNewPromptTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreatePrompt();
                    if (e.key === "Escape") setIsCreatingPrompt(false);
                  }}
                  className="h-8"
                />
                <Button size="sm" onClick={handleCreatePrompt}>
                  {t("prompts.create")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsCreatingPrompt(false)}
                >
                  {t("prompts.cancel")}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 border-dashed gap-2"
                onClick={() => setIsCreatingPrompt(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("prompts.newIn", { category: getCategoryName() })}
              </Button>
            )
          ) : null}
        </div>
      )}
    </>
  );
}

/**
 * Card #195: sección "Prompts del sistema" a 2 niveles.
 *
 * Nivel 1: "Prompts del sistema" (colapsable).
 * Nivel 2: sub-grupos definidos en SYSTEM_PROMPT_GROUPS (código): Core,
 * Títulos y nombres, Git, Sistema de memoria, Procesamiento de imágenes.
 *
 * La clasificación NO usa categoryId: usa `groupKey` (metadato de código que
 * el handler `list` expone en el DTO). Los prompts de sistema NO se muestran
 * bajo categorías de usuario.
 */
function SystemPromptsGroup({
  prompts,
  categories,
  onRefresh,
}: {
  prompts: PromptDto[];
  categories: PromptCategoryDto[];
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  // Sub-grupos en el orden de SYSTEM_PROMPT_GROUPS (metadato de código).
  const groups = SYSTEM_PROMPT_GROUPS.map((g) => ({
    groupKey: g.groupKey,
    prompts: g.promptIds
      .map((id) => prompts.find((p) => p.systemId === id))
      .filter((p): p is PromptDto => Boolean(p)),
  })).filter((g) => g.prompts.length > 0);

  // Fallback defensivo: systemIds sin grupo (no debería ocurrir — el test de
  // regla de oro en prompts/index.test.ts lo impide). Se muestran al final
  // para que no desaparezcan.
  const knownIds = new Set(SYSTEM_PROMPT_GROUPS.flatMap((g) => g.promptIds));
  const ungrouped = prompts.filter((p) => p.systemId && !knownIds.has(p.systemId as never));

  return (
    <div>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border transition-colors gap-4 bg-muted/20 hover:bg-muted/50"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label flex items-center gap-2">
            {t("prompts.categories.systemPrompts")}
            <span className="text-muted-foreground typo-caption">
              ({prompts.length})
            </span>
          </h3>
          <p className="typo-caption mt-1">{t("prompts.categories.systemPromptsDesc")}</p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {expanded && (
        <div className="pl-4 space-y-4">
          {groups.map((g) => (
            <div key={g.groupKey}>
              <h4 className="typo-micro font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-1">
                {t(`prompts.groups.${g.groupKey}`)}
              </h4>
              <div className="space-y-2">
                {g.prompts.map((p) => (
                  <PromptEditor
                    key={p.id ?? `default-${p.systemId}`}
                    prompt={p}
                    categories={categories}
                    onUpdate={onRefresh}
                    onDelete={onRefresh}
                  />
                ))}
              </div>
            </div>
          ))}
          {ungrouped.length > 0 && (
            <div className="space-y-2">
              {ungrouped.map((p) => (
                <PromptEditor
                  key={p.id ?? `default-${p.systemId}`}
                  prompt={p}
                  categories={categories}
                  onUpdate={onRefresh}
                  onDelete={onRefresh}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PromptsSection({ refreshKey }: { refreshKey?: number }) {
  const { t } = useI18n();
  const [categories, setCategories] = useState<PromptCategoryDto[]>([]);
  const [prompts, setPrompts] = useState<PromptDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [cats, prmpts] = await Promise.all([
        ipc.prompt.listCategories(),
        ipc.prompt.list(),
      ]);
      setCategories(cats);
      setPrompts(prmpts);
    } catch {
      toast.error(t("prompts.loadError"));
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // refreshKey prop: bump this from the parent to force a reload (e.g. after
  // the parent creates a category from the header button).
  useEffect(() => {
    if (refreshKey && refreshKey > 0) fetchData();
  }, [refreshKey, fetchData]);

  if (loading) {
    return (
      <div className="text-center text-sm text-muted-foreground py-4">
        {t("prompts.loading")}
      </div>
    );
  }

  // Card #195: dos mundos. Los prompts de sistema (con systemId) se rinden
  // por grupo (groupKey, metadato de código) bajo "Prompts del sistema".
  // Las categorías de usuario (isSystem=0) solo agrupan prompts custom.
  const systemPrompts = prompts.filter((p) => p.systemId);
  const customPrompts = prompts.filter((p) => !p.systemId);

  // Categorías de usuario (no system), por id.
  const userCategories = [...categories]
    .filter((c) => !c.isSystem)
    .sort((a, b) => a.id - b.id);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {systemPrompts.length > 0 && (
          <SystemPromptsGroup
            prompts={systemPrompts}
            categories={categories}
            onRefresh={fetchData}
          />
        )}

        {userCategories.map((cat) => (
          <PromptGroup
            key={cat.id}
            category={cat}
            prompts={customPrompts.filter((p) => p.categoryId === cat.id)}
            categories={categories}
            onRefresh={fetchData}
          />
        ))}
      </div>
    </div>
  );
}

export default PromptsSection;
