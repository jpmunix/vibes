import React from "react";
import { UnifiedAIProviders } from "./UnifiedAIProviders";

export function ModelsAndConnectivity({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  return <UnifiedAIProviders isHighlighted={isHighlighted} />;
}
