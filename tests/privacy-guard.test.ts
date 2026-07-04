import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCAN_DIRS = ["src", "worker"];

// Code-level guard: Eiwa must never phone home with lookup text. If any of
// these identifiers show up in application code, something added analytics
// or a remote logging call that this project deliberately does not want.
const FORBIDDEN_PATTERNS = [
  /\bgtag\(/,
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /plausible\(/,
  /\bmixpanel\b/i,
  /\bsegment\.(track|identify)\(/,
  /sentry\.(init|captureMessage|captureException)/i,
  /navigator\.sendBeacon/,
];

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(fullPath);
      if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) return [fullPath];
      return [];
    }),
  );
  return files.flat();
}

describe("privacy guard: no analytics or remote logging", () => {
  it("contains no known analytics/remote-logging identifiers in app or worker code", async () => {
    const files = (
      await Promise.all(SCAN_DIRS.map((dir) => listFiles(path.join(ROOT, dir))))
    ).flat();
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push(`${path.relative(ROOT, file)} matches ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Worker only ever calls request.json/text from within /api/health guard, i.e. never", async () => {
    const workerIndex = await readFile(path.join(ROOT, "worker", "index.ts"), "utf8");
    expect(workerIndex).not.toMatch(/request\.(json|text|arrayBuffer|formData)\(/);
  });
});
