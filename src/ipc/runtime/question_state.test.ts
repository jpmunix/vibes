import { describe, it, expect } from "vitest";
import {
  waitForRuntimeQuestionResponse,
  respondRuntimeQuestion,
  rejectAllPendingRuntimeQuestions,
  pendingRuntimeQuestionCount,
} from "./question_state";

describe("question_state", () => {
  it("resolves a pending question when respondRuntimeQuestion is called", async () => {
    const ac = new AbortController();
    const promise = waitForRuntimeQuestionResponse("req-1", ac.signal);
    expect(pendingRuntimeQuestionCount()).toBe(1);

    const resolved = respondRuntimeQuestion("req-1", ["Option A"]);
    expect(resolved).toBe(true);
    expect(pendingRuntimeQuestionCount()).toBe(0);

    const result = await promise;
    expect(result).toEqual({ requestId: "req-1", answers: ["Option A"] });
  });

  it("returns false for unknown requestId", () => {
    const resolved = respondRuntimeQuestion("does-not-exist", ["x"]);
    expect(resolved).toBe(false);
  });

  it("rejects when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();

    await expect(
      waitForRuntimeQuestionResponse("req-2", ac.signal),
    ).rejects.toMatchObject({ name: "QuestionCancelled" });
    expect(pendingRuntimeQuestionCount()).toBe(0);
  });

  it("rejects when signal aborts mid-flight", async () => {
    const ac = new AbortController();
    const promise = waitForRuntimeQuestionResponse("req-3", ac.signal);
    expect(pendingRuntimeQuestionCount()).toBe(1);

    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: "QuestionCancelled" });
    expect(pendingRuntimeQuestionCount()).toBe(0);
  });

  it("rejectAll clears all pending questions", async () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    const p1 = waitForRuntimeQuestionResponse("req-4", ac1.signal);
    const p2 = waitForRuntimeQuestionResponse("req-5", ac2.signal);
    expect(pendingRuntimeQuestionCount()).toBe(2);

    rejectAllPendingRuntimeQuestions();
    expect(pendingRuntimeQuestionCount()).toBe(0);

    await expect(p1).rejects.toMatchObject({ name: "QuestionCancelled" });
    await expect(p2).rejects.toMatchObject({ name: "QuestionCancelled" });
  });

  it("supports multi-select answers", async () => {
    const ac = new AbortController();
    const promise = waitForRuntimeQuestionResponse("req-6", ac.signal);

    respondRuntimeQuestion("req-6", [["A", "C"]]);
    const result = await promise;
    expect(result.answers).toEqual([["A", "C"]]);
  });
});
