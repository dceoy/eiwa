import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupDictionary } from "./dict";
import type { DictionaryEntry } from "./dict-types";
import type { AiEngine, AiStatus } from "./llm";
import { type LookupEvent, lookup } from "./lookup";
import { MAX_INPUT_CHARS } from "./prompt";

vi.mock("./dict", () => ({
  lookupDictionary: vi.fn(),
}));

const mockedLookupDictionary = vi.mocked(lookupDictionary);

const catEntry: DictionaryEntry = {
  id: "en:cat",
  headword: "cat",
  lang: "en",
  pos: ["noun"],
  translations: [{ text: "猫", lang: "ja" }],
  senses: [{ gloss: "A small domesticated carnivorous mammal." }],
  source: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
};

function makeAiEngine(overrides: Partial<AiEngine> & { status?: AiStatus } = {}): AiEngine {
  const status = overrides.status ?? "ready";
  return {
    getStatus: () => status,
    ensureReady: overrides.ensureReady ?? vi.fn().mockResolvedValue(undefined),
    explain:
      overrides.explain ??
      vi.fn().mockResolvedValue({
        translation: { primary: "ねこ", alternatives: [] },
        correction: { corrected: null, explanation: null },
        nuance: [],
        warnings: [],
      }),
    dispose: overrides.dispose ?? vi.fn(),
  };
}

async function collect(
  input: string,
  options?: Parameters<typeof lookup>[1],
): Promise<LookupEvent[]> {
  const events: LookupEvent[] = [];
  for await (const event of lookup(input, options)) {
    events.push(event);
  }
  return events;
}

beforeEach(() => {
  mockedLookupDictionary.mockReset();
  mockedLookupDictionary.mockResolvedValue([]);
});

