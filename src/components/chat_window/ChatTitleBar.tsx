import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { ipc } from "@/ipc/types";

export function ChatTitleBar() {
    const [showWindowControls, setShowWindowControls] = useState(false);

    useEffect(() => {
        const checkPlatform = async () => {
            try {
                const platform = await ipc.system.getSystemPlatform();
                setShowWindowControls(platform !== "darwin");
            } catch (error) {
                console.error("Failed to get platform info:", error);
            }
        };
        checkPlatform();
    }, []);

    return (
        <div className="z-50 w-full h-9 absolute top-0 left-0 app-region-drag flex items-center pointer-events-none">
            <div className="flex-1" />
            {showWindowControls && <WindowsControls />}
        </div>
    );
}

function WindowsControls() {
    const { isDarkMode } = useTheme();

    return (
        <div className="ml-auto flex items-center h-full pr-1 no-app-region-drag pointer-events-auto">
            <button
                className="w-11 h-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                onClick={() => ipc.system.minimizeWindow()}
                aria-label="Minimize"
            >
                <svg width="12" height="1" viewBox="0 0 12 1" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="12" height="1" fill={isDarkMode ? "#ffffff" : "#000000"} />
                </svg>
            </button>
            <button
                className="w-11 h-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                onClick={() => ipc.system.maximizeWindow()}
                aria-label="Maximize"
            >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0.5" y="0.5" width="11" height="11" stroke={isDarkMode ? "#ffffff" : "#000000"} />
                </svg>
            </button>
            <button
                className="w-11 h-full flex items-center justify-center hover:bg-red-500 transition-colors"
                onClick={() => ipc.system.closeWindow()}
                aria-label="Close"
            >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L11 11M1 11L11 1" stroke={isDarkMode ? "#ffffff" : "#000000"} strokeWidth="1.5" />
                </svg>
            </button>
        </div>
    );
}
