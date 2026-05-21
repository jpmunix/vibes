/**
 * VibesAvatar — Modern circular avatar for the Vibes AI assistant.
 *
 * Uses a deep purple circle background so the gradient V logo is always
 * clearly visible in both light and dark modes. The dark backdrop
 * makes the cyan→purple gradient pop and gives the avatar a
 * recognisable, app-icon-like presence at any size.
 */
import logoSrc from "../../logo";

interface VibesAvatarProps {
  /** Outer size class (width + height). Default: "h-7 w-7" */
  className?: string;
}

export function VibesAvatar({ className = "h-7 w-7" }: VibesAvatarProps) {
  return (
    <div
      className={`${className} relative flex items-center justify-center rounded-full`}
      style={{
        background: "linear-gradient(145deg, #0c0a1a, #1a0e2e)",
        boxShadow:
          "inset 0 0 0 1px rgba(168,85,247,0.35), 0 0 0 1px rgba(0,0,0,0.04)",
      }}
    >
      <img
        src={logoSrc}
        alt="Vibes"
        className="w-[72%] h-[72%] object-contain select-none pointer-events-none"
        draggable={false}
        style={{ mixBlendMode: "screen" }}
      />
    </div>
  );
}
