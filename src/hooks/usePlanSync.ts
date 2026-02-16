import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { chatMessagesByIdAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import {
    plansByChatIdAtom,
    planLoadingByChatIdAtom,
    planCollapsedByChatIdAtom,
} from "@/atoms/planAtoms";
import { parsePlanFromText } from "@/components/chat/PlanPanel";
import { useSettings } from "./useSettings";
import { ipc } from "@/ipc/types";

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
 * When the AI finishes streaming in plan mode, the response is parsed into a plan,
 * saved to the database, and the chat messages are cleared (plan generation is silent).
 *
 * Plans are persisted in the database (chats.planData column) and loaded on demand.
 */
export function usePlanSync(chatId?: number) {
    const messagesById = useAtomValue(chatMessagesByIdAtom);
    const setMessagesById = useSetAtom(chatMessagesByIdAtom);
    const isStreamingById = useAtomValue(isStreamingByIdAtom);
    const plans = useAtomValue(plansByChatIdAtom);
    const setPlans = useSetAtom(plansByChatIdAtom);
    const setLoading = useSetAtom(planLoadingByChatIdAtom);
    const setCollapsed = useSetAtom(planCollapsedByChatIdAtom);
    const { settings, updateSettings } = useSettings();

    const prevStreamingRef = useRef(false);
    const loadedChatIdsRef = useRef<Set<number>>(new Set());

    // Effect 1: When streaming ends in plan mode, parse the plan, save to DB, clear chat
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
            // Save plan to in-memory atom (panel stays collapsed — user decides when to open)
            updateMapAtom(setPlans, chatId, parsed);
            updateMapAtom(setLoading, chatId, false);

            // Auto-expand the plan panel with a slight delay to ensure the "unfold" animation plays
            // (The panel mounts collapsed first, then expands)
            setTimeout(() => {
                updateMapAtom(setCollapsed, chatId, false);
            }, 150);

            // Save plan to database (persistent, independent of chat messages)
            ipc.chat.savePlanData({ chatId, planData: parsed }).then(() => {
                window.dispatchEvent(new Event("plan-chat-db-update"));
            }).catch((err: any) =>
                console.error("Failed to save plan data:", err)
            );

            // Clear chat messages (plan generation is silent)
            ipc.chat.deleteMessages(chatId).then(() => {
                // Clear from atom too
                setMessagesById((prev) => {
                    const next = new Map(prev);
                    next.set(chatId, []);
                    return next;
                });
            }).catch((err: any) =>
                console.error("Failed to clear chat messages:", err)
            );

            // Switch back to the user's default chat mode now that the plan is ready
            const defaultMode = settings?.defaultChatMode || "build";
            if (defaultMode !== "plan") {
                updateSettings({ selectedChatMode: defaultMode });
            } else {
                updateSettings({ selectedChatMode: "build" });
            }

            // Notify user via system notification if window is not focused
            if (
                settings?.enableChatCompletionNotifications !== false &&
                Notification.permission === "granted" &&
                !document.hasFocus()
            ) {
                new Notification("Plan listo", {
                    body: parsed.objective.length > 80
                        ? parsed.objective.slice(0, 80) + "…"
                        : parsed.objective,
                });
            }
        }
    }, [
        chatId,
        isStreamingById,
        messagesById,
        settings?.selectedChatMode,
        settings?.defaultChatMode,
        settings?.enableChatCompletionNotifications,
        updateSettings,
        setPlans,
        setLoading,
        setMessagesById,
        setCollapsed,
    ]);

    // Effect 2: Load plan from database when switching to a chat
    useEffect(() => {
        if (!chatId) return;

        // Skip if already loaded or if plan already exists in memory
        if (loadedChatIdsRef.current.has(chatId)) return;
        if (plans.has(chatId)) return;

        // Mark as loaded to avoid duplicate calls
        loadedChatIdsRef.current.add(chatId);

        const loadPlan = async () => {
            try {
                const planData = await ipc.chat.getPlanData(chatId);
                if (planData) {
                    setPlans((prev) => {
                        // If plan was set in the meantime (e.g. by streaming), preserve it
                        if (prev.has(chatId)) return prev;

                        const next = new Map(prev);
                        next.set(chatId, planData);
                        return next;
                    });
                    // Don't auto-expand — user decides when to open the plan
                }
            } catch (err) {
                console.error("Failed to load plan data:", err);
                // Allow retry on next visit
                loadedChatIdsRef.current.delete(chatId);
            }
        };

        loadPlan();
    }, [chatId, plans, setPlans]);
}
