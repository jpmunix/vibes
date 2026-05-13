import React from "react";
import { OpenRouterSettings } from "./OpenRouterSettings";
import { AIProvidersSection } from "./AIProvidersSection";

export function ModelsAndConnectivity({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  return (
    <>
      <AIProvidersSection />
      <OpenRouterSettings isHighlighted={isHighlighted} />
    </>
  );
}
