import type React from "react";
import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import {
    MessageCircleQuestion,
    Loader2,
    CircleX,
    Send,
    CheckCircle2,
    Circle,
    Square,
    CheckSquare,
} from "@/components/ui/icons";
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
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
    const [customText, setCustomText] = useState("");
    const [useCustom, setUseCustom] = useState(false);
    const [hasResponded, setHasResponded] = useState(false);
    const [responseText, setResponseText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const customInputRef = useRef<HTMLInputElement>(null);

    const pendingAskUsers = useAtomValue(pendingAskUsersAtom);
    const setPendingAskUsers = useSetAtom(pendingAskUsersAtom);
    const chatId = useAtomValue(selectedChatIdAtom);

    const state = node?.properties?.state as CustomTagState;
    const aborted = state === "aborted";

    const question = node?.properties?.question || "";
    const context = node?.properties?.context || "";
    const optionsStr = node?.properties?.options || "";
    const options = optionsStr ? optionsStr.split("|").filter(Boolean) : [];

    const pendingEntry = pendingAskUsers.find(
        (p) => p.question === question && p.chatId === chatId,
    );

    const isMultiple = !!pendingEntry?.multiple;
    const isWaitingForResponse = !!pendingEntry && !hasResponded;
    const isCompleted = hasResponded || (!pendingEntry && !aborted);
    const childrenText = typeof children === "string" ? children : "";

    // Focus custom input when switching to custom mode
    useEffect(() => {
        if (useCustom && customInputRef.current) {
            customInputRef.current.focus();
        }
    }, [useCustom]);

    // --- Single-select handlers ---
    const handleOptionSelect = (option: string) => {
        if (isMultiple) {
            // Toggle in set
            setSelectedOptions((prev) => {
                const next = new Set(prev);
                if (next.has(option)) {
                    next.delete(option);
                } else {
                    next.add(option);
                }
                return next;
            });
            setUseCustom(false);
        } else {
            setSelectedOption(option);
            setUseCustom(false);
            setCustomText("");
        }
    };

    const handleCustomToggle = () => {
        setUseCustom(true);
        if (!isMultiple) {
            setSelectedOption(null);
        }
    };

    const handleSubmit = async () => {
        let response: string | string[];

        if (useCustom && customText.trim()) {
            // Custom text — always sent as single string
            response = customText.trim();
        } else if (isMultiple) {
            // Multi-select — send array of selected labels
            const selected = Array.from(selectedOptions);
            if (selected.length === 0) return;
            response = selected;
        } else {
            // Single-select
            if (!selectedOption) return;
            response = selectedOption;
        }

        if (hasResponded || !pendingEntry) return;

        setIsSending(true);
        setHasResponded(true);
        setResponseText(Array.isArray(response) ? response.join(", ") : response);

        try {
            await ipc.agent.respondToAskUser({
                requestId: pendingEntry.requestId,
                response,
            });
            setPendingAskUsers((prev) =>
                prev.filter((p) => p.requestId !== pendingEntry.requestId),
            );
        } catch (err) {
            console.error("Failed to send ask_user response:", err);
        } finally {
            setIsSending(false);
        }
    };

    const canSend = useCustom
        ? customText.trim().length > 0
        : isMultiple
            ? selectedOptions.size > 0
            : !!selectedOption;

    return (
        <div
            data-testid="vibes-ask-user"
            className="my-2 rounded-xl overflow-hidden"
            style={{
                background: isWaitingForResponse
                    ? "linear-gradient(135deg, oklch(0.25 0.04 280 / 0.6), oklch(0.22 0.02 260 / 0.4))"
                    : "oklch(0.24 0.01 260 / 0.3)",
                border: isWaitingForResponse
                    ? "1px solid oklch(0.6 0.15 280 / 0.35)"
                    : aborted
                        ? "1px solid oklch(0.6 0.2 25 / 0.4)"
                        : "1px solid oklch(0.5 0.05 280 / 0.15)",
                boxShadow: isWaitingForResponse
                    ? "0 4px 24px oklch(0.4 0.15 280 / 0.12), inset 0 1px 0 oklch(1 0 0 / 0.03)"
                    : "none",
            }}
        >
            {/* Header bar */}
            <div
                className="flex items-center gap-2.5 px-4 py-2.5"
                style={{
                    borderBottom: isWaitingForResponse
                        ? "1px solid oklch(0.5 0.1 280 / 0.15)"
                        : "1px solid oklch(0.5 0.05 280 / 0.08)",
                }}
            >
                <div
                    className="flex items-center justify-center w-6 h-6 rounded-md"
                    style={{ background: "oklch(0.55 0.18 280 / 0.2)" }}
                >
                    <MessageCircleQuestion size={14} style={{ color: "oklch(0.75 0.15 280)" }} />
                </div>
                <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "oklch(0.75 0.15 280)" }}
                >
                    Pregunta del agente
                </span>

                {/* Status indicator */}
                <div className="ml-auto flex items-center gap-1.5">
                    {isWaitingForResponse && (
                        <>
                            <span
                                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                                style={{ background: "oklch(0.75 0.18 280)" }}
                            />
                            <span className="text-[10px]" style={{ color: "oklch(0.65 0.1 280)" }}>
                                {isMultiple ? "Selección múltiple" : "Esperando"}
                            </span>
                        </>
                    )}
                    {isCompleted && (
                        <>
                            <CheckCircle2 size={13} style={{ color: "oklch(0.7 0.15 155)" }} />
                            <span className="text-[10px]" style={{ color: "oklch(0.65 0.1 155)" }}>
                                Respondido
                            </span>
                        </>
                    )}
                    {aborted && (
                        <>
                            <CircleX size={13} style={{ color: "oklch(0.65 0.2 25)" }} />
                            <span className="text-[10px]" style={{ color: "oklch(0.6 0.15 25)" }}>
                                Sin respuesta
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
                {/* Question text */}
                <p className="text-[13px] leading-relaxed text-foreground/90 mb-1">{question}</p>

                {/* Context */}
                {context && (
                    <p className="text-[11px] leading-relaxed mb-3" style={{ color: "oklch(0.6 0.03 260)" }}>
                        {context}
                    </p>
                )}

                {/* Interactive area */}
                {isWaitingForResponse && (
                    <div className="mt-3 space-y-2">
                        {/* Options — radio or checkbox depending on multiple */}
                        {options.length > 0 && (
                            <div className="space-y-1.5">
                                {options.map((option, i) => {
                                    const isSelected = isMultiple
                                        ? selectedOptions.has(option)
                                        : selectedOption === option && !useCustom;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => handleOptionSelect(option)}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150 cursor-pointer group"
                                            style={{
                                                background: isSelected
                                                    ? "oklch(0.55 0.18 280 / 0.15)"
                                                    : "oklch(0.5 0.02 260 / 0.08)",
                                                border: isSelected
                                                    ? "1px solid oklch(0.6 0.18 280 / 0.4)"
                                                    : "1px solid oklch(0.5 0.03 260 / 0.12)",
                                                ...(isSelected ? { boxShadow: "0 0 12px oklch(0.5 0.18 280 / 0.08)" } : {}),
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isSelected) {
                                                    e.currentTarget.style.background = "oklch(0.5 0.02 260 / 0.15)";
                                                    e.currentTarget.style.borderColor = "oklch(0.5 0.08 280 / 0.25)";
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isSelected) {
                                                    e.currentTarget.style.background = "oklch(0.5 0.02 260 / 0.08)";
                                                    e.currentTarget.style.borderColor = "oklch(0.5 0.03 260 / 0.12)";
                                                }
                                            }}
                                        >
                                            {/* Radio circle or Checkbox */}
                                            <div className="flex-shrink-0">
                                                {isMultiple ? (
                                                    // Checkbox style
                                                    isSelected ? (
                                                        <CheckSquare
                                                            size={16}
                                                            style={{ color: "oklch(0.7 0.18 280)" }}
                                                        />
                                                    ) : (
                                                        <Square
                                                            size={16}
                                                            style={{ color: "oklch(0.5 0.03 260 / 0.5)" }}
                                                            className="group-hover:!text-[oklch(0.6_0.08_280)]"
                                                        />
                                                    )
                                                ) : (
                                                    // Radio style
                                                    isSelected ? (
                                                        <div
                                                            className="w-4 h-4 rounded-full flex items-center justify-center"
                                                            style={{ border: "2px solid oklch(0.7 0.18 280)" }}
                                                        >
                                                            <div
                                                                className="w-2 h-2 rounded-full"
                                                                style={{ background: "oklch(0.7 0.18 280)" }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <Circle
                                                            size={16}
                                                            style={{ color: "oklch(0.5 0.03 260 / 0.5)" }}
                                                            className="group-hover:!text-[oklch(0.6_0.08_280)]"
                                                        />
                                                    )
                                                )}
                                            </div>
                                            <span
                                                className="text-[13px]"
                                                style={{
                                                    color: isSelected
                                                        ? "oklch(0.85 0.08 280)"
                                                        : "oklch(0.75 0.02 260)",
                                                }}
                                            >
                                                {option}
                                            </span>
                                        </button>
                                    );
                                })}

                                {/* Custom text option — acts as another radio/checkbox choice */}
                                <button
                                    onClick={handleCustomToggle}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150 cursor-pointer"
                                    style={{
                                        background: useCustom
                                            ? "oklch(0.55 0.18 280 / 0.15)"
                                            : "oklch(0.5 0.02 260 / 0.08)",
                                        border: useCustom
                                            ? "1px solid oklch(0.6 0.18 280 / 0.4)"
                                            : "1px solid oklch(0.5 0.03 260 / 0.08)",
                                        borderStyle: useCustom ? "solid" : "dashed",
                                    }}
                                >
                                    <div className="flex-shrink-0">
                                        {useCustom ? (
                                            isMultiple ? (
                                                <CheckSquare size={16} style={{ color: "oklch(0.7 0.18 280)" }} />
                                            ) : (
                                                <div
                                                    className="w-4 h-4 rounded-full flex items-center justify-center"
                                                    style={{ border: "2px solid oklch(0.7 0.18 280)" }}
                                                >
                                                    <div
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ background: "oklch(0.7 0.18 280)" }}
                                                    />
                                                </div>
                                            )
                                        ) : (
                                            isMultiple ? (
                                                <Square size={16} style={{ color: "oklch(0.5 0.03 260 / 0.4)" }} />
                                            ) : (
                                                <Circle size={16} style={{ color: "oklch(0.5 0.03 260 / 0.4)" }} />
                                            )
                                        )}
                                    </div>
                                    <span
                                        className="text-[13px]"
                                        style={{ color: useCustom ? "oklch(0.85 0.08 280)" : "oklch(0.55 0.02 260)" }}
                                    >
                                        Otra respuesta...
                                    </span>
                                </button>
                            </div>
                        )}

                        {/* Custom text input — shown when custom is toggled or no options exist */}
                        {(useCustom || options.length === 0) && (
                            <div className="pt-1">
                                <input
                                    ref={customInputRef}
                                    type="text"
                                    value={customText}
                                    onChange={(e) => setCustomText(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter" && canSend) handleSubmit(); }}
                                    placeholder="Escribe tu respuesta..."
                                    className="w-full px-3 py-2 text-[13px] rounded-lg outline-none transition-all"
                                    style={{
                                        background: "oklch(0.2 0.01 260 / 0.6)",
                                        border: "1px solid oklch(0.5 0.08 280 / 0.25)",
                                        color: "oklch(0.88 0.02 260)",
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = "oklch(0.6 0.15 280 / 0.5)";
                                        e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.5 0.15 280 / 0.1)";
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = "oklch(0.5 0.08 280 / 0.25)";
                                        e.currentTarget.style.boxShadow = "none";
                                    }}
                                    autoFocus={options.length === 0}
                                />
                            </div>
                        )}

                        {/* Submit button */}
                        <div className="flex items-center justify-between pt-1">
                            {/* Multi-select counter */}
                            {isMultiple && selectedOptions.size > 0 && !useCustom && (
                                <span className="text-[11px]" style={{ color: "oklch(0.65 0.1 280)" }}>
                                    {selectedOptions.size} seleccionada{selectedOptions.size !== 1 ? "s" : ""}
                                </span>
                            )}
                            {(!isMultiple || selectedOptions.size === 0 || useCustom) && <span />}
                            <button
                                onClick={handleSubmit}
                                disabled={!canSend || isSending}
                                className="flex items-center gap-2 px-4 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                                style={{
                                    background: canSend
                                        ? "linear-gradient(135deg, oklch(0.55 0.2 280), oklch(0.48 0.18 270))"
                                        : "oklch(0.35 0.05 280 / 0.3)",
                                    color: canSend ? "oklch(0.95 0.02 280)" : "oklch(0.6 0.03 260)",
                                    boxShadow: canSend
                                        ? "0 2px 8px oklch(0.4 0.18 280 / 0.25), inset 0 1px 0 oklch(1 0 0 / 0.1)"
                                        : "none",
                                }}
                                onMouseEnter={(e) => {
                                    if (canSend) {
                                        e.currentTarget.style.background = "linear-gradient(135deg, oklch(0.6 0.2 280), oklch(0.52 0.18 270))";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (canSend) {
                                        e.currentTarget.style.background = "linear-gradient(135deg, oklch(0.55 0.2 280), oklch(0.48 0.18 270))";
                                    }
                                }}
                            >
                                {isSending ? (
                                    <Loader2 size={13} className="animate-spin" />
                                ) : (
                                    <Send size={13} />
                                )}
                                Enviar respuesta
                            </button>
                        </div>
                    </div>
                )}

                {/* Response display */}
                {isCompleted && (responseText || childrenText) && (
                    <div
                        className="mt-2 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]"
                        style={{
                            background: "oklch(0.5 0.1 155 / 0.08)",
                            border: "1px solid oklch(0.5 0.1 155 / 0.15)",
                        }}
                    >
                        <CheckCircle2 size={14} style={{ color: "oklch(0.65 0.15 155)", flexShrink: 0 }} />
                        <span style={{ color: "oklch(0.75 0.08 155)" }}>
                            {responseText || childrenText}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
