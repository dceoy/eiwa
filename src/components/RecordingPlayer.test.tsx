import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, expect, it, vi } from "vitest";
import type { DictionaryEntry } from "../dict-types";
import { mergeResult } from "../result-merge";
import { ResultView } from "./ResultView";

const recording = {
  url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a9/En-us-run.ogg/En-us-run.ogg.mp3",
  file: "en-us-run.ogg",
  source: "Wikimedia Commons" as const,
};
const entry: DictionaryEntry = {
  id: "run",
  lang: "en",
  headword: "run",
  pos: [],
  senses: [{ gloss: "Run" }],
  translations: [{ text: "走る", lang: "ja" }],
  source: [{ name: "Fixture", license: "CC0" }],
};
function show(withAudio: boolean) {
  const result = mergeResult({
    input: "run",
    direction: "en-ja",
    ai: null,
    dictionaryEntries: [{ ...entry, pronunciation: withAudio ? { recording } : { ipa: "/rʌn/" } }],
  });
  return render(<ResultView result={result} />);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("does not load audio until Play, labels Commons and handles playback failure", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("offline"));
  const view = show(true);
  const audio = view.container.querySelector("audio");
  expect(audio?.getAttribute("preload")).toBe("none");
  expect(audio?.getAttribute("src")).toBeNull();
  expect(screen.getByRole("link", { name: /Wikimedia Commons/ }).getAttribute("href")).toContain(
    "File:en-us-run.ogg",
  );
  fireEvent.click(screen.getByRole("button", { name: "Play recording (Commons)" }));
  expect(play).toHaveBeenCalledOnce();
  expect(audio?.getAttribute("src")).toBe(recording.url);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Recording unavailable"),
  );
});
it("keeps device TTS as the fallback without requiring a recording", () => {
  vi.stubGlobal("speechSynthesis", { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] });
  show(false);
  expect(screen.queryByRole("button", { name: "Play recording (Commons)" })).toBeNull();
  expect(screen.getByRole("region", { name: "Pronunciation" }).textContent).toContain("/rʌn/");
  expect(screen.getAllByRole("button", { name: /Listen/ }).length).toBeGreaterThan(0);
});
