import { useState } from "react";
import { Plus, Paperclip, ChartColumnIncreasing } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ContextFilesPicker } from "@/components/ContextFilesPicker";
import { FileAttachmentDropdown } from "./FileAttachmentDropdown";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useCustomThemes } from "@/hooks/useCustomThemes";
import { useSettings } from "@/hooks/useSettings";

interface AuxiliaryActionsMenuProps {
  onFileSelect: (
    files: FileList,
    type: "chat-context" | "upload-to-codebase",
  ) => void;
  showTokenBar?: boolean;
  toggleShowTokenBar?: () => void;
  hideContextFilesPicker?: boolean;
  appId?: number;
}

export function AuxiliaryActionsMenu({
  onFileSelect,
  showTokenBar,
  toggleShowTokenBar,
  hideContextFilesPicker,
  appId,
}: AuxiliaryActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [] = useState(false);
  const [] = useState(false);

  const { themeId: appThemeId } = useAppTheme(appId);
  const { settings } = useSettings();

  // Determine current theme: use app theme if appId exists, otherwise use settings
  // Note: settings stores empty string for "no theme", convert to null

  // Compute visible custom themes: selected custom theme + up to 3 others

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="has-[>svg]:px-2 hover:bg-muted bg-primary/10 text-primary cursor-pointer rounded-xl"
            data-testid="auxiliary-actions-menu"
          >
            <Plus
              size={20}
              className={`transition-transform duration-200 ${isOpen ? "rotate-45" : "rotate-0"}`}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Codebase Context */}
          {!hideContextFilesPicker && <ContextFilesPicker />}

          {/* Attach Files Submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="py-2 px-3">
              <Paperclip size={16} className="mr-2" />
              Adjuntar archivos
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <FileAttachmentDropdown
                onFileSelect={onFileSelect}
                closeMenu={() => setIsOpen(false)}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Themes Submenu */}
          {/*<DropdownMenuSub>*/}
          {/*  <DropdownMenuSubTrigger className="py-2 px-3">*/}
          {/*    <Palette size={16} className="mr-2" />*/}
          {/*    Temas*/}
          {/*  </DropdownMenuSubTrigger>*/}
          {/*  <DropdownMenuSubContent>*/}
          {/*    <DropdownMenuItem*/}
          {/*      onClick={() => handleThemeSelect(null)}*/}
          {/*      className={`py-2 px-3 ${currentThemeId === null ? "bg-primary/10" : ""}`}*/}
          {/*      data-testid="theme-option-none"*/}
          {/*    >*/}
          {/*      <div className="flex items-center w-full">*/}
          {/*        <Ban size={16} className="mr-2 text-muted-foreground" />*/}
          {/*        <span className="flex-1">Sin tema</span>*/}
          {/*        {currentThemeId === null && (*/}
          {/*          <Check size={16} className="text-primary ml-2" />*/}
          {/*        )}*/}
          {/*      </div>*/}
          {/*    </DropdownMenuItem>*/}

          {/*    /!* Built-in themes from themesData *!/*/}
          {/*    {themes?.map((theme) => {*/}
          {/*      const isSelected = currentThemeId === theme.id;*/}
          {/*      return (*/}
          {/*        <Tooltip key={theme.id}>*/}
          {/*          <TooltipTrigger asChild>*/}
          {/*            <DropdownMenuItem*/}
          {/*              onClick={() => handleThemeSelect(theme.id)}*/}
          {/*              className={`py-2 px-3 ${isSelected ? "bg-primary/10" : ""}`}*/}
          {/*              data-testid={`theme-option-${theme.id}`}*/}
          {/*            >*/}
          {/*              <div className="flex items-center w-full">*/}
          {/*                {theme.icon === "palette" && (*/}
          {/*                  <Palette*/}
          {/*                    size={16}*/}
          {/*                    className="mr-2 text-muted-foreground"*/}
          {/*                  />*/}
          {/*                )}*/}
          {/*                <span className="flex-1">{theme.name}</span>*/}
          {/*                {isSelected && (*/}
          {/*                  <Check size={16} className="text-primary ml-2" />*/}
          {/*                )}*/}
          {/*              </div>*/}
          {/*            </DropdownMenuItem>*/}
          {/*          </TooltipTrigger>*/}
          {/*          <TooltipContent side="right">*/}
          {/*            {theme.description}*/}
          {/*          </TooltipContent>*/}
          {/*        </Tooltip>*/}
          {/*      );*/}
          {/*    })}*/}

          {/*    /!* Custom Themes Section (limited) *!/*/}
          {/*    {visibleCustomThemes.length > 0 && (*/}
          {/*      <>*/}
          {/*        <DropdownMenuSeparator />*/}
          {/*        {visibleCustomThemes.map((theme) => {*/}
          {/*          const themeId = `custom:${theme.id}`;*/}
          {/*          const isSelected = currentThemeId === themeId;*/}
          {/*          return (*/}
          {/*            <Tooltip key={themeId}>*/}
          {/*              <TooltipTrigger asChild>*/}
          {/*                <DropdownMenuItem*/}
          {/*                  onClick={() => handleThemeSelect(themeId)}*/}
          {/*                  className={`py-2 px-3 ${isSelected ? "bg-primary/10" : ""}`}*/}
          {/*                  data-testid={`theme-option-${themeId}`}*/}
          {/*                >*/}
          {/*                  <div className="flex items-center w-full">*/}
          {/*                    <Brush*/}
          {/*                      size={16}*/}
          {/*                      className="mr-2 text-muted-foreground"*/}
          {/*                    />*/}
          {/*                    <span className="flex-1">{theme.name}</span>*/}
          {/*                    {isSelected && (*/}
          {/*                      <Check*/}
          {/*                        size={16}*/}
          {/*                        className="text-primary ml-2"*/}
          {/*                      />*/}
          {/*                    )}*/}
          {/*                  </div>*/}
          {/*                </DropdownMenuItem>*/}
          {/*              </TooltipTrigger>*/}
          {/*              <TooltipContent side="right">*/}
          {/*                {theme.description || "Tema personalizado"}*/}
          {/*              </TooltipContent>*/}
          {/*            </Tooltip>*/}
          {/*          );*/}
          {/*        })}*/}
          {/*      </>*/}
          {/*    )}*/}

          {/*    /!* All Custom Themes option *!/*/}
          {/*    {hasMoreCustomThemes && (*/}
          {/*      <DropdownMenuItem*/}
          {/*        onClick={() => {*/}
          {/*          setIsOpen(false);*/}
          {/*          setAllThemesDialogOpen(true);*/}
          {/*        }}*/}
          {/*        className="py-2 px-3"*/}
          {/*        data-testid="all-custom-themes-option"*/}
          {/*      >*/}
          {/*        <div className="flex items-center w-full">*/}
          {/*          <MoreHorizontal*/}
          {/*            size={16}*/}
          {/*            className="mr-2 text-muted-foreground"*/}
          {/*          />*/}
          {/*          <span className="flex-1">Más temas</span>*/}
          {/*        </div>*/}
          {/*      </DropdownMenuItem>*/}
          {/*    )}*/}

          {/*    /!* Create Custom Theme option (always available) *!/*/}
          {/*    <>*/}
          {/*      <DropdownMenuSeparator />*/}
          {/*      <DropdownMenuItem*/}
          {/*        onClick={handleCreateCustomTheme}*/}
          {/*        className="py-2 px-3"*/}
          {/*        data-testid="create-custom-theme"*/}
          {/*      >*/}
          {/*        <div className="flex items-center w-full">*/}
          {/*          <PlusCircle*/}
          {/*            size={16}*/}
          {/*            className="mr-2 text-muted-foreground"*/}
          {/*          />*/}
          {/*          <span className="flex-1">Nuevo tema</span>*/}
          {/*        </div>*/}
          {/*      </DropdownMenuItem>*/}
          {/*    </>*/}
          {/*  </DropdownMenuSubContent>*/}
          {/*</DropdownMenuSub>*/}

          {toggleShowTokenBar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={toggleShowTokenBar}
                className={`py-2 px-3 group ${showTokenBar ? "bg-primary/10 text-primary" : ""}`}
                data-testid="token-bar-toggle"
              >
                <ChartColumnIncreasing
                  size={16}
                  className={
                    showTokenBar
                      ? "text-primary group-hover:text-accent-foreground"
                      : ""
                  }
                />
                <span className="flex-1">
                  {showTokenBar ? "Ocultar" : "Mostrar"} uso de tokens
                </span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/*/!* Custom Theme Dialog *!/*/}
      {/*<CustomThemeDialog*/}
      {/*  open={customThemeDialogOpen}*/}
      {/*  onOpenChange={handleCustomThemeDialogClose}*/}
      {/*  onThemeCreated={(themeId) => {*/}
      {/*    // Auto-select the newly created theme*/}
      {/*    handleThemeSelect(`custom:${themeId}`);*/}
      {/*  }}*/}
      {/*/>*/}

      {/* All Custom Themes Dialog */}
      {/*<Dialog open={allThemesDialogOpen} onOpenChange={setAllThemesDialogOpen}>*/}
      {/*  <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">*/}
      {/*    <DialogHeader>*/}
      {/*      <DialogTitle>Todos los temas personalizados</DialogTitle>*/}
      {/*    </DialogHeader>*/}
      {/*    <div className="overflow-y-auto flex-1 -mx-6 px-6">*/}
      {/*      /!* All custom themes list *!/*/}
      {/*      {customThemes.map((theme) => {*/}
      {/*        const themeId = `custom:${theme.id}`;*/}
      {/*        const isSelected = currentThemeId === themeId;*/}
      {/*        return (*/}
      {/*          <div*/}
      {/*            key={themeId}*/}
      {/*            onClick={() => {*/}
      {/*              handleThemeSelect(themeId);*/}
      {/*              setAllThemesDialogOpen(false);*/}
      {/*            }}*/}
      {/*            className={`flex items-center p-3 rounded-lg cursor-pointer hover:bg-muted transition-colors ${isSelected ? "bg-primary/10" : ""*/}
      {/*              }`}*/}
      {/*          >*/}
      {/*            <Brush size={18} className="mr-3 text-muted-foreground" />*/}
      {/*            <div className="flex-1">*/}
      {/*              <div className="font-medium">{theme.name}</div>*/}
      {/*              {theme.description && (*/}
      {/*                <div className="text-sm text-muted-foreground">*/}
      {/*                  {theme.description}*/}
      {/*                </div>*/}
      {/*              )}*/}
      {/*            </div>*/}
      {/*            {isSelected && <Check size={18} className="text-primary" />}*/}
      {/*          </div>*/}
      {/*        );*/}
      {/*      })}*/}
      {/*    </div>*/}
      {/*  </DialogContent>*/}
      {/*</Dialog>*/}
    </>
  );
}
