import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, expect, it } from "vitest";
import { mergeResult } from "../result-merge";
import { ResultView } from "./ResultView";

afterEach(cleanup);

it("labels lexical depth as dictionary facts with per-sentence contributor links", () => {
  const result = mergeResult({
    direction: "en-ja",
    input: "run",
    ai: null,
    dictionaryEntries: [
      {
        id: "test:run",
        headword: "run",
        lang: "en",
        pos: ["verb"],
        translations: [{ text: "走る", lang: "ja" }],
        senses: [{ gloss: "Test fixture" }],
        level: "basic",
        pronunciation: { ipa: "/rʌn/" },
        etymology: "Test etymology",
        relatedWords: ["walk"],
        inflectionForms: ["ran"],
        examples: [
          {
            en: { id: 1, text: "Run!", author: "Alice" },
            ja: { id: 2, text: "走れ", author: "Bob" },
          },
        ],
        source: [
          {
            name: "Test attribution",
            license: "CC BY 2.0 FR",
            licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
            attribution: "Test source terms",
            url: "https://tatoeba.org/en/terms_of_use",
          },
        ],
      },
    ],
  });
  render(<ResultView result={result} />);
  expect(screen.getByText("basic · NGSL")).toBeTruthy();
  expect(screen.getByText("Run!").getAttribute("lang")).toBe("en");
  expect(screen.getByText("走れ").getAttribute("lang")).toBe("ja");
  expect(screen.getByRole("link", { name: "#1" }).getAttribute("href")).toBe(
    "https://tatoeba.org/en/sentences/show/1",
  );
  expect(screen.getByRole("link", { name: "Alice" }).getAttribute("href")).toContain(
    "/user/profile/Alice",
  );
  expect(screen.getByText(/Examples — dictionary data/)).toBeTruthy();
  expect(screen.getByText("/rʌn/")).toBeTruthy();
  expect(screen.getByText("Test etymology")).toBeTruthy();
  expect(screen.getByText("Test source terms")).toBeTruthy();
  expect(screen.getByRole("link", { name: "CC BY 2.0 FR" })).toBeTruthy();
});

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
