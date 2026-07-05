import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cloudflare Workers Static Assets hard limits (per deployed version):
 * https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
 * A build that violates these builds green locally but fails at `wrangler
 * deploy` time — this check catches it in CI/at build time instead.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_COUNT = 20_000;
/** Fail well before Cloudflare's hard file-count limit so growth (e.g. more
 * dictionary shards) is caught long before it becomes an emergency. */
const FILE_COUNT_SAFETY_THRESHOLD = 18_000;

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = path.join(ROOT, "dist");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
    }),
  );
  return nested.flat();
}

async function main() {
  let files: string[];
  try {
    files = await walk(DIST_DIR);
  } catch {
    console.error(`Could not read ${DIST_DIR}; run "pnpm run build" first.`);
    process.exitCode = 1;
    return;
  }

  const errors: string[] = [];

  for (const file of files) {
    const { size } = await stat(file);
    if (size > MAX_FILE_BYTES) {
      errors.push(
        `${path.relative(DIST_DIR, file)}: ${size} bytes exceeds Cloudflare's ${MAX_FILE_BYTES}-byte (5 MiB) per-file static-asset limit`,
      );
    }
  }

  if (files.length > FILE_COUNT_SAFETY_THRESHOLD) {
    errors.push(
      `dist/ contains ${files.length} files, above the safety threshold of ${FILE_COUNT_SAFETY_THRESHOLD} ` +
        `(Cloudflare's hard limit is ${MAX_FILE_COUNT} files per version)`,
    );
  }

  if (errors.length > 0) {
    console.error(`Asset limit check failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Asset limit check passed: ${files.length} file(s) in dist/, all under ${MAX_FILE_BYTES} bytes.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
