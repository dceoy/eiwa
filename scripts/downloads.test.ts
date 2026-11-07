// @vitest-environment node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildJmdict, JMDICT_SHA256, JMDICT_VERSION } from "./build-jmdict";
import { FREQUENCY_PINS, loadFrequency } from "./frequency";

vi.mock("node:fs", () => ({ createReadStream: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pins = { en: FREQUENCY_PINS.en.sha256, ja: FREQUENCY_PINS.ja.sha256 };
const missing = () => Object.assign(new Error("not cached"), { code: "ENOENT" });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockRejectedValue(missing());
  vi.mocked(createReadStream).mockImplementation(
    () =>
      (async function* () {
        yield await Promise.reject(missing());
      })() as unknown as ReturnType<typeof createReadStream>,
  );
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  FREQUENCY_PINS.en.sha256 = pins.en;
  FREQUENCY_PINS.ja.sha256 = pins.ja;
  vi.unstubAllGlobals();
});

function expectNoDiskChanges() {
  expect(mkdir).not.toHaveBeenCalled();
  expect(writeFile).not.toHaveBeenCalled();
  expect(rename).not.toHaveBeenCalled();
  expect(rm).not.toHaveBeenCalled();
}

describe("pinned build-time downloads", () => {
  it.each(["en", "ja"] as const)(
    "rejects unverified %s frequency bytes before parsing or writing",
    async (lang) => {
      // Invalid UTF-8 and malformed rows must fail at the raw-byte hash gate.
      vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([0xff, 0x00])));
      await expect(loadFrequency(lang)).rejects.toThrow(/checksum mismatch/);
      expectNoDiskChanges();
    },
  );
  it.each(["en", "ja"] as const)(
    "writes only verified %s frequency bytes to a fixed cache path",
    async (lang) => {
      const bytes = Buffer.from("cat 100\n");
      // Test-only pin for a tiny payload; use the real SHA-256 implementation.
      FREQUENCY_PINS[lang].sha256 = createHash("sha256").update(bytes).digest("hex");
      vi.mocked(fetch).mockResolvedValue(new Response(bytes));
      const scores = await loadFrequency(lang);
      expect(scores.get("cat")).toBe(Math.round(1000 * Math.log10(101)));
      const file = path.join(ROOT, ".cache", "frequency", `${lang}.txt`);
      expect(readFile).toHaveBeenCalledWith(file);
      expect(writeFile).toHaveBeenCalledExactlyOnceWith(`${file}.part`, bytes);
      expect(rename).toHaveBeenCalledExactlyOnceWith(`${file}.part`, file);
      expect(rm).toHaveBeenCalledExactlyOnceWith(`${file}.part`, { force: true });
    },
  );
  it("hashes original frequency bytes rather than re-encoded decoded text", async () => {
    const bytes = Buffer.concat([Buffer.from([0xff]), Buffer.from(" 100\n")]);
    FREQUENCY_PINS.en.sha256 = createHash("sha256").update(bytes).digest("hex");
    vi.mocked(fetch).mockResolvedValue(new Response(bytes));
    expect((await loadFrequency("en")).has("\ufffd")).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(expect.any(String), bytes);
  });
  it("rejects corrupt cached frequency bytes without parsing, downloading or overwriting", async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from("not frequency rows"));
    await expect(loadFrequency("en")).rejects.toThrow(/checksum mismatch/);
    expect(fetch).not.toHaveBeenCalled();
    expectNoDiskChanges();
  });
  it("rejects unverified JMdict bytes before disk writes or XML decompression", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not a gzip archive"));
    await expect(buildJmdict()).rejects.toThrow(/JMdict SHA-256 mismatch/);
    expect(createReadStream).toHaveBeenCalledExactlyOnceWith(
      path.join(ROOT, ".cache", "jmdict", `JMdict_e-${JMDICT_VERSION}-${JMDICT_SHA256}.gz`),
    );
    expectNoDiskChanges();
  });
});
