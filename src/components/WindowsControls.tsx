import { useTheme } from "@/contexts/ThemeContext";
import { ipc } from "@/ipc/types";
import { useEffect, useState } from "react";

interface WindowsControlsProps {
    className?: string;
    buttonClassName?: string;
}

export function WindowsControls({ className = "", buttonClassName = "h-11" }: WindowsControlsProps) {
    const { isDarkMode } = useTheme();

    const [showWindowControls, setShowWindowControls] = useState(false);

    useEffect(() => {
        // Check if we're running on Windows/Linux
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

    if (!showWindowControls) return null;

    const minimizeWindow = () => {
        ipc.system.minimizeWindow();
    };

    const maximizeWindow = () => {
        ipc.system.maximizeWindow();
    };

    const closeWindow = () => {
        ipc.system.closeWindow();
    };

    return (
        <div className={`flex items-center no-app-region-drag ${className}`}>
            <button
                className={`w-11 flex items-center justify-center hover:bg-accent transition-colors cursor-pointer ${buttonClassName}`}
                onClick={minimizeWindow}
                aria-label="Minimize"
            >
                <svg width="12" height="1" viewBox="0 0 12 1" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="12" height="1" fill={isDarkMode ? "#ffffff" : "#000000"} />
                </svg>
            </button>
            <button
                className={`w-11 flex items-center justify-center hover:bg-accent transition-colors cursor-pointer ${buttonClassName}`}
                onClick={maximizeWindow}
                aria-label="Maximize"
            >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0.5" y="0.5" width="11" height="11" stroke={isDarkMode ? "#ffffff" : "#000000"} />
                </svg>
            </button>
            <button
                className={`w-11 flex items-center justify-center hover:bg-red-500 transition-colors cursor-pointer group ${buttonClassName}`}
                onClick={closeWindow}
                aria-label="Close"
            >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L11 11M1 11L11 1" stroke={isDarkMode ? "#ffffff" : "#000000"} strokeWidth="1.5" className="group-hover:stroke-white" />
                </svg>
            </button>
        </div>
    );
}
