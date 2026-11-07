import { expect, test } from "@playwright/test";

test("run shows sourced examples, IPA, etymology and a coarse NGSL tag without AI", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:") &&
      !request.url().startsWith("http://localhost:")
    )
      external.push(request.url());
  });
  await page.goto("/");
  await page.getByLabel(/english or japanese/i).fill("run");
  await page.getByRole("button", { name: "Translate", exact: true }).click();
  const entry = page
    .locator(".dictionary-entry")
    .filter({ has: page.getByText("run", { exact: true }) })
    .first();
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry.getByText("basic · NGSL")).toBeVisible();
  await expect(entry.getByText("Someday I'll run like the wind.")).toBeVisible();
  await expect(entry.getByText("またいつか風のように走るんだ。")).toBeVisible();
  await expect(entry.getByRole("link", { name: "#1519", exact: true })).toHaveAttribute(
    "href",
    "https://tatoeba.org/en/sentences/show/1519",
  );
  await expect(entry.getByRole("link", { name: "CK", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pronunciation", exact: true })).toContainText(
    "/ɹʌn/",
  );
  await expect(page.getByRole("region", { name: "Etymology", exact: true })).toContainText(
    "Middle English",
  );
  const sources = page.getByRole("region", { name: "Sources", exact: true });
  await expect(sources.getByText("Tatoeba contributors", { exact: false })).toBeVisible();
  await expect(sources.getByRole("link", { name: "CC BY 2.0 FR", exact: true })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/2.0/fr/",
  );
  expect(external).toEqual([]);
});

for (const query of ["電車", "でんしゃ"])
  test(`${query} shows Japanese-side bilingual examples and both contributor credits`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel(/english or japanese/i).fill(query);
    await page.getByRole("button", { name: "Translate", exact: true }).click();
    const entry = page
      .locator(".dictionary-entry")
      .filter({ has: page.getByText("電車", { exact: true }) })
      .first();
    // A cold production lookup also reads the Phase A related-search tables.
    await expect(entry).toBeVisible({ timeout: 20_000 });
    await expect(entry.getByText("電車が停まるまで開けないで。")).toBeVisible();
    await expect(entry.getByText("Don't open before the train stops.")).toBeVisible();
    await expect(entry.getByRole("link", { name: "mrtaistoi", exact: true })).toBeVisible();
    await expect(entry.getByRole("link", { name: "bunbuku", exact: true })).toBeVisible();
    await expect(entry.getByText(/Examples — dictionary data/)).toBeVisible();
  });
