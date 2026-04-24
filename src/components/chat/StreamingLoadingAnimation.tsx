import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

interface StreamingLoadingAnimationProps {
  variant: "initial" | "streaming";
  label?: string;
  /** @deprecated kept for API compat — color is now derived from labelColorClass */
  dotColorClass?: string;
  /** Tailwind text-* class for the label, e.g. "text-amber-500". Falls back to text-muted-foreground. */
  labelColorClass?: string;
  /** Short text excerpt to display alongside the loader (e.g. for peeking into thoughts) */
  contentExcerpt?: string;
}

/** Format elapsed seconds into a compact readable string */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

// ─── Color extraction helpers ─────────────────────────────────────────────────

/** Map a Tailwind text-* class to an actual CSS color for the orbital particles.
 *  Uses the SAME source as the label so they always match visually. */
const TEXT_CLASS_TO_HEX: Record<string, string> = {
  "text-purple-500": "#a855f7",
  "text-blue-500": "#3b82f6",
  "text-amber-500": "#f59e0b",
  "text-indigo-500": "#6366f1",
  "text-red-500": "#ef4444",
  "text-cyan-500": "#06b6d4",
  "text-green-500": "#22c55e",
  "text-slate-500": "#64748b",
  "text-orange-500": "#f97316",
  "text-muted-foreground": "#6b7280",
  "text-emerald-500": "#10b981",
  "text-emerald-600 dark:text-lime-500": "#10b981",
  "text-violet-500": "#8b5cf6",
  "text-violet-400": "#a78bfa",
  "text-teal-500": "#14b8a6",
  "text-amber-600 dark:text-yellow-500": "#f59e0b",
};

function resolveColor(textClass?: string): string {
  if (!textClass) return "#a855f7"; // fallback purple
  return TEXT_CLASS_TO_HEX[textClass] || "#a855f7";
}

// ─── Orbital Loader ───────────────────────────────────────────────────────────

/**
 * Premium orbital particle loader.
 * Three luminous particles orbit an invisible center with glowing trails.
 * Color-reactive: matches the current streaming action.
 */
function OrbitalLoader({ color, size = 24 }: { color: string; size?: number }) {
  const r = size / 2; // orbit radius
  const particleSize = 2;

  return (
    <div className="relative flex items-center justify-center overflow-hidden shrink-0" style={{ width: size, height: size }}>
      {/* Glow backdrop */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: color,
          filter: "blur(3px)",
        }}
        animate={{ opacity: [0.15, 0.35, 0.15], scale: [0.8, 1.1, 0.8] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Center dot */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: particleSize,
          height: particleSize,
          background: color,
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Orbiting particles */}
      {[0, 1, 2].map((i) => {
        const delay = i * (1.2 / 3);
        const orbitDuration = 1.2;
        // Each particle has a slightly different orbit radius for depth
        const orbitR = r - 1 + i * 1.2;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: particleSize + (2 - i) * 0.5,
              height: particleSize + (2 - i) * 0.5,
              background: color,
              boxShadow: `0 0 ${4 + i * 2}px ${color}80, 0 0 ${8 + i * 3}px ${color}40`,
              top: "50%",
              left: "50%",
              marginTop: -(particleSize + (2 - i) * 0.5) / 2,
              marginLeft: -(particleSize + (2 - i) * 0.5) / 2,
            }}
            animate={{
              x: [
                Math.cos(0) * orbitR,
                Math.cos(Math.PI * 0.5) * orbitR,
                Math.cos(Math.PI) * orbitR,
                Math.cos(Math.PI * 1.5) * orbitR,
                Math.cos(Math.PI * 2) * orbitR,
              ],
              y: [
                Math.sin(0) * orbitR,
                Math.sin(Math.PI * 0.5) * orbitR,
                Math.sin(Math.PI) * orbitR,
                Math.sin(Math.PI * 1.5) * orbitR,
                Math.sin(Math.PI * 2) * orbitR,
              ],
              opacity: [0.5, 1, 0.7, 1, 0.5],
              scale: [0.8, 1.3, 0.9, 1.2, 0.8],
            }}
            transition={{
              duration: orbitDuration,
              delay,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        );
      })}
    </div>
  );
}


/**
 * Elapsed timer that appears after a short delay.
 * Shows how long the current phase has been processing.
 * Resets when resetKey changes (e.g., label changes from "Pensando" to "Leyendo archivo...").
 */
function ElapsedTimer({ delayMs = 3000, resetKey }: { delayMs?: number; resetKey?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    // Reset everything when the phase changes
    startRef.current = Date.now();
    setElapsed(0);
    setVisible(false);

    // Show timer after delay
    const showTimer = setTimeout(() => setVisible(true), delayMs);

    // Update elapsed every second
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    return () => {
      clearTimeout(showTimer);
      clearInterval(interval);
    };
  }, [delayMs, resetKey]);

  if (!visible) return null;

  return (
    <motion.span
      className="text-xs text-muted-foreground/50 tabular-nums"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {formatElapsed(elapsed)}
    </motion.span>
  );
}

/**
 * Professional streaming indicator with orbital particle animation.
 *
 * - **initial**: orbital loader with label (shown when waiting for first content)
 * - **streaming**: compact inline orbital with contextual label (shown while content is arriving)
 */
export const StreamingLoadingAnimation = React.memo(function StreamingLoadingAnimation({
  variant,
  label,
  dotColorClass,
  labelColorClass,
  contentExcerpt,
}: StreamingLoadingAnimationProps) {
  const latestExcerptRef = useRef(contentExcerpt);
  latestExcerptRef.current = contentExcerpt;
  const [displayedExcerpt, setDisplayedExcerpt] = useState(contentExcerpt);

  useEffect(() => {
    // Throttle the excerpt updates so the user can actually read the text
    // instead of it flashing by token by token.
    const interval = setInterval(() => {
      setDisplayedExcerpt((prev) =>
        prev !== latestExcerptRef.current ? latestExcerptRef.current : prev
      );
    }, 1000); // 1 second per update

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // If the streaming finishes or changes state abruptly, clear the excerpt
    if (!contentExcerpt) {
      setDisplayedExcerpt(undefined);
    }
  }, [contentExcerpt]);

  const resolvedColor = resolveColor(labelColorClass);

  if (variant === "initial") {
    return (
      <div className="flex items-center gap-2.5 pt-3 pb-1.5 overflow-hidden min-w-0">
        <OrbitalLoader color={resolvedColor} size={14} />
        <AnimatePresence mode="wait">
          {label && (
            <motion.span
              key={label}
              className={`text-xs font-medium shrink-0 ${labelColorClass || "text-muted-foreground"} whitespace-nowrap`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="shrink-0">
          <ElapsedTimer delayMs={3000} resetKey={label} />
        </span>
        <AnimatePresence mode="popLayout">
          {displayedExcerpt && (
            <motion.span
              key={displayedExcerpt}
              className="text-xs italic text-muted-foreground/60 overflow-hidden text-ellipsis whitespace-nowrap flex-1"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
            >
              {displayedExcerpt}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // streaming variant — compact inline
  return (
    <div className="mt-3 ml-1 flex items-center gap-2.5">
      <OrbitalLoader color={resolvedColor} size={12} />
      <AnimatePresence mode="wait">
        {label && (
          <motion.span
            key={label}
            className={`text-xs ${labelColorClass || "text-muted-foreground"}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 0.85, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.2 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      <ElapsedTimer delayMs={3000} resetKey={label} />
    </div>
  );
});
