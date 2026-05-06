/**
 * CrossChatNotification — Floating notification banner.
 *
 * Shows when another chat (not the one currently visible) has pending
 * interactions: ask_user questions, permission requests, or consent requests.
 *
 * Uses the same vibes-permission-banner BEM design tokens so it looks
 * coherent with VibesPermissionBanner and VibesAskUser.
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  selectedChatIdAtom,
  pendingAskUsersAtom,
  pendingAgentConsentsAtom,
  pendingOpenCodePermissionsAtom,
  isStreamingByIdAtom,
} from "@/atoms/chatAtoms";
import { MessageCircleQuestion, ShieldCheck, X } from "@/components/ui/icons";
import { useNavigate } from "@tanstack/react-router";
import { sendAppNotification } from "@/lib/notification-sound";
import { useSettings } from "@/hooks/useSettings";

// ── Types ───────────────────────────────────────────────────────────────

interface CrossChatItem {
  chatId: number;
  type: "ask_user" | "consent" | "permission";
  question?: string;
  toolName?: string;
}

// ── Component ───────────────────────────────────────────────────────────

export function CrossChatNotification() {
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const pendingAskUsers = useAtomValue(pendingAskUsersAtom);
  const pendingConsents = useAtomValue(pendingAgentConsentsAtom);
  const pendingPermissions = useAtomValue(pendingOpenCodePermissionsAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const navigate = useNavigate();

  // Switch to the target chatId — updates atom AND router (if /chat exists)
  const switchToChat = useCallback(
    (chatId: number) => {
      setSelectedChatId(chatId);
      try {
        navigate({ to: "/chat", search: { id: chatId } });
      } catch {
        // ChatWindowApp uses a minimal memory router without /chat route
      }
    },
    [setSelectedChatId, navigate],
  );

  // Dismissed chatIds for this mount cycle (reset when selectedChatId changes)
  const [dismissedChatIds, setDismissedChatIds] = useState<Set<number>>(
    new Set(),
  );

  // Reset dismissed when the user switches chats
  useEffect(() => {
    setDismissedChatIds(new Set());
  }, [selectedChatId]);

  // Compute cross-chat pending items (items for chats OTHER than the visible one)
  const crossChatItems = useMemo<CrossChatItem[]>(() => {
    const items: CrossChatItem[] = [];

    for (const ask of pendingAskUsers) {
      if (ask.chatId !== selectedChatId && !dismissedChatIds.has(ask.chatId)) {
        items.push({
          chatId: ask.chatId,
          type: "ask_user",
          question: ask.question,
        });
      }
    }

    for (const consent of pendingConsents) {
      if (
        consent.chatId !== selectedChatId &&
        !dismissedChatIds.has(consent.chatId)
      ) {
        items.push({
          chatId: consent.chatId,
          type: "consent",
          toolName: consent.toolName,
        });
      }
    }

    for (const perm of pendingPermissions) {
      if (
        perm.chatId !== selectedChatId &&
        !dismissedChatIds.has(perm.chatId)
      ) {
        items.push({
          chatId: perm.chatId,
          type: "permission",
          toolName: perm.toolName,
        });
      }
    }

    return items;
  }, [
    selectedChatId,
    pendingAskUsers,
    pendingConsents,
    pendingPermissions,
    dismissedChatIds,
  ]);

  // Group by chatId — show one notification per chat at most
  const groupedByChatId = useMemo(() => {
    const map = new Map<
      number,
      { chatId: number; items: CrossChatItem[]; isStreaming: boolean }
    >();

    for (const item of crossChatItems) {
      if (!map.has(item.chatId)) {
        map.set(item.chatId, {
          chatId: item.chatId,
          items: [],
          isStreaming: isStreamingById.get(item.chatId) ?? false,
        });
      }
      map.get(item.chatId)!.items.push(item);
    }

    return Array.from(map.values());
  }, [crossChatItems, isStreamingById]);

  // ── Notification + sound ──────────────────────────────────────────────
  const { settings } = useSettings();
  const notifiedChatIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const { chatId, items } of groupedByChatId) {
      if (notifiedChatIdsRef.current.has(chatId)) continue;
      notifiedChatIdsRef.current.add(chatId);

      const primary =
        items.find((i) => i.type === "ask_user") ||
        items.find((i) => i.type === "permission") ||
        items[0];

      const body =
        primary.type === "ask_user" && primary.question
          ? primary.question.length > 80
            ? primary.question.slice(0, 77) + "…"
            : primary.question
          : "El agente necesita tu respuesta en otro chat";

      sendAppNotification({ title: "Vibes", body, settings: settings ?? null });
    }

    // Clean up chatIds that are no longer pending
    const activeChatIds = new Set(groupedByChatId.map((g) => g.chatId));
    for (const id of notifiedChatIdsRef.current) {
      if (!activeChatIds.has(id)) {
        notifiedChatIdsRef.current.delete(id);
      }
    }
  }, [groupedByChatId, settings]);

  if (groupedByChatId.length === 0) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1.5 pointer-events-none w-full max-w-lg px-4">
      {groupedByChatId.map(({ chatId, items }) => {
        // Pick the most important item to display
        const primary =
          items.find((i) => i.type === "ask_user") ||
          items.find((i) => i.type === "permission") ||
          items[0];

        const label =
          primary.type === "ask_user"
            ? "necesita tu respuesta"
            : primary.type === "permission"
              ? `pide permiso para ${primary.toolName}`
              : `pide consentimiento para ${primary.toolName}`;

        const questionPreview =
          primary.type === "ask_user" && primary.question
            ? primary.question.length > 60
              ? primary.question.slice(0, 57) + "…"
              : primary.question
            : null;

        return (
          <div
            key={chatId}
            className="vibes-permission-banner pointer-events-auto animate-in slide-in-from-top-2 fade-in duration-300 rounded-xl overflow-hidden"
          >
            <div className="vibes-permission-banner__header flex items-center gap-2.5 px-4 py-2.5">
              {/* Icon — same slot as VibesPermissionBanner */}
              <div className="vibes-permission-banner__icon flex items-center justify-center w-6 h-6 rounded-md">
                {primary.type === "ask_user" ? (
                  <MessageCircleQuestion size={14} />
                ) : (
                  <ShieldCheck size={14} />
                )}
              </div>

              {/* Message */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">
                  <span style={{ color: "var(--accent-teal-label)" }}>
                    Otro chat
                  </span>{" "}
                  {label}
                </p>
                {questionPreview && (
                  <p
                    className="text-[11px] truncate mt-0.5 italic"
                    style={{ color: "var(--accent-teal-context-text)" }}
                  >
                    &ldquo;{questionPreview}&rdquo;
                  </p>
                )}
              </div>

              {/* Actions */}
              <button
                onClick={() => switchToChat(chatId)}
                className="vibes-permission-banner__btn flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 cursor-pointer"
              >
                Ir al chat
              </button>
              <button
                onClick={() =>
                  setDismissedChatIds((prev) => new Set([...prev, chatId]))
                }
                className="vibes-permission-banner__btn flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 cursor-pointer"
                title="Ignorar"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
