import * as React from "react";
import { CheckIcon } from "@/components/ui/icons";

import { cn } from "@/lib/utils";

type CheckedState = boolean | "indeterminate";

interface CheckboxProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "checked" | "defaultChecked"
  > {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
}

function Checkbox({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  // Controlled or uncontrolled (Radix parity).
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState<CheckedState>(
    defaultChecked ?? false,
  );
  const current = isControlled ? checked : internal;
  const isChecked = current === true;
  const state =
    current === "indeterminate" ? "indeterminate" : isChecked ? "checked" : "unchecked";

  const toggle = () => {
    const next = isChecked ? false : true;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={current === "indeterminate" ? "mixed" : isChecked}
      data-slot="checkbox"
      data-state={state}
      onClick={toggle}
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {isChecked ? (
        <span
          data-slot="checkbox-indicator"
          className="flex items-center justify-center text-current transition-none"
        >
          <CheckIcon className="size-3.5" />
        </span>
      ) : null}
    </button>
  );
}

export { Checkbox };
