import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";

/**
 * /chat route — redirects to the dedicated chat window.
 * Chats are no longer rendered in the main window; they open in a
 * lightweight, independent BrowserWindow (P18).
 */
export default function ChatPage() {
  const { id: chatId } = useSearch({ from: "/chat" });
  const navigate = useNavigate();
  const selectedAppId = useAtomValue(selectedAppIdAtom);

  useEffect(() => {
    if (selectedAppId && chatId) {
      // Open in dedicated chat window and go to app-details
      ipc.system.openChatWindow({ appId: selectedAppId, chatId });
      navigate({ to: "/app-details", search: { appId: selectedAppId }, replace: true });
    } else if (selectedAppId) {
      // No chatId, just go to app-details
      navigate({ to: "/app-details", search: { appId: selectedAppId }, replace: true });
    } else {
      // No app selected, go home
      navigate({ to: "/", replace: true });
    }
  }, [selectedAppId, chatId, navigate]);

  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Redirigiendo...
    </div>
  );
}
