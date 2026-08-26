import React, { useEffect, useRef, useState } from "react";

/**
 * Monta children solo cuando el contenedor entra en viewport (IntersectionObserver)
 * o cuando el navegador esta idle (requestIdleCallback fallback + timeout).
 * Evita pintar 10 secciones pesadas en un solo frame al navegar a /settings.
 */
export function DeferredSection({
  children,
  fallback,
  rootId = "settings-scroll-container",
  rootMargin = "400px",
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootId?: string;
  rootMargin?: string;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cic = (window as any).cancelIdleCallback as
      | ((id: number) => void)
      | undefined;

    let idleId: number | null = null;
    let fallbackTimer: number | null = null;
    let observer: IntersectionObserver | null = null;

    const reveal = () => setVisible(true);

    if (ric) {
      idleId = ric(reveal, { timeout: 1200 });
    } else {
      fallbackTimer = window.setTimeout(reveal, 900);
    }

    if ("IntersectionObserver" in window) {
      const root = rootId ? document.getElementById(rootId) : null;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            reveal();
            observer?.disconnect();
            observer = null;
            if (idleId !== null && cic) cic(idleId);
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
          }
        },
        { root: root as Element | null, rootMargin, threshold: 0 },
      );
      observer.observe(el);
    }

    return () => {
      if (observer) observer.disconnect();
      if (idleId !== null && cic) cic(idleId);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [visible, rootId, rootMargin]);

  return <div ref={ref}>{visible ? children : fallback}</div>;
}

export function SectionSkeleton() {
  return (
    <div className="space-y-3 py-2 animate-pulse">
      <div className="h-4 w-1/3 bg-muted rounded" />
      <div className="h-3 w-2/3 bg-muted/70 rounded" />
      <div className="h-24 w-full bg-muted/50 rounded-xl" />
    </div>
  );
}
