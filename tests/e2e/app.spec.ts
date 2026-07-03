import { expect, test } from "@playwright/test";

test("GET /api/health returns a JSON health response", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ ok: true, service: "eiwa" });
});

test("homepage loads with a usable input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /eiwa/i })).toBeVisible();
  await expect(page.getByLabel(/english or japanese/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /translate/i })).toBeDisabled();
});

test("English input returns a dictionary-backed Japanese translation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("cat");
  await page.getByRole("button", { name: /translate/i }).click();

  await expect(page.getByRole("heading", { name: "Dictionary" })).toBeVisible();
  await expect(page.getByText("猫").first()).toBeVisible();
});

test("Japanese input returns a dictionary-backed English translation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("猫");
  await page.getByRole("button", { name: /translate/i }).click();

  await expect(page.getByRole("heading", { name: "Dictionary" })).toBeVisible();
  await expect(page.getByText("cat").first()).toBeVisible();
});

test("a dictionary miss shows no dictionary card and no crash", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("zzznotarealword");
  await page.getByRole("button", { name: /translate/i }).click();

  await expect(page.getByRole("heading", { name: "Dictionary" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /eiwa/i })).toBeVisible();
});

test("Clear resets the input and any shown result", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel(/english or japanese/i);
  await input.fill("cat");
  await page.getByRole("button", { name: /translate/i }).click();
  await expect(page.getByText("猫").first()).toBeVisible();

  await page.getByRole("button", { name: /clear/i }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Dictionary" })).toHaveCount(0);
});

test("Settings sheet explains local-only inference and can be closed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /open settings/i }).click();
  await expect(page.getByText(/nothing you type is sent to a server/i)).toBeVisible();

  await page.getByRole("button", { name: /close settings/i }).click();
  await expect(page.getByText(/nothing you type is sent to a server/i)).toBeHidden();
});

test("renders usably within a small mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");

  const input = page.getByLabel(/english or japanese/i);
  await expect(input).toBeVisible();
  const box = await input.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(360);

  const translateButton = page.getByRole("button", { name: /translate/i });
  const buttonBox = await translateButton.boundingBox();
  expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(40);
});
