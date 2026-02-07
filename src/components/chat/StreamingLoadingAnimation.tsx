import { motion } from "framer-motion";

interface StreamingLoadingAnimationProps {
  variant: "initial" | "streaming";
  label?: string;
}

const INITIAL_ORBS = [0, 1, 2, 3, 4];
const STREAMING_BARS = [
  { min: 5, max: 16, delay: 0 },
  { min: 7, max: 20, delay: 0.1 },
  { min: 4, max: 14, delay: 0.18 },
  { min: 8, max: 22, delay: 0.05 },
  { min: 6, max: 15, delay: 0.24 },
];

export function StreamingLoadingAnimation({
  variant,
  label,
}: StreamingLoadingAnimationProps) {
  if (variant === "initial") {
    return (
      <div className="flex items-center gap-3 p-2">
        <div className="relative flex h-8 items-center gap-2">
          {INITIAL_ORBS.map((i) => (
            <motion.div
              key={i}
              className="relative"
              animate={{ y: [0, -10, 2, 0] }}
              transition={{
                duration: 0.9,
                repeat: Number.POSITIVE_INFINITY,
                ease: [0.22, 1.2, 0.36, 1],
                delay: i * 0.08,
              }}
            >
              <motion.div
                className="absolute -inset-1 rounded-full blur-md"
                style={{
                  background:
                    "radial-gradient(circle, color-mix(in srgb, var(--primary) 30%, transparent), transparent 70%)",
                }}
                animate={{
                  scale: [1, 1.6, 1],
                  opacity: [0.2, 0.5, 0.2],
                }}
                transition={{
                  duration: 0.9,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeOut",
                  delay: i * 0.08,
                }}
              />
              <motion.div
                className="h-2.5 w-2.5 rounded-full bg-primary"
                style={{
                  boxShadow:
                    "0 0 6px color-mix(in srgb, var(--primary) 30%, transparent)",
                }}
                animate={{
                  scale: [1, 1.2, 0.95, 1],
                  opacity: [0.6, 1, 0.8, 0.6],
                }}
                transition={{
                  duration: 0.9,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: [0.22, 1.2, 0.36, 1],
                  delay: i * 0.08,
                }}
              />
            </motion.div>
          ))}
        </div>
        {label ? (
          <span className="text-[11px] text-muted-foreground font-medium">
            {label}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 ml-1 flex items-center gap-3">
      <div className="flex h-6 items-end gap-[3px]">
        {STREAMING_BARS.map((bar, i) => (
          <motion.div
            key={i}
            className="w-[3px] rounded-full bg-primary"
            animate={{
              height: [
                bar.min,
                bar.max,
                bar.min * 1.2,
                bar.max * 0.85,
                bar.min,
              ],
              opacity: [0.4, 1, 0.7, 0.9, 0.4],
            }}
            transition={{
              duration: 1.1,
              repeat: Number.POSITIVE_INFINITY,
              ease: [0.22, 1.2, 0.36, 1],
              delay: bar.delay,
            }}
          />
        ))}
      </div>
      {label ? (
        <motion.span
          className="text-xs text-muted-foreground"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 1.6,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          {label}
        </motion.span>
      ) : null}
    </div>
  );
}
