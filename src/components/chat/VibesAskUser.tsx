import type React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
    MessageCircleQuestion,
    Loader,
    CircleX,
    Send,
    CheckCircle2,
} from "lucide-react";
import { CustomTagState } from "./stateTypes";
import { ipc } from "@/ipc/types";
import { useAtomValue, useSetAtom } from "jotai";
import { pendingAskUsersAtom, selectedChatIdAtom } from "@/atoms/chatAtoms";

interface VibesAskUserProps {
    children?: ReactNode;
    node?: {
        properties?: {
            state?: CustomTagState;
            question?: string;
            options?: string; // pipe-separated options
            context?: string;
            requestId?: string;
        };
    };
}

export const VibesAskUser: React.FC<VibesAskUserProps> = ({ children, node }) => {
    const [userInput, setUserInput] = useState("");
    const [hasResponded, setHasResponded] = useState(false);
    const [responseText, setResponseText] = useState("");

    const pendingAskUsers = useAtomValue(pendingAskUsersAtom);
    const setPendingAskUsers = useSetAtom(pendingAskUsersAtom);
    const chatId = useAtomValue(selectedChatIdAtom);

    // XML tag state (may be "finished" prematurely due to XML closing before execute)
    const state = node?.properties?.state as CustomTagState;
    const aborted = state === "aborted";

    const question = node?.properties?.question || "";
    const context = node?.properties?.context || "";
    const optionsStr = node?.properties?.options || "";
    const options = optionsStr ? optionsStr.split("|").filter(Boolean) : [];

    // PRIMARY UI DRIVER: find if this question has a pending IPC entry.
    // The XML tag state may show "finished" prematurely (closing tag is emitted
    // before execute() runs), so we use the atom as the source of truth
    // for whether the tool is still waiting for a response.
    const pendingEntry = pendingAskUsers.find(
        (p) => p.question === question && p.chatId === chatId,
    );

    // Derive actual interactive state from atom, not XML
    const isWaitingForResponse = !!pendingEntry && !hasResponded;
    const isCompleted = hasResponded || (!pendingEntry && !aborted);

    const childrenText = typeof children === "string" ? children : "";

    const handleSendResponse = async (response: string) => {
        if (!response.trim() || hasResponded || !pendingEntry) return;
        setHasResponded(true);
        setResponseText(response);

        try {
            await ipc.agent.respondToAskUser({
                requestId: pendingEntry.requestId,
                response: response.trim(),
            });
            // Remove from pending list
            setPendingAskUsers((prev) =>
                prev.filter((p) => p.requestId !== pendingEntry.requestId),
            );
        } catch (err) {
            console.error("Failed to send ask_user response:", err);
        }
    };

    const handleOptionClick = (option: string) => {
        handleSendResponse(option);
    };

    const handleTextSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSendResponse(userInput);
    };

    // Dynamic border styling
    const borderClass = isWaitingForResponse
        ? "border-violet-500 shadow-md shadow-violet-500/10"
        : aborted
            ? "border-red-500"
            : "border-violet-500/30";

    return (
        <div
            data-testid="vibes-ask-user"
            className={`bg-(--background-lightest) rounded-lg px-4 py-3 border my-2 ${borderClass}`}
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <MessageCircleQuestion size={18} className="text-violet-500" />
                <span className="font-bold text-xs outline-2 outline-violet-500/20 bg-violet-500/10 text-violet-500 rounded-md px-1.5 py-0.5">
                    PREGUNTA
                </span>
                {isWaitingForResponse && (
                    <div className="flex items-center text-violet-500 text-xs ml-auto">
                        <Loader size={14} className="mr-1 animate-spin" />
                        <span>Esperando respuesta...</span>
                    </div>
                )}
                {isCompleted && (
                    <div className="flex items-center text-violet-400 text-xs ml-auto">
                        <CheckCircle2 size={14} className="mr-1" />
                        <span>Respondido</span>
                    </div>
                )}
                {aborted && (
                    <div className="flex items-center text-red-600 text-xs ml-auto">
                        <CircleX size={14} className="mr-1" />
                        <span>No respondido</span>
                    </div>
                )}
            </div>

            {/* Question */}
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">{question}</p>

            {/* Context */}
            {context && (
                <p className="text-xs text-muted-foreground mb-3 italic">{context}</p>
            )}

            {/* Interactive area — driven by atom, not by XML tag state */}
            {isWaitingForResponse && (
                <div className="mt-3">
                    {options.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {options.map((option, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleOptionClick(option)}
                                    className="px-3 py-1.5 text-sm rounded-lg border border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/15 hover:border-violet-500/60 text-violet-700 dark:text-violet-300 transition-all cursor-pointer"
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <form onSubmit={handleTextSubmit} className="flex gap-2">
                            <input
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder="Escribe tu respuesta..."
                                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-violet-500/30 bg-(--background) focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={!userInput.trim()}
                                className="px-3 py-1.5 text-sm rounded-lg bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
                            >
                                <Send size={14} />
                                Enviar
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Response display */}
            {isCompleted && (responseText || childrenText) && (
                <div className="mt-2 px-3 py-2 text-sm rounded-lg bg-violet-500/5 border border-violet-500/20 text-violet-700 dark:text-violet-300">
                    <span className="font-medium text-xs text-muted-foreground mr-2">Respuesta:</span>
                    {responseText || childrenText}
                </div>
            )}
        </div>
    );
};
