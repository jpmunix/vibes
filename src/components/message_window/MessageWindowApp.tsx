import React, { useState, useEffect } from "react";
import { WindowsControls } from "@/components/WindowsControls";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
    createRouter,
    createRootRoute,
    createRoute,
    createMemoryHistory,
    RouterProvider,
} from "@tanstack/react-router";
import { PostHogProvider } from "posthog-js/react";
import { Provider } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { Loader2 } from "lucide-react";
import { chatClient } from "@/ipc/types/chat";
import ChatMessage from "@/components/chat/ChatMessage";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { ThemeProvider } from "../../contexts/ThemeContext";

const queryClient = new QueryClient();
const noopPosthogClient = null;

// Route setup
function createMessageWindowRouter(appId: number, chatId: number, messageId: number) {
    const rootRoute = createRootRoute({
        component: () => <MessageWindowContent appId={appId} chatId={chatId} messageId={messageId} />,
    });

    const chatRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/chat",
        component: () => null,
        validateSearch: () => ({ id: chatId }),
    });

    const catchAllRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/*",
        component: () => null,
    });

    const routeTree = rootRoute.addChildren([chatRoute, catchAllRoute]);

    const memoryHistory = createMemoryHistory({
        initialEntries: [`/chat?id=${chatId}`],
    });

    return createRouter({
        routeTree,
        history: memoryHistory,
        defaultNotFoundComponent: () => null,
    });
}

interface MessageWindowAppProps {
  appId: number;
  chatId: number;
  messageId: number;
}

function GlobalStateHydrator({ appId, chatId, children }: { appId: number, chatId: number, children: React.ReactNode }) {
  useHydrateAtoms([
    [selectedAppIdAtom, appId],
    [selectedChatIdAtom, chatId],
  ]);
  return <>{children}</>;
}

function MessageWindowContent({ appId, chatId, messageId }: MessageWindowAppProps) {
  const { data: chat, isLoading, error } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => chatClient.getChat(chatId),
  });

  const message = chat?.messages.find((m) => m.id === messageId);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mr-3" />
          <span className="text-muted-foreground">Cargando mensaje...</span>
        </div>
      );
    }

    if (error || !chat) {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-foreground">
          <div className="text-destructive text-center">
            <p className="font-semibold mb-2">Error al cargar el mensaje</p>
            <p className="text-sm opacity-80">{String(error || "Chat no encontrado")}</p>
          </div>
        </div>
      );
    }

    if (!message) {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-foreground">
          <div className="text-muted-foreground text-center">
            <p className="font-semibold mb-2">Mensaje no encontrado</p>
            <p className="text-sm opacity-80">El mensaje con ID {messageId} no existe en este chat.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 pb-4 border-b">
            <h1 className="text-lg font-medium">Debug de Mensaje</h1>
            <div className="text-xs text-muted-foreground flex gap-4 mt-2">
              <span>Chat: {chat.title} (ID: {chatId})</span>
              <span>App ID: {appId}</span>
              <span>Mensaje ID: {messageId}</span>
            </div>
          </div>
          <div className="chat-container">
              <ChatMessage message={message} isLastMessage={false} forceFullMode={true} />
          </div>
        </div>
      </div>
    );
  };

  // Sync OS window title to match the top bar
  useEffect(() => {
    document.title = chat?.title || "Mensaje";
  }, [chat?.title]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Title Bar - Draggable */}
      <div className="z-50 w-full h-11 bg-sidebar border-b border-border app-region-drag flex items-center shrink-0">
          <div className="flex-1 text-sm font-medium text-foreground pl-4 truncate">
            {chat?.title || "Mensaje"}
          </div>
          <WindowsControls className="ml-auto pr-1 pointer-events-auto" buttonClassName="h-full" />
      </div>

      {/* Main Content - Scrollable */}
      {renderContent()}
    </div>
  );
}

export function MessageWindowApp(props: MessageWindowAppProps) {
  const [chatRouter] = useState(() => createMessageWindowRouter(props.appId, props.chatId, props.messageId));

  return (
    <Provider>
      <GlobalStateHydrator appId={props.appId} chatId={props.chatId}>
        <QueryClientProvider client={queryClient}>
          <PostHogProvider client={noopPosthogClient}>
            <ThemeProvider>
              <div className="vibes-theme-root h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
                {/* @ts-ignore */}
                <RouterProvider router={chatRouter} />
              </div>
            </ThemeProvider>
          </PostHogProvider>
        </QueryClientProvider>
      </GlobalStateHydrator>
    </Provider>
  );
}
