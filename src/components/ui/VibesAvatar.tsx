/**
 * VibesAvatar — Modern circular avatar for the Vibes AI assistant.
 *
 * Renders the V logo inside a subtle, themed circle that looks great
 * in both light and dark modes. Uses a soft gradient ring and
 * translucent background so the logo pops without clashing.
 */
import logoSrc from "../../../assets/icon/logo.png";

interface VibesAvatarProps {
  /** Outer size class (width + height). Default: "h-7 w-7" */
  className?: string;
}

export function VibesAvatar({ className = "h-7 w-7" }: VibesAvatarProps) {
  return (
    <div
      className={`${className} relative flex items-center justify-center rounded-full`}
      style={{
        /* Subtle gradient ring (1px inset shadow acts as a border) */
        background:
          "linear-gradient(135deg, rgba(0,224,255,0.12) 0%, rgba(130,80,255,0.12) 100%)",
        boxShadow:
          "inset 0 0 0 1px rgba(130,80,255,0.18), 0 0 6px 0 rgba(0,224,255,0.08)",
      }}
    >
      <img
        src={logoSrc}
        alt="Vibes"
        /* ~62% of container so the V sits comfortably inside the circle */
        className="w-[62%] h-[62%] object-contain select-none pointer-events-none"
        draggable={false}
      />
    </div>
  );
}
