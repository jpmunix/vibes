import { useState, useEffect } from "react";
import { ipc } from "@/ipc/types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, StickyNote, CheckSquare, Search, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InjectedItem } from "@/ipc/types/debate";

interface InjectedItemPickerProps {
    onSelect: (item: InjectedItem) => void;
}

export function InjectedItemPicker({ onSelect }: InjectedItemPickerProps) {
    const [open, setOpen] = useState(false);
    const [chats, setChats] = useState<any[]>([]);
    const [notes, setNotes] = useState<any[]>([]);
    const [todos, setTodos] = useState<any[]>([]);
    const [apps, setApps] = useState<any[]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open]);

    const loadData = async () => {
        try {
            const [c, n, t, a] = await Promise.all([
                ipc.chat.getChats(undefined),
                ipc.note.getNotes(),
                ipc.todo.getTodos(),
                ipc.app.listApps()
            ]);
            setChats(c);
            setNotes(n);
            setTodos(Array.isArray(t) ? t : []);
            setApps(a.apps);
        } catch (e) {
            console.error("Error loading context data:", e);
        }
    };

    const handleSelectItem = async (type: "chat" | "note" | "todo", item: any) => {
        let content = "";
        if (type === "note") {
            try {
                const fullNote = await ipc.note.getNote(item.id);
                content = fullNote.content;
            } catch (e) {
                content = item.content || "No se pudo cargar el contenido de la nota.";
            }
        }
        if (type === "todo")
            content = item.content + (item.description ? "\n" + item.description : "");
        if (type === "chat") {
            // For chats, we might want to fetch messages to get meaningful content
            try {
                const fullChat = await ipc.chat.getChat(item.id);
                content = fullChat.messages
                    .map((m: any) => `${m.role}: ${m.content}`)
                    .join("\n\n");
            } catch (e) {
                content = "No se pudo cargar el historial del chat.";
            }
        }

        onSelect({
            type,
            id: item.id,
            title: item.title || item.name || item.content || "Sin título",
            content,
        });
        setOpen(false);
    };

    const filteredChats = chats.filter((c) => (c.title || "").toLowerCase().includes(search.toLowerCase()));
    const filteredNotes = notes.filter((n) => (n.title || "").toLowerCase().includes(search.toLowerCase()));
    const filteredTodos = todos.filter((t) => (t.content || "").toLowerCase().includes(search.toLowerCase()));

    const groupedChats = apps.map(app => ({
        app,
        items: filteredChats.filter(c => c.appId === app.id)
    })).filter(group => group.items.length > 0);

    const groupedTodos = apps.map(app => ({
        app,
        items: filteredTodos.filter(t => t.appId === app.id)
    })).filter(group => group.items.length > 0);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9 rounded-xl border-dashed">
                    <Plus size={14} />
                    <span>Inyectar contexto</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-6 gap-4 border-none shadow-2xl bg-background/95 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                        Inyectar contenido en el debate
                    </DialogTitle>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <input
                        placeholder="Buscar chats, notas o tareas..."
                        className="w-full bg-accent/50 border-none rounded-2xl py-2.5 pl-10 pr-4 text-sm transition-all shadow-inner outline-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <Tabs defaultValue="chats" className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="grid w-full grid-cols-3 bg-accent/50 p-1 rounded-2xl mb-4">
                        <TabsTrigger value="chats" className="gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Inbox size={14} /> Chats
                        </TabsTrigger>
                        <TabsTrigger value="notes" className="gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <StickyNote size={14} /> Notas
                        </TabsTrigger>
                        <TabsTrigger value="todos" className="gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <CheckSquare size={14} /> Tareas
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="chats" className="flex-1 overflow-hidden mt-0">
                        <ScrollArea className="h-full pr-4">
                            <div className="space-y-4 pb-4">
                                {groupedChats.map(({ app, items }) => (
                                    <div key={app.id} className="space-y-2">
                                        <div className="flex items-center gap-2 px-2 py-1 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">{app.name}</span>
                                            <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                                        </div>
                                        <div className="space-y-2">
                                            {items.map((c) => (
                                                <Button
                                                    key={c.id}
                                                    variant="ghost"
                                                    className="w-full justify-start h-auto flex-col items-start p-4 gap-1 rounded-2xl hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
                                                    onClick={() => handleSelectItem("chat", c)}
                                                >
                                                    <span className="font-semibold text-foreground/90">
                                                        {c.title || "Nuevo Chat"}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full">
                                                        {new Date(c.createdAt).toLocaleDateString()}
                                                    </span>
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {chats.length === 0 && (
                                    <div className="text-center py-10 opacity-50">No hay chats disponibles</div>
                                )}
                                {chats.length > 0 && groupedChats.length === 0 && (
                                    <div className="text-center py-10 opacity-50">No hay coincidencias</div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="notes" className="flex-1 overflow-hidden mt-0">
                        <ScrollArea className="h-full pr-4">
                            <div className="space-y-4 pb-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 px-2 py-1 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">General</span>
                                        <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                                    </div>
                                    <div className="space-y-2">
                                        {filteredNotes.map((n) => (
                                            <Button
                                                key={n.id}
                                                variant="ghost"
                                                className="w-full justify-start h-auto flex-col items-start p-4 gap-1 rounded-2xl hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
                                                onClick={() => handleSelectItem("note", n)}
                                            >
                                                <span className="font-semibold text-foreground/90">{n.title}</span>
                                                <span className="text-xs text-muted-foreground line-clamp-2 bg-accent/30 p-2 rounded-lg w-full text-left">
                                                    {n.content || "Sin contenido previo"}
                                                </span>
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                {notes.length === 0 && (
                                    <div className="text-center py-10 opacity-50">No hay notas disponibles</div>
                                )}
                                {notes.length > 0 && filteredNotes.length === 0 && (
                                    <div className="text-center py-10 opacity-50">No hay coincidencias</div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="todos" className="flex-1 overflow-hidden mt-0">
                        <ScrollArea className="h-full pr-4">
                            <div className="space-y-4 pb-4">
                                {groupedTodos.map(({ app, items }) => (
                                    <div key={app.id} className="space-y-2">
                                        <div className="flex items-center gap-2 px-2 py-1 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">{app.name}</span>
                                            <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                                        </div>
                                        <div className="space-y-2">
                                            {items.map((t) => (
                                                <Button
                                                    key={t.id}
                                                    variant="ghost"
                                                    className="w-full justify-start h-auto flex-col items-start p-4 gap-1 rounded-2xl hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
                                                    onClick={() => handleSelectItem("todo", t)}
                                                >
                                                    <span className="font-semibold text-foreground/90">{t.content}</span>
                                                    {t.description && (
                                                        <span className="text-xs text-muted-foreground line-clamp-2 bg-accent/30 p-2 rounded-lg w-full text-left">
                                                            {t.description}
                                                        </span>
                                                    )}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {todos.length === 0 && (
                                    <div className="text-center py-10 opacity-50">No hay tareas disponibles</div>
                                )}
                                {todos.length > 0 && groupedTodos.length === 0 && (
                                    <div className="text-center py-10 opacity-50">No hay coincidencias</div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
