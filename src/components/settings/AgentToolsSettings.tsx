import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useAgentTools,
  type AgentToolName,
  type AgentTool,
} from "@/hooks/useAgentTools";
import { Loader2, ChevronRight } from "lucide-react";
import { AgentToolConsent } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export function AgentToolsSettings() {
  const { tools, isLoading, setConsent } = useAgentTools();
  const [showAutoApproved, setShowAutoApproved] = useState(false);

  const handleConsentChange = (
    toolName: AgentToolName,
    consent: AgentToolConsent,
  ) => {
    setConsent({ toolName, consent });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-primary/40" />
      </div>
    );
  }

  const autoApprovedTools =
    tools?.filter((t: AgentTool) => t.isAllowedByDefault) || [];
  const requiresApprovalTools =
    tools?.filter((t: AgentTool) => !t.isAllowedByDefault) || [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        {requiresApprovalTools.map((tool: AgentTool) => (
          <ToolConsentRow
            key={tool.name}
            name={tool.name}
            description={tool.description}
            consent={tool.consent}
            onConsentChange={(consent) =>
              handleConsentChange(tool.name as AgentToolName, consent)
            }
          />
        ))}
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={() => setShowAutoApproved(!showAutoApproved)}
          className="flex items-center gap-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors group px-2 py-1"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform text-muted-foreground/40 group-hover:text-foreground",
              showAutoApproved ? "rotate-90" : ""
            )}
          />
          <span className="uppercase tracking-widest text-[10px]">
            Herramientas automáticas ({autoApprovedTools.length})
          </span>
        </button>
        {showAutoApproved && (
          <div className="space-y-2 mt-4">
            {autoApprovedTools.map((tool: AgentTool) => (
              <ToolConsentRow
                key={tool.name}
                name={tool.name}
                description={tool.description}
                consent={tool.consent}
                onConsentChange={(consent) =>
                  handleConsentChange(tool.name as AgentToolName, consent)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolConsentRow({
  name,
  description,
  consent,
  onConsentChange,
}: {
  name: string;
  description: string;
  consent: AgentToolConsent;
  onConsentChange: (consent: AgentToolConsent) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-8 p-4 rounded-xl hover:bg-muted/30 transition-colors border border-transparent hover:border-border">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">
          {name}
        </div>
        <div className="text-xs text-muted-foreground mt-1 leading-relaxed opacity-70">
          {description}
        </div>
      </div>
      <Select
        value={consent}
        onValueChange={(v) => onConsentChange(v as AgentToolConsent)}
      >
        <SelectTrigger className="w-[180px] h-10 rounded-xl bg-card border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="ask">Preguntar</SelectItem>
          <SelectItem value="always">Permitir siempre</SelectItem>
          <SelectItem value="never">No permitir nunca</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
