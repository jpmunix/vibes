import React, { useEffect, useState, useRef, useCallback } from "react";
import { ipc } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Loader2, RotateCcw, Check, Plus, Trash2, Edit2 } from "@/components/ui/icons";
import { toast } from "sonner";
import type { PromptDto, PromptCategoryDto } from "@/ipc/types";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

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
  const [expanded, setExpanded] = useState(false);
  const [localTitle, setLocalTitle] = useState(prompt.title);
  const [localDesc, setLocalDesc] = useState(prompt.description || "");
  const [localContent, setLocalContent] = useState(prompt.content);
  const [localEnabled, setLocalEnabled] = useState(prompt.enabled);
  const [localCategoryId, setLocalCategoryId] = useState<number | null>(prompt.categoryId);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasUnsavedChanges = 
    localTitle !== prompt.title || 
    localDesc !== (prompt.description || "") || 
    localContent !== prompt.content ||
    localEnabled !== prompt.enabled ||
    localCategoryId !== prompt.categoryId;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [localContent, expanded]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await ipc.prompt.update({
        id: prompt.id,
        title: localTitle,
        description: localDesc,
        content: localContent,
        enabled: localEnabled,
        categoryId: localCategoryId,
      });
      toast.success(`Prompt guardado`);
      onUpdate();
    } catch {
      toast.error("Error al guardar el prompt");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await ipc.prompt.delete(prompt.id);
      toast.success("Prompt eliminado");
      onDelete();
    } catch {
      toast.error("Error al eliminar");
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        className={cn("flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4", !localEnabled && "opacity-50")}
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 flex items-center gap-3">
          <Switch
             checked={localEnabled}
             onCheckedChange={async (c) => {
               setLocalEnabled(c);
               try {
                 await ipc.prompt.update({ id: prompt.id, enabled: c });
                 onUpdate();
                 toast.success(`Prompt ${c ? "activado" : "desactivado"}`);
               } catch {
                 setLocalEnabled(!c);
                 toast.error("Error al actualizar estado");
               }
             }}
             onClick={(e) => e.stopPropagation()}
          />
          <div>
            <h3 className="typo-label flex items-center gap-2">
              {prompt.title}
              {!localEnabled && <span className="typo-micro px-1.5 py-0.5 rounded bg-muted text-muted-foreground">DESACTIVADO</span>}
            </h3>
            <p className="typo-caption mt-1">{prompt.description}</p>
          </div>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {expanded && (
        <div className="space-y-3 pl-4">
          <div className="space-y-2">
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              placeholder="Título del prompt"
              className="h-8"
            />
            <Input
              value={localDesc}
              onChange={(e) => setLocalDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              className="h-8"
            />
            <Select 
                value={localCategoryId ? String(localCategoryId) : "none"} 
                onValueChange={(val) => setLocalCategoryId(val === "none" ? null : Number(val))}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin Categoría</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <textarea
              ref={textareaRef}
              className="w-full p-4 typo-mono-xs leading-relaxed resize-none border-0 bg-transparent focus:outline-none overflow-hidden"
              spellCheck={false}
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <DeleteConfirmationDialog
              itemName={prompt.title || "prompt"}
              itemType="prompt"
              onDelete={handleDelete}
              isDeleting={isDeleting}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={isDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              }
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />
                }
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
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
  const [expanded, setExpanded] = useState(false);
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editCategoryName, setEditCategoryName] = useState(category?.name || "");
  const [editCategoryDesc, setEditCategoryDesc] = useState(category?.description || "");

  const handleCreatePrompt = async () => {
    if (!newPromptTitle.trim()) return;
    try {
      await ipc.prompt.create({
        title: newPromptTitle,
        description: "",
        content: "Escribe tu prompt aquí...",
        categoryId: category?.id,
      });
      setNewPromptTitle("");
      setIsCreatingPrompt(false);
      onRefresh();
    } catch {
      toast.error("Error al crear prompt");
    }
  };
  
  const handleDeleteCategory = async () => {
      if (!category) return;
      try {
          await ipc.prompt.deleteCategory(category.id);
          toast.success("Categoría eliminada");
          onRefresh();
      } catch {
          toast.error("Error al eliminar categoría");
      }
  };

  const handleUpdateCategory = async () => {
      if (!category) return;
      if (!editCategoryName.trim()) return;
      try {
          await ipc.prompt.updateCategory({ id: category.id, name: editCategoryName, description: editCategoryDesc });
          toast.success("Categoría actualizada");
          setIsEditingCategory(false);
          onRefresh();
      } catch {
          toast.error("Error al actualizar categoría");
      }
  };

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4 bg-muted/20"
        onClick={() => !isEditingCategory && setExpanded((e) => !e)}
      >
        <div className="flex-1">
          {isEditingCategory && category ? (
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  <Input 
                      value={editCategoryName} 
                      onChange={(e) => setEditCategoryName(e.target.value)} 
                      placeholder="Nombre de la categoría" 
                      className="h-8"
                  />
                  <Input 
                      value={editCategoryDesc} 
                      onChange={(e) => setEditCategoryDesc(e.target.value)} 
                      placeholder="Descripción (opcional)" 
                      className="h-8"
                  />
                  <div className="flex gap-2">
                      <Button size="sm" onClick={handleUpdateCategory}>Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                          setEditCategoryName(category.name);
                          setEditCategoryDesc(category.description || "");
                          setIsEditingCategory(false);
                      }}>Cancelar</Button>
                  </div>
              </div>
          ) : (
              <>
                  <h3 className="typo-label flex items-center gap-2">
                    {category ? category.name : "Sin Categoría"}
                    <span className="text-muted-foreground typo-caption">({prompts.length})</span>
                  </h3>
                  {category?.description && (
                    <p className="typo-caption mt-1">{category.description}</p>
                  )}
              </>
          )}
        </div>
        {!isEditingCategory && (
            <div className="flex items-center gap-2">
               {category && (
                   <>
                       <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setIsEditingCategory(true); }}>
                           <Edit2 className="h-3.5 w-3.5" />
                       </Button>
                       <div onClick={(e) => e.stopPropagation()}>
                           <DeleteConfirmationDialog
                               itemName={category.name}
                               itemType="categoría"
                               onDelete={handleDeleteCategory}
                               trigger={
                                   <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                                       <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                   </Button>
                               }
                           />
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
              key={p.id}
              prompt={p}
              categories={categories}
              onUpdate={onRefresh}
              onDelete={onRefresh}
            />
          ))}

          {isCreatingPrompt ? (
            <div className="flex gap-2 p-2 bg-muted/20 rounded-xl border border-border mt-2">
              <Input
                autoFocus
                placeholder="Nombre del nuevo prompt..."
                value={newPromptTitle}
                onChange={(e) => setNewPromptTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePrompt();
                  if (e.key === "Escape") setIsCreatingPrompt(false);
                }}
                className="h-8"
              />
              <Button size="sm" onClick={handleCreatePrompt}>Crear</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsCreatingPrompt(false)}>Cancelar</Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 border-dashed gap-2"
              onClick={() => setIsCreatingPrompt(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo Prompt en {category ? category.name : "Sin Categoría"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export function PromptsSection() {
  const [categories, setCategories] = useState<PromptCategoryDto[]>([]);
  const [prompts, setPrompts] = useState<PromptDto[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [cats, prmpts] = await Promise.all([
        ipc.prompt.listCategories(),
        ipc.prompt.list(),
      ]);
      setCategories(cats);
      setPrompts(prmpts);
    } catch (err) {
      toast.error("Error al cargar prompts");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  const handleCreateCategory = async () => {
      if (!newCategoryName.trim()) return;
      try {
          await ipc.prompt.createCategory({ name: newCategoryName, description: "" });
          setNewCategoryName("");
          setIsCreatingCategory(false);
          fetchData();
      } catch {
          toast.error("Error al crear categoría");
      }
  };

  if (loading) {
    return <div className="text-center text-sm text-muted-foreground py-4">Cargando prompts...</div>;
  }

  const uncategorizedPrompts = prompts.filter(p => !p.categoryId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold">Prompts del Sistema</h2>
          <Button size="sm" variant="outline" onClick={() => setIsCreatingCategory(true)} className="gap-2">
              <Plus className="h-3.5 w-3.5" /> Nueva Categoría
          </Button>
      </div>
      
      {isCreatingCategory && (
          <div className="flex gap-2 p-3 bg-muted/20 rounded-xl border border-border">
              <Input
                  autoFocus
                  placeholder="Nombre de la nueva categoría..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCategory();
                      if (e.key === "Escape") setIsCreatingCategory(false);
                  }}
                  className="h-9"
              />
              <Button onClick={handleCreateCategory}>Crear</Button>
              <Button variant="ghost" onClick={() => setIsCreatingCategory(false)}>Cancelar</Button>
          </div>
      )}

      <div className="space-y-3">
        {categories.map((cat) => (
          <PromptGroup
            key={cat.id}
            category={cat}
            prompts={prompts.filter(p => p.categoryId === cat.id)}
            categories={categories}
            onRefresh={fetchData}
          />
        ))}

        {(uncategorizedPrompts.length > 0 || categories.length === 0) && (
          <PromptGroup
            category={null}
            prompts={uncategorizedPrompts}
            categories={categories}
            onRefresh={fetchData}
          />
        )}
      </div>
    </div>
  );
}

export default PromptsSection;
