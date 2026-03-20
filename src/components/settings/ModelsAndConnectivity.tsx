import React from "react";
import { OpenRouterSettings } from "./OpenRouterSettings";

export function ModelsAndConnectivity({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  return <OpenRouterSettings isHighlighted={isHighlighted} />;
}
