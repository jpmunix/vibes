
import { User } from "firebase/auth";
import {
    LogOut,
    User as UserIcon,
    CloudUpload,
    Database,
} from "lucide-react";
import { ChatActivityButton } from "@/components/chat/ChatActivity";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export interface UserHeaderActionsProps {
    user?: User | null;
    isAuthModalOpen?: boolean;
    setIsAuthModalOpen?: (open: boolean) => void;
    isProfileModalOpen?: boolean;
    setIsProfileModalOpen?: (open: boolean) => void;
    isBackupModalOpen?: boolean;
    setIsBackupModalOpen?: (open: boolean) => void;
    handleLogout?: () => void;
    navigate?: any;
    enableAllStatsAndLogs?: boolean;
}

export const UserHeaderActions = ({
    user,
    setIsAuthModalOpen,
    setIsProfileModalOpen,
    setIsBackupModalOpen,
    handleLogout,
    navigate,
    enableAllStatsAndLogs,
}: UserHeaderActionsProps) => {
    return (
        <TooltipProvider>
            <div className="flex items-center gap-1 no-app-region-drag">
                <ChatActivityButton />
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div className="cursor-pointer ml-1">
                                <SimpleAvatar
                                    src={user.photoURL || undefined}
                                    className="h-6 w-6"
                                    fallbackText={(
                                        user.displayName?.[0] ||
                                        user.email?.[0] ||
                                        "U"
                                    ).toUpperCase()}
                                />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 p-2 shadow-xl border-border/50">
                            <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">
                                Cuenta
                            </DropdownMenuLabel>
                            <div className="flex items-center gap-3 px-2 py-3">
                                <div className="h-10 w-10">
                                    <SimpleAvatar
                                        src={user.photoURL || undefined}
                                        fallbackText={(
                                            user.displayName?.[0] ||
                                            user.email?.[0] ||
                                            "U"
                                        ).toUpperCase()}
                                    />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate">
                                        {user.displayName || "Usuario"}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                        {user.email}
                                    </span>
                                </div>
                            </div>

                            <DropdownMenuItem
                                className="py-2 cursor-pointer focus:bg-accent"
                                onClick={() => setIsProfileModalOpen?.(true)}
                            >
                                <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Editar Perfil</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="py-2 cursor-pointer focus:bg-accent"
                                onClick={() => setIsBackupModalOpen?.(true)}
                            >
                                <CloudUpload className="mr-3 h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Copias de seguridad</span>
                            </DropdownMenuItem>
                            {enableAllStatsAndLogs && (
                                <DropdownMenuItem
                                    className="py-2 cursor-pointer focus:bg-accent"
                                    onClick={() => navigate?.({ to: "/settings/ai-query-logs" })}
                                >
                                    <Database className="mr-3 h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Logs de Consultas IA</span>
                                </DropdownMenuItem>
                            )}

                            <DropdownMenuItem
                                className="py-2 cursor-pointer focus:bg-accent text-foreground"
                                onClick={handleLogout}
                            >
                                <LogOut className="mr-3 h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Cerrar sesión</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className="cursor-pointer ml-1"
                                onClick={() => setIsAuthModalOpen?.(true)}
                            >
                                <SimpleAvatar className="h-6 w-6" fallbackText={<UserIcon className="h-4 w-4" />} />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Iniciar sesión / Registrarse</p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </TooltipProvider>
    );
};
