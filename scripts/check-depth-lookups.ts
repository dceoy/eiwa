/** Production checks through the app's real on-demand lookup path, entirely offline. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dictionaryLicenses, lookupDictionary } from "../src/dict";
import { mergeResult } from "../src/result-merge";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input), "http://localhost");
  assert(url.pathname.startsWith("/dict/"), "Only local dictionary files may be fetched");
  return new Response(
    await readFile(path.resolve(import.meta.dirname, "../public", `.${url.pathname}`), "utf8"),
  );
};
try {
  const run = await lookupDictionary("run", "en");
  const first = run[0];
  assert.equal(first?.headword, "run");
  assert(first.examples?.length && first.pronunciation?.ipa, "run must show examples and IPA");
  assert.equal(first.level, "basic");
  const result = mergeResult({
    input: "run",
    direction: "en-ja",
    dictionaryEntries: run,
    ai: null,
  });
  assert(result.pronunciation?.ipa && result.etymology);
  const train = await lookupDictionary("電車", "ja");
  assert(train.some((entry) => entry.headword === "電車" && entry.examples?.length));
  assert(
    (await lookupDictionary("でんしゃ", "ja")).some(
      (entry) => entry.headword === "電車" && entry.examples?.length,
    ),
  );
  assert(
    (await lookupDictionary("ran", "en")).some(
      (entry) => entry.headword === "run" && entry.match?.kind === "inflection",
    ),
  );
  for (const entry of [first, ...train.filter((entry) => entry.headword === "電車")]) {
    for (const pair of entry.examples ?? []) {
      assert(pair.en.author && pair.ja.author && pair.en.id > 0 && pair.ja.id > 0);
      console.log(
        `${entry.headword}: #${pair.en.id} (${pair.en.author}) ${pair.en.text} ↔ #${pair.ja.id} (${pair.ja.author}) ${pair.ja.text}`,
      );
    }
  }
  const licenses = await dictionaryLicenses();
  for (const name of ["Tatoeba", "Wiktionary", "General Service List"])
    assert(
      licenses.some(
        (source) => source.name.includes(name) && source.licenseUrl && source.attribution,
      ),
    );
  console.log(
    `run: ${first.pronunciation.ipa}; level ${first.level}; etymology ${first.etymology?.length} chars; derived ${first.derivedWords?.length ?? 0}, related ${first.relatedWords?.length ?? 0}, forms ${first.inflectionForms?.length ?? 0}.`,
  );
  console.log("Depth lookup, reading alias, merge/provenance and license spot checks passed.");
} finally {
  globalThis.fetch = originalFetch;
}
