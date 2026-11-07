import { expect, test } from "@playwright/test";

test("typing a prefix suggests a headword; selection performs lookup", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("moun");
  const suggestions = page.getByRole("region", { name: "Headword suggestions" });
  await expect(suggestions.getByRole("button", { name: "mountain", exact: true })).toBeVisible();
  await suggestions.getByRole("button", { name: "mountain", exact: true }).click();
  await expect(page.getByLabel(/english or japanese/i)).toHaveValue("mountain");
  await expect(page.getByRole("heading", { name: "Dictionary", exact: true })).toBeVisible();
  await expect(page.locator(".translation-primary")).toContainText("山");
});

for (const [form, lemma] of [
  ["took", "take"],
  ["went", "go"],
  ["better", "good"],
  ["children", "child"],
]) {
  test(`${form} resolves to ${lemma} and notes the original input`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/english or japanese/i).fill(form ?? "");
    await page.getByRole("button", { name: "Translate", exact: true }).click();
    await expect(
      page.getByText(`Inflected form: ${form} → ${lemma}`, { exact: true }),
    ).toBeVisible();
  });
}

test("substring results are labeled as partial matches", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("ounta");
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await expect(page.locator(".dictionary-entry").filter({ hasText: "mountain" })).toContainText(
    "Partial match",
  );
});

test("a typo offers did-you-mean candidates, not unverified dictionary facts", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("mountan");
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dictionary", exact: true })).toHaveCount(0);
  const spelling = page.getByRole("region", { name: "Spelling suggestions" });
  await expect(spelling.getByRole("button", { name: "mountain", exact: true })).toBeVisible();
  await spelling.getByRole("button", { name: "mountain", exact: true }).click();
  await expect(page.locator(".translation-primary")).toContainText("山");
});

test("Japanese reading prefixes suggest headwords and keyboard selection works", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("ね");
  const suggestion = page
    .getByRole("region", { name: "Headword suggestions" })
    .getByRole("button", { name: "ねこ", exact: true });
  await expect(suggestion).toBeVisible();
  await suggestion.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".translation-primary")).toContainText("cat");
});
