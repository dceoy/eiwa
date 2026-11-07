import { describe, expect, it } from "vitest";
import { parseAiProgress } from "./ai-progress";
import { validateAiExplanationOutput } from "./result-schema";

const output = {
  translation: { primary: '走る "速く"', alternatives: ["運営する"] },
  nuance: ["文脈による"],
  correction: { corrected: null, explanation: null },
  warnings: [],
};

describe("streamed JSON sections", () => {
  it("does not publish unfinished translation strings or nested lookalike keys", () => {
    expect(parseAiProgress('{"translation":{"primary":"unfinished')).toBeNull();
    expect(parseAiProgress('{"other":{"translation":{"primary":"fake"}}')).toBeNull();
  });

  it("publishes completed translation before nuance and the full document", () => {
    const prefix = `{"translation":${JSON.stringify(output.translation)}`;
    expect(parseAiProgress(prefix)?.translation).toEqual(output.translation);
    expect(parseAiProgress(`${prefix},"nuance":["unfinished`)?.nuance).toEqual([]);
    expect(parseAiProgress(`${prefix},"nuance":["文脈による"]`)?.nuance).toEqual(output.nuance);
  });

  it("agrees with the unchanged final schema at every completed document", () => {
    const json = JSON.stringify({ ...output, dictionary: ["invented"], etymology: "fake" });
    expect(parseAiProgress(json)).toEqual(validateAiExplanationOutput(JSON.parse(json)));
    expect(parseAiProgress(`\`\`\`json\n${json}\n\`\`\``)).toEqual(output);
    expect(parseAiProgress(json)).not.toHaveProperty("dictionary");
  });

  it("handles arbitrarily split escaped quotes, braces and backslashes", () => {
    const tricky = {
      ...output,
      translation: { primary: 'a \\ "},\\"nuance": ["fake"]', alternatives: [] },
    };
    const json = JSON.stringify(tricky);
    for (let i = 0; i <= json.length; i++) {
      const progress = parseAiProgress(json.slice(0, i));
      if (progress) expect(progress.translation).toEqual(tricky.translation);
    }
    expect(parseAiProgress(json)).toEqual(tricky);
  });
});
