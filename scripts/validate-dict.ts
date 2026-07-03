import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DictManifest } from "../src/dict-types";
import { validateManifest, validateShardPayload } from "../src/dict-validate";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DICT_DIR = path.join(ROOT, "public", "dict");

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function main() {
  const errors: string[] = [];

  const manifestRaw = await readFile(path.join(DICT_DIR, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw) as DictManifest;

  for (const issue of validateManifest(manifest)) {
    errors.push(`${issue.path}: ${issue.message}`);
  }

  for (const shard of manifest.shards ?? []) {
    const filePath = path.join(ROOT, "public", shard.path);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      errors.push(`${shard.path}: file could not be read`);
      continue;
    }

    const actualChecksum = sha256(content);
    if (actualChecksum !== shard.checksum) {
      errors.push(`${shard.path}: checksum mismatch (manifest says ${shard.checksum})`);
    }

    const payload = JSON.parse(content) as { entries: Record<string, unknown[]> };
    for (const issue of validateShardPayload(payload)) {
      errors.push(`${shard.path} ${issue.path}: ${issue.message}`);
    }

    const actualCount = Object.values(payload.entries ?? {}).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    if (actualCount !== shard.entryCount) {
      errors.push(
        `${shard.path}: entryCount mismatch (manifest says ${shard.entryCount}, found ${actualCount})`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(`Dictionary validation failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Dictionary validation passed: ${manifest.shards.length} shard(s) OK.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
