import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { WEBLLM_CDN_URL } from "../../src/webllm-cdn";

/** Use the real, hash-checked pinned WebLLM library, stubbing only its Worker
 * protocol. No production test hooks, model downloads, or WebGPU inference. */
async function stubLocalWorker(page: Page) {
  const library = await readFile("node_modules/@mlc-ai/web-llm/lib/index.js");
  await page.route(WEBLLM_CDN_URL, (route) =>
    route.fulfill({
      body: library,
      contentType: "text/javascript",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      value: { requestAdapter: async () => ({}) },
      configurable: true,
    });
    const control = window as unknown as {
      aiRelease: () => void;
      aiFail: boolean;
      aiRequests: { messages: { content: string }[] }[];
    };
    control.aiRequests = [];
    control.aiFail = false;
    Object.defineProperty(window, "Worker", {
      value: class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        index = 0;
        generation = 0;
        allowed = 0;
        interrupted = false;
        pending: (() => void) | null = null;
        constructor() {
          control.aiRelease = () => {
            this.allowed++;
            this.pending?.();
          };
        }
        terminate() {}
        postMessage(msg: {
          kind: string;
          uuid: string;
          content?: { request?: { messages: { content: string }[] } };
        }) {
          const reply = (content?: unknown, kind = "return") => {
            setTimeout(
              () =>
                this.onmessage?.(
                  new MessageEvent("message", { data: { uuid: msg.uuid, kind, content } }),
                ),
              0,
            );
          };
          if (msg.kind === "chatCompletionStreamInit") {
            this.generation++;
            this.index = 0;
            this.interrupted = false;
            if (msg.content?.request) control.aiRequests.push(msg.content.request);
            reply(null);
          } else if (msg.kind === "completionStreamNextChunk") {
            const next = () => {
              this.pending = null;
              if (this.interrupted) {
                reply();
                return;
              }
              if (control.aiFail) {
                reply("fixture late failure", "throw");
                return;
              }
              const chunks =
                this.generation === 1
                  ? [
                      '{"translation":{"primary":"AI fixture translation","alternatives":[]},',
                      '"nuance":["AI fixture nuance"],',
                      '"correction":{"corrected":null,"explanation":null},"warnings":[]}',
                    ]
                  : [
                      '{"translation":{"primary":"AI fixture back-translation","alternatives":[]},"nuance":[],"correction":{"corrected":null,"explanation":null},"warnings":[]}',
                    ];
              const content = chunks[this.index++];
              reply(content === undefined ? undefined : { choices: [{ delta: { content } }] });
            };
            if (this.generation === 1 && this.index > this.allowed && this.index < 3)
              this.pending = next;
            else next();
          } else if (msg.kind === "interruptGenerate") {
            this.interrupted = true;
            this.pending?.();
            reply(null);
          } else reply(null);
        }
      },
      configurable: true,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /open settings/i }).click();
  await page.getByRole("checkbox", { name: /enable ai explanations/i }).check();
  await expect(page.getByText("Status: ready")).toBeVisible();
  await page.getByRole("button", { name: /close settings/i }).click();
}

async function release(page: Page, fail = false) {
  await page.evaluate((shouldFail) => {
    const control = window as unknown as { aiRelease: () => void; aiFail: boolean };
    control.aiFail = shouldFail;
    control.aiRelease();
  }, fail);
}

test("dictionary paints immediately; AI sections stream, then back-translate locally", async ({
  page,
}) => {
  await stubLocalWorker(page);
  await page.getByLabel(/english or japanese/i).fill("cat");
  await page.getByRole("button", { name: /^translate$/i }).click();
  await expect(page.getByRole("heading", { name: "Dictionary" })).toBeVisible();
  await expect(page.getByText("AI fixture translation", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuance" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /back-translate/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
  await release(page);
  await expect(page.getByText("AI fixture nuance", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
  await release(page);
  await page.getByRole("button", { name: /back-translate AI translation/i }).click();
  await expect(page.getByRole("heading", { name: "AI back-translation" })).toBeVisible();
  await expect(page.getByText("AI fixture back-translation", { exact: true })).toBeVisible();
  const requests = await page.evaluate(
    () => (window as unknown as { aiRequests: { messages: { content: string }[] }[] }).aiRequests,
  );
  expect(requests[0]?.messages[1]?.content).toContain("carnivorous mammal");
  expect(requests[1]?.messages[1]?.content).toContain("Direction: Japanese to English");
  expect(requests[1]?.messages[1]?.content).toContain("Input: AI fixture translation");
});

for (const ending of ["failure", "cancel"] as const) {
  test(`late ${ending} retains streamed content without warning/miss banners`, async ({ page }) => {
    await stubLocalWorker(page);
    await page.getByLabel(/english or japanese/i).fill("unlisted sentence");
    await page.getByRole("button", { name: /^translate$/i }).click();
    await expect(page.getByText("AI fixture translation", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warnings" })).toHaveCount(0);
    await expect(page.getByText(/no dictionary entry was found/i)).toHaveCount(0);
    await release(page);
    await expect(page.getByText("AI fixture nuance", { exact: true })).toBeVisible();
    if (ending === "failure") await release(page, true);
    else await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("button", { name: /^translate$/i })).toBeVisible();
    await expect(page.getByText("AI fixture translation", { exact: true })).toBeVisible();
    await expect(page.getByText("AI fixture nuance", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warnings" })).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(/no dictionary entry was found/i)).toHaveCount(0);
  });
}
