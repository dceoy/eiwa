import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { englishHeadword, JMDICT_SOURCE, parseJmdict, verifyArchive } from "./build-jmdict";

async function* chunks(xml: string) {
  for (let i = 0; i < xml.length; i += 7) yield xml.slice(i, i + 7);
}
const xml = `<?xml version="1.0"?>
<!DOCTYPE JMdict [<!ENTITY n "noun">]>
<JMdict>
<entry><ent_seq>1</ent_seq><k_ele><keb>山</keb><ke_pri>ichi1</ke_pri></k_ele>
<r_ele><reb>やま</reb></r_ele><sense><pos>&n;</pos><gloss>mountain</gloss><gloss>hill</gloss></sense></entry>
<entry><ent_seq>2</ent_seq><k_ele><keb>電車</keb></k_ele><r_ele><reb>でんしゃ</reb></r_ele>
<sense><pos>&n;</pos><gloss>train</gloss><gloss>electric train</gloss></sense></entry>
</JMdict>`;

describe("JMdict streaming conversion", () => {
  it("converts chunked XML, entities, kanji, kana, and primary English glosses", async () => {
    const { ja, en, sourceEntries } = await parseJmdict(chunks(xml));
    expect(sourceEntries).toBe(2);
    expect(ja.map((entry) => entry.headword)).toEqual(["山", "電車"]);
    expect(ja[1]?.reading).toBe("でんしゃ");
    expect(ja[0]?.pos).toEqual(["noun"]);
    expect(en.map((entry) => entry.headword)).toEqual(["mountain", "train"]);
    expect(en[0]?.translations[0]?.text).toBe("山");
    expect(ja[0]?.source).toEqual([JMDICT_SOURCE]);
    expect(en.some((entry) => entry.headword === "hill")).toBe(false);
  });

  it("honors spelling/reading/sense restrictions, inherited POS and mobile trimming", async () => {
    const source = `<JMdict><entry><ent_seq>3</ent_seq>
      <k_ele><keb>甲</keb></k_ele><k_ele><keb>乙</keb></k_ele>
      <r_ele><reb>こう</reb><re_restr>甲</re_restr></r_ele>
      <r_ele><reb>おつ</reb><re_restr>乙</re_restr></r_ele>
      <r_ele><reb>かな</reb><re_nokanji/></r_ele>
      <sense><stagk>乙</stagk><stagr>おつ</stagr><pos>noun</pos><gloss>second</gloss></sense>
      <sense><gloss>one</gloss><gloss>two</gloss><gloss>three</gloss><gloss>trimmed gloss</gloss><example>omit</example></sense>
      <sense><gloss>other</gloss></sense><sense><gloss>last</gloss></sense>
      <sense><gloss>trimmed sense</gloss></sense>
      </entry></JMdict>`;
    const { ja, en } = await parseJmdict(chunks(source));
    expect(ja.map((entry) => [entry.headword, entry.reading])).toEqual([
      ["甲", "こう"],
      ["乙", "おつ"],
      ["かな", "かな"],
    ]);
    expect(ja[0]?.translations.some((t) => t.text === "second")).toBe(false);
    expect(en[0]?.translations[0]?.text).toBe("乙");
    expect(ja.every((entry) => entry.pos.includes("noun") && entry.senses.length === 3)).toBe(true);
    expect(JSON.stringify(ja)).not.toMatch(/trimmed|omit/);
  });

  it("rejects malformed, empty or externally defined entity input", async () => {
    await expect(parseJmdict(chunks("<JMdict/>"))).rejects.toThrow(/no entries/);
    await expect(parseJmdict(chunks(xml.slice(0, -8)))).rejects.toThrow();
    await expect(
      parseJmdict(
        chunks(xml.replace('<!ENTITY n "noun">', '<!ENTITY n SYSTEM "file:///etc/passwd">')),
      ),
    ).rejects.toThrow();
  });

  it("only accepts short exact headword-style English glosses", () => {
    expect(englishHeadword("mountain")).toBe(true);
    expect(englishHeadword("electric train")).toBe(true);
    expect(englishHeadword("a long definition with many words")).toBe(false);
    expect(englishHeadword("train (electric)")).toBe(false);
  });

  it("verifies archive bytes and fails on a checksum mismatch", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "eiwa-jmdict-"));
    try {
      const file = path.join(dir, "test.gz");
      await writeFile(file, "test archive bytes");
      const hash = createHash("sha256").update("test archive bytes").digest("hex");
      await expect(verifyArchive(file, hash)).resolves.toBeUndefined();
      await expect(verifyArchive(file, "0".repeat(64))).rejects.toThrow(/SHA-256 mismatch/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
