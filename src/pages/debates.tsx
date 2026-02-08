import { useSearch } from "@tanstack/react-router";
import { DebatePanel } from "../components/debates/DebatePanel";

export default function DebatesPage() {
    const { id: debateId } = useSearch({ from: "/debates" });

    return (
        <div className="h-full w-full flex flex-col overflow-hidden bg-background">
            {debateId ? (
                <DebatePanel debateId={debateId} />
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-primary"
                        >
                            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                            <path d="M8 12h.01" />
                            <path d="M12 12h.01" />
                            <path d="M16 12h.01" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">Debates e Ideas</h2>
                    <p className="text-muted-foreground max-w-sm">
                        Selecciona un debate de la barra lateral o crea uno nuevo para comenzar a discutir temas variados con el asistente.
                    </p>
                </div>
            )}
        </div>
    );
}
