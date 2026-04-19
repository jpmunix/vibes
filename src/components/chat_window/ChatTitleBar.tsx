import { WindowsControls } from "@/components/WindowsControls";

export function ChatTitleBar() {
    return (
        <div className="z-50 w-full h-9 bg-sidebar border-b border-border app-region-drag flex items-center shrink-0">
            <div className="flex-1" />
            <WindowsControls className="ml-auto pr-1 pointer-events-auto" buttonClassName="h-full" />
        </div>
    );
}


