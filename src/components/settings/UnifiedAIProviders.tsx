import React, { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { ChevronRight } from "@/components/ui/icons";
import { OpenRouterProviderSection } from "./providers/OpenRouterProviderSection";
import { OllamaProviderSection } from "./providers/OllamaProviderSection";
import { CustomProviderSection } from "./providers/CustomProviderSection";
import { AddCustomProviderButton } from "./providers/AddCustomProviderButton";

/**
 * Unified AI Providers settings — single card with all provider sub-sections.
 * Each provider can be individually enabled/disabled.
 * OpenRouter is always first and always on by default.
 */
export function UnifiedAIProviders({ isHighlighted }: { isHighlighted?: boolean }) {
  const { settings } = useSettings();
  const customProviders = settings?.customProviders ?? [];

  return (
    <div
      id="models-connectivity"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30" : "",
      )}
    >
      <div className="mb-6">
        <h2 className="typo-section-title">Proveedores de IA</h2>
        <p className="typo-caption mt-1">
          Configura los servicios de IA disponibles en Vibes
        </p>
      </div>

      <div className="space-y-4">
        {/* OpenRouter — always first */}
        <OpenRouterProviderSection />

        {/* Custom providers */}
        {customProviders.map((cp) => (
          <CustomProviderSection key={cp.id} provider={cp} />
        ))}

        {/* Ollama */}
        <OllamaProviderSection />

        {/* Add custom provider button */}
        <AddCustomProviderButton />
      </div>
    </div>
  );
}
