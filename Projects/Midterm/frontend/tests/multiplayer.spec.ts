import { test, expect, type Page } from "@playwright/test";
import { RoomSchema, PacketSchema } from "../src/types";

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

test("two players compare accuracy, broadcast scores, recover after reload, and retain results", async ({
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
    await p1.getByRole("button", { name: /Create multiplayer room/ }).click();
    await expect(p1.locator(".connected")).toBeVisible();
    const code = await p1.locator(".room-code strong").innerText();
    await p2.getByLabel("Room code").fill(code);
    await p2.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(p2.locator(".connected")).toBeVisible();
    await expect(p1.locator(".player-row")).toHaveCount(2);
    await p1.getByRole("button", { name: "Ready up", exact: true }).click();
    await p2.getByRole("button", { name: "Ready up", exact: true }).click();
    await expect(p1.getByRole("button", { name: /Start song/ })).toBeEnabled();
    await p1.getByRole("button", { name: /Start song/ }).click();
    const running = await readRoom(p1, code);
    if (!running.starts_at) throw new Error("No synchronized start");
    const firstNoteAt =
      Date.parse(running.starts_at) + running.song.chart[0].time;
    await p1.waitForTimeout(Math.max(0, firstNoteAt - Date.now() + 15));
    await Promise.all([p1.keyboard.press("d"), p2.keyboard.press("d")]);
    await expect(
      p1
        .locator(".accuracy-player")
        .filter({ hasText: rival })
        .locator(".score"),
    ).toHaveText("1,000");
    await expect(
      p2
        .locator(".accuracy-player")
        .filter({ hasText: host })
        .locator(".score"),
    ).toHaveText("1,000");
    await p2.reload();
    await expect(
      p2.getByRole("heading", { name: "Resume a session", exact: true }),
    ).toHaveCount(0);
    await p2.getByLabel("Room code").fill(code);
    await p2.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(p2.locator(".connected")).toBeVisible();
    await expect(
      p2
        .locator(".accuracy-player")
        .filter({ hasText: rival })
        .locator(".score"),
    ).toHaveText("1,000");
    const doneAt = Date.parse(running.starts_at) + running.song.duration_ms;
    await p1.waitForTimeout(Math.max(0, doneAt - Date.now() + 800));
    await expect(p1.getByText(/Song complete ·/)).toBeVisible();
    await expect(p2.getByText(/Song complete ·/)).toBeVisible();
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

test("select an expert track and play solo directly with drums, without a lobby", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(page, `solo_${Date.now()}`);
  await expect(page.locator(".track")).toHaveCount(4);
  await page.getByRole("button", { name: /Overdrive/ }).click();
  await expect(page.getByRole("button", { name: /Overdrive/ })).toContainText(
    "EXPERT",
  );
  // Observe real percussion source creation; no audio mocks replace playback.
  await page.evaluate(() => {
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      document.documentElement.dataset.drumSources = String(
        Number(document.documentElement.dataset.drumSources ?? 0) + 1,
      );
      return original.call(this);
    };
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/rooms/solo/") && response.status() === 201,
  );
  await page.getByRole("button", { name: /Play solo/ }).click();
  const response = await responsePromise;
  const room = RoomSchema.parse(await response.json());
  expect(room.mode).toBe("solo");
  expect(room.status).toBe("running");
  expect(room.song.title).toBe("Overdrive");
  expect(room.song.duration_ms).toBeGreaterThan(45000);
  await expect(page.locator(".room-code")).toContainText("SOLO PLAY");
  await expect(
    page.getByRole("button", { name: "Ready up", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".connected")).toBeVisible();
  if (!room.starts_at) throw new Error("Missing start time");
  await page.waitForTimeout(
    Math.max(
      0,
      Date.parse(room.starts_at) + room.song.chart[0].time - Date.now() + 15,
    ),
  );
  await page.keyboard.press("d");
  await expect(page.locator(".score")).toHaveText("1,000");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(document.documentElement.dataset.drumSources ?? 0),
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "♫ Audio on", exact: true }).click();
  const count = await page.evaluate(
    () => document.documentElement.dataset.drumSources,
  );
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => document.documentElement.dataset.drumSources),
  ).toBe(count);
  await expect(page.locator("body")).not.toContainText(/\brace\b/i);
  await page.screenshot({
    path: test.info().outputPath("expert-solo.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("solo can pause, resume, start over and quit without saving an incomplete result", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(page, `controls_${Date.now()}`);
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/rooms/solo/") && response.status() === 201,
  );
  await page.getByRole("button", { name: /Play solo/ }).click();
  const initial = RoomSchema.parse(await (await createResponse).json());
  if (!initial.starts_at) throw new Error("Missing start time");
  await expect(page.locator(".connected")).toBeVisible();
  await page.waitForTimeout(
    Math.max(
      0,
      Date.parse(initial.starts_at) +
        initial.song.chart[0].time -
        Date.now() +
        15,
    ),
  );
  await page.keyboard.press("d");
  await expect(page.locator(".score")).toHaveText("1,000");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".pause-overlay")).toBeVisible();
  const paused = await readRoom(page, initial.code);
  expect(paused.status).toBe("paused");
  const image = await page
    .locator("canvas")
    .evaluate((canvas) => canvas.toDataURL());
  const accuracy = await page.locator(".accuracy-value").innerText();
  await page.keyboard.press("f");
  await page.waitForTimeout(1200);
  expect(
    await page.locator("canvas").evaluate((canvas) => canvas.toDataURL()),
  ).toBe(image);
  expect(await page.locator(".accuracy-value").innerText()).toBe(accuracy);
  const scorePaused = await readRoom(page, initial.code);
  expect(scorePaused.participants[0].score).toBe(1000);
  expect(scorePaused.paused_at).toBe(paused.paused_at);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".pause-overlay")).toHaveCount(0);
  const resumed = await readRoom(page, initial.code);
  expect(resumed.status).toBe("running");
  expect(resumed.paused_at).toBeNull();
  expect(
    Date.parse(resumed.starts_at!) - Date.parse(initial.starts_at),
  ).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Resume a session", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".pause-overlay")).toBeVisible();
  await expect(page.locator(".score")).toHaveText("1,000");
  const restartResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/${initial.code}/restart/`) &&
      response.status() === 200,
  );
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  const restarted = RoomSchema.parse(await (await restartResponse).json());
  expect(restarted.code).not.toBe(initial.code);
  expect(restarted.song.id).toBe(initial.song.id);
  await expect(page.locator(".score")).toHaveText("0");
  await expect(page.locator(".feedback")).toContainText("BEST COMBO 0");
  expect((await readRoom(page, initial.code)).status).toBe("abandoned");
  await page.getByRole("button", { name: "Quit level", exact: true }).click();
  await expect(page.locator(".instrument")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Play solo/ })).toBeEnabled();
  expect((await readRoom(page, restarted.code)).status).toBe("abandoned");
  await page.getByRole("button", { name: "Your records", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("late inputs show MISS feedback without a raw Django error banner", async ({
  page,
}) => {
  // Delay real outgoing hit frames to reproduce a locally valid input arriving
  // after the authoritative server window. Authentication and other frames run normally.
  await page.addInitScript(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      if (typeof data === "string" && data.includes('"type":"hit"')) {
        const socket = this;
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) send.call(socket, data);
        }, 350);
      } else send.call(this, data);
    };
  });
  await register(page, `timing_${Date.now()}`);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/rooms/solo/") && response.status() === 201,
  );
  const socketPromise = page.waitForEvent("websocket");
  await page.getByRole("button", { name: /Play solo/ }).click();
  const room = RoomSchema.parse(await (await responsePromise).json());
  if (!room.starts_at) throw new Error("Missing start time");
  await expect(page.locator(".connected")).toBeVisible();
  await page.waitForTimeout(
    Math.max(
      0,
      Date.parse(room.starts_at) + room.song.chart[0].time - Date.now() + 15,
    ),
  );
  const socket = await socketPromise;
  const rejection = socket.waitForEvent("framereceived", {
    predicate: (event) => {
      const packet = PacketSchema.safeParse(JSON.parse(String(event.payload)));
      return packet.success && packet.data.type === "input_rejected";
    },
  });
  await page.keyboard.press("d");
  const packet = PacketSchema.parse(
    JSON.parse(String((await rejection).payload)),
  );
  expect(packet.type).toBe("input_rejected");
  if (packet.type !== "input_rejected")
    throw new Error("Expected server input rejection");
  expect(packet.reason).toBe("timing");
  expect(packet.message).toContain("Too late");
  await expect(page.locator(".feedback")).toContainText("MISS");
  await expect(page.locator(".error")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("ErrorDetail");
  await page.getByRole("button", { name: "Quit level", exact: true }).click();
});

test("vibrant UI shows Glow, the simplified heading, larger combo and transient hit/miss bursts", async ({
  page,
}) => {
  await register(page, `visual_${Date.now()}`);
  await expect(
    page.getByRole("heading", { name: "Feel the Beat", exact: true }),
  ).toBeVisible();
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "MADE FOR THE MOMENT BETWEEN BEATS.",
  );
  await expect(page.locator("body")).not.toContainText(
    "A little friendly competition.",
  );
  const glow = page.getByRole("button", { name: /Glow/ });
  await expect(glow).toBeVisible();
  await expect(page.getByRole("button", { name: /Afterglow/ })).toHaveCount(0);
  await glow.click();
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/rooms/solo/") && response.status() === 201,
  );
  await page.getByRole("button", { name: /Play solo/ }).click();
  const room = RoomSchema.parse(await (await response).json());
  if (!room.starts_at) throw new Error("No start time");
  await expect(page.locator(".connected")).toBeVisible();
  await page.waitForTimeout(
    Math.max(
      0,
      Date.parse(room.starts_at) + room.song.chart[0].time - Date.now() + 15,
    ),
  );
  await page.keyboard.press("d");
  await expect(page.locator(".hit-burst--perfect")).toHaveText("Perfect!");
  const firstId = await page
    .locator(".hit-burst--perfect")
    .getAttribute("data-burst-id");
  expect(
    await page
      .locator(".hit-burst--perfect")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("hit-bounce");
  expect(
    await page
      .locator(".feedback strong")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(25);
  await expect(page.locator(`[data-burst-id="${firstId}"]`)).toHaveCount(0, {
    timeout: 1500,
  });
  // Do not press the second note: a miss must appear without a keyboard event.
  await expect(page.locator(".hit-burst--miss")).toHaveText("Miss");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".hit-burst--miss")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("hit-fade");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".hit-burst")).toHaveCount(0);
  await page.waitForTimeout(750);
  await expect(page.locator(".hit-burst")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("vibrant-paused.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".session-heading").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("vibrant-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Quit level", exact: true }).click();
});
