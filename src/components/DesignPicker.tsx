import React, { useState, useCallback, useRef } from "react";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { selectedDesignAtom } from "@/atoms/chatAtoms";
import { cn } from "@/lib/utils";
import { useSelectedModelSupportsImages, useIsStrategistMode } from "@/hooks/useSelectedModelSupportsImages";
import { useSettings } from "@/hooks/useSettings";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Palette,
  XSquare,
  Check,
  ChevronDown,
} from "@/components/ui/icons";
import * as Lucide from "lucide-react";

const Upload = Lucide.Upload;
const ClipboardPaste = Lucide.ClipboardPaste;
const FileText = Lucide.FileText;
const Camera = Lucide.Camera;
const Loader2 = Lucide.Loader2;
const AlertTriangle = Lucide.AlertTriangle;

// ─── Brand avatar URL from GitHub ───────────────────────────────────────────
function brandAvatarUrl(id: string, size = 56): string {
  return `https://github.com/${id}.png?size=${size}`;
}

// ─── Avatar component with fallback ────────────────────────────────────────
const BrandAvatar: React.FC<{ id: string; className?: string }> = ({
  id,
  className = "w-5 h-5",
}) => {
  const [error, setError] = useState(false);
  if (error) {
    return <Palette className={className} />;
  }
  return (
    <img
      src={brandAvatarUrl(id)}
      alt={id}
      className={`${className} rounded-full object-cover`}
      onError={() => setError(true)}
      loading="lazy"
    />
  );
};

