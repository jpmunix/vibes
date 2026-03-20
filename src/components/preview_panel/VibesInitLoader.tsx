import { useEffect, useState } from "react";

interface VibesInitLoaderProps {
  /** Optional subtitle to show below the vibes.init() animation */
  subtitle?: string;
}

/**
 * A premium loading screen that mirrors the scaffold's vibes.init() animation.
 * Replaces boring spinners with an elegant, branded experience.
 */
export function VibesInitLoader({ subtitle }: VibesInitLoaderProps) {
  const full = "vibes.init()";
  const [text, setText] = useState<string>("");

  useEffect(() => {
    let i = 0;
    const timer: number = window.setInterval(() => {
      i += 1;
      setText(full.slice(0, i));
      if (i >= full.length) {
        window.clearInterval(timer);
      }
    }, 85);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="vibes-init-loader">
      <h1 className="vibes-init-title">
        <span className="vibes-init-text">
          {text}
          <span className="vibes-init-cursor"> |</span>
        </span>
        <span aria-hidden className="vibes-init-glow" />
      </h1>

      {subtitle && (
        <p className="vibes-init-subtitle">{subtitle}</p>
      )}

      <style>{`
        .vibes-init-loader {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--background);
          overflow: hidden;
          gap: 1rem;
          z-index: 10;
        }

        .vibes-init-title {
          position: relative;
          font-size: 2rem;
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--foreground);
          filter: drop-shadow(0 0 22px color-mix(in srgb, var(--primary) 45%, transparent));
          margin: 0;
        }

        .vibes-init-text {
          position: relative;
          z-index: 10;
        }

        .vibes-init-cursor {
          margin-left: 0.25rem;
          animation: vibes-init-blink 1.1s step-end infinite;
        }

        .vibes-init-glow {
          position: absolute;
          inset: -120%;
          z-index: -1;
          border-radius: 9999px;
          background: radial-gradient(
            circle,
            color-mix(in srgb, var(--primary) 55%, transparent) 0%,
            color-mix(in srgb, var(--primary) 35%, transparent) 35%,
            color-mix(in srgb, var(--primary) 15%, transparent) 55%,
            color-mix(in srgb, var(--primary) 5%, transparent) 70%,
            transparent 80%
          );
          animation: vibes-init-breathe 4.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .vibes-init-subtitle {
          font-size: 0.8125rem;
          color: var(--muted-foreground, #94a3b8);
          margin: 0;
          opacity: 0;
          animation: vibes-init-fadein 0.6s ease 1s forwards;
        }

        @keyframes vibes-init-blink {
          0%, 45% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        @keyframes vibes-init-breathe {
          0% {
            transform: scale(0.9);
            opacity: 0.45;
            filter: blur(48px);
          }
          50% {
            transform: scale(1.15);
            opacity: 0.75;
            filter: blur(72px);
          }
          100% {
            transform: scale(0.9);
            opacity: 0.45;
            filter: blur(48px);
          }
        }

        @keyframes vibes-init-fadein {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
