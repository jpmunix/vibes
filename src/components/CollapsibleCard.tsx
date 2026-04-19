import { useState } from "react";
import { ChevronDown } from "@/components/ui/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
    title: React.ReactNode;
    icon?: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    defaultExpanded?: boolean;
}

export function CollapsibleCard({ title, icon, description, children, defaultExpanded = false }: CollapsibleCardProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <Card className="overflow-hidden group">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left cursor-pointer hover:bg-black/3 dark:hover:bg-white/5 transition-colors focus:outline-none"
            >
                <CardHeader className="pb-4 flex flex-row items-center justify-between">
                    <div className="space-y-1.5 flex-1 pr-4">
                        <CardTitle className="flex items-center gap-2 text-base">
                            {icon}
                            {title}
                        </CardTitle>
                        {description && <CardDescription>{description}</CardDescription>}
                    </div>
                    <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/10 group-hover:bg-black/10 dark:group-hover:bg-white/15 transition-colors">
                        <ChevronDown className={cn("h-4 w-4 text-foreground/70 transition-transform duration-200", expanded ? "rotate-180" : "")} />
                    </div>
                </CardHeader>
            </button>
            <div className={cn("grid transition-all duration-300 ease-in-out", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                    <div className="border-t border-black/5 dark:border-white/5 mx-6"></div>
                    <CardContent className="pt-4">
                        {children}
                    </CardContent>
                </div>
            </div>
        </Card>
    );
}