// ─── Paste modal ────────────────────────────────────────────────────────────
const PasteModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (content: string) => void;
}> = ({ open, onClose, onSubmit }) => {
  const [content, setContent] = useState("");

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-popover rounded-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <ClipboardPaste size={14} className="text-primary" />
          <span className="typo-select font-medium">Pegar DESIGN.md</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="typo-micro text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Cancelar
        </button>
      </div>

      {/* Textarea */}
      <div className="flex-1 p-2 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Pega aquí el contenido de tu archivo DESIGN.md…"
          className={cn(
            "w-full h-full resize-none rounded-md bg-muted/30 border border-border/40",
            "px-3 py-2 typo-caption text-foreground placeholder:text-muted-foreground/50",
            "focus:outline-none focus:ring-1 focus:ring-primary/30",
            "font-mono leading-relaxed",
          )}
          autoFocus
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40">
        <span className="typo-micro text-muted-foreground mr-auto">
          {content.length > 0
            ? `${content.length} caracteres`
            : "Vacío"}
        </span>
        <button
          type="button"
          onClick={() => {
            if (content.trim().length > 0) {
              onSubmit(content.trim());
              setContent("");
            }
          }}
          disabled={content.trim().length === 0}
          className={cn(
            "px-3 py-1 rounded-md typo-select font-medium transition-all",
            content.trim().length > 0
              ? "bg-primary text-primary-foreground hover:brightness-110 cursor-pointer"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
};

// ─── Screenshot modal ───────────────────────────────────────────────────────
const ScreenshotModal: React.FC<{
  open: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (dataUrl: string) => void;
  onClearError: () => void;
}> = ({ open, loading, error, onClose, onSubmit, onClearError }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const readFileAsDataUrl = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Handle paste on the focused container
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (loading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        e.stopPropagation();
        const file = item.getAsFile();
        if (file) readFileAsDataUrl(file);
        return;
      }
    }
  }, [loading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFileAsDataUrl(file);
    e.target.value = "";
  };

  // Reset state on close & auto-focus container on open
  React.useEffect(() => {
    if (!open) {
      setPreview(null);
    } else {
      // Small delay to let the DOM render, then steal focus
      requestAnimationFrame(() => containerRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onPaste={handlePaste}
      className="absolute inset-0 z-10 flex flex-col bg-popover rounded-md overflow-hidden outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Camera size={14} className="text-primary" />
          <span className="typo-select font-medium">Generar desde captura</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="typo-micro text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 p-2 overflow-hidden flex flex-col items-center justify-center">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center px-3">
            <AlertTriangle size={28} className="text-destructive" />
            <span className="typo-select font-medium">No se pudo generar</span>
            <span className="typo-micro text-muted-foreground max-w-[280px] leading-relaxed">
              {error}
            </span>
            <button
              type="button"
              onClick={() => { onClearError(); setPreview(null); }}
              className="mt-1 px-3 py-1 rounded-md typo-select font-medium bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
            >
              Intentar de nuevo
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="text-primary animate-spin" />
            <span className="typo-select font-medium">Analizando captura…</span>
            <span className="typo-micro text-muted-foreground max-w-[260px]">
              La IA está extrayendo colores, tipografía, componentes y generando tu DESIGN.md
            </span>
          </div>
        ) : preview ? (
          <div className="w-full h-full flex flex-col items-center gap-2">
            <img
              src={preview}
              alt="Captura"
              className="max-h-[220px] max-w-full rounded-md border border-border/40 object-contain"
            />
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="typo-micro text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cambiar imagen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => imgInputRef.current?.click()}
            className={cn(
              "w-full h-full rounded-md border-2 border-dashed border-border/60",
              "flex flex-col items-center justify-center gap-2 cursor-pointer",
              "hover:border-primary/40 hover:bg-muted/30 transition-all",
            )}
          >
            <Camera size={24} className="text-muted-foreground" />
            <span className="typo-select text-muted-foreground">Sube o pega una captura</span>
            <span className="typo-micro text-muted-foreground/60">
              Haz clic para seleccionar o pega con Ctrl+V
            </span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40">
        <span className="typo-micro text-muted-foreground mr-auto">
          {loading ? "Generando…" : preview ? "Imagen lista" : "Sin imagen"}
        </span>
        <button
          type="button"
          onClick={() => preview && onSubmit(preview)}
          disabled={!preview || loading}
          className={cn(
            "px-3 py-1 rounded-md typo-select font-medium transition-all",
            preview && !loading
              ? "bg-primary text-primary-foreground hover:brightness-110 cursor-pointer"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {loading ? "Generando…" : "Generar diseño"}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

// ─── Component ──────────────────────────────────────────────────────────────

export const DesignPicker: React.FC = () => {
  const [selected, setSelected] = useAtom(selectedDesignAtom);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vision check — disable screenshot option if model doesn't support images
  const supportsImages = useSelectedModelSupportsImages();
  const isStrategistMode = useIsStrategistMode();
  const { settings } = useSettings();

  const { data: designs, isLoading } = useQuery({
    queryKey: queryKeys.designs.all,
    queryFn: () => ipc.design.listDesigns(),
    staleTime: 24 * 60 * 60 * 1000, // 24h
    retry: 1,
  });

  const handleSelect = useCallback(
    (value: string) => {
      if (value === "__none__") {
        setSelected(null);
      } else if (value === "__custom__") {
        // Custom is already set — just close
      } else {
        const design = designs?.find((d) => d.id === value);
        if (design) {
          setSelected({ id: design.id, description: design.description });
        }
      }
      setSearch("");
      setOpen(false);
    },
    [designs, setSelected],
  );

  // Handle file upload
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.endsWith(".md")) {
        alert("Solo se aceptan archivos con extensión .md");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        if (content.trim().length > 0) {
          const trimmed = content.trim();
          setSelected({
            id: "__custom__",
            description: "Diseño personalizado",
            customContent: trimmed,
          });
          setOpen(false);
        }
      };
      reader.readAsText(file);
      // Reset the input so the same file can be re-uploaded
      e.target.value = "";
    },
    [setSelected],
  );

  // Handle paste submit
  const handlePasteSubmit = useCallback(
    (content: string) => {
      setSelected({
        id: "__custom__",
        description: "Diseño personalizado",
        customContent: content,
      });
      setPasteOpen(false);
      setOpen(false);
    },
    [setSelected],
  );

  // Handle screenshot submit — call AI then set as custom design
  const handleScreenshotSubmit = useCallback(
    async (dataUrl: string) => {
      setScreenshotLoading(true);
      try {
        const modelName = settings?.selectedModel?.name ?? "";
        console.log(`[DesignPicker] Generando diseño desde captura con modelo: ${modelName}`);
        const result = await ipc.design.generateFromScreenshot({
          imageDataUrl: dataUrl,
          model: modelName,
        });
        if (result.content) {
          setSelected({
            id: "__custom__",
            description: "Diseño personalizado",
            customContent: result.content,
          });
          setScreenshotOpen(false);
          setOpen(false);
        }
      } catch (err: any) {
        // Extract the meaningful part of the error (strip IPC wrapper chain)
        const raw = err.message || "Error desconocido";
        const clean = raw.replace(/^.*Error:\s*/i, "").trim();
        setScreenshotError(clean);
      } finally {
        setScreenshotLoading(false);
      }
    },
    [setSelected, settings],
  );

  // Build options
  const allDesigns = designs ?? [];
  const currentValue = selected?.id ?? "__none__";

  // Trigger label
  const triggerLabel = selected
    ? selected.id === "__custom__"
      ? "Personalizado"
      : selected.id.charAt(0).toUpperCase() + selected.id.slice(1)
    : null;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setSearch("");
            setPasteOpen(false);
            if (!screenshotLoading) setScreenshotOpen(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center justify-between cursor-pointer",
              "h-auto w-fit px-1.5 py-1 typo-select gap-1",
              "border border-input bg-transparent hover:bg-muted/50 rounded-md shadow-none transition-colors",
              "min-h-[28px]",
            )}
          >
            <span className="shrink-0 flex items-center">
              {selected ? (
                selected.id === "__custom__" ? (
                  <FileText className="w-4 h-4 text-primary" />
                ) : (
                  <BrandAvatar id={selected.id} className="w-4 h-4" />
                )
              ) : (
                <Palette className="w-4 h-4" />
              )}
            </span>
            {triggerLabel && (
              <span className="truncate max-w-[80px]">{triggerLabel}</span>
            )}
            <ChevronDown size={12} className="shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="top"
          className="p-0 overflow-hidden"
          style={{ width: 520, minWidth: 520, maxWidth: 520 }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex relative" style={{ height: "min(360px, 55vh)" }}>
            {/* Paste overlay */}
            <PasteModal
              open={pasteOpen}
              onClose={() => setPasteOpen(false)}
              onSubmit={handlePasteSubmit}
            />

            {/* Screenshot overlay */}
            <ScreenshotModal
              open={screenshotOpen}
              loading={screenshotLoading}
              error={screenshotError}
              onClose={() => { if (!screenshotLoading) { setScreenshotOpen(false); setScreenshotError(null); } }}
              onSubmit={handleScreenshotSubmit}
              onClearError={() => setScreenshotError(null)}
            />

            {/* ── Left panel: Design list ────────────────────────────── */}
            <div className="flex-1 min-w-0 flex flex-col border-r border-border/40">
              <Command
                filter={(value, search, keywords) => {
                  const haystack = [value, ...(keywords || [])]
                    .join(" ")
                    .toLowerCase();
                  return haystack.includes(search.toLowerCase()) ? 1 : 0;
                }}
              >
                <CommandInput
                  placeholder="Buscar diseño…"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList className="max-h-none flex-1 overflow-y-auto">
                  <CommandEmpty className="py-4 text-center typo-caption">
                    No se encontraron diseños
                  </CommandEmpty>
                  <CommandGroup>
                    {/* None */}
                    <CommandItem
                      value="__none__"
                      keywords={["ninguno", "sin diseño", "none"]}
                      onSelect={() => handleSelect("__none__")}
                      className={cn(
                        "cursor-pointer typo-dropdown",
                        currentValue === "__none__" && "bg-primary/8 !font-bold",
                      )}
                    >
                      <span className="w-4 shrink-0 flex items-center justify-center">
                        {currentValue === "__none__" && (
                          <Check size={14} className="text-primary" />
                        )}
                      </span>
                      <XSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col gap-0 flex-1 min-w-0">
                        <span className="truncate">Ninguno</span>
                        <span className="typo-caption leading-tight opacity-70 truncate">
                          Sin sistema de diseño predefinido
                        </span>
                      </div>
                    </CommandItem>

                    {/* Custom (if set) */}
                    {selected?.id === "__custom__" && (
                      <CommandItem
                        value="__custom__"
                        keywords={["personalizado", "custom"]}
                        onSelect={() => handleSelect("__custom__")}
                        className={cn(
                          "cursor-pointer typo-dropdown",
                          "bg-primary/8 !font-bold",
                        )}
                      >
                        <span className="w-4 shrink-0 flex items-center justify-center">
                          <Check size={14} className="text-primary" />
                        </span>
                        <FileText className="w-4 h-4 shrink-0 text-primary" />
                        <div className="flex flex-col gap-0 flex-1 min-w-0">
                          <span className="truncate">Diseño personalizado</span>
                          <span className="typo-caption leading-tight opacity-70 truncate">
                            {(selected.customContent?.length ?? 0).toLocaleString()} caracteres cargados
                          </span>
                        </div>
                      </CommandItem>
                    )}

                    {/* Loading skeletons */}
                    {isLoading &&
                      Array.from({ length: 5 }).map((_, i) => (
                        <CommandItem
                          key={`__loading_${i}__`}
                          value={`__loading_${i}__`}
                          disabled
                          className="cursor-default"
                        >
                          <span className="w-4" />
                          <div className="w-5 h-5 rounded-full bg-muted animate-pulse" />
                          <div className="flex flex-col gap-1 flex-1">
                            <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                            <div className="h-2 w-32 bg-muted/60 animate-pulse rounded" />
                          </div>
                        </CommandItem>
                      ))}

                    {/* Brand designs */}
                    {allDesigns.map((d) => {
                      const isSelected = currentValue === d.id;
                      return (
                        <CommandItem
                          key={d.id}
                          value={d.id}
                          keywords={[d.id, d.description]}
                          onSelect={() => handleSelect(d.id)}
                          className={cn(
                            "cursor-pointer typo-dropdown",
                            isSelected && "bg-primary/8 !font-bold",
                          )}
                        >
                          <span className="w-4 shrink-0 flex items-center justify-center">
                            {isSelected && (
                              <Check size={14} className="text-primary" />
                            )}
                          </span>
                          <BrandAvatar id={d.id} className="w-5 h-5" />
                          <div className="flex flex-col gap-0 flex-1 min-w-0">
                            <span className="truncate">
                              {d.id.charAt(0).toUpperCase() + d.id.slice(1)}
                            </span>
                            <span className="typo-caption leading-tight opacity-70 line-clamp-2">
                              {d.description}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>

            {/* ── Right panel: Upload / Paste ────────────────────────── */}
            <div className="w-[170px] shrink-0 flex flex-col bg-muted/20">
              <div className="px-3 py-2 border-b border-border/40">
                <span className="typo-menu-header uppercase tracking-wider opacity-70">
                  Personalizar
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {/* Upload */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full flex items-start gap-2 rounded-lg px-2.5 py-2.5 text-left transition-all duration-150",
                    "cursor-pointer hover:bg-muted/60",
                  )}
                >
                  <Upload size={14} className="shrink-0 mt-0.5 text-primary" />
                  <div className="flex flex-col gap-0 min-w-0">
                    <span className="typo-select font-medium">Subir archivo</span>
                    <span className="typo-micro text-muted-foreground leading-tight">
                      Selecciona un .md de tu equipo
                    </span>
                  </div>
                </button>

                {/* Paste */}
                <button
                  type="button"
                  onClick={() => setPasteOpen(true)}
                  className={cn(
                    "w-full flex items-start gap-2 rounded-lg px-2.5 py-2.5 text-left transition-all duration-150",
                    "cursor-pointer hover:bg-muted/60",
                  )}
                >
                  <ClipboardPaste
                    size={14}
                    className="shrink-0 mt-0.5 text-primary"
                  />
                  <div className="flex flex-col gap-0 min-w-0">
                    <span className="typo-select font-medium">Pegar contenido</span>
                    <span className="typo-micro text-muted-foreground leading-tight">
                      Pega el markdown directamente
                    </span>
                  </div>
                </button>

                {/* Screenshot */}
                {supportsImages ? (
                  <button
                    type="button"
                    onClick={() => setScreenshotOpen(true)}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-lg px-2.5 py-2.5 text-left transition-all duration-150",
                      "cursor-pointer hover:bg-muted/60",
                    )}
                  >
                    <Camera
                      size={14}
                      className="shrink-0 mt-0.5 text-primary"
                    />
                    <div className="flex flex-col gap-0 min-w-0">
                      <span className="typo-select font-medium">Desde captura</span>
                      <span className="typo-micro text-muted-foreground leading-tight">
                        Genera diseño con IA
                      </span>
                    </div>
                  </button>
                ) : (
                  <div
                    className={cn(
                      "w-full flex items-start gap-2 rounded-lg px-2.5 py-2.5 text-left",
                      "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <Camera
                      size={14}
                      className="shrink-0 mt-0.5 text-muted-foreground"
                    />
                    <div className="flex flex-col gap-0 min-w-0">
                      <span className="typo-select font-medium text-muted-foreground">Desde captura</span>
                      <span className="typo-micro text-muted-foreground/80 leading-tight">
                        {isStrategistMode
                          ? "El modelo estratega no soporta imágenes"
                          : "El modelo actual no soporta imágenes"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Current custom indicator */}
              {selected?.id === "__custom__" && (
                <div className="px-3 py-2 border-t border-border/40 typo-micro text-primary/80 text-center">
                  Diseño personalizado cargado
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md"
        onChange={handleFileUpload}
        className="hidden"
      />
    </>
  );
};
