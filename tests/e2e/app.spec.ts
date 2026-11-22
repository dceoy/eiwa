import { expect, test as it } from "@playwright/test";

it("GET /api/health returns a JSON health response", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ ok: true, service: "eiwa" });
});

it("homepage loads with a usable input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /eiwa/iu })).toBeVisible();
  await expect(page.getByLabel(/english or japanese/iu)).toBeVisible();
  await expect(page.getByRole("button", { name: /translate/iu })).toBeDisabled();
});

it("English input returns a dictionary-backed Japanese translation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/iu).fill("cat");
  await page.getByRole("button", { name: /translate/iu }).click();

  await expect(page.getByRole("heading", { name: "Dictionary" })).toBeVisible();
  await expect(page.getByText("猫").first()).toBeVisible();
});

it("Japanese input returns a dictionary-backed English translation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/iu).fill("猫");
  await page.getByRole("button", { name: /translate/iu }).click();

  await expect(page.getByRole("heading", { name: "Dictionary" })).toBeVisible();
  await expect(page.getByText("cat").first()).toBeVisible();
});

it("Japanese kana reading input resolves the kanji dictionary entry", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/iu).fill("ネコ");
  await page.getByRole("button", { name: /translate/iu }).click();

  await expect(page.getByRole("heading", { name: "Dictionary" })).toBeVisible();
  await expect(page.getByText("cat").first()).toBeVisible();
});

it("a dictionary miss shows a 'no results' message instead of a blank result", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/iu).fill("zzznotarealword");
  await page.getByRole("button", { name: /translate/iu }).click();

  await expect(page.getByRole("heading", { name: "Dictionary" })).toHaveCount(0);
  await expect(page.getByText(/no dictionary entry was found/iu)).toBeVisible();
  await expect(page.getByRole("heading", { name: /eiwa/iu })).toBeVisible();
});

it("Clear resets the input and any shown result", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel(/english or japanese/iu);
  await input.fill("cat");
  await page.getByRole("button", { name: /translate/iu }).click();
  await expect(page.getByText("猫").first()).toBeVisible();

  await page.getByRole("button", { name: /clear/iu }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Dictionary" })).toHaveCount(0);
});

it("Settings sheet explains local-only inference and can be closed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /open settings/iu }).click();
  await expect(page.getByText(/nothing you type is sent to a server/iu)).toBeVisible();

  await page.getByRole("button", { name: /close settings/iu }).click();
  await expect(page.getByText(/nothing you type is sent to a server/iu)).toBeHidden();
});

it("renders usably within a small mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");

  const input = page.getByLabel(/english or japanese/iu);
  await expect(input).toBeVisible();
  const box = await input.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(360);

  const translateButton = page.getByRole("button", { name: /translate/iu });
  const buttonBox = await translateButton.boundingBox();
  expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(40);
});
