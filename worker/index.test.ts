import { describe, expect, it, vi } from "vitest";
import worker from "./index";

function makeEnv(assetsResponse: Response) {
  return {
    ASSETS: {
      fetch: vi.fn(async () => assetsResponse),
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
}

function makeRequest(input: string, init?: RequestInit): Parameters<typeof worker.fetch>[0] {
  return new Request(input, init) as unknown as Parameters<typeof worker.fetch>[0];
}

describe("worker fetch handler", () => {
  it("returns a JSON health response for /api/health", async () => {
    const env = makeEnv(new Response("unused"));
    const request = makeRequest("https://example.com/api/health");

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ ok: true, service: "eiwa" });
  });

  it("delegates all non-API requests to the static asset binding", async () => {
    const assetsResponse = new Response("<html>index</html>", {
      headers: { "content-type": "text/html" },
    });
    const env = makeEnv(assetsResponse);
    const request = makeRequest("https://example.com/some/deep/link");

    const response = await worker.fetch(request, env);

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(response).toBe(assetsResponse);
  });

  it("never inspects or forwards the request body when routing", async () => {
    const env = makeEnv(new Response("unused"));
    const request = makeRequest("https://example.com/api/health", {
      method: "POST",
      body: JSON.stringify({ text: "secret lookup text" }),
    });

    await worker.fetch(request, env);

    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
