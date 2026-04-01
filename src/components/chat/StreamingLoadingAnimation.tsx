import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

interface StreamingLoadingAnimationProps {
  variant: "initial" | "streaming";
  label?: string;
  /** Tailwind bg-* class for the dots, e.g. "bg-amber-500". Falls back to bg-primary. */
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

/**
 * Three pulsing dots – the core loading indicator.
 * Clean, professional, and small enough to sit inline with text.
 */
function PulsingDots({ size = 6, gap = 5, colorClass }: { size?: number; gap?: number; colorClass?: string }) {
  return (
    <div className="flex items-center" style={{ gap }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`rounded-full ${colorClass || "bg-primary"}`}
          style={{ width: size, height: size }}
          animate={{
            scale: [1, 1.35, 1],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 1.0,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.18,
          }}
        />
      ))}
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
 * Professional streaming indicator.
 *
 * - **initial**: pulsing dots with label (shown when waiting for first content)
 * - **streaming**: compact inline dots with contextual label (shown while content is arriving)
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
    }, 1500); // 1.5 seconds per update

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // If the streaming finishes or changes state abruptly, clear the excerpt
    if (!contentExcerpt) {
      setDisplayedExcerpt(undefined);
    }
  }, [contentExcerpt]);

  if (variant === "initial") {
    return (
      <div className="flex items-center gap-3 py-2">
        <PulsingDots size={8} gap={6} colorClass={dotColorClass} />
        <AnimatePresence mode="wait">
          {label && (
            <motion.span
              key={label}
              className={`text-sm font-medium ${labelColorClass || "text-muted-foreground"} whitespace-nowrap`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
        <ElapsedTimer delayMs={3000} resetKey={label} />
        <AnimatePresence mode="popLayout">
          {displayedExcerpt && (
            <motion.span
              key={displayedExcerpt}
              className="text-sm italic text-muted-foreground/60 overflow-hidden text-ellipsis whitespace-nowrap flex-1"
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
      <PulsingDots size={5} gap={4} colorClass={dotColorClass} />
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
