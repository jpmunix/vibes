import React, { useState, useRef, useEffect, useMemo } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotatorToolbar } from "@/components/preview_panel/AnnotatorToolbar";
import { DraggableTextInput } from "@/components/preview_panel/DraggableTextInput";
import { useSetAtom } from "jotai";
import { chatInputValueAtom } from "@/atoms/chatAtoms";

// Types
type Point = [number, number];
type Shape =
  | {
    id: string;
    type: "line";
    points: Point[];
    color: string;
    size: number;
    isComplete: boolean;
  }
  | {
    id: string;
    type: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    strokeWidth: number;
    isComplete: boolean;
  }
  | {
    id: string;
    type: "text";
    x: number;
    y: number;
    text: string;
    fontSize: number;
    color: string;
  }
  | {
    id: string;
    type: "arrow";
    points: [number, number, number, number];
    color: string;
    strokeWidth: number;
    isComplete: boolean;
  };

// Custom Image Hook
const useImage = (url: string) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = url;
    img.onload = () => setImage(img);
  }, [url]);
  return image;
};

export const Annotator = ({
  screenshotUrl,
  onSubmit,
  handleAnnotatorClick,
}: {
  screenshotUrl: string;
  onSubmit?: (
    file: File[],
    type?: "chat-context" | "upload-to-codebase",
  ) => void;
  handleAnnotatorClick: () => void;
}) => {
  const image = useImage(screenshotUrl);
  const [tool, setTool] = useState<"select" | "draw" | "rect" | "text" | "arrow">("draw");
  const [color, setColor] = useState<string>("#ef4444");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  const spanRef = useRef<HTMLSpanElement[]>([]);
  const inputRef = useRef<HTMLInputElement[]>([]);
  const setChatInput = useSetAtom(chatInputValueAtom);

  // Text input state - now supports multiple inputs
  const [textInputs, setTextInputs] = useState<
    Array<{
      id: string;
      x: number;
      y: number;
      adjustedX: number;
      adjustedY: number;
      value: string;
      color: string;
    }>
  >([]);

  // Drawing state
  const isDrawing = useRef(false);
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Container dimensions
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Initialize history
  useEffect(() => {
    if (history.length === 0) {
      setHistory([[]]);
    }
  }, []);

  // Save history
  const saveHistory = (newShapes: Shape[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const getAnnotatedBlob = async (): Promise<Blob | null> => {
    if (!stageRef.current) return null;

    // Auto-submit any pending text inputs
    textInputs.forEach((input) => {
      if (input.value.trim()) {
        const newShape: Shape = {
          id: Date.now().toString(),
          type: "text",
          x: input.x + 32,
          y: input.y + 8,
          text: input.value,
          fontSize: 24,
          color: input.color,
        };
        setShapes((prev) => [...prev, newShape]);
      }
    });
    setTextInputs([]);

    // Wait a tick for state to update
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Export the stage as a blob
    const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
    const response = await fetch(uri);
    return await response.blob();
  };

  const handleSubmit = async () => {
    if (!stageRef.current || !onSubmit) return;

    try {
      const blob = await getAnnotatedBlob();
      if (!blob) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File([blob], `annotated-screenshot-${timestamp}.png`, {
        type: "image/png",
      });

      onSubmit([file], "chat-context");
      handleAnnotatorClick();
    } catch (error) {
      console.error("Failed to export annotated image:", error);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const blob = await getAnnotatedBlob();
      if (!blob) return;

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const handleSaveAsFile = async () => {
    try {
      const blob = await getAnnotatedBlob();
      if (!blob) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshot-${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setShapes(history[historyStep - 1]);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setShapes(history[historyStep + 1]);
    }
  };

  const handleDelete = () => {
    if (selectedId) {
      const newShapes = shapes.filter((s) => s.id !== selectedId);
      setShapes(newShapes);
      setSelectedId(null);
      saveHistory(newShapes);
    }
  };

  const handleTextInputChange = (inputId: string, value: string) => {
    setTextInputs((prev) =>
      prev.map((i) => (i.id === inputId ? { ...i, value } : i)),
    );
  };

  const handleTextInputMove = (
    inputId: string,
    x: number,
    y: number,
    adjustedX: number,
    adjustedY: number,
  ) => {
    setTextInputs((prev) =>
      prev.map((i) =>
        i.id === inputId ? { ...i, x, y, adjustedX, adjustedY } : i,
      ),
    );
  };

  const handleTextInputKeyDown = (
    inputId: string,
    e: React.KeyboardEvent,
    index: number,
  ) => {
    if (e.key === "Enter") {
      if (!spanRef.current[index] || !inputRef.current[index]) return;
      spanRef.current[index].textContent = inputRef.current[index].value || "";
      const width = spanRef.current[index].offsetWidth + 8; // padding
      inputRef.current[index].style.width = width + "px";
    } else if (e.key === "Escape") {
      setTextInputs((prev) => prev.filter((i) => i.id !== inputId));
    }
  };

  const handleTextInputRemove = (inputId: string) => {
    setTextInputs((prev) => prev.filter((i) => i.id !== inputId));
  };

  const handleMouseDown = (e: any) => {
    if (tool === "select") {
      const clickedOnEmpty = e.target === e.target.getStage();
      if (clickedOnEmpty) {
        setSelectedId(null);
      }
      return;
    }

    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;

    // Adjust coordinates for scale
    const adjustedPos = {
      x: pos.x / scale,
      y: pos.y / scale,
    };

    if (tool === "draw") {
      isDrawing.current = true;
      const id = Date.now().toString();
      const newShape: Shape = {
        id,
        type: "line",
        points: [[adjustedPos.x, adjustedPos.y]],
        color: color,
        size: 6,
        isComplete: false,
      };
      setShapes([...shapes, newShape]);
      setSelectedId(null);
    } else if (tool === "rect") {
      isDrawing.current = true;
      const id = Date.now().toString();
      const newShape: Shape = {
        id,
        type: "rect",
        x: adjustedPos.x,
        y: adjustedPos.y,
        width: 0,
        height: 0,
        color: color,
        strokeWidth: 3,
        isComplete: false,
      };
      setShapes([...shapes, newShape]);
      setSelectedId(null);
    } else if (tool === "arrow") {
      isDrawing.current = true;
      const id = Date.now().toString();
      const newShape: Shape = {
        id,
        type: "arrow",
        points: [adjustedPos.x, adjustedPos.y, adjustedPos.x, adjustedPos.y],
        color: color,
        strokeWidth: 3,
        isComplete: false,
      };
      setShapes([...shapes, newShape]);
      setSelectedId(null);
    } else if (tool === "text") {
      const newInput = {
        id: Date.now().toString(),
        x: pos.x,
        y: pos.y,
        adjustedX: adjustedPos.x,
        adjustedY: adjustedPos.y,
        value: "",
        color: color,
      };
      setTextInputs([...textInputs, newInput]);
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;
    if (tool !== "draw" && tool !== "rect" && tool !== "arrow") return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    if (!point) return;

    // Adjust coordinates for scale
    const adjustedPoint = {
      x: point.x / scale,
      y: point.y / scale,
    };

    const lastShape = shapes[shapes.length - 1];

    if (tool === "draw" && lastShape && lastShape.type === "line") {
      // Append point
      const newPoints = [
        ...lastShape.points,
        [adjustedPoint.x, adjustedPoint.y] as Point,
      ];
      const updatedShape = { ...lastShape, points: newPoints };

      // Update shapes without saving history yet (performance)
      const newShapes = shapes.slice(0, -1).concat(updatedShape);
      setShapes(newShapes);
    } else if (tool === "rect" && lastShape && lastShape.type === "rect") {
      const updatedShape = {
        ...lastShape,
        width: adjustedPoint.x - lastShape.x,
        height: adjustedPoint.y - lastShape.y,
      };
      const newShapes = shapes.slice(0, -1).concat(updatedShape);
      setShapes(newShapes);
    } else if (tool === "arrow" && lastShape && lastShape.type === "arrow") {
      const updatedShape = {
        ...lastShape,
        points: [lastShape.points[0], lastShape.points[1], adjustedPoint.x, adjustedPoint.y] as [number, number, number, number],
      };
      const newShapes = shapes.slice(0, -1).concat(updatedShape);
      setShapes(newShapes);
    }
  };

  const handleMouseUp = () => {
    if ((tool === "draw" || tool === "rect" || tool === "arrow") && isDrawing.current) {
      isDrawing.current = false;
      const lastShape = shapes[shapes.length - 1];
      if (lastShape && (lastShape.type === "line" || lastShape.type === "rect" || lastShape.type === "arrow")) {
        const completedShape = { ...lastShape, isComplete: true };
        const newShapes = shapes.slice(0, -1).concat(completedShape);
        setShapes(newShapes);
        saveHistory(newShapes);
      }
    }
  };

  // Update transformer selection
  useEffect(() => {
    if (selectedId && transformerRef.current && stageRef.current) {
      const node = stageRef.current.findOne("#" + selectedId);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer().batchDraw();
      }
    }
  }, [selectedId, shapes]);

  // Calculate scale to fit image in container
  const scale = useMemo(() => {
    if (!image || containerSize.width === 0 || containerSize.height === 0)
      return 1;

    const scaleX = containerSize.width / image.width;

    // Fit width and allow scrolling for height
    return scaleX;
  }, [image, containerSize]);

  // Calculate actual stage dimensions
  const stageDimensions = useMemo(() => {
    if (!image)
      return {
        width: containerSize.width || 800,
        height: containerSize.height || 600,
      };

    return {
      width: image.width * scale,
      height: image.height * scale,
    };
  }, [image, scale, containerSize]);

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Toolbar */}
      <AnnotatorToolbar
        tool={tool}
        color={color}
        selectedId={selectedId}
        historyStep={historyStep}
        historyLength={history.length}
        onToolChange={setTool}
        onColorChange={setColor}
        onDelete={handleDelete}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSubmit={handleSubmit}
        onCopyToClipboard={handleCopyToClipboard}
        onSaveAsFile={handleSaveAsFile}
        onDeactivate={handleAnnotatorClick}
        hasSubmitHandler={!!onSubmit}
      />

      {/* Canvas Container - Scrollable */}
      <div ref={containerRef} className="flex-1 relative overflow-auto">
        {textInputs.map((input, index) => (
          <DraggableTextInput
            key={input.id}
            input={input}
            index={index}
            totalInputs={textInputs.length}
            scale={scale}
            onMove={handleTextInputMove}
            onChange={handleTextInputChange}
            onKeyDown={handleTextInputKeyDown}
            onRemove={handleTextInputRemove}
            spanRef={spanRef}
            inputRef={inputRef}
            color={input.color}
            containerRef={containerRef}
          />
        ))}

        <AnnotationCanvas
          image={image}
          shapes={shapes}
          selectedId={selectedId}
          tool={tool}
          scale={scale}
          stageDimensions={stageDimensions}
          containerSize={containerSize}
          stageRef={stageRef}
          transformerRef={transformerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onShapeSelect={setSelectedId}
          onShapeDragEnd={(id, x, y) => {
            const newShapes = shapes.map((s) =>
              s.id === id ? { ...s, x, y } : s,
            );
            setShapes(newShapes);
            saveHistory(newShapes);
          }}
        />
      </div>
    </div>
  );
};
