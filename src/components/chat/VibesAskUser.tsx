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
    const isWaitingForResponse = !!pendingEntry;
    const isPartOfGroup = (pendingEntry?.totalQuestions ?? 1) > 1;

    // Focus custom input when switching to custom mode
    useEffect(() => {
        if (useCustom && customInputRef.current) {
            customInputRef.current.focus();
        }
    }, [useCustom]);

    // --- Option selection handlers ---
    const handleOptionSelect = (option: string) => {
        if (isMultiple) {
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
            response = customText.trim();
        } else if (isMultiple) {
            const selected = Array.from(selectedOptions);
            if (selected.length === 0) return;
            response = selected;
        } else {
            if (!selectedOption) return;
            response = selectedOption;
        }

        if (!pendingEntry) return;

        setIsSending(true);

        try {
            await ipc.agent.respondToAskUser({
                requestId: pendingEntry.requestId,
                response,
                questionIndex: pendingEntry.questionIndex,
            });
            // Remove only THIS specific question from pending — don't remove
            // other questions from the same multi-question group.
            setPendingAskUsers((prev) =>
                prev.filter(
                    (p) =>
                        !(p.requestId === pendingEntry.requestId && p.questionIndex === pendingEntry.questionIndex) &&
                        !(p.chatId === chatId && p.question === question),
                ),
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

    // If not waiting for response, don't render anything —
    // the answer is already shown as a blockquote in the chat stream
    if (!isWaitingForResponse) return null;

    return (
        <div
            data-testid="vibes-ask-user"
            className="my-2 rounded-xl overflow-hidden"
            style={{
                background: "linear-gradient(135deg, var(--accent-teal-gradient-start), var(--accent-teal-gradient-end))",
                border: "1px solid var(--accent-teal-border)",
                boxShadow: "0 4px 24px var(--accent-teal-shadow), inset 0 1px 0 oklch(1 0 0 / 0.03)",
            }}
        >
            {/* Header bar */}
            <div
                className="flex items-center gap-2.5 px-4 py-2.5"
                style={{ borderBottom: "1px solid var(--accent-teal-header-divider)" }}
            >
                <div
                    className="flex items-center justify-center w-6 h-6 rounded-md"
                    style={{ background: "var(--accent-teal-icon-bg)" }}
                >
                    <MessageCircleQuestion size={14} style={{ color: "var(--accent-teal-icon)" }} />
                </div>
                <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--accent-teal-label)" }}
                >
                    Pregunta del agente
                </span>

                {/* Status indicator */}
                <div className="ml-auto flex items-center gap-1.5">
                    {isPartOfGroup && (
                        <span className="text-[10px] font-medium mr-1.5" style={{ color: "var(--accent-teal-label)" }}>
                            {(pendingEntry?.questionIndex ?? 0) + 1}/{pendingEntry?.totalQuestions}
                        </span>
                    )}
                    <span
                        className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ background: "var(--accent-teal-pulse)" }}
                    />
                    <span className="text-[10px]" style={{ color: "var(--accent-teal-status-text)" }}>
                        {isMultiple ? "Selección múltiple" : "Esperando"}
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
                {/* Question text */}
                <p className="text-[13px] leading-relaxed text-foreground/90 mb-1">{question}</p>

                {/* Context */}
                {context && (
                    <p className="text-[11px] leading-relaxed mb-3" style={{ color: "var(--accent-teal-context-text)" }}>
                        {context}
                    </p>
                )}

                {/* Interactive area */}
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
                                                ? "var(--accent-teal-selected-bg)"
                                                : "var(--accent-teal-option-bg)",
                                            border: isSelected
                                                ? "1px solid var(--accent-teal-selected-border)"
                                                : "1px solid var(--accent-teal-option-border)",
                                            ...(isSelected ? { boxShadow: "0 0 12px var(--accent-teal-glow)" } : {}),
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.background = "var(--accent-teal-option-hover-bg)";
                                                e.currentTarget.style.borderColor = "var(--accent-teal-option-hover-border)";
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.background = "var(--accent-teal-option-bg)";
                                                e.currentTarget.style.borderColor = "var(--accent-teal-option-border)";
                                            }
                                        }}
                                    >
                                        {/* Radio circle or Checkbox */}
                                        <div className="flex-shrink-0">
                                            {isMultiple ? (
                                                isSelected ? (
                                                    <CheckSquare size={16} style={{ color: "var(--accent-teal-selected-icon)" }} />
                                                ) : (
                                                    <Square
                                                        size={16}
                                                        style={{ color: "var(--accent-teal-checkbox-inactive)" }}
                                                    />
                                                )
                                            ) : (
                                                isSelected ? (
                                                    <div
                                                        className="w-4 h-4 rounded-full flex items-center justify-center"
                                                        style={{ border: "2px solid var(--accent-teal-selected-icon)" }}
                                                    >
                                                        <div
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ background: "var(--accent-teal-selected-icon)" }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <Circle
                                                        size={16}
                                                        style={{ color: "var(--accent-teal-checkbox-inactive)" }}
                                                    />
                                                )
                                            )}
                                        </div>
                                        <span
                                            className="text-[13px]"
                                            style={{
                                                color: isSelected
                                                    ? "var(--accent-teal-selected-text)"
                                                    : "var(--accent-teal-option-text)",
                                            }}
                                        >
                                            {option}
                                        </span>
                                    </button>
                                );
                            })}

                            {/* Custom text option */}
                            <button
                                onClick={handleCustomToggle}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150 cursor-pointer"
                                style={{
                                    background: useCustom
                                        ? "var(--accent-teal-selected-bg)"
                                        : "var(--accent-teal-option-bg)",
                                    border: useCustom
                                        ? "1px solid var(--accent-teal-selected-border)"
                                        : "1px solid var(--accent-teal-custom-border-dashed)",
                                    borderStyle: useCustom ? "solid" : "dashed",
                                }}
                            >
                                <div className="flex-shrink-0">
                                    {useCustom ? (
                                        isMultiple ? (
                                            <CheckSquare size={16} style={{ color: "var(--accent-teal-selected-icon)" }} />
                                        ) : (
                                            <div
                                                className="w-4 h-4 rounded-full flex items-center justify-center"
                                                style={{ border: "2px solid var(--accent-teal-selected-icon)" }}
                                            >
                                                <div
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ background: "var(--accent-teal-selected-icon)" }}
                                                />
                                            </div>
                                        )
                                    ) : (
                                        isMultiple ? (
                                            <Square size={16} style={{ color: "var(--accent-teal-checkbox-inactive)" }} />
                                        ) : (
                                            <Circle size={16} style={{ color: "var(--accent-teal-checkbox-inactive)" }} />
                                        )
                                    )}
                                </div>
                                <span
                                    className="text-[13px]"
                                    style={{ color: useCustom ? "var(--accent-teal-selected-text)" : "var(--accent-teal-custom-text)" }}
                                >
                                    Otra respuesta...
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Custom text input */}
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
                                    background: "var(--accent-teal-input-bg)",
                                    border: "1px solid var(--accent-teal-input-border)",
                                    color: "var(--accent-teal-input-text)",
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = "var(--accent-teal-input-focus-border)";
                                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-teal-input-focus-ring)";
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = "var(--accent-teal-input-border)";
                                    e.currentTarget.style.boxShadow = "none";
                                }}
                                autoFocus={options.length === 0}
                            />
                        </div>
                    )}

                    {/* Submit button */}
                    <div className="flex items-center justify-between pt-1">
                        {isMultiple && selectedOptions.size > 0 && !useCustom && (
                            <span className="text-[11px]" style={{ color: "var(--accent-teal-count-text)" }}>
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
                                    ? "linear-gradient(135deg, var(--accent-teal-btn-gradient-from), var(--accent-teal-btn-gradient-to))"
                                    : "var(--accent-teal-btn-disabled-bg)",
                                color: canSend ? "var(--accent-teal-btn-text)" : "var(--accent-teal-btn-disabled-text)",
                                boxShadow: canSend
                                    ? "0 2px 8px var(--accent-teal-btn-shadow), inset 0 1px 0 oklch(1 0 0 / 0.1)"
                                    : "none",
                            }}
                            onMouseEnter={(e) => {
                                if (canSend) {
                                    e.currentTarget.style.background = "linear-gradient(135deg, var(--accent-teal-btn-hover-from), var(--accent-teal-btn-hover-to))";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (canSend) {
                                    e.currentTarget.style.background = "linear-gradient(135deg, var(--accent-teal-btn-gradient-from), var(--accent-teal-btn-gradient-to))";
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
            </div>
        </div>
    );
};
