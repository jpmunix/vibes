import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface ToolbarColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const COLOR_SWATCHES = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ffffff", // white
  "#000000", // black
];

export const ToolbarColorPicker = ({
  color,
  onChange,
}: ToolbarColorPickerProps) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, updatePosition]);

  const isDark = document.documentElement.classList.contains("dark");
  const popoverBg = isDark ? "#1f2937" : "#ffffff";
  const popoverBorder = isDark
    ? "1px solid rgba(255,255,255,0.1)"
    : "1px solid rgba(0,0,0,0.1)";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          backgroundColor: color,
          border: "1.5px solid rgba(128,128,128,0.4)",
          cursor: "pointer",
          display: "block",
          padding: 0,
        }}
        title="Elegir color"
        aria-label="Elegir color"
      />
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              transform: "translateX(-50%)",
              zIndex: 99999,
              padding: 8,
              background: popoverBg,
              borderRadius: 10,
              boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
              border: popoverBorder,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
            }}
          >
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  backgroundColor: c,
                  border:
                    color === c
                      ? "2.5px solid #3b82f6"
                      : c === "#ffffff"
                        ? "1.5px solid #ccc"
                        : "1.5px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                  outline:
                    color === c
                      ? "2px solid rgba(59,130,246,0.3)"
                      : "none",
                  outlineOffset: 1,
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.transform = "scale(1.2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "scale(1)")
                }
                title={c}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};
