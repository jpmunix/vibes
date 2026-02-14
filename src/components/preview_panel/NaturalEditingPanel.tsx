import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    X,
    ChevronDown,
    Type,
    Box,
    Image,
    MousePointer2,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    AlertTriangle,
    Wand2,
    Pencil,
    Loader2,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ComponentSelection, ElementType } from "@/ipc/types";
import { ipc } from "@/ipc/types";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
    pendingVisualChangesAtom,
    selectedComponentsPreviewAtom,
    visualEditingSelectedComponentAtom,
    elementTypeAtom,
    naturalEditingPanelOpenAtom,
    isDynamicComponentAtom,
    hasStaticTextAtom,
    iconSelectorOpenAtom,
    currentIconNameAtom,
    iconLineAtom,
    componentTextContentAtom,
} from "@/atoms/previewAtoms";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { NumberInput } from "@/components/ui/NumberInput";
import { rgbToHex, processNumericValue } from "@/utils/style-utils";
import { IconSelector } from "./IconSelector";
import "./NaturalEditingPanel.css";

const FONT_WEIGHT_OPTIONS = [
    { value: "", label: "Default" },
    { value: "100", label: "Thin (100)" },
    { value: "200", label: "Extra Light (200)" },
    { value: "300", label: "Light (300)" },
    { value: "400", label: "Normal (400)" },
    { value: "500", label: "Medium (500)" },
    { value: "600", label: "Semi Bold (600)" },
    { value: "700", label: "Bold (700)" },
    { value: "800", label: "Extra Bold (800)" },
    { value: "900", label: "Black (900)" },
] as const;

