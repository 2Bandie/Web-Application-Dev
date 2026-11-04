import { test, expect, type Page } from "@playwright/test";
import { RoomSchema } from "../src/types";

async function register(page: Page, username: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Test-rhythm-password-954!");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page.locator(".setup-grid")).toBeVisible();
}

async function readRoom(page: Page, code: string) {
  const payload: unknown = await page.evaluate(async (roomCode) => {
    const response = await fetch(`/api/rooms/${roomCode}/`, {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("pulse.access")}`,
      },
    });
    if (!response.ok) throw new Error("Could not read room");
    return response.json();
  }, code);
  return RoomSchema.parse(payload);
}

test("two players race, broadcast scores, recover after reload, and retain results", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const p1 = await first.newPage();
  const p2 = await second.newPage();
  const errors: string[] = [];
  p1.on("pageerror", (error) => errors.push(error.message));
  p2.on("pageerror", (error) => errors.push(error.message));
  const suffix = Date.now().toString();
  const host = `beat_host_${suffix}`;
  const rival = `beat_rival_${suffix}`;
  try {
    await register(p1, host);
    await register(p2, rival);
    await p1.getByRole("button", { name: /Neon Circuit/ }).click();
    await p1.getByRole("button", { name: /Create a room/ }).click();
    await expect(p1.locator(".connected")).toBeVisible();
    const code = await p1.locator(".room-code strong").innerText();
    await p2.getByLabel("Room code").fill(code);
    await p2.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(p2.locator(".connected")).toBeVisible();
    await expect(p1.locator(".player-row")).toHaveCount(2);
    await p1.getByRole("button", { name: "Ready up", exact: true }).click();
    await p2.getByRole("button", { name: "Ready up", exact: true }).click();
    await expect(p1.getByRole("button", { name: /Start race/ })).toBeEnabled();
    await p1.getByRole("button", { name: /Start race/ }).click();
    const running = await readRoom(p1, code);
    if (!running.starts_at) throw new Error("No synchronized start");
    const firstNoteAt =
      Date.parse(running.starts_at) + running.song.chart[0].time;
    await p1.waitForTimeout(Math.max(0, firstNoteAt - Date.now() + 15));
    await Promise.all([p1.keyboard.press("d"), p2.keyboard.press("d")]);
    await expect(
      p1.locator(".player-row").filter({ hasText: rival }).locator(".score"),
    ).toHaveText("1,000");
    await expect(
      p2.locator(".player-row").filter({ hasText: host }).locator(".score"),
    ).toHaveText("1,000");
    await p2.reload();
    await p2
      .locator(".recent-list")
      .getByRole("button", { name: new RegExp(code) })
      .click();
    await expect(p2.locator(".connected")).toBeVisible();
    await expect(
      p2.locator(".player-row").filter({ hasText: rival }).locator(".score"),
    ).toHaveText("1,000");
    const doneAt = Date.parse(running.starts_at) + running.song.duration_ms;
    await p1.waitForTimeout(Math.max(0, doneAt - Date.now() + 800));
    await expect(p1.getByText(/Race complete ·/)).toBeVisible();
    await expect(p2.getByText(/Race complete ·/)).toBeVisible();
    await p1.getByRole("button", { name: "Your records", exact: true }).click();
    await expect(p1.locator(".history-row").first()).toContainText(
      "Neon Circuit",
    );
    await expect(p1.locator(".history-row").first()).toContainText("1,000");
    await expect(p1.locator("table")).toContainText(host);
    await expect(p1.locator("table")).toContainText(rival);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
