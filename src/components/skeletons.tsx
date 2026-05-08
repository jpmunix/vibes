/**
 * Skeleton Loaders
 *
 * Lightweight skeleton components shown immediately while the real UI bundle loads.
 * Uses inline styles so they don't depend on any CSS file being loaded yet.
 * Theme-aware: reads localStorage to match the user's dark/light preference.
 */
import React from "react";

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const skeletonKeyframes = `
  @keyframes skeletonPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.15; }
  }
`;

function useSkeletonTheme() {
  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const isDark =
    savedTheme === "dark" ||
    (savedTheme !== "light" && systemPrefersDark);

  const savedIntensity = localStorage.getItem("theme-intensity");
  const intensity = savedIntensity ? parseFloat(savedIntensity) : 0.58;

  let bgL: number;
  let pulseL1: number;
  let pulseL2: number;
  let sidebarL: number;
  let sepL: number;

  if (isDark) {
    const lOffset = intensity * -0.15;
    bgL = Math.max(0, Math.min(1, 0.28 + lOffset));
    pulseL1 = bgL + 0.06;
    pulseL2 = bgL + 0.10;
    sidebarL = bgL - 0.04;
    sepL = bgL + 0.04;
  } else {
    const lOffset = intensity * -0.15;
    bgL = Math.max(0, Math.min(1, 0.985 + lOffset));
    pulseL1 = bgL - 0.06;
    pulseL2 = bgL - 0.10;
    sidebarL = bgL - 0.02;
    sepL = bgL - 0.04;
  }

  const toHex = (l: number) => {
    const v = Math.round(Math.pow(Math.max(0, Math.min(1, l)), 0.75) * 255);
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`;
  };

  const bgColor = toHex(bgL);
  const pulse1 = toHex(pulseL1);
  const pulse2 = toHex(pulseL2);
  const sidebarBg = toHex(sidebarL);
  const sepColor = toHex(sepL);

  const pulseStyle: React.CSSProperties = {
    animation: "skeletonPulse 1.5s ease-in-out infinite",
    borderRadius: "8px",
    background: `linear-gradient(90deg, ${pulse1} 0%, ${pulse2} 50%, ${pulse1} 100%)`,
  };

  return { bgColor, sidebarBg, sepColor, pulseStyle, skeletonKeyframes };
}

// ─── ChatWindowSkeleton ──────────────────────────────────────────────────────

/**
 * Skeleton for the pop-out chat window.
 * Matches the chat+preview two-panel layout.
 */
export function ChatWindowSkeleton() {
  const { bgColor, sepColor, pulseStyle, skeletonKeyframes: keyframes } = useSkeletonTheme();

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100%",
      background: bgColor,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <style>{keyframes}</style>

      {/* Chat panel skeleton */}
      <div style={{ flex: "1 1 50%", display: "flex", flexDirection: "column", padding: "16px", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "8px" }}>
          <div style={{ ...pulseStyle, width: "36px", height: "36px", borderRadius: "50%" }} />
          <div style={{ ...pulseStyle, width: "140px", height: "16px" }} />
          <div style={{ marginLeft: "auto", ...pulseStyle, width: "80px", height: "28px" }} />
        </div>

        {/* Message area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", paddingTop: "12px" }}>
          {/* User message */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ ...pulseStyle, width: "65%", height: "48px", animationDelay: "0.1s" }} />
          </div>
          {/* Assistant message */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ ...pulseStyle, width: "80%", height: "16px", animationDelay: "0.2s" }} />
            <div style={{ ...pulseStyle, width: "70%", height: "16px", animationDelay: "0.3s" }} />
            <div style={{ ...pulseStyle, width: "55%", height: "16px", animationDelay: "0.4s" }} />
          </div>
        </div>

        {/* Input area */}
        <div style={{ ...pulseStyle, width: "100%", height: "52px", animationDelay: "0.5s" }} />
      </div>

      {/* Separator */}
      <div style={{
        width: "4px",
        background: sepColor,
        flexShrink: 0,
      }} />

      {/* Preview panel skeleton */}
      <div style={{ flex: "1 1 50%", display: "flex", flexDirection: "column", padding: "16px", gap: "12px" }}>
        {/* Preview header */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "6px", animationDelay: "0.2s" }} />
          <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "6px", animationDelay: "0.3s" }} />
          <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "6px", animationDelay: "0.4s" }} />
          <div style={{ flex: 1 }} />
          <div style={{ ...pulseStyle, width: "100px", height: "24px", animationDelay: "0.3s" }} />
        </div>
        {/* Preview content area */}
        <div style={{ ...pulseStyle, flex: 1, animationDelay: "0.2s" }} />
      </div>
    </div>
  );
}

// ─── MainWindowSkeleton ──────────────────────────────────────────────────────

/**
 * Skeleton for the main application window.
 * Matches the layout: title bar + top navbar + sidebar + content area.
 */
export function MainWindowSkeleton() {
  const { bgColor, sidebarBg, sepColor, pulseStyle, skeletonKeyframes: keyframes } = useSkeletonTheme();

  // Title bar height matches the real TitleBar (44px = h-11)
  const titleBarHeight = 44;
  // Top navbar height (40px)
  const topNavHeight = 40;
  // Secondary sidebar panel width (~250px)
  const sidebarPanelWidth = 250;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100%",
      background: bgColor,
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
    }}>
      <style>{keyframes}</style>

      {/* Title bar */}
      <div style={{
        height: `${titleBarHeight}px`,
        background: sidebarBg,
        flexShrink: 0,
        // @ts-ignore — Electron-specific CSS for window drag
        WebkitAppRegionDrag: "drag",
      } as React.CSSProperties} />

      {/* Top navbar */}
      <div style={{
        height: `${topNavHeight}px`,
        background: sidebarBg,
        borderBottom: `1px solid ${sepColor}`,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: "8px",
        flexShrink: 0,
      }}>
        {/* Toggle + separator */}
        <div style={{ ...pulseStyle, width: "80px", height: "28px", borderRadius: "8px", animationDelay: "0s" }} />
        <div style={{ width: "1px", height: "20px", background: sepColor, flexShrink: 0 }} />

        {/* 3 nav items (Apps, Agente, Tareas) */}
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0 10px",
            height: "28px",
            borderRadius: "8px",
            ...(i === 0 ? { background: sepColor } : {}),
          }}>
            <div style={{ ...pulseStyle, width: "16px", height: "16px", borderRadius: "4px", animationDelay: `${i * 0.06}s` }} />
            <div style={{ ...pulseStyle, width: `${40 + i * 10}px`, height: "12px", borderRadius: "4px", animationDelay: `${i * 0.06 + 0.03}s` }} />
          </div>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right side items (credits, settings, avatar) */}
        <div style={{ ...pulseStyle, width: "60px", height: "28px", borderRadius: "8px", animationDelay: "0.3s" }} />
        <div style={{ ...pulseStyle, width: "28px", height: "28px", borderRadius: "8px", animationDelay: "0.35s" }} />
        <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "50%", animationDelay: "0.4s" }} />
      </div>

      {/* Below topnav: sidebar panel + content */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Secondary sidebar panel */}
        <div style={{
          width: `${sidebarPanelWidth}px`,
          background: sidebarBg,
          display: "flex",
          flexDirection: "column",
          padding: "8px 8px 16px 8px",
          gap: "6px",
          flexShrink: 0,
          borderRight: `1px solid ${sepColor}`,
        }}>
          {/* Header buttons (Nueva aplicación, etc.) */}
          <div style={{ ...pulseStyle, width: "100%", height: "28px", animationDelay: "0.1s" }} />
          <div style={{ ...pulseStyle, width: "100%", height: "28px", animationDelay: "0.15s" }} />
          <div style={{ ...pulseStyle, width: "100%", height: "28px", animationDelay: "0.2s" }} />
          <div style={{ ...pulseStyle, width: "85%", height: "28px", animationDelay: "0.25s" }} />

          {/* Section label */}
          <div style={{ ...pulseStyle, width: "80px", height: "10px", marginTop: "12px", animationDelay: "0.3s" }} />

          {/* App list items */}
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              padding: "4px 0",
            }}>
              <div style={{ ...pulseStyle, width: `${70 + (i % 3) * 10}%`, height: "14px", animationDelay: `${0.35 + i * 0.06}s` }} />
              <div style={{ ...pulseStyle, width: "60%", height: "10px", animationDelay: `${0.38 + i * 0.06}s` }} />
            </div>
          ))}

          {/* Another section */}
          <div style={{ ...pulseStyle, width: "100px", height: "10px", marginTop: "8px", animationDelay: "0.7s" }} />
          {[0, 1, 2].map((i) => (
            <div key={`s2-${i}`} style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              padding: "4px 0",
            }}>
              <div style={{ ...pulseStyle, width: `${60 + (i % 2) * 20}%`, height: "14px", animationDelay: `${0.75 + i * 0.06}s` }} />
              <div style={{ ...pulseStyle, width: "50%", height: "10px", animationDelay: `${0.78 + i * 0.06}s` }} />
            </div>
          ))}
        </div>

        {/* Main content area */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          gap: "24px",
        }}>
          {/* Title placeholder (vibes.start()) */}
          <div style={{ ...pulseStyle, width: "280px", height: "36px", animationDelay: "0.15s" }} />

          {/* Input box placeholder */}
          <div style={{
            width: "100%",
            maxWidth: "640px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}>
            {/* Text input area */}
            <div style={{ ...pulseStyle, width: "100%", height: "100px", borderRadius: "12px", animationDelay: "0.2s" }} />

            {/* Toolbar row below input (Agents, Gemini, etc.) */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" as const }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ ...pulseStyle, width: `${60 + i * 15}px`, height: "28px", borderRadius: "14px", animationDelay: `${0.3 + i * 0.05}s` }} />
              ))}
            </div>
          </div>

          {/* Inspiration prompt buttons */}
          <div style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: "10px",
            justifyContent: "center",
            maxWidth: "640px",
          }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{
                ...pulseStyle,
                width: `${110 + (i % 3) * 30}px`,
                height: "36px",
                borderRadius: "12px",
                animationDelay: `${0.4 + i * 0.06}s`,
              }} />
            ))}
          </div>

          {/* "Más ideas" button */}
          <div style={{ ...pulseStyle, width: "100px", height: "36px", borderRadius: "12px", animationDelay: "0.8s" }} />
        </div>
      </div>
    </div>
  );
}

// ─── SecondaryWindowSkeleton ─────────────────────────────────────────────────

const secondaryShimmerKeyframes = `
  @keyframes skeletonShimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
`;

/**
 * Universal skeleton for all secondary (pop-out) windows.
 * Displays a title-bar, toolbar, sidebar+content split, and status bar.
 * Theme-aware and fully inline-styled (no CSS dependencies).
 */
export function SecondaryWindowSkeleton() {
  const { bgColor, sidebarBg, sepColor, pulseStyle, skeletonKeyframes: kf } = useSkeletonTheme();

  // Enhanced shimmer bar — gradient sweep over the pulse background
  const shimmer = (w: string, h: string, delay = "0s"): React.CSSProperties => ({
    ...pulseStyle,
    width: w,
    height: h,
    animationDelay: delay,
    position: "relative" as const,
    overflow: "hidden",
  });

  const titleBarHeight = 44;
  const toolbarHeight = 42;
  const sidebarWidth = 220;
  const statusBarHeight = 32;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100%",
      background: bgColor,
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
    }}>
      <style>{kf}{secondaryShimmerKeyframes}</style>

      {/* ── Title bar (draggable) ── */}
      <div style={{
        height: `${titleBarHeight}px`,
        background: sidebarBg,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "10px",
        // @ts-ignore — Electron-specific
        WebkitAppRegion: "drag",
      } as React.CSSProperties}>
        {/* Window dots placeholder */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              ...pulseStyle,
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              animationDelay: `${i * 0.08}s`,
            }} />
          ))}
        </div>
        {/* Title text placeholder */}
        <div style={{ ...pulseStyle, width: "160px", height: "14px", marginLeft: "12px", animationDelay: "0.1s" }} />
      </div>

      {/* ── Toolbar row ── */}
      <div style={{
        height: `${toolbarHeight}px`,
        background: sidebarBg,
        borderBottom: `1px solid ${sepColor}`,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        gap: "8px",
        flexShrink: 0,
      }}>
        {/* Action buttons */}
        {[0, 1, 2].map((i) => (
          <div key={i} style={shimmer(`${28 + i * 4}px`, "28px", `${i * 0.06}s`)} />
        ))}
        <div style={{ width: "1px", height: "20px", background: sepColor, flexShrink: 0 }} />
        {/* Search / filter bar */}
        <div style={shimmer("180px", "28px", "0.2s")} />
        <div style={{ flex: 1 }} />
        {/* Right-side controls */}
        <div style={shimmer("28px", "28px", "0.25s")} />
        <div style={shimmer("28px", "28px", "0.3s")} />
      </div>

      {/* ── Body: sidebar + content ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Sidebar */}
        <div style={{
          width: `${sidebarWidth}px`,
          background: sidebarBg,
          borderRight: `1px solid ${sepColor}`,
          display: "flex",
          flexDirection: "column",
          padding: "12px 10px",
          gap: "6px",
          flexShrink: 0,
          overflow: "hidden",
        }}>
          {/* Section header */}
          <div style={shimmer("60%", "10px", "0.15s")} />
          {/* List items */}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 4px",
              borderRadius: "6px",
              ...(i === 0 ? { background: sepColor } : {}),
            }}>
              <div style={shimmer("18px", "18px", `${0.2 + i * 0.05}s`)} />
              <div style={shimmer(`${55 + (i % 3) * 12}%`, "12px", `${0.22 + i * 0.05}s`)} />
            </div>
          ))}
          {/* Second section */}
          <div style={{ ...shimmer("50%", "10px", "0.6s"), marginTop: "10px" }} />
          {[0, 1, 2].map((i) => (
            <div key={`s2-${i}`} style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 4px",
            }}>
              <div style={shimmer("18px", "18px", `${0.65 + i * 0.05}s`)} />
              <div style={shimmer(`${50 + (i % 2) * 20}%`, "12px", `${0.67 + i * 0.05}s`)} />
            </div>
          ))}
        </div>

        {/* Main content area */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "20px 24px",
          gap: "16px",
          overflow: "hidden",
        }}>
          {/* Content header row */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={shimmer("200px", "22px", "0.1s")} />
            <div style={{ flex: 1 }} />
            <div style={shimmer("90px", "30px", "0.15s")} />
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: sepColor, flexShrink: 0 }} />

          {/* Content blocks — card grid */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" as const }}>
            {[0, 1].map((i) => (
              <div key={i} style={{
                flex: "1 1 45%",
                minWidth: "200px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "16px",
                borderRadius: "12px",
                border: `1px solid ${sepColor}`,
              }}>
                <div style={shimmer("40%", "14px", `${0.2 + i * 0.1}s`)} />
                <div style={shimmer("90%", "12px", `${0.25 + i * 0.1}s`)} />
                <div style={shimmer("70%", "12px", `${0.3 + i * 0.1}s`)} />
                <div style={shimmer("50%", "12px", `${0.35 + i * 0.1}s`)} />
              </div>
            ))}
          </div>

          {/* Text content rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={shimmer(`${85 - (i % 3) * 10}%`, "14px", `${0.4 + i * 0.06}s`)} />
            ))}
          </div>

          {/* Bottom block — large content area */}
          <div style={{
            ...pulseStyle,
            flex: 1,
            minHeight: "80px",
            borderRadius: "12px",
            animationDelay: "0.7s",
          }} />
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        height: `${statusBarHeight}px`,
        background: sidebarBg,
        borderTop: `1px solid ${sepColor}`,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        gap: "16px",
        flexShrink: 0,
      }}>
        <div style={shimmer("8px", "8px", "0.8s")} />
        <div style={shimmer("120px", "10px", "0.85s")} />
        <div style={{ flex: 1 }} />
        <div style={shimmer("80px", "10px", "0.9s")} />
      </div>
    </div>
  );
}
