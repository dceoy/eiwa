import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, expect, it, vi } from "vitest";
import { resolveHeadwords } from "../dict";
import { mergeResult } from "../result-merge";
import { ResultView } from "./ResultView";

vi.mock("../dict", () => ({
  resolveHeadwords: vi.fn(
    async (words: string[], lang: string) =>
      new Set(
        words.filter((w) => (lang === "ja" ? w === "猫" : ["cat", "time", "the"].includes(w))),
      ),
  ),
}));
afterEach(cleanup);
it("marks only resolving result terms, skips function words and sends the token language", async () => {
  const result = mergeResult({
    input: "study",
    direction: "en-ja",
    ai: null,
    dictionaryEntries: [
      {
        id: "study",
        headword: "study",
        lang: "en",
        pos: [],
        translations: [{ text: "猫", lang: "ja" }],
        senses: [{ gloss: "The cat takes time with zzznonword.", examples: ["The cat."] }],
        source: [{ name: "Fixture", license: "CC0" }],
      },
    ],
  });
  const onLookup = vi.fn();
  render(<ResultView result={result} onLookup={onLookup} />);
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Look up time" })).toHaveLength(1),
  );
  expect(screen.queryByRole("button", { name: "Look up The" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Look up zzznonword" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Look up study" }));
  expect(onLookup).toHaveBeenLastCalledWith("study", "en");
  const translation = within(screen.getByRole("region", { name: "Translation" }));
  fireEvent.click(translation.getByRole("button", { name: "Look up 猫" }));
  expect(onLookup).toHaveBeenLastCalledWith("猫", "ja");
  fireEvent.click(screen.getByRole("button", { name: "Look up time" }));
  expect(onLookup).toHaveBeenLastCalledWith("time", "en");
  expect(resolveHeadwords).toHaveBeenCalled();
});
