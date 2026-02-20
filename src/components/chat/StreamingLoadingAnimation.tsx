import { motion, AnimatePresence } from "framer-motion";

interface StreamingLoadingAnimationProps {
  variant: "initial" | "streaming";
  label?: string;
  /** Tailwind bg-* class for the dots, e.g. "bg-amber-500". Falls back to bg-primary. */
  dotColorClass?: string;
  /** Tailwind text-* class for the label, e.g. "text-amber-500". Falls back to text-muted-foreground. */
  labelColorClass?: string;
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
}: StreamingLoadingAnimationProps) {
  if (variant === "initial") {
    return (
      <div className="flex items-center gap-3 py-2">
        <PulsingDots size={8} gap={6} colorClass={dotColorClass} />
        <AnimatePresence mode="wait">
          {label && (
            <motion.span
              key={label}
              className={`text-sm font-medium ${labelColorClass || "text-muted-foreground"}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {label}
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
