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

/**
 * Professional streaming indicator.
 *
 * - **initial**: pulsing dots with label (shown when waiting for first content)
 * - **streaming**: compact inline dots with contextual label (shown while content is arriving)
 */
export function StreamingLoadingAnimation({
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
    </div>
  );
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
