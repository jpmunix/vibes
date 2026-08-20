import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ScrollArea in-house (reemplaza @radix-ui/react-scroll-area).
 * Scroll nativo + CSS mínimo, sin scrollbars custom ni corner.
 * Mantiene la misma API (className + children) para no tocar consumidores.
 */
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative overflow-auto", className)}
    {...props}
  >
    {children}
  </div>
));
ScrollArea.displayName = "ScrollArea";

/**
 * ScrollBar se conserva como no-op por compatibilidad de API.
 * Con scroll nativo el navegador pinta su propia scrollbar; nadie la importa.
 */
const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "vertical" | "horizontal";
  }
>(({ className, orientation: _orientation, ...props }, ref) => (
  <div ref={ref} className={cn("hidden", className)} {...props} />
));
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
