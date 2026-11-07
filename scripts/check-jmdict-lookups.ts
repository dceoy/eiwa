/** Offline spot checks through the exact browser lookup/cache/validation path. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dictionaryLicenses, lookupDictionary } from "../src/dict";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input), "http://localhost");
  assert(url.pathname.startsWith("/dict/"), "Only local dictionary assets may be fetched");
  const content = await readFile(path.join(ROOT, "public", url.pathname), "utf8");
  return new Response(content, { headers: { "content-type": "application/json" } });
};
try {
  const mountain = await lookupDictionary("mountain", "en");
  assert.equal(mountain[0]?.translations[0]?.text, "山");
  const train = await lookupDictionary("電車", "ja");
  assert(train.some((entry) => entry.translations.some((t) => /train/.test(t.text))));
  const reading = await lookupDictionary("でんしゃ", "ja");
  assert(
    reading.some((entry) => entry.headword === "電車" && train.some((t) => t.id === entry.id)),
  );
  const licenses = await dictionaryLicenses();
  assert(
    licenses.some((source) => source.name.includes("EDRDG") && source.license === "CC BY-SA 4.0"),
  );
  console.log(
    `mountain → 山 (${mountain.length} matches; primary ${mountain[0]?.translations[0]?.text})`,
  );
  console.log(`電車 → ${train[0]?.translations.map((t) => t.text).join("; ")}`);
  console.log(`でんしゃ → 電車 (reading alias; ${reading.length} matches)`);
  console.log("JMdict lookup spot checks and EDRDG attribution passed.");
} finally {
  globalThis.fetch = originalFetch;
}
