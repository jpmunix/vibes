import { WindowsControls } from "@/components/WindowsControls";
import { useAtomValue, useSetAtom } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { artifactsSidebarOpenAtom, selectedArtifactPathAtom } from "@/atoms/uiAtoms";
import { useChatArtifacts } from "@/hooks/useChatArtifacts";
import { FileText } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ChatTitleBar() {
    const chatId = useAtomValue(selectedChatIdAtom);

    return (
        <div className="z-50 w-full h-9 bg-sidebar border-b border-border app-region-drag flex items-center shrink-0">
            <div className="flex-1" />
            <div className="flex items-center no-app-region-drag">
                <TitleBarArtifactsDropdown chatId={chatId} />
            </div>
            <WindowsControls className="ml-auto pr-1 pointer-events-auto" buttonClassName="h-full" />
        </div>
    );
}

function TitleBarArtifactsDropdown({ chatId }: { chatId: number | null }) {
    const { artifacts } = useChatArtifacts(chatId);
    const setSidebarOpen = useSetAtom(artifactsSidebarOpenAtom);
    const setSelectedPath = useSetAtom(selectedArtifactPathAtom);

    if (!artifacts || artifacts.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver planificaciones y artefactos">
                    <FileText size={15} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px] max-w-[400px] w-auto">
                {artifacts.map((artifact) => (
                    <DropdownMenuItem
                        key={artifact.id}
                        onClick={() => {
                            setSelectedPath(artifact.path);
                            setSidebarOpen(true);
                        }}
                        className="cursor-pointer py-2"
                    >
                        <div className="flex flex-col gap-0.5 w-full">
                            <span className="font-medium text-sm truncate">{artifact.title || artifact.path}</span>
                            {artifact.createdAt && (
                                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                                    {new Date(artifact.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} · {new Date(artifact.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            )}
                        </div>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