describe("lookup", () => {
  it("emits empty-input and stops for blank input", async () => {
    const events = await collect("   ");
    expect(events).toEqual([
      { type: "error", error: expect.objectContaining({ code: "empty-input" }) },
    ]);
  });

  it("emits unsupported-language for input with no recognizable script", async () => {
    const events = await collect("12345");
    expect(events).toEqual([
      { type: "error", error: expect.objectContaining({ code: "unsupported-language" }) },
    ]);
  });

  it("returns a dictionary-only result when no AI engine is supplied", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const events = await collect("cat");

    expect(events[0]).toEqual({ type: "direction", direction: "en-ja" });
    expect(events[1]).toEqual({ type: "dictionary", entries: [catEntry] });
    expect(events[2]).toEqual({ type: "ai-status", status: "idle" });
    const resultEvent = events.at(-1);
    expect(resultEvent?.type).toBe("result");
    if (resultEvent?.type === "result") {
      expect(resultEvent.result.sourceKinds).toEqual(["dictionary"]);
      expect(resultEvent.result.translation.primary).toBe("猫");
    }
  });

  it("surfaces a dictionary-shard error but still emits a result", async () => {
    mockedLookupDictionary.mockRejectedValue(new Error("network down"));
    const events = await collect("cat");

    expect(
      events.some(
        (e) => e.type === "error" && e.error.code === "network-unavailable-for-dictionary-shard",
      ),
    ).toBe(true);
    expect(events.at(-1)?.type).toBe("result");
  });

  it("uses the AI engine when it reports ready, and merges into the result", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const aiEngine = makeAiEngine({ status: "ready" });
    const events = await collect("cat", { aiEngine });

    expect(events).toContainEqual({ type: "ai-status", status: "ready" });
    expect(events).toContainEqual({ type: "ai-status", status: "generating" });
    const resultEvent = events.at(-1);
    expect(resultEvent?.type).toBe("result");
    if (resultEvent?.type === "result") {
      expect(resultEvent.result.translation.primary).toBe("ねこ");
      expect(resultEvent.result.sourceKinds).toEqual(["dictionary", "ai"]);
    }
    expect(aiEngine.explain).toHaveBeenCalledOnce();
  });

  it("emits a terminal ai-status reflecting the engine's post-generation status before the result", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const aiEngine = makeAiEngine({ status: "ready" });
    const events = await collect("cat", { aiEngine });

    expect(events.at(-2)).toEqual({ type: "ai-status", status: "ready" });
    expect(events.at(-1)?.type).toBe("result");
  });

  it("emits a terminal ai-status reflecting the engine's post-generation status before an invalid-JSON error", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const aiEngine = makeAiEngine({
      status: "ready",
      explain: vi.fn().mockRejectedValue(new Error("generation-invalid-json")),
    });
    const events = await collect("cat", { aiEngine });

    const errorIndex = events.findIndex((e) => e.type === "error");
    expect(events[errorIndex - 1]).toEqual({ type: "ai-status", status: "ready" });
    expect(events.at(-1)?.type).toBe("result");
  });

  it("emits a terminal ai-status reflecting the engine's post-generation status before a cancellation", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const aiEngine = makeAiEngine({
      status: "ready",
      explain: vi.fn().mockRejectedValue(new DOMException("Generation cancelled", "AbortError")),
    });
    const events = await collect("cat", { aiEngine });

    expect(events.at(-2)).toEqual({ type: "ai-status", status: "ready" });
    expect(events.at(-1)).toEqual({ type: "cancelled" });
  });

  it("warns when input exceeds the AI character limit and an AI engine is used", async () => {
    mockedLookupDictionary.mockResolvedValue([]);
    const aiEngine = makeAiEngine({ status: "ready" });
    const longInput = "a".repeat(MAX_INPUT_CHARS + 1);
    const events = await collect(longInput, { aiEngine });

    const resultEvent = events.at(-1);
    expect(resultEvent?.type).toBe("result");
    if (resultEvent?.type === "result") {
      expect(
        resultEvent.result.warnings.some((w) => w.includes("truncated to the first 500")),
      ).toBe(true);
    }
  });

  it("does not warn when input is exactly at the AI character limit", async () => {
    mockedLookupDictionary.mockResolvedValue([]);
    const aiEngine = makeAiEngine({ status: "ready" });
    const boundaryInput = "a".repeat(MAX_INPUT_CHARS);
    const events = await collect(boundaryInput, { aiEngine });

    const resultEvent = events.at(-1);
    expect(resultEvent?.type).toBe("result");
    if (resultEvent?.type === "result") {
      expect(resultEvent.result.warnings.some((w) => w.includes("truncated"))).toBe(false);
    }
  });

  it("does not warn about truncation when no AI engine is used, even for long input", async () => {
    mockedLookupDictionary.mockResolvedValue([]);
    const longInput = "a".repeat(MAX_INPUT_CHARS + 1);
    const events = await collect(longInput);

    const resultEvent = events.at(-1);
    expect(resultEvent?.type).toBe("result");
    if (resultEvent?.type === "result") {
      expect(resultEvent.result.warnings.some((w) => w.includes("truncated"))).toBe(false);
    }
  });

  it("falls back to dictionary-only when the AI engine is still loading", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const aiEngine = makeAiEngine({ status: "loading-model" });
    const events = await collect("cat", { aiEngine });

    expect(events).toContainEqual({ type: "ai-status", status: "loading-model" });
    expect(aiEngine.explain).not.toHaveBeenCalled();
    const resultEvent = events.at(-1);
    if (resultEvent?.type === "result") {
      expect(resultEvent.result.sourceKinds).toEqual(["dictionary"]);
    }
  });

  it("falls back to dictionary-only and reports an error on invalid AI JSON", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const aiEngine = makeAiEngine({
      status: "ready",
      explain: vi.fn().mockRejectedValue(new Error("generation-invalid-json")),
    });
    const events = await collect("cat", { aiEngine });

    expect(
      events.some((e) => e.type === "error" && e.error.code === "generation-invalid-json"),
    ).toBe(true);
    const resultEvent = events.at(-1);
    expect(resultEvent?.type).toBe("result");
    if (resultEvent?.type === "result") {
      expect(resultEvent.result.sourceKinds).toEqual(["dictionary"]);
      expect(resultEvent.result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("emits cancelled instead of a result when the signal aborts before generation", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const controller = new AbortController();
    controller.abort();
    const aiEngine = makeAiEngine({ status: "ready" });

    const events = await collect("cat", { signal: controller.signal, aiEngine });

    expect(events.at(-1)).toEqual({ type: "cancelled" });
    expect(events.some((e) => e.type === "result")).toBe(false);
  });

  it("emits cancelled when AI generation itself is aborted", async () => {
    mockedLookupDictionary.mockResolvedValue([catEntry]);
    const aiEngine = makeAiEngine({
      status: "ready",
      explain: vi.fn().mockRejectedValue(new DOMException("Generation cancelled", "AbortError")),
    });
    const events = await collect("cat", { aiEngine });

    expect(events.at(-1)).toEqual({ type: "cancelled" });
    expect(events.some((e) => e.type === "result")).toBe(false);
  });

  it("honors an explicit direction override instead of auto-detecting", async () => {
    mockedLookupDictionary.mockResolvedValue([]);
    const events = await collect("cat", { direction: "ja-en" });

    expect(events[0]).toEqual({ type: "direction", direction: "ja-en" });
    expect(mockedLookupDictionary).toHaveBeenCalledWith("cat", "ja");
  });

  it("never passes the raw lookup text to any network call other than dictionary shards", async () => {
    mockedLookupDictionary.mockResolvedValue([]);
    await collect("some private sentence about my health");
    expect(mockedLookupDictionary).toHaveBeenCalledWith(
      "some private sentence about my health",
      "en",
    );
  });
});
