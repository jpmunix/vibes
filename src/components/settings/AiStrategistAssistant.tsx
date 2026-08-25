import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { ipc } from "@/ipc/types";
import { DEFAULT_STRATEGIST_MODEL } from "@/lib/schemas";
import { Sparkles, Loader2, Check, X } from "@/components/ui/icons";
import { showError, showSuccess } from "@/lib/toast";
import {
  SKILL_SYSTEM_PROMPT,
  PROMPT_SYSTEM_PROMPT,
} from "@/prompts/strategist";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

interface AiStrategistAssistantProps {
  type: "skill" | "prompt";
  currentContent: string;
  onAccept: (newContent: string) => void;
}

export function AiStrategistAssistant({
  type,
  currentContent,
  onAccept,
}: AiStrategistAssistantProps) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!instruction.trim()) return;

    setIsGenerating(true);
    try {
      const systemPrompt =
        type === "skill" ? SKILL_SYSTEM_PROMPT : PROMPT_SYSTEM_PROMPT;
      const model = settings?.strategistModel || DEFAULT_STRATEGIST_MODEL;

      let prompt = "";
      if (currentContent && currentContent.trim()) {
        prompt = `Contenido actual:
\`\`\`
${currentContent}
\`\`\`

Instrucciones del usuario para modificar o refinar este contenido:
"${instruction}"`;
      } else {
        prompt = `Instrucciones del usuario para crear un nuevo contenido desde cero:
"${instruction}"`;
      }

      const response = await ipc.misc.playgroundCompletion({
        model,
        prompt: `${systemPrompt}\n\n${prompt}`,
      });

      if (response && response.text) {
        setProposal(response.text);
        showSuccess(t("aiStrategist.success"));
      } else {
        throw new Error(t("aiStrategist.noResponse"));
      }
    } catch (e: any) {
      console.error(e);
      showError(t("aiStrategist.generateError", { error: e.message }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (proposal) {
      onAccept(proposal);
      setProposal(null);
      setInstruction("");
      setIsOpen(false);
      showSuccess(t("aiStrategist.proposalApplied"));
    }
  };

  const handleDiscard = () => {
    setProposal(null);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setInstruction("");
      setProposal(null);
    }
  };

  const model = settings?.strategistModel || DEFAULT_STRATEGIST_MODEL;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5 hover:border-primary/40 rounded-lg h-7 font-medium"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t("aiStrategist.generateButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[875px] max-h-[80vh] p-6 rounded-2xl shadow-2xl bg-popover border border-border flex flex-col">
        <DialogHeader className="pb-3 border-b border-border/50">
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            {t("aiStrategist.dialogTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 flex flex-col min-h-0">
          {!proposal ? (
            <div className="space-y-3 flex-1 flex flex-col min-h-0">
              <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("aiStrategist.instructionLabel")}
                </label>
                <textarea
                  className="w-full flex-1 min-h-[220px] rounded-xl border border-border bg-muted/10 px-3 py-2 text-sm placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30 font-sans leading-relaxed custom-scrollbar"
                  placeholder={
                    type === "skill"
                      ? t("aiStrategist.exampleSkill")
                      : t("aiStrategist.examplePrompt")
                  }
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={isGenerating}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 flex-1 flex flex-col min-h-0">
              <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("aiStrategist.proposalLabel")}
                </label>
                <textarea
                  readOnly
                  className="w-full flex-1 min-h-[380px] rounded-xl border border-border bg-muted/5 px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-none custom-scrollbar"
                  value={proposal}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border/50 justify-between items-center gap-2">
          <div className="flex items-center">
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {model}
            </span>
          </div>

          <div className="flex gap-2">
            {!proposal ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg h-9"
                  onClick={() => handleOpenChange(false)}
                  disabled={isGenerating}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 rounded-lg h-9 font-medium"
                  onClick={handleGenerate}
                  disabled={!instruction.trim() || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("aiStrategist.generating")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("aiStrategist.generateProposal")}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDiscard}
                  disabled={isGenerating}
                >
                  {t("aiStrategist.discard")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-lg h-9 font-medium"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {t("aiStrategist.regenerate")}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 rounded-lg h-9 font-medium bg-emerald-600 hover:bg-emerald-500 text-white border-none"
                  onClick={handleAccept}
                  disabled={isGenerating}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("aiStrategist.acceptApply")}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
