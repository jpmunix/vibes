import React from "react";
import { VanillaMarkdownParser } from "./VibesMarkdownParser";
import { CustomTagState } from "./stateTypes";
import { VibesTokenSavings } from "./VibesTokenSavings";

interface VibesThinkProps {
  node?: any;
  children?: React.ReactNode;
}

/**
 * VibesThink renders inside the CompactToolBadge modal.
 * It just renders the thinking content as markdown.
 * The compact badge / modal behavior is handled by CompactToolBadge.
 */
export const VibesThink: React.FC<VibesThinkProps> = ({ children }) => {
  // Check if content matches token savings format
  const tokenSavingsMatch =
    typeof children === "string"
      ? children.match(
        /^dyad-token-savings\?original-tokens=([0-9.]+)&smart-context-tokens=([0-9.]+)$/,
      )
      : null;

  // If it's token savings format, render VibesTokenSavings component
  if (tokenSavingsMatch) {
    const originalTokens = parseFloat(tokenSavingsMatch[1]);
    const smartContextTokens = parseFloat(tokenSavingsMatch[2]);
    return (
      <VibesTokenSavings
        originalTokens={originalTokens}
        smartContextTokens={smartContextTokens}
      />
    );
  }

  return (
    <div className="prose dark:prose-invert prose-sm max-w-none">
      {typeof children === "string" ? (
        <VanillaMarkdownParser content={children} />
      ) : (
        children
      )}
    </div>
  );
};
