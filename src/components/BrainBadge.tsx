import React from "react";

export function BrainBadge({ brainSigns }: { brainSigns: number | undefined }) {
  if (brainSigns === undefined || brainSigns === null) return null;

  const label = "🧠".repeat(brainSigns);

  const className =
    "text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-medium";

  return <span className={className}>{label}</span>;
}

export default BrainBadge;
