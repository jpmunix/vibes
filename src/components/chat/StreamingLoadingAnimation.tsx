import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSettings } from "@/hooks/useSettings";

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

const BASE_COLOR_TO_HEX: Record<string, string> = {
  purple: "#a855f7",
  violet: "#8b5cf6",
  blue: "#3b82f6",
  amber: "#f59e0b",
  yellow: "#eab308",
  indigo: "#6366f1",
  red: "#ef4444",
  cyan: "#06b6d4",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  orange: "#f97316",
  slate: "#64748b",
  zinc: "#71717a",
  gray: "#6b7280",
  neutral: "#737373",
  stone: "#78716c",
  lime: "#84cc16",
  pink: "#ec4899",
  rose: "#f43f5e",
  fuchsia: "#d946ef",
  sky: "#0ea5e9",
};

function resolveColor(textClass?: string): string {
  if (!textClass) return "#a855f7"; // fallback purple
  
  const cleanText = textClass.trim();
  if (cleanText.startsWith("#") || cleanText.startsWith("rgb") || cleanText.startsWith("hsl")) {
    return cleanText;
  }

  if (TEXT_CLASS_TO_HEX[cleanText]) {
    return TEXT_CLASS_TO_HEX[cleanText];
  }
  
  // Split by whitespace and search for matching sub-tokens (e.g. "text-cyan-500 dark:text-cyan-400")
  const tokens = cleanText.split(/\s+/);
  for (const token of tokens) {
    const baseColorClass = token.replace(/^(dark|light|hover|focus|active):/, "");
    if (TEXT_CLASS_TO_HEX[baseColorClass]) {
      return TEXT_CLASS_TO_HEX[baseColorClass];
    }

    // Parse text-[color]-[weight] patterns dynamically (e.g. text-amber-500, text-emerald-600)
    const match = baseColorClass.match(/^text-([a-z]+)(-\d+)?$/);
    if (match) {
      const colorName = match[1];
      if (BASE_COLOR_TO_HEX[colorName]) {
        return BASE_COLOR_TO_HEX[colorName];
      }
    }
  }
  
  return "#a855f7"; // fallback purple
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

// ─── Glitch Typewriter Effect ─────────────────────────────────────────────────

/**
 * Characters that can substitute during the "glitch" reveal phase.
 * Mix of unicode blocks, dots, slashes — gives a terminal/matrix feel.
 */
const GLITCH_CHARS = "░▒▓█▄▀─│┌┐└┘├┤┬┴┼·•◦⊙⊕";

/**
 * GlitchTypewriter: reveals text character-by-character with random "glitch"
 * substitutions that quickly resolve to the real character.
 * Inspired by the thinking-stream effect but designed for tool command output.
 */
function GlitchTypewriter({ text, className }: { text: string; className?: string }) {
  const [revealCount, setRevealCount] = useState(0);
  const [glitchIndices, setGlitchIndices] = useState<Set<number>>(new Set());
  const prevTextRef = useRef(text);
  const frameRef = useRef<number | null>(null);

  // When text changes (new excerpt), animate the new characters in
  useEffect(() => {
    const prevLen = prevTextRef.current === text ? 0 : Math.min(prevTextRef.current.length, text.length);
    prevTextRef.current = text;
    setRevealCount(prevLen);

    // Cancel any pending animation
    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const totalChars = text.length;
    const charsToReveal = totalChars - prevLen;
    if (charsToReveal <= 0) {
      setRevealCount(totalChars);
      return;
    }

    // Reveal ~3-5 chars per frame at ~60fps for a fast but visible effect
    const CHARS_PER_TICK = Math.max(2, Math.ceil(charsToReveal / 15));
    let current = prevLen;

    const tick = () => {
      current = Math.min(current + CHARS_PER_TICK, totalChars);
      setRevealCount(current);

      // Add random glitch positions in the "frontier" zone
      const newGlitch = new Set<number>();
      for (let i = Math.max(0, current - 4); i < Math.min(current + 3, totalChars); i++) {
        if (Math.random() > 0.5) newGlitch.add(i);
      }
      setGlitchIndices(newGlitch);

      if (current < totalChars) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        // Clear glitches after reveal completes
        setTimeout(() => setGlitchIndices(new Set()), 80);
      }
    };

    // Small initial delay so the label animation plays first
    const startTimeout = setTimeout(() => {
      frameRef.current = requestAnimationFrame(tick);
    }, 50);

    return () => {
      clearTimeout(startTimeout);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [text]);

  // Build the rendered string with glitch substitutions
  const rendered = useMemo(() => {
    const chars: React.ReactNode[] = [];
    for (let i = 0; i < text.length; i++) {
      if (i >= revealCount) {
        // Not yet revealed — show nothing or a dim placeholder
        chars.push(
          <span key={i} style={{ opacity: 0 }}>{text[i]}</span>
        );
      } else if (glitchIndices.has(i)) {
        // Glitch zone — show random char that will resolve next frame
        const glitchChar = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        chars.push(
          <span key={i} style={{ opacity: 0.3 }}>{glitchChar}</span>
        );
      } else {
        // Fully revealed
        chars.push(
          <span key={i} style={{ opacity: Math.min(1, 0.4 + (revealCount - i) * 0.08) }}>
            {text[i]}
          </span>
        );
      }
    }
    return chars;
  }, [text, revealCount, glitchIndices]);

  return (
    <span className={className} style={{ fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', monospace)" }}>
      {rendered}
    </span>
  );
}

/**
 * Professional streaming indicator with orbital particle animation.
 *
 * - **initial**: orbital loader with label (shown when waiting for first content)
 * - **streaming**: compact inline orbital with contextual label (shown while content is arriving)
 *
 * When a tool is active (not just thinking), shows a glitch-typewriter effect
 * on the right with the tool's inner content (commands, paths, etc.).
 */
export function ActiveLoader({ style, color, size }: { style: string; color: string; size?: number }) {
  const loaderElement = (() => {
    switch (style) {
      case "aurora":
        return <AuroraLoader color={color} size={size} />;
      case "wave":
        return <WaveLoader color={color} />;
      case "jelly":
        return <JellyBlobLoader color={color} size={size} />;
      case "spark":
        return <SparkLoader color={color} size={size} />;
      case "equalizer":
        return <EqualizerLoader color={color} />;
      case "infinity":
        return <InfinityLoader color={color} size={size} />;
      case "grid":
        return <PixelGridLoader color={color} />;
      case "brackets":
        return <BracketsLoader color={color} />;
      case "terminal":
        return <TerminalCursorLoader color={color} />;
      case "server":
        return <ServerLightsLoader color={color} />;
      case "morph":
        return <MorphingCoreLoader color={color} size={size} />;
      case "matrix":
        return <MatrixRainLoader color={color} />;
      case "glow":
        return <GlowingSphereLoader color={color} size={size} />;
      case "voice":
        return <AiVoiceLoader color={color} />;
      case "packet":
        return <NetworkPacketLoader color={color} />;
      case "sonar":
        return <SonarRippleLoader color={color} size={size} />;
      case "blocks":
        return <DataBlocksLoader color={color} />;
      case "nodes":
        return <NodeConnectionLoader color={color} />;
      case "glowring":
        return <NeonGlowRingLoader color={color} size={size} />;
      case "m-dots":
        return <MicroDotsLoader color={color} />;
      case "m-radar":
        return <RadarSweepLoader color={color} />;
      case "m-sine":
        return <SineLineLoader color={color} />;
      case "m-orbit":
        return <OrbitDotLoader color={color} />;
      case "m-eq":
        return <MicroEqualizerLoader color={color} />;
      case "m-pulse":
        return <PulsingCoreLoader color={color} />;
      case "m-cross":
        return <CrossRotatorLoader color={color} />;
      case "m-flip":
        return <FlippingSquareLoader color={color} />;
      case "m-blink":
        return <CursorBlinkLoader color={color} />;
      case "m-breathe":
        return <BreatheRingLoader color={color} />;
      case "m-swap":
        return <SwappingDotsLoader color={color} />;
      case "m-sonar":
        return <SonarPingLoader color={color} />;
      case "m-pie":
        return <PieFillLoader color={color} />;
      case "m-scan":
        return <ScanLineLoader color={color} />;
      case "m-hour":
        return <MinimalHourglassLoader color={color} />;
      case "m-yin":
        return <YinYangMicroLoader color={color} />;
      case "m-diamond":
        return <DiamondPulseLoader color={color} />;
      case "m-clock":
        return <ClockHandLoader color={color} />;
      case "m-expand":
        return <ExpandingBarLoader color={color} />;
      case "orbital":
      default:
        return <OrbitalLoader color={color} size={size} />;
    }
  })();

  return (
    <>
      <LoaderStyles />
      {loaderElement}
    </>
  );
}

export const StreamingLoadingAnimation = React.memo(function StreamingLoadingAnimation({
  variant,
  label,
  dotColorClass,
  labelColorClass,
  contentExcerpt,
}: StreamingLoadingAnimationProps) {
  const { settings } = useSettings();
  const loaderStyle = settings?.loaderStyle || "orbital";
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
    }, 800); // Slightly faster than before (800ms vs 1s) for better tool feedback

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
        <div className={`shrink-0 flex items-center justify-center ${labelColorClass || "text-muted-foreground"}`}>
          <ActiveLoader style={loaderStyle} color={resolvedColor} size={14} />
        </div>
        <AnimatePresence mode="wait">
          {label && (
            <motion.span
              key={label}
              className={`text-xs font-medium shrink-0 whitespace-nowrap ${labelColorClass || "text-muted-foreground"}`}
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
            <motion.div
              key={displayedExcerpt}
              className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.2 }}
            >
              <GlitchTypewriter
                text={displayedExcerpt}
                className="text-[11px] text-muted-foreground/45"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // streaming variant — compact inline
  return (
    <div className="mt-3 ml-1 flex items-center gap-2.5">
      <div className={`shrink-0 flex items-center justify-center ${labelColorClass || "text-muted-foreground"}`}>
        <ActiveLoader style={loaderStyle} color={resolvedColor} size={12} />
      </div>
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

export function AuroraLoader({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <div className="relative flex items-center justify-center overflow-hidden shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full"
        style={{
          width: 4,
          height: 4,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <motion.div
        className="absolute rounded-full border"
        style={{
          width: size,
          height: size,
          borderColor: color,
          borderWidth: 1,
        }}
        animate={{
          scale: [0.5, 1.5],
          opacity: [0.6, 0],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
      <motion.div
        className="absolute rounded-full border"
        style={{
          width: size,
          height: size,
          borderColor: color,
          borderWidth: 1,
        }}
        animate={{
          scale: [0.5, 1.5],
          opacity: [0.6, 0],
        }}
        transition={{
          duration: 1.5,
          delay: 0.75,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
    </div>
  );
}

export function WaveLoader({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 shrink-0 h-4 px-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: 3,
            height: 3,
            background: color,
            boxShadow: `0 0 4px ${color}80`,
          }}
          animate={{
            y: [1.5, -4.5, 1.5],
          }}
          transition={{
            duration: 1.0,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}


export function JellyBlobLoader({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <motion.div
        className="rounded-full"
        style={{
          width: size * 0.8,
          height: size * 0.8,
          background: color,
          boxShadow: `0 0 10px ${color}60`,
        }}
        animate={{
          borderRadius: [
            "42% 58% 70% 30% / 45% 45% 55% 55%",
            "70% 30% 52% 48% / 60% 40% 60% 40%",
            "42% 58% 70% 30% / 45% 45% 55% 55%",
          ],
          rotate: [0, 360],
          scale: [0.85, 1.05, 0.85],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}

export function SparkLoader({ color, size = 24 }: { color: string; size?: number }) {
  const centerSize = 4;
  const sparkSize = 2.5;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {/* Center glowing core */}
      <motion.div
        className="rounded-full absolute"
        style={{
          width: centerSize,
          height: centerSize,
          background: color,
          boxShadow: `0 0 8px ${color}, 0 0 14px ${color}80`,
        }}
        animate={{
          scale: [0.9, 1.25, 0.9],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* 8 spark particles shooting outwards in a burst pattern */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const angle = (i * Math.PI) / 4; // 8 directions (45 degrees apart)
        const targetX = Math.cos(angle) * (size * 0.65);
        const targetY = Math.sin(angle) * (size * 0.65);
        const delay = (i % 4) * 0.15;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: sparkSize,
              height: sparkSize,
              background: color,
              boxShadow: `0 0 6px ${color}`,
            }}
            animate={{
              x: [0, targetX],
              y: [0, targetY],
              opacity: [1, 0.8, 0],
              scale: [1.2, 0.8, 0.2],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: delay,
              ease: "easeOut",
            }}
          />
        );
      })}
    </div>
  );
}

export function EqualizerLoader({ color }: { color: string }) {
  return (
    <div className="flex items-end gap-[2px] shrink-0 h-4 px-1 pb-[2px] select-none">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="rounded-t-[1px]"
          style={{
            width: 2,
            background: color,
            boxShadow: `0 0 4px ${color}60`,
          }}
          animate={{
            height: ["25%", "95%", "25%"],
          }}
          transition={{
            duration: 0.75 + i * 0.12,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function InfinityLoader({ color, size = 24 }: { color: string; size?: number }) {
  const rx = size * 0.33;
  const ry = size * 0.20;
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute opacity-10">
        <path
          d={`M ${size/2 - rx} ${size/2} C ${size/2 - rx} ${size/2 - ry * 1.8}, ${size/2} ${size/2 + ry * 1.8}, ${size/2} ${size/2} C ${size/2} ${size/2 - ry * 1.8}, ${size/2 + rx} ${size/2 + ry * 1.8}, ${size/2 + rx} ${size/2} C ${size/2 + rx} ${size/2 - ry * 1.8}, ${size/2} ${size/2 + ry * 1.8}, ${size/2} ${size/2} C ${size/2} ${size/2 - ry * 1.8}, ${size/2 - rx} ${size/2 + ry * 1.8}, ${size/2 - rx} ${size/2}`}
          fill="none"
          stroke={color}
          strokeWidth="0.75"
        />
      </svg>
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 3,
          height: 3,
          background: color,
          boxShadow: `0 0 6px ${color}, 0 0 10px ${color}60`,
        }}
        animate={{
          x: [0, rx * 0.707, rx, rx * 0.707, 0, -rx * 0.707, -rx, -rx * 0.707, 0],
          y: [0, ry, 0, -ry, 0, ry, 0, -ry, 0],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute rounded-full opacity-60"
        style={{
          width: 2.2,
          height: 2.2,
          background: color,
          boxShadow: `0 0 4px ${color}`,
        }}
        animate={{
          x: [0, rx * 0.707, rx, rx * 0.707, 0, -rx * 0.707, -rx, -rx * 0.707, 0],
          y: [0, ry, 0, -ry, 0, ry, 0, -ry, 0],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          delay: 0.15,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}


export function PixelGridLoader({ color }: { color: string }) {
  return (
    <div className="grid grid-cols-2 gap-[2.5px] p-[1.5px] shrink-0 select-none">
      {[0, 1, 3, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-[1px]"
          style={{
            width: 3.2,
            height: 3.2,
            background: color,
          }}
          animate={{
            opacity: [0.15, 1, 0.15],
            scale: [0.85, 1.15, 0.85],
            boxShadow: [`0 0 0px ${color}00`, `0 0 4px ${color}b0`, `0 0 0px ${color}00`],
          }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function BracketsLoader({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-[4px] shrink-0 font-mono font-bold text-sm select-none" style={{ color }}>
      <motion.span
        className="leading-none"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        &#123;
      </motion.span>
      <motion.span
        className="leading-none"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.75, ease: "easeInOut" }}
      >
        &#125;
      </motion.span>
    </div>
  );
}

export function TerminalCursorLoader({ color }: { color: string }) {
  return (
    <div className="flex items-center shrink-0 font-mono font-bold text-sm select-none" style={{ color }}>
      <span className="leading-none">&gt;</span>
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "steps(1, start)" }}
        className="ml-[1px] leading-none"
      >
        _
      </motion.span>
    </div>
  );
}

export function ServerLightsLoader({ color }: { color: string }) {
  return (
    <div className="flex gap-[3.5px] shrink-0 items-center justify-center p-[2px]">
      {[0.5, 1.2, 0.8].map((duration, i) => (
        <motion.div
          key={i}
          className="rounded-[1.5px]"
          style={{ width: 5, height: 5, background: color }}
          animate={{
            opacity: [0.25, 1, 0.25],
            boxShadow: [`none`, `0 0 5px ${color}`, `none`],
          }}
          transition={{
            duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function MorphingCoreLoader({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <div className="flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <motion.div
        style={{ width: size - 4, height: size - 4, background: color }}
        animate={{
          borderRadius: ["0%", "50%", "0%"],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 2.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}

export function MatrixRainLoader({ color }: { color: string }) {
  return (
    <div className="relative shrink-0 font-mono font-bold text-[10px] select-none overflow-hidden h-[18px] w-4" style={{ color }}>
      <motion.div
        className="absolute left-0 right-0 flex flex-col items-center leading-[9px]"
        animate={{ y: [0, -18] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      >
        <span>0</span>
        <span>1</span>
        <span>0</span>
        <span>1</span>
      </motion.div>
    </div>
  );
}

export function GlowingSphereLoader({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {/* Outer pulsing glow aura */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size - 4,
          height: size - 4,
          background: color,
          filter: "blur(3.5px)",
        }}
        animate={{
          scale: [0.8, 1.8, 0.8],
          opacity: [0.25, 0.75, 0.25],
        }}
        transition={{
          duration: 2.0,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* 3D Sphere Core */}
      <motion.div
        className="rounded-full shadow-md"
        style={{
          width: size - 6,
          height: size - 6,
          background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${color} 65%, ${color}dd 100%)`,
          boxShadow: `0 0 6px ${color}b0, inset 0 -1.5px 3px rgba(0,0,0,0.25)`,
        }}
        animate={{
          scale: [0.9, 1.15, 0.9],
        }}
        transition={{
          duration: 2.0,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}


export function AiVoiceLoader({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-[2px] shrink-0 h-4 px-1 select-none">
      {[0, 1, 2, 1, 0].map((hIndex, i) => {
        const delay = i * 0.12;
        const minH = 4;
        const maxH = 14;
        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: 2,
              background: color,
            }}
            animate={{
              height: [minH, maxH, minH],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

export function NetworkPacketLoader({ color }: { color: string }) {
  return (
    <div className="relative w-8 h-[10px] flex items-center shrink-0 select-none">
      <div className="w-full h-[1px] rounded-full opacity-20" style={{ background: color }} />
      <motion.div
        className="absolute rounded-[1px]"
        style={{ width: 5, height: 3, background: color, boxShadow: `0 0 3px ${color}` }}
        animate={{ left: ["0%", "80%"], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

export function SonarRippleLoader({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <div className="rounded-full absolute" style={{ width: 3, height: 3, background: color }} />
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{ borderColor: color, borderWidth: 1 }}
          animate={{
            width: [0, size],
            height: [0, size],
            opacity: [1, 0],
          }}
          transition={{
            duration: 1.5,
            delay: i * 0.75,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

export function DataBlocksLoader({ color }: { color: string }) {
  return (
    <div className="flex flex-col gap-[2px] shrink-0 items-center justify-center select-none transform rotate-180 p-[1px]">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-[1px]"
          style={{ height: 2.5, background: color }}
          animate={{
            width: [6, 12, 6],
            opacity: [0.35, 1, 0.35],
          }}
          transition={{
            duration: 1.3,
            repeat: Infinity,
            delay: i * 0.22,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function NodeConnectionLoader({ color }: { color: string }) {
  return (
    <div className="relative flex items-center justify-between w-[26px] h-4 shrink-0 select-none px-[2px]">
      <div className="w-2 h-2 rounded-full z-10" style={{ background: color, boxShadow: `0 0 3px ${color}` }} />
      <div className="w-2 h-2 rounded-full z-10" style={{ background: color, boxShadow: `0 0 3px ${color}` }} />
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 h-[1.2px] rounded-full"
        style={{ background: color, left: 5 }}
        animate={{
          width: ["0px", "14px", "0px"],
          left: [5, 5, 19],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}

export function NeonGlowRingLoader({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <motion.div
        className="absolute rounded-full border-2 border-t-transparent border-b-transparent"
        style={{
          width: size - 2,
          height: size - 2,
          borderColor: color,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
          filter: `drop-shadow(0 0 3px ${color})`,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1.1,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}

export const LoaderShowcase = React.memo(function LoaderShowcase({ labelColorClass }: { labelColorClass?: string }) {
  const color = resolveColor(labelColorClass);
  return (
    <div className="mt-3 pt-3 border-t border-border/25 space-y-3 select-none">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold">Demos de Loader:</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <OrbitalLoader color={color} size={14} />
          </div>
          <span className="text-xs text-muted-foreground">Original: Orbital</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <AuroraLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Aurora Pulse</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <WaveLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Sine Wave Dots</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <JellyBlobLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Morphing Jelly</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <SparkLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Pulse Spark</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <EqualizerLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Bar Equalizer</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <InfinityLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Infinity Loop</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <PixelGridLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Pixel Grid</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <BracketsLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Code Brackets</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <TerminalCursorLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Terminal Cursor</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <ServerLightsLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Server Lights</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <MorphingCoreLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Morphing AI Core</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <MatrixRainLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Matrix Rain</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <GlowingSphereLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Glowing Sphere</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <AiVoiceLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">AI Voice</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <NetworkPacketLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Network Packet</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <SonarRippleLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Sonar Ripple</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <DataBlocksLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Data Blocks</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <NodeConnectionLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Node Connection</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <NeonGlowRingLoader color={color} size={16} />
          </div>
          <span className="text-xs text-muted-foreground">Neon Glow Ring</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <MicroDotsLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Micro Dots</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <RadarSweepLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Micro Radar</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <SineLineLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Sine Line</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <OrbitDotLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Orbit Dot</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <MicroEqualizerLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Micro Equalizer</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <PulsingCoreLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Pulsing Core</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <CrossRotatorLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Cross Rotator</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <FlippingSquareLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Flipping Square</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <CursorBlinkLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Cursor Blink</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <BreatheRingLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Breathe Ring</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <SwappingDotsLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Swapping Dots</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <SonarPingLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Sonar Ping</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <PieFillLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Pie Fill</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <ScanLineLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Scan Line</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <MinimalHourglassLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Micro Hourglass</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <YinYangMicroLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Semicircle</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <DiamondPulseLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Diamond Pulse</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <ClockHandLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Clock Hand</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <ExpandingBarLoader color={color} />
          </div>
          <span className="text-xs text-muted-foreground">Bar Expand</span>
        </div>
      </div>
    </div>
  );
});

export const MICRO_LOADER_CSS = `
.micro-loader {
    width: 18px; height: 18px;
    position: relative;
    display: inline-flex; justify-content: center; align-items: center;
    color: inherit;
    --m-color: currentColor;
    --m-color-dim: color-mix(in srgb, var(--m-color, currentColor) 25%, transparent);
}
@keyframes m-spin { 100% { transform: rotate(360deg); } }
.m-dots { gap: 2px; }
.m-dots div { width: 2.5px; height: 2.5px; background: var(--m-color); border-radius: 50%; animation: m-pulse-dot 1s infinite alternate; }
.m-dots div:nth-child(2) { animation-delay: 0.2s; }
.m-dots div:nth-child(3) { animation-delay: 0.4s; }
@keyframes m-pulse-dot { 0%, 20% { opacity: 0.2; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1.2); } }
.m-radar { border-radius: 50%; background: conic-gradient(from 0deg, transparent 60%, var(--m-color) 100%); animation: m-spin 1s linear infinite; }
.m-radar::before { content: ''; position: absolute; width: 14px; height: 14px; background: var(--background, #0d1117); border-radius: 50%; }
.m-sine::after {
    content: ''; width: 12px; height: 1.5px; background: var(--m-color);
    animation: m-scale-x 1s infinite ease-in-out alternate;
}
@keyframes m-scale-x { 0% { transform: scaleX(0.1); opacity: 0.3; } 100% { transform: scaleX(1); opacity: 1; } }
.m-orbit::before { content: ''; width: 3px; height: 3px; background: var(--m-color); border-radius: 50%; }
.m-orbit::after {
    content: ''; position: absolute; width: 14px; height: 14px;
    border-radius: 50%; border: 1px solid transparent; border-top: 1.5px solid var(--m-color);
    animation: m-spin 1s linear infinite;
}
.m-eq { gap: 2px; align-items: flex-end; padding-bottom: 2px; }
.m-eq div { width: 2px; background: var(--m-color); animation: m-eq-bounce 0.8s infinite alternate ease-out; }
.m-eq div:nth-child(1) { height: 6px; animation-delay: 0.1s; }
.m-eq div:nth-child(2) { height: 12px; animation-delay: 0.3s; }
.m-eq div:nth-child(3) { height: 8px; animation-delay: 0.2s; }
@keyframes m-eq-bounce { 0% { height: 2px; } 100% { height: 12px; } }
.m-pulse::after {
    content: ''; width: 6px; height: 6px; background: var(--m-color); border-radius: 50%;
    animation: m-beat 1s infinite cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes m-beat { 0% { transform: scale(0.5); box-shadow: 0 0 0 0 var(--m-color-dim); } 70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(255,255,255,0); } 100% { transform: scale(0.5); box-shadow: 0 0 0 0 var(--m-color-dim); } }
.m-cross { position: relative; animation: m-spin 1s cubic-bezier(0.5, 0, 0.5, 1) infinite; }
.m-cross::before, .m-cross::after { content: ''; position: absolute; background: var(--m-color); border-radius: 1px; }
.m-cross::before { width: 12px; height: 1.5px; }
.m-cross::after { width: 1.5px; height: 12px; }
.m-flip::after {
    content: ''; width: 8px; height: 8px; background: var(--m-color);
    animation: m-flip-anim 1.2s infinite ease-in-out;
}
@keyframes m-flip-anim { 0% { transform: perspective(30px) rotateY(0); } 50% { transform: perspective(30px) rotateY(180deg); } 100% { transform: perspective(30px) rotateY(180deg) rotateX(180deg); } }
.m-blink::after { content: ''; width: 8px; height: 12px; background: var(--m-color); animation: m-blink-anim 1s step-end infinite; }
@keyframes m-blink-anim { 50% { opacity: 0; } }
.m-breathe::after {
    content: ''; width: 12px; height: 12px; border: 1.5px solid var(--m-color); border-radius: 50%;
    animation: m-breathe-anim 1.5s infinite ease-in-out alternate;
}
@keyframes m-breathe-anim { 0% { transform: scale(0.6); opacity: 0.2; } 100% { transform: scale(1); opacity: 1; } }
.m-swap { position: relative; }
.m-swap div { position: absolute; width: 4px; height: 4px; background: var(--m-color); border-radius: 50%; animation: m-swap-anim 1s infinite ease-in-out; }
.m-swap div:nth-child(1) { left: 2px; }
.m-swap div:nth-child(2) { right: 2px; background: var(--m-color-dim); animation-direction: reverse; }
@keyframes m-swap-anim { 0% { transform: translateX(0) scale(1); z-index: 2; } 50% { transform: translateX(6px) scale(1.3); z-index: 2; } 50.001% { z-index: 1; } 100% { transform: translateX(0) scale(1); z-index: 1; } }
.m-sonar { position: relative; }
.m-sonar::before { content: ''; width: 3px; height: 3px; background: var(--m-color); border-radius: 50%; }
.m-sonar::after {
    content: ''; position: absolute; width: 100%; height: 100%; border: 1px solid var(--m-color); border-radius: 50%;
    animation: m-ping 1.5s infinite cubic-bezier(0, 0, 0.2, 1);
}
@keyframes m-ping { 0% { transform: scale(0.2); opacity: 1; } 100% { transform: scale(1.2); opacity: 0; } }
.m-pie { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--m-color-dim); position: relative; overflow: hidden; }
.m-pie::after {
    content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--m-color);
    transform-origin: 50% 100%; animation: m-fill 1.5s infinite steps(4);
}
@keyframes m-fill { 0% { transform: rotate(-90deg); } 100% { transform: rotate(270deg); } }
.m-scan { width: 14px; height: 14px; border: 1px solid var(--m-color-dim); position: relative; border-radius: 2px; }
.m-scan::after {
    content: ''; position: absolute; left: 0; top: 0; width: 1px; height: 100%; background: var(--m-color);
    animation: m-scan-move 1s infinite alternate ease-in-out; box-shadow: 0 0 2px var(--m-color);
}
@keyframes m-scan-move { 0% { transform: translateX(0); } 100% { transform: translateX(12px); } }
.m-hour {
    width: 0; height: 0;
    border-left: 6px solid transparent; border-right: 6px solid transparent;
    border-bottom: 6px solid var(--m-color); border-top: 6px solid var(--m-color);
    animation: m-spin 1.5s infinite cubic-bezier(0.5, 0, 0.5, 1);
}
.m-yin { width: 12px; height: 12px; border: 1.5px solid var(--m-color); border-radius: 50%; position: relative; animation: m-spin 1s infinite linear; }
.m-yin::after { content: ''; position: absolute; top: -1.5px; left: -1.5px; width: 6px; height: 12px; background: var(--m-color); border-radius: 12px 0 0 12px; }
.m-diamond { width: 8px; height: 8px; border: 1.5px solid var(--m-color); transform: rotate(45deg); animation: m-dia-pulse 1.2s infinite ease-in-out alternate; }
@keyframes m-dia-pulse { 0% { transform: rotate(45deg) scale(0.6); opacity: 0.3; } 100% { transform: rotate(45deg) scale(1.2); opacity: 1; background: var(--m-color); } }
.m-clock { width: 14px; height: 14px; border: 1.5px solid var(--m-color-dim); border-radius: 50%; position: relative; }
.m-clock::after {
    content: ''; position: absolute; top: 2px; left: 6.5px; width: 1.5px; height: 5px; background: var(--m-color);
    transform-origin: 50% 100%; border-radius: 1px; animation: m-spin 1s infinite linear;
}
.m-expand::after {
    content: ''; height: 3px; background: var(--m-color); border-radius: 2px;
    animation: m-expand-anim 1s infinite ease-in-out;
}
@keyframes m-expand-anim { 0%, 100% { width: 3px; } 50% { width: 14px; } }
`;

export function LoaderStyles() {
  return <style dangerouslySetInnerHTML={{ __html: MICRO_LOADER_CSS }} />;
}


export function MicroDotsLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-dots shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
      <div /><div /><div />
    </div>
  );
}

export function RadarSweepLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-radar shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function SineLineLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-sine shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function OrbitDotLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-orbit shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function MicroEqualizerLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-eq shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
      <div /><div /><div />
    </div>
  );
}

export function PulsingCoreLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-pulse shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function CrossRotatorLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-cross shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function FlippingSquareLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-flip shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function CursorBlinkLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-blink shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function BreatheRingLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-breathe shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function SwappingDotsLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-swap shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
      <div /><div />
    </div>
  );
}

export function SonarPingLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-sonar shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function PieFillLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-pie shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function ScanLineLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-scan shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function MinimalHourglassLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-hour shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function YinYangMicroLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-yin shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function DiamondPulseLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-diamond shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function ClockHandLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-clock shrink-0" 
      style={{ '--m-color': color } as React.CSSProperties}
    >
    </div>
  );
}

export function ExpandingBarLoader({ color }: { color: string }) {
  return (
    <div 
      className="micro-loader m-expand shrink-0" 
      style={{ '--m-color': color, '--m-color-dim': `${color}40` } as React.CSSProperties}
    />
  );
}
