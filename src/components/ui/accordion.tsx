import * as React from "react";
import { ChevronDownIcon } from "@/components/ui/icons";

import { cn } from "@/lib/utils";

/**
 * Accordion in-house (reemplaza @radix-ui/react-accordion).
 * Soporta type="single" (con collapsible) y type="multiple".
 * Preserva el data-state="open|closed" que usan las animaciones y el styling.
 * Content solo se monta cuando el item está abierto (parity aproximado con Radix).
 */

type AccordionValue = string | string[];

interface AccordionContextValue {
  type: "single" | "multiple";
  value: AccordionValue;
  collapsible: boolean;
  onItemToggle: (itemValue: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

interface AccordionProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  type: "single" | "multiple";
  collapsible?: boolean;
  defaultValue?: AccordionValue;
  value?: AccordionValue;
  onValueChange?: (value: AccordionValue) => void;
}

function Accordion({
  type,
  collapsible = false,
  defaultValue,
  value,
  onValueChange,
  className,
  children,
  ...props
}: AccordionProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<AccordionValue>(
    () => defaultValue ?? (type === "multiple" ? [] : ""),
  );
  const current = isControlled ? value : internal;

  const onItemToggle = (itemValue: string) => {
    let next: AccordionValue;
    if (type === "single") {
      // En single, toggle solo si collapsible; si ya está abierto y no es
      // collapsible, se queda abierto.
      next =
        current === itemValue ? (collapsible ? "" : itemValue) : itemValue;
    } else {
      const arr = Array.isArray(current) ? current : [];
      next = arr.includes(itemValue)
        ? arr.filter((v) => v !== itemValue)
        : [...arr, itemValue];
    }
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <AccordionContext.Provider
      value={{ type, value: current, collapsible, onItemToggle }}
    >
      <div data-slot="accordion" className={className} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemContextValue {
  value: string;
  open: boolean;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(
  null,
);

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function AccordionItem({ className, value: itemValue, children, ...props }: AccordionItemProps) {
  const context = React.useContext(AccordionContext);
  if (!context) throw new Error("AccordionItem must be used within Accordion");
  const open = Array.isArray(context.value)
    ? context.value.includes(itemValue)
    : context.value === itemValue;

  return (
    <AccordionItemContext.Provider value={{ value: itemValue, open }}>
      <div
        data-slot="accordion-item"
        data-state={open ? "open" : "closed"}
        className={cn("border-b last:border-b-0", className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

interface AccordionTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

function AccordionTrigger({ className, children, ...props }: AccordionTriggerProps) {
  const accordion = React.useContext(AccordionContext);
  const item = React.useContext(AccordionItemContext);
  if (!accordion || !item)
    throw new Error("AccordionTrigger must be used within AccordionItem");

  return (
    <div className="flex">
      <button
        type="button"
        data-slot="accordion-trigger"
        data-state={item.open ? "open" : "closed"}
        aria-expanded={item.open}
        onClick={() => accordion.onItemToggle(item.value)}
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-colors outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </button>
    </div>
  );
}

interface AccordionContentProps extends React.HTMLAttributes<HTMLDivElement> {}

function AccordionContent({ className, children, ...props }: AccordionContentProps) {
  const item = React.useContext(AccordionItemContext);
  if (!item) throw new Error("AccordionContent must be used within AccordionItem");

  // Radix parity (aproximado): el contenido no se monta cuando está cerrado.
  if (!item.open) return null;

  return (
    <div
      data-slot="accordion-content"
      data-state={item.open ? "open" : "closed"}
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </div>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
