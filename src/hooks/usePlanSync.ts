import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { chatMessagesByIdAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import {
    planAtom,
    planCollapsedAtom,
    planLoadingAtom,
    planReadOnlyAtom,
} from "@/atoms/planAtoms";
import { parsePlanFromText } from "@/components/chat/PlanPanel";
import { useSettings } from "./useSettings";

/**
 * Hook that watches chat messages and parses plan responses when in plan mode.
 * When the AI finishes streaming in plan mode, the last assistant message
 * is parsed into the plan panel.
 */
export function usePlanSync(chatId?: number) {
    const messagesById = useAtomValue(chatMessagesByIdAtom);
    const isStreamingById = useAtomValue(isStreamingByIdAtom);
    const setPlan = useSetAtom(planAtom);
    const setCollapsed = useSetAtom(planCollapsedAtom);
    const setLoading = useSetAtom(planLoadingAtom);
    const setReadOnly = useSetAtom(planReadOnlyAtom);
    const { settings } = useSettings();

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
            setPlan(parsed);
            setCollapsed(false); // auto-expand plan panel
            setReadOnly(false);
            setLoading(false);
        }
    }, [
        chatId,
        isStreamingById,
        messagesById,
        settings?.selectedChatMode,
        setPlan,
        setCollapsed,
        setLoading,
        setReadOnly,
    ]);
}
