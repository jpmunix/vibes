import { useState, useEffect } from "react";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Hash, Check, Trash2 } from "lucide-react";
import { showError, showSuccess } from "@/lib/toast";
import type { DebateTag } from "@/ipc/types/debate";

interface DebateTagPickerProps {
    debateId: number;
    selectedTags: DebateTag[];
    onTagsChange: (tags: DebateTag[]) => void;
}

export function DebateTagPicker({
    debateId,
    selectedTags,
    onTagsChange,
}: DebateTagPickerProps) {
    const [open, setOpen] = useState(false);
    const [allTags, setAllTags] = useState<DebateTag[]>([]);
    const [newTagName, setNewTagName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (open) {
            loadTags();
        }
    }, [open]);

    const loadTags = async () => {
        try {
            const tags = await ipc.debate.getTags();
            setAllTags(tags);
        } catch (e: any) {
            showError(`Error al cargar etiquetas: ${e.message}`);
        }
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        setIsCreating(true);
        try {
            const newTag = await ipc.debate.createTag({
                name: newTagName.trim(),
                color: "#3b82f6", // Vibrant Blue
            });
            setAllTags((prev) => [...prev, newTag]);
            setNewTagName("");
            showSuccess("Etiqueta creada");
        } catch (e: any) {
            showError(`Error al crear etiqueta: ${e.message}`);
        } finally {
            setIsCreating(false);
        }
    };

    const handleToggleTag = async (tag: DebateTag) => {
        const isSelected = selectedTags.some((t) => t.id === tag.id);
        try {
            if (isSelected) {
                await ipc.debate.removeTagFromDebate({ debateId, tagId: tag.id });
                onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
            } else {
                await ipc.debate.addTagToDebate({ debateId, tagId: tag.id });
                onTagsChange([...selectedTags, tag]);
            }
        } catch (e: any) {
            showError(`Error al actualizar etiqueta: ${e.message}`);
        }
    };

    const handleDeleteTag = async (e: React.MouseEvent, tagId: number) => {
        e.stopPropagation();
        if (!confirm("¿Eliminar esta etiqueta permanentemente de todos los debates?")) return;
        try {
            await ipc.debate.deleteTag({ tagId });
            setAllTags((prev) => prev.filter((t) => t.id !== tagId));
            onTagsChange(selectedTags.filter((t) => t.id !== tagId));
            showSuccess("Etiqueta eliminada");
        } catch (e: any) {
            showError(`Error al eliminar etiqueta: ${e.message}`);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >
                    <Plus size={10} />
                    {selectedTags.length === 0 ? "Añadir etiquetas" : "Editar"}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Etiquetas</h4>
                    </div>

                    {/* Create new tag */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Nueva etiqueta..."
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateTag();
                            }}
                            className="flex-1 bg-secondary/30 border border-border/50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 outline-none"
                        />
                        <Button
                            size="sm"
                            onClick={handleCreateTag}
                            disabled={!newTagName.trim() || isCreating}
                            className="h-8 px-3"
                        >
                            <Plus size={12} />
                        </Button>
                    </div>

                    {/* Tag list */}
                    <div className="max-h-48 overflow-y-auto space-y-1">
                        {allTags.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">
                                No hay etiquetas. Crea una nueva.
                            </p>
                        ) : (
                            allTags.map((tag) => {
                                const isSelected = selectedTags.some((t) => t.id === tag.id);
                                return (
                                    <div key={tag.id} className="group flex items-center gap-1">
                                        <button
                                            onClick={() => handleToggleTag(tag)}
                                            className={`flex-1 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${isSelected
                                                ? "bg-primary/10 text-primary border border-primary/20"
                                                : "hover:bg-secondary/50 text-foreground"
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Hash size={10} className="text-primary" />
                                                <span className="font-medium">{tag.name}</span>
                                            </div>
                                            {isSelected && <Check size={12} />}
                                        </button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                            onClick={(e) => handleDeleteTag(e, tag.id)}
                                        >
                                            <Trash2 size={12} />
                                        </Button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