const FONT_FAMILY_OPTIONS = [
    { value: "", label: "Default" },
    { value: "Arial, sans-serif", label: "Arial" },
    { value: "Inter, sans-serif", label: "Inter" },
    { value: "Roboto, sans-serif", label: "Roboto" },
    { value: "Georgia, serif", label: "Georgia" },
    { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
    { value: "Merriweather, serif", label: "Merriweather" },
    { value: "'Courier New', Courier, monospace", label: "Courier New" },
    { value: "'Fira Code', monospace", label: "Fira Code" },
    { value: "Consolas, monospace", label: "Consolas" },
    { value: "Impact, fantasy", label: "Impact" },
    { value: "'Bebas Neue', cursive", label: "Bebas Neue" },
    { value: "'Comic Sans MS', cursive", label: "Comic Sans MS" },
] as const;

const SHADOW_OPTIONS = [
    { value: "none", label: "None" },
    { value: "sm", label: "Small" },
    { value: "md", label: "Medium" },
    { value: "lg", label: "Large" },
    { value: "xl", label: "Extra Large" },
    { value: "2xl", label: "2XL" },
] as const;

const DISPLAY_OPTIONS = [
    { value: "block", label: "Block" },
    { value: "flex", label: "Flex" },
    { value: "grid", label: "Grid" },
    { value: "inline-flex", label: "Inline Flex" },
    { value: "inline", label: "Inline" },
    { value: "none", label: "Hidden" },
] as const;

const ELEMENT_TYPE_CONFIG: Record<
    ElementType,
    { label: string; icon: React.ReactNode }
> = {
    text: { label: "Text", icon: <Type size={14} /> },
    container: { label: "Container", icon: <Box size={14} /> },
    image: { label: "Image", icon: <Image size={14} /> },
    button: { label: "Button", icon: <MousePointer2 size={14} /> },
    unknown: { label: "Element", icon: <Box size={14} /> },
};

interface NaturalEditingPanelProps {
    selectedComponent: ComponentSelection | null;
    iframeRef: HTMLIFrameElement | null;
}

export function NaturalEditingPanel({
    selectedComponent,
    iframeRef,
}: NaturalEditingPanelProps) {
    const elementType = useAtomValue(elementTypeAtom);
    const setNaturalEditingPanelOpen = useSetAtom(naturalEditingPanelOpenAtom);
    const setPendingChanges = useSetAtom(pendingVisualChangesAtom);
    const setSelectedComponentsPreview = useSetAtom(selectedComponentsPreviewAtom);
    const setVisualEditingSelectedComponent = useSetAtom(
        visualEditingSelectedComponentAtom,
    );
    const isDynamic = useAtomValue(isDynamicComponentAtom);
    const hasStaticText = useAtomValue(hasStaticTextAtom);
    const [iconSelectorOpen, setIconSelectorOpen] = useAtom(iconSelectorOpenAtom);
    const [currentIconName, setCurrentIconName] = useAtom(currentIconNameAtom);
    const iconLine = useAtomValue(iconLineAtom);
    const componentTextContent = useAtomValue(componentTextContentAtom);
    const appId = useAtomValue(selectedAppIdAtom);

    // Create a ref-like object from the raw iframe element
    const iframeRefObj = useMemo(
        () => ({ current: iframeRef }),
        [iframeRef],
    );

    // Accordion section state
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(["content", "typography", "spacing", "appearance", "layout"]),
    );

    // Style state
    const [currentMargin, setCurrentMargin] = useState({ x: "", y: "" });
    const [currentPadding, setCurrentPadding] = useState({ x: "", y: "" });
    const [currentBorder, setCurrentBorder] = useState({
        width: "",
        radius: "",
        color: "#000000",
    });
    const [currentBackgroundColor, setCurrentBackgroundColor] =
        useState("#ffffff");
    const [currentTextStyles, setCurrentTextStyles] = useState({
        fontSize: "",
        fontWeight: "",
        fontFamily: "",
        color: "#000000",
        textAlign: "",
    });
    const [currentOpacity, setCurrentOpacity] = useState("1");
    const [currentShadow, setCurrentShadow] = useState("none");
    const [currentGap, setCurrentGap] = useState("");
    const [currentDisplay, setCurrentDisplay] = useState("");
    const [currentFlexDirection, setCurrentFlexDirection] = useState("");
    const [currentTextContent, setCurrentTextContent] = useState("");

    // Resize state
    const [panelWidth, setPanelWidth] = useState(360);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        startX.current = e.clientX;
        startWidth.current = panelWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [panelWidth]);

    useEffect(() => {
        if (!isDragging) return;

        const handleResizeMove = (e: MouseEvent) => {
            const delta = startX.current - e.clientX;
            const newWidth = Math.min(Math.max(startWidth.current + delta, 280), 700);
            setPanelWidth(newWidth);
        };

        const handleResizeEnd = () => {
            setIsDragging(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        return () => {
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
        };
    }, [isDragging]);

    // Sync text content from backend analysis
    useEffect(() => {
        setCurrentTextContent(componentTextContent);
    }, [componentTextContent]);

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    const handleClose = () => {
        if (selectedComponent) {
            setSelectedComponentsPreview((prev) =>
                prev.filter((c) => c.id !== selectedComponent.id),
            );
            setVisualEditingSelectedComponent(null);

            if (iframeRefObj.current?.contentWindow) {
                iframeRefObj.current.contentWindow.postMessage(
                    {
                        type: "remove-dyad-component-overlay",
                        componentId: selectedComponent.id,
                    },
                    "*",
                );
            }
        }
        setNaturalEditingPanelOpen(false);
    };

    const sendStyleModification = useCallback(
        (styles: Record<string, any>) => {
            if (!iframeRefObj.current?.contentWindow || !selectedComponent) return;
            console.log("[sendStyleModification] Recibido:", styles);
            console.log("[sendStyleModification] iframe disponible?", !!iframeRefObj.current?.contentWindow);
            console.log("[sendStyleModification] componente seleccionado?", !!selectedComponent);

            iframeRefObj.current.contentWindow.postMessage(
                {
                    type: "modify-dyad-component-styles",
                    data: {
                        elementId: selectedComponent.id,
                        runtimeId: selectedComponent.runtimeId,
                        styles,
                    },
                },
                "*",
            );

            iframeRefObj.current.contentWindow.postMessage(
                { type: "update-dyad-overlay-positions" },
                "*",
            );

            setPendingChanges((prev) => {
                const updated = new Map(prev);
                const existing = updated.get(selectedComponent.id);
                const newStyles: any = { ...existing?.styles };

                if (styles.margin)
                    newStyles.margin = { ...existing?.styles?.margin, ...styles.margin };
                if (styles.padding)
                    newStyles.padding = {
                        ...existing?.styles?.padding,
                        ...styles.padding,
                    };
                if (styles.border)
                    newStyles.border = { ...existing?.styles?.border, ...styles.border };
                if (styles.backgroundColor)
                    newStyles.backgroundColor = styles.backgroundColor;
                if (styles.text)
                    newStyles.text = { ...existing?.styles?.text, ...styles.text };
                if (styles.opacity !== undefined) newStyles.opacity = styles.opacity;
                if (styles.boxShadow !== undefined)
                    newStyles.boxShadow = styles.boxShadow;
                if (styles.gap !== undefined) newStyles.gap = styles.gap;
                if (styles.display !== undefined) newStyles.display = styles.display;
                if (styles.flexDirection !== undefined)
                    newStyles.flexDirection = styles.flexDirection;

                const change: any = {
                    componentId: selectedComponent.id,
                    componentName: selectedComponent.name,
                    relativePath: selectedComponent.relativePath,
                    lineNumber: selectedComponent.lineNumber,
                    styles: newStyles,
                };
                // Only include textContent if it was previously set
                if (existing?.textContent !== undefined) {
                    change.textContent = existing.textContent;
                }

                updated.set(selectedComponent.id, change);

                console.log('[NaturalEditingPanel] Added change to pending:', change);
                console.log('[NaturalEditingPanel] Total pending changes:', updated.size);

                return updated;
            });
        },
        [selectedComponent, iframeRefObj, setPendingChanges],
    );

    // Fetch current styles when component changes
    useEffect(() => {
        if (!selectedComponent || !iframeRefObj.current?.contentWindow) return;

        iframeRefObj.current.contentWindow.postMessage(
            {
                type: "get-dyad-component-styles",
                data: {
                    elementId: selectedComponent.id,
                    runtimeId: selectedComponent.runtimeId,
                },
            },
            "*",
        );
    }, [selectedComponent, iframeRefObj]);

    // Request current text content from iframe DOM for text/button elements without static text
    useEffect(() => {
        if (!selectedComponent || !iframeRefObj.current?.contentWindow) return;
        if (hasStaticText) return; // Already have text from AST analysis
        if (!["text", "button"].includes(elementType)) return;

        iframeRefObj.current.contentWindow.postMessage(
            {
                type: "get-dyad-text-content",
                data: {
                    componentId: selectedComponent.id,
                    runtimeId: selectedComponent.runtimeId,
                },
            },
            "*",
        );
    }, [selectedComponent, iframeRefObj, hasStaticText, elementType]);

    // Listen for style responses from iframe
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === "dyad-component-styles") {
                const {
                    margin,
                    padding,
                    border,
                    backgroundColor,
                    text,
                    opacity,
                    boxShadow,
                    gap,
                    display,
                    flexDirection,
                } = event.data.data;

                const marginX = margin?.left === margin?.right ? margin.left : "";
                const marginY = margin?.top === margin?.bottom ? margin.top : "";
                const paddingX =
                    padding?.left === padding?.right ? padding.left : "";
                const paddingY =
                    padding?.top === padding?.bottom ? padding.top : "";

                setCurrentMargin({ x: marginX, y: marginY });
                setCurrentPadding({ x: paddingX, y: paddingY });
                setCurrentBorder({
                    width: border?.width || "",
                    radius: border?.radius || "",
                    color: rgbToHex(border?.color),
                });
                setCurrentBackgroundColor(rgbToHex(backgroundColor) || "#ffffff");
                setCurrentTextStyles({
                    fontSize: text?.fontSize || "",
                    fontWeight: text?.fontWeight || "",
                    fontFamily: text?.fontFamily || "",
                    color: rgbToHex(text?.color) || "#000000",
                    textAlign: text?.textAlign || "",
                });
                setCurrentOpacity(opacity || "1");
                setCurrentShadow(boxShadow || "none");
                setCurrentGap(gap || "");
                setCurrentDisplay(display || "");
                setCurrentFlexDirection(flexDirection || "");
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    // Listen for text content response from iframe (for dynamic text elements)
    useEffect(() => {
        const handleTextResponse = (event: MessageEvent) => {
            if (event.data?.type === "dyad-text-content-response") {
                const { text } = event.data;
                if (text && !componentTextContent) {
                    setCurrentTextContent(text.trim());
                }
            }
        };

        window.addEventListener("message", handleTextResponse);
        return () => window.removeEventListener("message", handleTextResponse);
    }, [componentTextContent]);

    const handleSpacingChange = (
        type: "margin" | "padding",
        axis: "x" | "y",
        value: string,
    ) => {
        const setter = type === "margin" ? setCurrentMargin : setCurrentPadding;
        setter((prev) => ({ ...prev, [axis]: value }));

        if (value) {
            const processedValue = processNumericValue(value);
            const data =
                axis === "x"
                    ? { left: processedValue, right: processedValue }
                    : { top: processedValue, bottom: processedValue };

            sendStyleModification({ [type]: data });
        }
    };

    const handleBorderChange = (
        property: "width" | "radius" | "color",
        value: string,
    ) => {
        const newBorder = { ...currentBorder, [property]: value };
        setCurrentBorder(newBorder);

        if (value) {
            let processedValue = value;
            if (property !== "color" && /^\d+$/.test(value)) {
                processedValue = `${value}px`;
            }

            if (property === "width" || property === "color") {
                sendStyleModification({
                    border: {
                        width:
                            property === "width"
                                ? processedValue
                                : currentBorder.width || "0px",
                        color: property === "color" ? processedValue : currentBorder.color,
                    },
                });
            } else {
                sendStyleModification({ border: { [property]: processedValue } });
            }
        }
    };

    const handleTextStyleChange = (
        property: "fontSize" | "fontWeight" | "fontFamily" | "color" | "textAlign",
        value: string,
    ) => {
        setCurrentTextStyles((prev) => ({ ...prev, [property]: value }));

        if (value) {
            let processedValue = value;
            if (property === "fontSize" && /^\d+$/.test(value)) {
                processedValue = `${value}px`;
            }

            if (property === "textAlign") {
                sendStyleModification({ text: { textAlign: processedValue } });
            } else {
                sendStyleModification({ text: { [property]: processedValue } });
            }
        }
    };

    const handleIconChange = useCallback(async (newIconName: string) => {
        if (!selectedComponent || !appId) return;

        // Build componentId targeting the icon line (child icon or direct icon)
        const targetLine = iconLine || selectedComponent.lineNumber;
        const iconComponentId = `${selectedComponent.relativePath}:${targetLine}`;

        try {
            console.log("Replacing icon with:", newIconName, "at line:", targetLine);
            await ipc.visualEditing.replaceIcon({
                appId,
                componentId: iconComponentId,
                newIconName,
            });

            // Optimistic update
            setCurrentIconName(newIconName);
            setIconSelectorOpen(false);
        } catch (error) {
            console.error("Failed to replace icon:", error);
        }
    }, [selectedComponent, appId, iconLine, setCurrentIconName, setIconSelectorOpen]);

    const handleTextContentChange = useCallback((text: string) => {
        if (!selectedComponent) return;

        setPendingChanges((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(selectedComponent.id);

            updated.set(selectedComponent.id, {
                componentId: selectedComponent.id,
                componentName: existing?.componentName || selectedComponent.name,
                relativePath: selectedComponent.relativePath,
                lineNumber: selectedComponent.lineNumber,
                styles: existing?.styles || {},
                textContent: text,
            });

            return updated;
        });
    }, [selectedComponent, setPendingChanges]);

    const sendTextPreview = useCallback((text: string) => {
        if (!selectedComponent || !iframeRefObj.current?.contentWindow) return;
        iframeRefObj.current.contentWindow.postMessage(
            {
                type: "preview-dyad-text-content",
                data: {
                    componentId: selectedComponent.id,
                    runtimeId: selectedComponent.runtimeId,
                    text,
                },
            },
            "*",
        );
    }, [selectedComponent, iframeRefObj]);

    if (!selectedComponent) return null;

    const showTypography = ["text", "button", "unknown"].includes(elementType);
    const showLayout = ["container", "unknown"].includes(elementType);
    const showContent = ["text", "button"].includes(elementType) || hasStaticText;

    const typeConfig = ELEMENT_TYPE_CONFIG[elementType] || ELEMENT_TYPE_CONFIG.unknown;

    return (
        <div className="natural-editing-panel" style={{ width: panelWidth }}>
            {/* Full-screen overlay during resize to block iframe events */}
            {isDragging && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        cursor: 'col-resize',
                    }}
                />
            )}
            {/* Resize handle */}
            <div
                className={`nep-resize-handle${isDragging ? ' dragging' : ''}`}
                onMouseDown={handleResizeStart}
            />
            {/* Header */}
            <div className="nep-header">
                <div className="nep-header-info">
                    <span className="nep-header-name">{selectedComponent.name}</span>
                    <span className="nep-header-path">
                        {selectedComponent.relativePath}:{selectedComponent.lineNumber}
                    </span>
                </div>
                <button
                    onClick={handleClose}
                    className="nep-close-btn"
                    aria-label="Close panel"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Element type badge - hide when icon is detected */}
            {!currentIconName && (
                <div className="nep-type-badge">
                    {typeConfig.icon}
                    <span>{typeConfig.label}</span>
                </div>
            )}

            {/* Dynamic warning */}
            {isDynamic && (
                <div className="nep-dynamic-warn">
                    <AlertTriangle size={14} />
                    <span>El estilo de este elemento cambia según condiciones</span>
                </div>
            )}

            {/* Icon Section - shown when icon is detected */}
            {currentIconName && (
                <div className="nep-section">
                    <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <Wand2 size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
                            <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: '13px', fontWeight: 500, margin: 0 }}>
                                    Icono: {currentIconName}
                                </p>
                                <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>
                                    Haz clic para cambiarlo
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIconSelectorOpen(true)}
                            className="nep-close-btn"
                            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer' }}
                            type="button"
                        >
                            Cambiar
                        </button>
                    </div>
                </div>
            )}

            {/* Text Content Section */}
            {showContent && (
                <Section
                    title="Content"
                    expanded={expandedSections.has("content")}
                    onToggle={() => toggleSection("content")}
                >
                    <div className="nep-control-full">
                        <Label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Pencil size={12} />
                            Text Content
                        </Label>
                        <textarea
                            className="nep-select"
                            style={{
                                resize: 'vertical',
                                minHeight: '60px',
                                fontFamily: 'inherit',
                                lineHeight: '1.4',
                            }}
                            value={currentTextContent}
                            onChange={(e) => {
                                setCurrentTextContent(e.target.value);
                                handleTextContentChange(e.target.value);
                                sendTextPreview(e.target.value);
                            }}
                            placeholder="Enter text content..."
                        />
                    </div>
                </Section>
            )}

            {/* Typography Section */}
            {showTypography && (
                <Section
                    title="Typography"
                    expanded={expandedSections.has("typography")}
                    onToggle={() => toggleSection("typography")}
                >
                    <NumberInput
                        id="font-size"
                        label="Font Size"
                        value={currentTextStyles.fontSize}
                        onChange={(v) => handleTextStyleChange("fontSize", v)}
                        placeholder="16"
                    />

                    <div className="nep-control-full">
                        <Label htmlFor="font-weight" className="text-xs">
                            Font Weight
                        </Label>
                        <select
                            id="font-weight"
                            className="nep-select"
                            value={currentTextStyles.fontWeight}
                            onChange={(e) =>
                                handleTextStyleChange("fontWeight", e.target.value)
                            }
                        >
                            {FONT_WEIGHT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="nep-control-full">
                        <Label htmlFor="font-family" className="text-xs">
                            Font Family
                        </Label>
                        <select
                            id="font-family"
                            className="nep-select"
                            value={currentTextStyles.fontFamily}
                            onChange={(e) =>
                                handleTextStyleChange("fontFamily", e.target.value)
                            }
                        >
                            {FONT_FAMILY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="nep-control-full">
                        <Label className="text-xs">Text Color</Label>
                        <ColorPicker
                            id="text-color"
                            value={currentTextStyles.color}
                            onChange={(v) => handleTextStyleChange("color", v)}
                            className="mt-1"
                        />
                    </div>

                    {showContent && (
                        <div className="nep-control-full">
                            <Label className="text-xs">Text Align</Label>
                            <div className="nep-align-group">
                                {[
                                    { value: "left", icon: <AlignLeft size={14} /> },
                                    { value: "center", icon: <AlignCenter size={14} /> },
                                    { value: "right", icon: <AlignRight size={14} /> },
                                    { value: "justify", icon: <AlignJustify size={14} /> },
                                ].map(({ value, icon }) => (
                                    <button
                                        key={value}
                                        className={`nep-align-btn ${currentTextStyles.textAlign === value ? "active" : ""}`}
                                        onClick={() => handleTextStyleChange("textAlign", value)}
                                        aria-label={`Align ${value}`}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {/* Layout Section (containers only) */}
            {showLayout && (
                <Section
                    title="Layout"
                    expanded={expandedSections.has("layout")}
                    onToggle={() => toggleSection("layout")}
                >
                    <div className="nep-control-full">
                        <Label htmlFor="display" className="text-xs">
                            Display
                        </Label>
                        <select
                            id="display"
                            className="nep-select"
                            value={currentDisplay}
                            onChange={(e) => {
                                setCurrentDisplay(e.target.value);
                                sendStyleModification({ display: e.target.value });
                            }}
                        >
                            {DISPLAY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {(currentDisplay === "flex" ||
                        currentDisplay === "inline-flex") && (
                            <div className="nep-control-full">
                                <Label htmlFor="flex-dir" className="text-xs">
                                    Direction
                                </Label>
                                <select
                                    id="flex-dir"
                                    className="nep-select"
                                    value={currentFlexDirection}
                                    onChange={(e) => {
                                        setCurrentFlexDirection(e.target.value);
                                        sendStyleModification({
                                            flexDirection: e.target.value,
                                        });
                                    }}
                                >
                                    <option value="row">Row</option>
                                    <option value="column">Column</option>
                                    <option value="row-reverse">Row Reverse</option>
                                    <option value="column-reverse">Column Reverse</option>
                                </select>
                            </div>
                        )}

                    <NumberInput
                        id="gap"
                        label="Gap"
                        value={currentGap}
                        onChange={(v) => {
                            setCurrentGap(v);
                            if (v) {
                                sendStyleModification({
                                    gap: processNumericValue(v),
                                });
                            }
                        }}
                        placeholder="0"
                    />
                </Section>
            )}

            {/* Spacing Section (all elements) */}
            <Section
                title="Spacing"
                expanded={expandedSections.has("spacing")}
                onToggle={() => toggleSection("spacing")}
            >
                <div className="nep-control-row">
                    <NumberInput
                        id="margin-x"
                        label="Margin H"
                        value={currentMargin.x}
                        onChange={(v) => handleSpacingChange("margin", "x", v)}
                        placeholder="0"
                    />
                    <NumberInput
                        id="margin-y"
                        label="Margin V"
                        value={currentMargin.y}
                        onChange={(v) => handleSpacingChange("margin", "y", v)}
                        placeholder="0"
                    />
                </div>
                <div className="nep-control-row">
                    <NumberInput
                        id="padding-x"
                        label="Padding H"
                        value={currentPadding.x}
                        onChange={(v) => handleSpacingChange("padding", "x", v)}
                        placeholder="0"
                    />
                    <NumberInput
                        id="padding-y"
                        label="Padding V"
                        value={currentPadding.y}
                        onChange={(v) => handleSpacingChange("padding", "y", v)}
                        placeholder="0"
                    />
                </div>
            </Section>

            {/* Appearance Section (all elements) */}
            <Section
                title="Appearance"
                expanded={expandedSections.has("appearance")}
                onToggle={() => toggleSection("appearance")}
            >
                <div className="nep-control-full">
                    <Label className="text-xs">Background</Label>
                    <ColorPicker
                        id="bg-color"
                        value={currentBackgroundColor}
                        onChange={(v) => {
                            setCurrentBackgroundColor(v);
                            if (v) sendStyleModification({ backgroundColor: v });
                        }}
                        className="mt-1"
                    />
                </div>

                <div className="nep-control-row">
                    <NumberInput
                        id="border-width"
                        label="Border Width"
                        value={currentBorder.width}
                        onChange={(v) => handleBorderChange("width", v)}
                        placeholder="0"
                    />
                    <NumberInput
                        id="border-radius"
                        label="Border Radius"
                        value={currentBorder.radius}
                        onChange={(v) => handleBorderChange("radius", v)}
                        placeholder="0"
                    />
                </div>

                <div className="nep-control-full">
                    <Label className="text-xs">Border Color</Label>
                    <ColorPicker
                        id="border-color"
                        value={currentBorder.color}
                        onChange={(v) => handleBorderChange("color", v)}
                        className="mt-1"
                    />
                </div>

                <div className="nep-control-full">
                    <Label htmlFor="opacity" className="text-xs">
                        Opacity
                    </Label>
                    <div className="nep-slider-group">
                        <input
                            id="opacity"
                            type="range"
                            className="nep-slider"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentOpacity}
                            onChange={(e) => {
                                setCurrentOpacity(e.target.value);
                                sendStyleModification({ opacity: e.target.value });
                            }}
                        />
                        <span className="nep-slider-value">
                            {Math.round(parseFloat(currentOpacity) * 100)}%
                        </span>
                    </div>
                </div>

                <div className="nep-control-full">
                    <Label htmlFor="shadow" className="text-xs">
                        Shadow
                    </Label>
                    <select
                        id="shadow"
                        className="nep-select"
                        value={currentShadow}
                        onChange={(e) => {
                            setCurrentShadow(e.target.value);
                            sendStyleModification({ boxShadow: e.target.value });
                        }}
                    >
                        {SHADOW_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </Section>

            {/* Icon Selector Modal */}
            {iconSelectorOpen && currentIconName && (
                <IconSelector
                    currentIcon={currentIconName}
                    onSelect={handleIconChange}
                    onClose={() => setIconSelectorOpen(false)}
                />
            )}

            {/* Quick Edit Chat */}
            <QuickEditChat
                selectedComponent={selectedComponent}
                currentStyles={{
                    margin: currentMargin,
                    padding: currentPadding,
                    border: currentBorder,
                    backgroundColor: currentBackgroundColor,
                    text: currentTextStyles,
                    opacity: currentOpacity,
                    boxShadow: currentShadow,
                    gap: currentGap,
                    display: currentDisplay,
                    flexDirection: currentFlexDirection,
                }}
                currentTextContent={currentTextContent}
                onChangeApplied={() => {
                    // Refresh the iframe to show changes
                    if (iframeRefObj.current?.contentWindow) {
                        iframeRefObj.current.contentWindow.postMessage(
                            { type: "update-dyad-overlay-positions" },
                            "*",
                        );
                    }
                }}
                appId={appId}
                sendStyleModification={sendStyleModification}
            />
        </div>
    );
}

interface QuickEditChatProps {
    selectedComponent: ComponentSelection | null;
    currentStyles: Record<string, any>;
    currentTextContent: string;
    onChangeApplied: () => void;
    appId: number | null;
    sendStyleModification: (styles: Record<string, any>) => void;
}

function QuickEditChat({
    selectedComponent,
    currentStyles,
    currentTextContent,
    onChangeApplied,
    appId,
    sendStyleModification,
}: QuickEditChatProps) {
    const [prompt, setPrompt] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const setPendingChanges = useSetAtom(pendingVisualChangesAtom);

    // Reset state when component changes
    useEffect(() => {
        setIsProcessing(false);
        setError(null);
        setPrompt("");
    }, [selectedComponent?.id]);

    // Auto-clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleSubmit = async () => {
        if (!prompt.trim() || !selectedComponent || !appId || isProcessing) return;

        setIsProcessing(true);
        setError(null);

        try {
            const result = await ipc.visualEditing.quickEdit({
                appId,
                componentId: selectedComponent.id,
                componentName: selectedComponent.name,
                relativePath: selectedComponent.relativePath,
                lineNumber: selectedComponent.lineNumber,
                prompt,
                currentStyles,
                currentTextContent,
            });

            if (result.error) {
                setError(result.error);
            } else if (result.change) {
                // Check if the AI actually made any changes
                const hasStyleChanges = result.change.styles && Object.keys(result.change.styles).length > 0;
                const hasTextChanges = result.change.textContent !== undefined;
                
                if (!hasStyleChanges && !hasTextChanges) {
                    // AI couldnt interpret the request
                    setError("No entendí esa solicitud. Intenta con algo más específico sobre estilos (ej: hazlo rojo, más grande, borde negro)");
                    return;
                }
                
                // Apply changes visually to iframe immediately
                if (result.change.textContent !== undefined) {
                    window.postMessage(
                        {
                            type: "preview-dyad-text-content",
                            data: {
                                componentId: selectedComponent.id,
                                runtimeId: selectedComponent.runtimeId,
                                text: result.change.textContent,
                            },
                        },
                        "*",
                    );
                }



                // Apply style changes using sendStyleModification for live updates
                if (hasStyleChanges) {
                    console.log("[QuickEdit] Estilos recibidos de IA:", result.change.styles);
                    console.log("[QuickEdit] Llamando sendStyleModification...");
                    sendStyleModification(result.change.styles);
                    console.log("[QuickEdit] sendStyleModification llamado");
                }




                // Notify parent and clear
                onChangeApplied();
                setPrompt("");
            }
        } catch (err) {
            console.error("Quick edit error:", err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="nep-quick-chat">
            <div className="nep-quick-chat-header">
                <span className="nep-quick-chat-title">Explica lo que quieres cambiar</span>
                <span className="nep-quick-chat-subtitle">Para cambios pequeños al elemento seleccionado</span>
            </div>
            <div className="nep-quick-chat-content">
                {error && (
                    <div className="nep-quick-chat-error">
                        {error}
                    </div>
                )}

                {isProcessing ? (
                    <div className="nep-quick-chat-loader">
                        <Loader2 className="nep-quick-chat-loader-icon" />
                        <span>Procesando tu petición...</span>
                    </div>
                ) : (
                    <div className="nep-quick-chat-input-container">
                        <textarea
                            className="nep-quick-chat-input"
                            placeholder="Ej: cambia esto a negro, hazlo más grande..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                        rows={1}
                        ></textarea>
                        <button
                            className="nep-quick-chat-button"
                            onClick={handleSubmit}
                            disabled={!prompt.trim()}
                        >
                            Enviar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* Collapsible section sub-component */
function Section({
    title,
    expanded,
    onToggle,
    children,
}: {
    title: string;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="nep-section">
            <button
                className="nep-section-header"
                onClick={onToggle}
                aria-expanded={expanded}
            >
                <span>{title}</span>
                <ChevronDown size={14} />
            </button>
            {expanded && <div className="nep-section-content">{children}</div>}
        </div>
    );
}
