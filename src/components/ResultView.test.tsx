import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, expect, it } from "vitest";
import { mergeResult } from "../result-merge";
import { ResultView } from "./ResultView";

afterEach(cleanup);

it("frames the AI translation separately from the dictionary baseline", () => {
  const result = mergeResult({
    direction: "en-ja",
    input: "cat",
    dictionaryEntries: [
      {
        id: "en:cat",
        headword: "cat",
        lang: "en",
        pos: [],
        translations: [{ text: "猫", lang: "ja" }],
        senses: [{ gloss: "cat" }],
        source: [{ name: "Fixture", license: "CC0-1.0" }],
      },
    ],
    ai: {
      translation: { primary: "ねこ", alternatives: ["ニャンコ"] },
      correction: { corrected: null, explanation: null },
      nuance: [],
      warnings: [],
    },
  });
  render(<ResultView result={result} />);
  const baseline = within(screen.getByRole("region", { name: "Translation" }));
  expect(baseline.getByText("猫")).toBeTruthy();
  expect(baseline.getByText("Dictionary")).toBeTruthy();
  expect(baseline.queryByText("ねこ")).toBeNull();
  expect(baseline.queryByText(/ニャンコ/)).toBeNull();
  const ai = within(screen.getByRole("region", { name: "AI translation" }));
  expect(ai.getByText("ねこ")).toBeTruthy();
  expect(ai.getByText("AI explanation")).toBeTruthy();
  expect(ai.getByText("ニャンコ")).toBeTruthy();
});
