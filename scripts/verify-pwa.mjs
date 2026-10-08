import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Optional browser check; Playwright need not be installed in the app's runtime.
// Run against a local production build with --url, never production accounts.
const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  process.env.PLAYWRIGHT_MODULE ?? "playwright",
);
const base = process.argv[2] ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use a local production server for this check.");
const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["Pixel 7"],
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${base}/?year=1&group=A1`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("button", { name: "Dodaj raspored u kalendar" })
    .waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForFunction(
    () => localStorage.getItem("fon-raspored:offline:v1") !== null,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Instaliraj aplikaciju", exact: true })
      .count(),
    0,
  );
  const calendarGap = await page
    .getByRole("button", { name: "Dodaj raspored u kalendar" })
    .evaluate(
      (button) =>
        button.getBoundingClientRect().top -
        button.previousElementSibling.getBoundingClientRect().bottom,
    );
  assert.ok(
    calendarGap >= 0 && calendarGap <= 16,
    `Calendar action gap: ${calendarGap}px`,
  );
  const manifestURL = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  assert.ok(manifestURL);
  const manifestResponse = await context.request.get(
    new URL(manifestURL, base).href,
  );
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    const response = await context.request.get(new URL(icon.src, base).href);
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"], /image\/png/);
  }
  const workerResponse = await context.request.get(`${base}/sw.js`);
  assert.match(workerResponse.headers()["cache-control"], /no-store/);

  await page.getByRole("button", { name: "Dodaj raspored u kalendar" }).click();
  await page.getByLabel("Od datuma", { exact: true }).fill("2026-10-05");
  await page.getByLabel("Do datuma", { exact: true }).fill("2026-11-02");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Preuzmi .ics fajl" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "fon-raspored.ics");
  const calendar = await readFile(await download.path(), "utf8");
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /BEGIN:VEVENT/);
  assert.match(calendar, /TZID:Europe\/Belgrade/);
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page
    .getByRole("button", { name: "Podešavanja rasporeda", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Instaliraj aplikaciju", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "FON raspored na početnom ekranu" })
    .waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fon-raspored:offline:v1")),
  );
  assert.equal(snapshot.owner, "guest");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#schedule-title").waitFor();
  assert.equal(
    await page.locator("#schedule-title").textContent(),
    snapshot.title,
  );
  assert.equal(await page.locator("#days button").count(), 5);
  await page.getByRole("button", { name: "Ponedeljak", exact: true }).click();
  assert.equal(
    await page.locator("#events article").count(),
    snapshot.schedule.Ponedeljak?.length ?? 0,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.goto(`${base}/termini`, { waitUntil: "domcontentloaded" });
  assert.equal(
    await page.locator("#schedule-title").textContent(),
    snapshot.title,
  );
  await page.getByRole("button", { name: "Ukloni lokalni raspored" }).click();
  await page.getByRole("heading", { name: "Raspored nije sačuvan" }).waitFor();
  await context.setOffline(false);
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "RASPORED NASTAVE" }).waitFor();
  await page.evaluate((snapshot) => {
    localStorage.setItem(
      "fon-raspored:offline:v1",
      JSON.stringify({ ...snapshot, owner: "previous-account" }),
    );
  }, snapshot);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => localStorage.getItem("fon-raspored:offline:v1") === null,
  );
  assert.deepEqual(errors, []);
  const desktop = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await desktopPage
      .getByRole("button", { name: "Podešavanja rasporeda", exact: true })
      .click();
    await desktopPage
      .getByRole("button", { name: "Prikaži raspored", exact: true })
      .waitFor();
    assert.equal(
      await desktopPage
        .getByRole("button", { name: "Instaliraj aplikaciju", exact: true })
        .count(),
      0,
    );
  } finally {
    await desktop.close();
  }
  console.log(
    "PASS: compact calendar placement, mobile settings install / desktop hidden, manifest/icons, service worker, calendar download, offline reload/navigation, snapshot clearing and reconnect.",
  );
} finally {
  await context.close();
  await browser.close();
}
