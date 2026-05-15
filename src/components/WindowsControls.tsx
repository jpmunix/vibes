import { ipc } from "@/ipc/types";
import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "@/components/ui/icons";
import { isElectron } from "@/lib/transport";

interface WindowsControlsProps {
    className?: string;
    buttonClassName?: string;
}

export function WindowsControls({ className = "", buttonClassName = "" }: WindowsControlsProps) {
    // In web mode, the browser has its own window controls — don't render anything
    if (!isElectron) return null;

    const [showWindowControls, setShowWindowControls] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);

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

    useEffect(() => {
        if (!showWindowControls) return;

        const checkMaximized = async () => {
            try {
                const max = await ipc.system.isWindowMaximized();
                setIsMaximized(max);
            } catch {}
        };
        
        checkMaximized();
        window.addEventListener('resize', checkMaximized);
        return () => window.removeEventListener('resize', checkMaximized);
    }, [showWindowControls]);

    if (!showWindowControls) return null;

    const minimizeWindow = () => {
        ipc.system.minimizeWindow();
    };

    const maximizeWindow = () => {
        ipc.system.maximizeWindow();
        setIsMaximized(!isMaximized);
    };

    const closeWindow = () => {
        ipc.system.closeWindow();
    };

    const baseButtonStyle = "w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-all cursor-pointer mx-0.5";

    return (
        <div className={`flex items-center h-full no-app-region-drag px-2 ${className}`}>
            <button
                className={baseButtonStyle}
                onClick={minimizeWindow}
                aria-label="Minimize"
            >
                <Minus size={14} strokeWidth={1.5} />
            </button>
            <button
                className={baseButtonStyle}
                onClick={maximizeWindow}
                aria-label={isMaximized ? "Restore" : "Maximize"}
            >
                {isMaximized ? (
                    <Copy size={13} strokeWidth={1.5} className="mt-[2px]" />
                ) : (
                    <Square size={13} strokeWidth={1.5} />
                )}
            </button>
            <button
                className={`${baseButtonStyle} hover:bg-red-500 hover:text-white group`}
                onClick={closeWindow}
                aria-label="Close"
            >
                <X size={14} strokeWidth={1.5} />
            </button>
        </div>
    );
}
