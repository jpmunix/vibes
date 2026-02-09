import { useSearch } from "@tanstack/react-router";
import { DebatePanel } from "../components/debates/DebatePanel";

export default function DebatesPage() {
    const { id: debateId } = useSearch({ from: "/debates" });

    return (
        <div className="h-full w-full flex flex-col overflow-hidden bg-background">
            <DebatePanel debateId={debateId} />
        </div>
    );
}
