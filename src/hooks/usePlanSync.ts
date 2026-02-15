import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { chatMessagesByIdAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import {
    plansByChatIdAtom,
    planCollapsedByChatIdAtom,
    planLoadingByChatIdAtom,
    planReadOnlyByChatIdAtom,
} from "@/atoms/planAtoms";
import { parsePlanFromText } from "@/components/chat/PlanPanel";
import { useSettings } from "./useSettings";

function updateMapAtom<K, V>(
    setter: (fn: (prev: Map<K, V>) => Map<K, V>) => void,
    key: K,
    value: V,
) {
    setter((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
    });
}

/**
 * Hook that watches chat messages and parses plan responses when in plan mode.
 * When the AI finishes streaming in plan mode, the last assistant message
 * is parsed into the plan panel.
 */
export function usePlanSync(chatId?: number) {
    const messagesById = useAtomValue(chatMessagesByIdAtom);
    const isStreamingById = useAtomValue(isStreamingByIdAtom);
    const setPlans = useSetAtom(plansByChatIdAtom);
    const setCollapsed = useSetAtom(planCollapsedByChatIdAtom);
    const setLoading = useSetAtom(planLoadingByChatIdAtom);
    const setReadOnly = useSetAtom(planReadOnlyByChatIdAtom);
    const { settings, updateSettings } = useSettings();

    const prevStreamingRef = useRef(false);

    useEffect(() => {
        if (!chatId) return;

        const isStreaming = isStreamingById.get(chatId) ?? false;
        const wasStreaming = prevStreamingRef.current;
        prevStreamingRef.current = isStreaming;

        // Only trigger when streaming transitions from true → false
        if (!wasStreaming || isStreaming) return;

        // Only parse in plan mode
        if (settings?.selectedChatMode !== "plan") return;

        const messages = messagesById.get(chatId) ?? [];
        if (messages.length === 0) return;

        // Find the last assistant message
        const lastAssistantMsg = [...messages]
            .reverse()
            .find((m) => m.role === "assistant");
        if (!lastAssistantMsg?.content) return;

        // Try to parse the response into a plan
        const parsed = parsePlanFromText(lastAssistantMsg.content);
        if (parsed) {
            updateMapAtom(setPlans, chatId, parsed);
            updateMapAtom(setCollapsed, chatId, false); // auto-expand plan panel
            updateMapAtom(setReadOnly, chatId, false);
            updateMapAtom(setLoading, chatId, false);

            // Switch back to the user's default chat mode now that the plan is ready
            const defaultMode = settings?.defaultChatMode || "build";
            if (defaultMode !== "plan") {
                updateSettings({ selectedChatMode: defaultMode });
            } else {
                updateSettings({ selectedChatMode: "build" });
            }
        }
    }, [
        chatId,
        isStreamingById,
        messagesById,
        settings?.selectedChatMode,
        settings?.defaultChatMode,
        updateSettings,
        setPlans,
        setCollapsed,
        setLoading,
        setReadOnly,
    ]);

    // Initial load: Try to recover plan from history if not present in atom
    useEffect(() => {
        if (!chatId) return;

        const messages = messagesById.get(chatId) ?? [];
        if (messages.length === 0) return;

        // If actively streaming, let the streaming effect handle it
        if (isStreamingById.get(chatId)) return;

        setPlans((prev) => {
            // If plan already exists in memory for this chat, preserve it (keeps user edits during session)
            if (prev.has(chatId)) return prev;

            // Otherwise, try to parse from last assistant message
            const lastAssistantMsg = [...messages]
                .reverse()
                .find((m) => m.role === "assistant");

            if (!lastAssistantMsg?.content) return prev;

            const parsed = parsePlanFromText(lastAssistantMsg.content);
            if (parsed) {
                const next = new Map(prev);
                next.set(chatId, parsed);
                return next;
            }
            return prev;
        });
    }, [chatId, messagesById, isStreamingById, setPlans]);
}
