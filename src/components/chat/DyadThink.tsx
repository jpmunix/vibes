import React from "react";
import { VanillaMarkdownParser } from "./DyadMarkdownParser";
import { CustomTagState } from "./stateTypes";
import { DyadTokenSavings } from "./DyadTokenSavings";

interface DyadThinkProps {
  node?: any;
  children?: React.ReactNode;
}

/**
 * DyadThink renders inside the CompactToolBadge modal.
 * It just renders the thinking content as markdown.
 * The compact badge / modal behavior is handled by CompactToolBadge.
 */
export const DyadThink: React.FC<DyadThinkProps> = ({ children }) => {
  // Check if content matches token savings format
  const tokenSavingsMatch =
    typeof children === "string"
      ? children.match(
        /^dyad-token-savings\?original-tokens=([0-9.]+)&smart-context-tokens=([0-9.]+)$/,
      )
      : null;

  // If it's token savings format, render DyadTokenSavings component
  if (tokenSavingsMatch) {
    const originalTokens = parseFloat(tokenSavingsMatch[1]);
    const smartContextTokens = parseFloat(tokenSavingsMatch[2]);
    return (
      <DyadTokenSavings
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
