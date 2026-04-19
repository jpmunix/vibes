import { useState, useMemo } from "react";
import { Search, X } from "@/components/ui/icons";
import * as LucideIcons from "@/components/ui/icons";
import iconDatabase from "@/data/lucide-icons.json";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface IconSelectorProps {
    currentIcon: string;
    onSelect: (iconName: string) => void;
    onClose: () => void;
}

export function IconSelector({ currentIcon, onSelect, onClose }: IconSelectorProps) {
    const [searchQuery, setSearchQuery] = useState("");

    // Filter icons based on search query
    const filteredIcons = useMemo(() => {
        if (!searchQuery.trim()) {
            return iconDatabase;
        }

        const query = searchQuery.toLowerCase();
        return iconDatabase.filter((icon) => {
            const nameMatch = icon.name.toLowerCase().includes(query);
            const tagsMatch = icon.tags.some((tag) => tag.toLowerCase().includes(query));
            return nameMatch || tagsMatch;
        });
    }, [searchQuery]);

    const handleIconClick = (iconName: string) => {
        onSelect(iconName);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold">Seleccionar Icono</h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-8 w-8 p-0"
                    >
                        <X size={18} />
                    </Button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" size={16} />
                        <Input
                            type="text"
                            placeholder="Buscar iconos... (ej: 'casa', 'usuario', 'configuración')"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Current Icon */}
                {currentIcon && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Icono actual:</span>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded border border-blue-200 dark:border-blue-700">
                                {(() => {
                                    const IconComponent = (LucideIcons as any)[currentIcon];
                                    return IconComponent ? <IconComponent size={20} /> : null;
                                })()}
                                <span className="text-sm">{currentIcon}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Icon Grid */}
                <ScrollArea className="flex-1 p-4">
                    {filteredIcons.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Search className="mb-3 text-muted-foreground/50 dark:text-muted-foreground" size={48} />
                            <p className="text-muted-foreground">
                                No se encontraron iconos para "{searchQuery}"
                            </p>
                            <p className="text-sm text-muted-foreground/70 mt-1">
                                Intenta con otros términos de búsqueda
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="text-xs text-muted-foreground mb-3">
                                {filteredIcons.length} icono{filteredIcons.length !== 1 ? "s" : ""} encontrado{filteredIcons.length !== 1 ? "s" : ""}
                            </div>
                            <div className="grid grid-cols-6 gap-2">
                                {filteredIcons.slice(0, 150).map((icon) => {
                                    const IconComponent = (LucideIcons as any)[icon.name];
                                    if (!IconComponent) return null;

                                    const isSelected = icon.name === currentIcon;

                                    return (
                                        <button
                                            key={icon.name}
                                            onClick={() => handleIconClick(icon.name)}
                                            className={`
                                                flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors
                                                hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700
                                                ${isSelected
                                                    ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-400 dark:ring-blue-600"
                                                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                                                }
                                            `}
                                            title={`${icon.name} - ${icon.tags.join(", ")}`}
                                            type="button"
                                        >
                                            <IconComponent size={24} className={isSelected ? "text-blue-600 dark:text-blue-400" : ""} />
                                            <span className={`text-xs text-center leading-tight ${isSelected ? "font-semibold text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
                                                {icon.name}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {filteredIcons.length > 150 && (
                                <div className="mt-4 text-center text-sm text-muted-foreground">
                                    Mostrando los primeros 150 resultados. Usa la búsqueda para refinar.
                                </div>
                            )}
                        </>
                    )}
                </ScrollArea>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-xs textgray-500 dark:text-muted-foreground/70">
                        Todos los iconos de <a href="https://lucide.dev" target="_blank" rel="noopener noreferrer" className="underline">Lucide</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
