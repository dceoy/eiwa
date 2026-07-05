import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AiEngine, AiStatus } from "./llm";
import { probeWebGpuAdapter } from "./llm";
import { MODEL_OPTIONS } from "./model-config";

const ensureReadyMock = vi.fn(async (onStatus?: (status: AiStatus) => void) => {
  onStatus?.("ready");
});

vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...actual,
    isWebGpuSupported: () => true,
    probeWebGpuAdapter: vi.fn(async () => true),
    createLocalAiEngine: vi.fn(
      (): AiEngine => ({
        getStatus: () => "ready",
        ensureReady: ensureReadyMock,
        explain: vi.fn(),
        dispose: vi.fn(),
      }),
    ),
    clearAllModelCaches: vi.fn(async () => undefined),
  };
});

const manifest = {
  schemaVersion: 1,
  builtAt: "2026-01-01T00:00:00.000Z",
  sourceVersions: { "eiwa-fixtures": "0.1.0" },
  shards: [{ lang: "en", key: "c", path: "dict/en/c.json", entryCount: 1, checksum: "sha256:x" }],
  licenses: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
};

const enShard = {
  entries: {
    cat: [
      {
        id: "en:cat",
        headword: "cat",
        lang: "en",
        pos: ["noun"],
        translations: [{ text: "猫", lang: "ja" }],
        senses: [{ gloss: "A small domesticated carnivorous mammal." }],
        source: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
      },
    ],
  },
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  ensureReadyMock.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/dict/manifest.json")) return jsonResponse(manifest);
      if (url.includes("/dict/en/c.json")) return jsonResponse(enShard);
      return new Response("not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("App", () => {
  it("renders the header and a usable input on first load", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /eiwa/i })).toBeTruthy();
    expect(screen.getByLabelText(/english or japanese/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /translate/i })).toHaveProperty("disabled", true);
  });

  it("enables Translate once text is entered, and shows a dictionary-backed result", async () => {
    render(<App />);
    const textarea = screen.getByLabelText(/english or japanese/i);

    fireEvent.input(textarea, { target: { value: "cat" } });
    expect(screen.getByRole("button", { name: /translate/i })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: /translate/i }));

    await waitFor(() => {
      expect(screen.getAllByText("猫").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("heading", { name: "Dictionary" })).toBeTruthy();
  });

  it("clears input and results when Clear is pressed", async () => {
    render(<App />);
    const textarea = screen.getByLabelText(/english or japanese/i) as HTMLTextAreaElement;

    fireEvent.input(textarea, { target: { value: "cat" } });
    fireEvent.click(screen.getByRole("button", { name: /translate/i }));
    await waitFor(() => expect(screen.getAllByText("猫").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(textarea.value).toBe("");
    expect(screen.queryByText("猫")).toBeNull();
  });

  it("opens the settings sheet and shows the local-inference privacy notice", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));
    expect(screen.getByText(/nothing you type is sent to a server/i)).toBeTruthy();
  });

  it("settles cleanly (not stuck busy) after rapid repeated submissions of the same query", async () => {
    render(<App />);
    const textarea = screen.getByLabelText(/english or japanese/i);
    fireEvent.input(textarea, { target: { value: "cat" } });

    const translateButton = screen.getByRole("button", { name: /translate/i });
    fireEvent.click(translateButton);
    fireEvent.click(translateButton);
    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(screen.getAllByText("猫").length).toBeGreaterThan(0);
    });
    // Busy resolved back to a non-busy state: Translate is rendered again
    // (not stuck showing Cancel), and there is exactly one Dictionary card.
    expect(screen.getByRole("button", { name: /translate/i })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Dictionary" })).toHaveLength(1);
  });

  it("turns AI off when clearing the local cache, instead of leaving it silently disabled", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));

    const aiToggle = screen.getByRole("checkbox", { name: /enable ai explanations/i });
    await waitFor(() => expect(aiToggle).toHaveProperty("disabled", false));
    fireEvent.click(aiToggle);
    await waitFor(() => expect(aiToggle).toHaveProperty("checked", true));

    fireEvent.click(screen.getByRole("button", { name: /clear local cache/i }));

    await waitFor(() => expect(aiToggle).toHaveProperty("checked", false));
  });

  it("clears a persisted AI-enabled setting when WebGPU turns out to be unavailable, instead of leaving the toggle stuck checked and disabled", async () => {
    vi.mocked(probeWebGpuAdapter).mockResolvedValueOnce(false);
    localStorage.setItem(
      "eiwa:settings:v1",
      JSON.stringify({
        aiEnabled: true,
        modelId: MODEL_OPTIONS[0]?.id,
        directionChoice: "auto",
        modelCached: true,
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));

    const aiToggle = screen.getByRole("checkbox", { name: /enable ai explanations/i });
    await waitFor(() => expect(aiToggle).toHaveProperty("checked", false));
    expect(aiToggle).toHaveProperty("disabled", true);
    expect(screen.queryByRole("group", { name: /model/i })).toBeNull();
    expect(ensureReadyMock).not.toHaveBeenCalled();
  });

  it("does not auto-resume downloading the model on reload when a previous download never completed", async () => {
    localStorage.setItem(
      "eiwa:settings:v1",
      JSON.stringify({
        aiEnabled: true,
        modelId: MODEL_OPTIONS[0]?.id,
        directionChoice: "auto",
        modelCached: false,
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));

    const aiToggle = screen.getByRole("checkbox", { name: /enable ai explanations/i });
    await waitFor(() => expect(aiToggle).toHaveProperty("disabled", false));

    // aiEnabled without a known-cached model is not a usable "on" state, so
    // it's normalized to unchecked on load rather than showing AI as
    // enabled with no engine behind it — the user can re-check it directly
    // to retry, with no need to uncheck first.
    expect(aiToggle).toHaveProperty("checked", false);
    expect(screen.queryByRole("group", { name: /model/i })).toBeNull();
    expect(ensureReadyMock).not.toHaveBeenCalled();
  });
});
