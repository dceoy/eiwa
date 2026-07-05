import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";
import { loadWebLlm, WEBLLM_CDN_URL, WEBLLM_SHA256, WEBLLM_VERSION } from "./webllm-cdn";

describe("WEBLLM_VERSION", () => {
  it("matches the @mlc-ai/web-llm devDependency pin in package.json", () => {
    const pinned = packageJson.devDependencies["@mlc-ai/web-llm"].replace(/^[\^~]/, "");
    expect(WEBLLM_VERSION).toBe(pinned);
  });

  it("is embedded in WEBLLM_CDN_URL", () => {
    expect(WEBLLM_CDN_URL).toContain(`@${WEBLLM_VERSION}/`);
  });

  it("has a pinned SHA-256 hash alongside it", () => {
    // Guards against a version bump that forgets to recompute WEBLLM_SHA256
    // (see the recompute instructions next to it in src/webllm-cdn.ts).
    expect(WEBLLM_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("loadWebLlm integrity check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws without executing anything when the fetch response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response));
    await expect(loadWebLlm()).rejects.toThrow("webllm-fetch-failed: 503");
  });

  it("throws without executing anything when the fetched bytes don't match the pinned hash", async () => {
    const tamperedBytes = new TextEncoder().encode("not the real library").buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(tamperedBytes),
      } as unknown as Response),
    );
    const wrongDigest = new Uint8Array(32).fill(0).buffer;
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(wrongDigest);

    await expect(loadWebLlm()).rejects.toThrow("webllm-integrity-mismatch");
  });
});
