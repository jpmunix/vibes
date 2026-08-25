import { describe, it, expect } from "vitest";
import {
  SYSTEM_PROMPT_GROUPS,
  SYSTEM_PROMPT_GROUP_BY_ID,
  PROMPT_LABELS,
  PROMPT_DESCRIPTIONS,
} from "./index";
import { DEFAULT_PROMPTS, DEFAULT_PROMPT_SCOPES } from "./defaults";

/**
 * Card #195: regla de oro de la jerarquía a 2 niveles.
 * SYSTEM_PROMPT_GROUPS es metadato de código (no hay DDL). Si un prompt de
 * sistema se crea sin grupo (o se duplica entre grupos), el handler `list`
 * lo clasifica mal o la UI lo pierde. Estos tests lo impiden.
 */
describe("SYSTEM_PROMPT_GROUPS — jerarquía a 2 niveles (card #195)", () => {
  const allGroupPromptIds = SYSTEM_PROMPT_GROUPS.flatMap((g) => g.promptIds);

  it("cada systemId de DEFAULT_PROMPTS aparece EXACTAMENTE una vez en algún grupo", () => {
    const counts = new Map<string, number>();
    for (const id of allGroupPromptIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const duplicated = [...counts.entries()].filter(([, n]) => n > 1);
    expect(duplicated).toEqual([]);
    const systemIds = Object.keys(DEFAULT_PROMPTS);
    const missing = systemIds.filter((id) => !counts.has(id));
    expect(missing).toEqual([]);
    expect(allGroupPromptIds.length).toBe(systemIds.length);
  });

  it("los 5 grupos canónicos existen y están en orden estable", () => {
    const keys = SYSTEM_PROMPT_GROUPS.map((g) => g.groupKey);
    expect(keys).toEqual(["core", "titles", "git", "memory", "vision"]);
  });

  it("los grupos canónicos contienen los prompts esperados", () => {
    const byKey = Object.fromEntries(
      SYSTEM_PROMPT_GROUPS.map((g) => [g.groupKey, [...g.promptIds]]),
    );
    expect(byKey.core).toEqual([
      "runtime_agent_base",
      "ctx_language",
      "ctx_no_run_locally",
      "ctx_task_management",
      "ctx_plan_mode",
      "ctx_build_walkthrough",
    ]);
    expect(byKey.titles).toEqual(["chat_title", "app_title_short", "app_name_pro"]);
    expect(byKey.git).toEqual(["auto_commit_message"]);
    expect(byKey.memory).toEqual([
      "memory_synthesis",
      "memory_selection",
      "memory_onboarding",
    ]);
    expect(byKey.vision).toEqual(["vision"]);
  });

  it("SYSTEM_PROMPT_GROUP_BY_ID resuelve el grupo de cada systemId", () => {
    for (const id of Object.keys(DEFAULT_PROMPTS)) {
      expect(SYSTEM_PROMPT_GROUP_BY_ID.has(id as never)).toBe(true);
    }
    expect(SYSTEM_PROMPT_GROUP_BY_ID.get("runtime_agent_base")).toBe("core");
    expect(SYSTEM_PROMPT_GROUP_BY_ID.get("vision")).toBe("vision");
    expect(SYSTEM_PROMPT_GROUP_BY_ID.get("auto_commit_message")).toBe("git");
    expect(SYSTEM_PROMPT_GROUP_BY_ID.get("memory_synthesis")).toBe("memory");
    expect(SYSTEM_PROMPT_GROUP_BY_ID.get("chat_title")).toBe("titles");
  });

  it("cada systemId del código tiene label y descripción", () => {
    for (const id of Object.keys(DEFAULT_PROMPTS)) {
      expect(PROMPT_LABELS[id as keyof typeof PROMPT_LABELS]).toBeTruthy();
      expect(PROMPT_DESCRIPTIONS[id as keyof typeof PROMPT_DESCRIPTIONS]).toBeTruthy();
    }
  });

  it("DEFAULT_PROMPT_SCOPES solo referencia systemIds de DEFAULT_PROMPTS", () => {
    const unknown = Object.keys(DEFAULT_PROMPT_SCOPES).filter(
      (id) => !(id in DEFAULT_PROMPTS),
    );
    expect(unknown).toEqual([]);
  });
});
