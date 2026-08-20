import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * ToggleGroup in-house (reemplaza @radix-ui/react-toggle-group).
 * Soporta type="single" y type="multiple". Preserva el contrato:
 * value / defaultValue / onValueChange / variant / size, y el
 * data-state="on|off" que usa el styling (toggleVariants).
 */

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ToggleGroupValue = string | string[];

interface ToggleGroupContextValue extends VariantProps<typeof toggleVariants> {
  type: "single" | "multiple";
  value: ToggleGroupValue;
  onItemActivate: (itemValue: string) => void;
  onItemDeactivate: (itemValue: string) => void;
}

const ToggleGroupContext =
  React.createContext<ToggleGroupContextValue | null>(null);

interface ToggleGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  type: "single" | "multiple";
  value?: ToggleGroupValue;
  defaultValue?: ToggleGroupValue;
  onValueChange?: (value: ToggleGroupValue) => void;
  disabled?: boolean;
  variant?: VariantProps<typeof toggleVariants>["variant"];
  size?: VariantProps<typeof toggleVariants>["size"];
}

function ToggleGroup({
  className,
  variant,
  size,
  type,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: ToggleGroupProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<ToggleGroupValue>(
    () => defaultValue ?? (type === "multiple" ? [] : ""),
  );
  const current = isControlled ? value : internal;

  const setValue = (next: ToggleGroupValue) => {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
  };

  const onItemActivate = (itemValue: string) => {
    if (type === "single") {
      // Radix parity: clicking the active item in single mode deselects it.
      setValue(current === itemValue ? "" : itemValue);
    } else {
      const arr = Array.isArray(current) ? current : [];
      if (!arr.includes(itemValue)) setValue([...arr, itemValue]);
    }
  };

  const onItemDeactivate = (itemValue: string) => {
    if (type === "multiple") {
      const arr = Array.isArray(current) ? current : [];
      setValue(arr.filter((v) => v !== itemValue));
    }
  };

  return (
    <div
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      role="group"
      className={cn(
        "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ variant, size, type, value: current, onItemActivate, onItemDeactivate }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </div>
  );
}

interface ToggleGroupItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value">,
    VariantProps<typeof toggleVariants> {
  value: string;
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  value: itemValue,
  ...props
}: ToggleGroupItemProps) {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error("ToggleGroupItem must be used within a ToggleGroup");
  }

  const { value, type, onItemActivate, onItemDeactivate } = context;
  const isOn = Array.isArray(value)
    ? value.includes(itemValue)
    : value === itemValue;
  const state = isOn ? "on" : "off";

  const handleClick = () => {
    if (isOn && type === "single") {
      // Single mode: clicking active item deselects (handled in onItemActivate).
      onItemActivate(itemValue);
    } else if (isOn) {
      onItemDeactivate(itemValue);
    } else {
      onItemActivate(itemValue);
    }
  };

  return (
    <button
      type="button"
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-state={state}
      aria-pressed={isOn}
      onClick={handleClick}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { ToggleGroup, ToggleGroupItem, toggleVariants };
