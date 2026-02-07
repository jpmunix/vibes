import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Todo } from "@/ipc/types";
import { useEffect, useState } from "react";

interface TodoEditModalProps {
    todo: Todo | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (todoId: number, content: string, description: string | null) => void;
}

export function TodoEditModal({
    todo,
    open,
    onOpenChange,
    onSave,
}: TodoEditModalProps) {
    const [content, setContent] = useState("");
    const [description, setDescription] = useState("");

    useEffect(() => {
        if (todo) {
            setContent(todo.content);
            setDescription(todo.description || "");
        }
    }, [todo]);

    const handleSave = () => {
        if (todo && content.trim()) {
            onSave(todo.id, content.trim(), description.trim() || null);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle>Editar Tarea</DialogTitle>
                    <DialogDescription>
                        Modifica los detalles de tu tarea aquí. Haz clic en guardar cuando termines.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="content">Título</Label>
                        <Input
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="¿Qué hay que hacer?"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Descripción</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Añade más detalles..."
                            className="min-h-[150px] resize-none"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={!content.trim()}>
                        Guardar cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
