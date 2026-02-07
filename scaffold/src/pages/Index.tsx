import { useEffect, useState } from "react";
import { MadeWithDyad } from "@/components/made-with-dyad";

const Index = () => {
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
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 overflow-hidden">
      <h1 className="relative text-4xl font-semibold tracking-tight drop-shadow-[0_0_22px_rgba(99,102,241,0.45)]">
        <span className="relative z-10">
          {text}
          <span className="cursor-blink ml-1"> |</span>
        </span>

        {/* glow respirando */}
        <span
          aria-hidden
          className="glow-breath absolute inset-[-120%] -z-10 rounded-full"
        />
      </h1>

      <MadeWithDyad />

      <style>{`
        @keyframes blink {
          0%, 45% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        @keyframes breathe {
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

        .cursor-blink {
          animation: blink 1.1s step-end infinite;
        }

        .glow-breath {
          background: radial-gradient(
            circle,
            rgba(99,102,241,0.55) 0%,
            rgba(99,102,241,0.35) 35%,
            rgba(99,102,241,0.15) 55%,
            rgba(99,102,241,0.05) 70%,
            transparent 80%
          );
          animation: breathe 4.8s cubic-bezier(0.4, 0.0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default Index;
