import { expect, type Page, test } from "@playwright/test";

async function lookup(page: Page, word: string) {
  await page.getByLabel(/english or japanese/i).fill(word);
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save to wordbook", exact: true })).toBeEnabled();
}
async function openWordbook(page: Page) {
  await page.getByRole("button", { name: "Wordbook & history", exact: true }).click();
  return page.getByRole("dialog", { name: "Wordbook & history" });
}

test("wordbook saves, reorders, exports/imports and reopens the same snapshot offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await lookup(page, "run");
  const before = await page.locator(".dictionary-entries").textContent();
  await page.getByRole("button", { name: "Save to wordbook", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved in wordbook" })).toBeDisabled();
  await lookup(page, "cat");
  await page.getByRole("button", { name: "Save to wordbook", exact: true }).click();
  const dialog = await openWordbook(page);
  await expect(dialog.getByRole("region", { name: "Saved words" })).toContainText("EN→JA");
  await dialog.getByRole("button", { name: "Move cat up", exact: true }).click();
  await expect(dialog.locator(".saved-words li").first()).toContainText("cat");
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloaded;
  const file = await download.path();
  if (!file) throw new Error("No export download");
  await dialog.getByRole("button", { name: "Delete saved run", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete saved cat", exact: true }).click();
  await expect(dialog.getByText("No saved words yet.")).toBeVisible();
  await dialog.getByLabel(/Import JSON/).setInputFiles(file);
  await expect(dialog.locator(".saved-words li")).toHaveCount(2);
  await expect(dialog.locator(".saved-words li").first()).toContainText("cat");
  // No dictionary cache needed: deliberately erase CacheStorage and reload the UI,
  // then block every dictionary request to simulate unavailable offline data.
  await dialog.getByRole("button", { name: "Close wordbook" }).click();
  await page.evaluate(async () => {
    for (const key of await caches.keys()) await caches.delete(key);
  });
  await page.reload();
  await page.route("**/dict/**", (route) => route.abort("internetdisconnected"));
  await context.setOffline(true);
  const offlineDialog = await openWordbook(page);
  await offlineDialog.getByRole("button", { name: "run · EN→JA", exact: true }).click();
  await expect(page.getByText("Saved dictionary snapshot — content from save time.")).toBeVisible();
  await expect(page.locator(".dictionary-entries")).toHaveText(before ?? "");
  await expect(page.getByRole("region", { name: "Pronunciation", exact: true })).toContainText(
    "/ɹʌn/",
  );
  await context.setOffline(false);
});

test("gloss, example and headword relookup use dictionary-resolved terms and correct direction", async ({
  page,
}) => {
  await page.goto("/");
  await lookup(page, "study");
  const senses = page.locator(".senses").first();
  await senses.getByRole("button", { name: "Look up time", exact: true }).click();
  await expect(page.getByLabel(/english or japanese/i)).toHaveValue("time");
  await expect(
    page.getByRole("button", { name: "Look up time", exact: true }).first(),
  ).toBeVisible();
  await lookup(page, "run");
  const exampleRun = page
    .locator(".entry-examples")
    .getByRole("button", { name: "Look up run", exact: true });
  await exampleRun.click();
  await expect(page.getByLabel(/english or japanese/i)).toHaveValue("run");
  await expect(
    page
      .locator(".dictionary-entry-head")
      .getByRole("button", { name: "Look up run", exact: true }),
  ).toBeVisible();
  // A Japanese gloss must not inherit the English-only direction override.
  await page
    .getByRole("region", { name: "Translation", exact: true })
    .getByRole("button", { name: "Look up 走る", exact: true })
    .click();
  await expect(page.getByLabel(/english or japanese/i)).toHaveValue("走る");
  await expect(
    page
      .locator(".dictionary-entry-head")
      .getByRole("button", { name: "Look up 走る", exact: true }),
  ).toBeVisible();
});

test("history is off by default, opt-in, deletable and erased when disabled", async ({ page }) => {
  await page.goto("/");
  await lookup(page, "cat");
  let dialog = await openWordbook(page);
  const toggle = dialog.getByRole("checkbox", { name: "Remember lookup history on this device" });
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("eiwa:history:v1"))).toBeNull();
  await toggle.check();
  await dialog.getByRole("button", { name: "Close wordbook" }).click();
  await lookup(page, "dog");
  await lookup(page, "cat");
  dialog = await openWordbook(page);
  await dialog.getByRole("button", { name: "Delete history cat", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Delete history cat", exact: true })).toHaveCount(
    0,
  );
  await dialog.getByRole("button", { name: "Clear all history" }).click();
  await expect(dialog.getByRole("button", { name: "Delete history dog", exact: true })).toHaveCount(
    0,
  );
  await toggle.uncheck();
  expect(await page.evaluate(() => localStorage.getItem("eiwa:history:v1"))).toBeNull();
  await dialog.getByRole("button", { name: "Close wordbook" }).click();
  await page.reload();
  dialog = await openWordbook(page);
  await expect(
    dialog.getByRole("checkbox", { name: "Remember lookup history on this device" }),
  ).not.toBeChecked();
});

test("recording requests only follow Play; Commons is attributed and missing audio keeps TTS", async ({
  page,
}) => {
  const media: string[] = [];
  await page.route("https://upload.wikimedia.org/**", async (route) => {
    media.push(route.request().url());
    await route.abort("failed");
  });
  await page.goto("/");
  await lookup(page, "run");
  const pronunciation = page.getByRole("region", { name: "Pronunciation", exact: true });
  await expect(
    pronunciation.getByRole("button", { name: "Play recording (Commons)" }),
  ).toBeVisible();
  await expect(pronunciation.getByRole("link", { name: /Wikimedia Commons/ })).toHaveAttribute(
    "href",
    /commons.wikimedia.org\/wiki\/File:/,
  );
  expect(media).toEqual([]);
  await pronunciation.getByRole("button", { name: "Play recording (Commons)" }).click();
  await expect(pronunciation.getByRole("status")).toContainText("Recording unavailable");
  expect(media.length).toBeGreaterThan(0);
  await lookup(page, "cat");
  await expect(page.getByRole("button", { name: "Play recording (Commons)" })).toHaveCount(0);
  await expect(
    pronunciation.getByRole("button", { name: "Listen (English)", exact: true }),
  ).toBeVisible();
});
