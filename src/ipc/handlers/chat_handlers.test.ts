import { describe, it, expect } from "vitest";
import { mapChatRowToSummary } from "./chat_handlers";

describe("mapChatRowToSummary", () => {
  const base = {
    id: 1,
    title: "Mi chat",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    appId: 7,
    isPlan: 0,
    isRead: 1,
    lastReadAt: null,
  };

  it("incluye messageCount cuando hay mensajes", () => {
    const result = mapChatRowToSummary(
      { ...base, messageCount: 12 },
      [],
    );
    expect(result.messageCount).toBe(12);
  });

  it("messageCount=0 cuando el chat está vacío", () => {
    const result = mapChatRowToSummary(
      { ...base, messageCount: 0 },
      [],
    );
    expect(result.messageCount).toBe(0);
  });

  it("messageCount=0 cuando el valor es null o string", () => {
    expect(mapChatRowToSummary({ ...base, messageCount: null }, []).messageCount).toBe(0);
    expect(mapChatRowToSummary({ ...base, messageCount: "5" }, []).messageCount).toBe(5);
  });

  it("normaliza isPlan e isRead a boolean", () => {
    const result = mapChatRowToSummary(
      { ...base, isPlan: 1, isRead: 0, messageCount: 3 },
      [],
    );
    expect(result.isPlan).toBe(true);
    expect(result.isRead).toBe(false);
  });

  it("pasa los labels tal cual", () => {
    const labels = [{ id: 1, label: "deuda", color: "#ff0000" }];
    const result = mapChatRowToSummary(
      { ...base, messageCount: 2 },
      labels,
    );
    expect(result.labels).toEqual(labels);
  });
});
