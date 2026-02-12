import React, { useRef, useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { appConsoleEntriesAtom, selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { Terminal as TerminalIcon, Send } from "lucide-react";
import { showError } from "@/lib/toast";

export const ConsoleTerminal = () => {
    const consoleEntries = useAtomValue(appConsoleEntriesAtom);
    const selectedAppId = useAtomValue(selectedAppIdAtom);
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState("");
    const [isNearBottom, setIsNearBottom] = useState(true);

    // Filter only server/stdout/stderr for the terminal view
    const terminalEntries = consoleEntries.filter(
        (entry) => entry.type === "server" || entry.type === "edge-function"
    );

    useEffect(() => {
        if (isNearBottom && virtuosoRef.current) {
            virtuosoRef.current.scrollToIndex({
                index: terminalEntries.length - 1,
                behavior: "auto",
            });
        }
    }, [terminalEntries.length, isNearBottom]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || !selectedAppId) return;

        try {
            await ipc.app.respondToAppInput({
                appId: selectedAppId,
                response: inputValue,
            });
            setInputValue("");
        } catch (error) {
            showError(error instanceof Error ? error.message : "Error al enviar comando");
        }
    };

    const focusInput = () => {
        inputRef.current?.focus();
    };

    return (
        <div
            className="flex flex-col flex-1 bg-black text-green-500 font-mono text-xs overflow-hidden"
            onClick={focusInput}
        >
            <div className="flex-1 overflow-hidden relative">
                <Virtuoso
                    ref={virtuosoRef}
                    data={terminalEntries}
                    initialTopMostItemIndex={Math.max(0, terminalEntries.length - 1)}
                    atBottomStateChange={setIsNearBottom}
                    itemContent={(index, entry) => (
                        <div className="px-4 py-0.5 break-all whitespace-pre-wrap">
                            <span className={entry.level === "error" ? "text-red-500" : entry.level === "warn" ? "text-yellow-500" : ""}>
                                {entry.message}
                            </span>
                        </div>
                    )}
                    style={{ height: "100%" }}
                />
            </div>

            <form
                onSubmit={handleSendMessage}
                className="flex items-center gap-2 px-4 py-2 border-t border-gray-800 bg-gray-950"
            >
                <span className="text-blue-400 font-bold">$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-green-500 placeholder:text-gray-700"
                    placeholder="Escribe un comando para el proceso..."
                    autoFocus
                />
                <button type="submit" className="text-gray-500 hover:text-white transition-colors">
                    <Send size={14} />
                </button>
            </form>
        </div>
    );
};
