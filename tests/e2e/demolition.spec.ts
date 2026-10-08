import { test, expect } from "@playwright/test";
test("demolition starts stable, responds to driving, water, and retry", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#demoMission")).toHaveText("The leaning bakery");
    const read = () => page.evaluate(() => JSON.parse((window as unknown as {
        render_game_to_text: () => string;
    }).render_game_to_text()));
    await page.waitForTimeout(1200);
    expect((await read()).targets).toBe(0);
    const start = (await read()).vehicle.x;
    await page.keyboard.down("d");
    await page.waitForTimeout(1000);
    await page.keyboard.up("d");
    expect((await read()).vehicle.x).toBeGreaterThan(start + 20);
    await page.keyboard.down("j");
    await page.waitForTimeout(500);
    expect((await read()).charge).toBeGreaterThan(.15);
    await page.keyboard.up("j");
    expect((await read()).charge).toBe(0);
    await page.getByRole("button", { name: "≈ Water", exact: true }).click();
    expect((await read()).water).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Retry challenge" }).click();
    expect((await read()).water).toBe(0);
    expect((await read()).targets).toBe(0);
    await page.getByLabel("Demolition challenge").selectOption("1");
    await expect(page.locator("#demoMission")).toHaveText("Water under the bridge");
    await page.getByRole("button", { name: "✎ Draw your machine" }).click();
    await expect(page.getByRole("dialog", { name: "Contraption garage" })).toBeVisible();
    const paused = (await read()).time;
    await page.waitForTimeout(400);
    expect((await read()).time).toBe(paused);
    await page.getByRole("button", { name: "Close garage" }).click();
    expect(errors).toEqual([]);
});
test("phone controls move without overflowing the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#demoMission")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const right = page.getByRole("button", { name: "Drive right" });
    const box = await right.boundingBox();
    expect(box).not.toBeNull();
    const x = await page.evaluate(() => JSON.parse((window as unknown as {
        render_game_to_text: () => string;
    }).render_game_to_text()).vehicle.x);
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    expect(await page.evaluate(() => JSON.parse((window as unknown as {
        render_game_to_text: () => string;
    }).render_game_to_text()).vehicle.x)).toBeGreaterThan(x + 20);
});
