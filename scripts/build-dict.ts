/** Build fixture or production dictionary data for development and deployment. */
import process from "node:process";
import { buildDictionary, loadFixtures } from "./build-dict-shards";
import { buildJmdict } from "./build-jmdict";

async function main() {
  const source = process.env["DICT_SOURCE"] ?? "fixtures";
  if (source === "jmdict") {
    await buildJmdict();
    return;
  }
  if (source !== "fixtures") {
    throw new Error(`Unknown DICT_SOURCE: ${source}`);
  }
  const seenIds = new Set<string>();
  await buildDictionary(await loadFixtures("en", seenIds), await loadFixtures("ja", seenIds), {
    "eiwa-fixtures": "0.1.0",
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
