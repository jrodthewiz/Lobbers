import { expect, test } from "@playwright/test";

test("host and join lobby smoke", async ({ browser }) => {
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  await hostPage.goto("/");
  await hostPage.getByRole("button", { name: "Host Lobby" }).click();
  await expect(hostPage.locator("#roomCode")).not.toHaveText("------");
  const code = (await hostPage.locator("#roomCode").textContent())?.trim() ?? "";
  expect(code).toHaveLength(6);

  await guestPage.goto("/");
  await guestPage.getByRole("button", { name: "Browse Lobbies" }).click();
  await expect(guestPage.locator("#lobbyList")).toContainText(code);
  await guestPage.locator("#joinCodeInput").fill(code);
  await guestPage.getByRole("button", { name: "Join By Code" }).click();
  await expect(guestPage.locator("#roomCode")).toHaveText(code);

  await hostPage.getByRole("button", { name: "Mark Ready" }).click();
  await guestPage.getByRole("button", { name: "Mark Ready" }).click();
  await expect(hostPage.locator("#roundState")).toContainText(/COUNTDOWN|ACTIVE/);

  await hostPage.close();
  await guestPage.close();
});

test("practice bot smoke", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice Bot" }).click();
  await expect(page.locator("#redName")).toContainText("Practice Bot");
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await expect(page.locator("#roundState")).toContainText(/COUNTDOWN|ACTIVE/);
});

test("practice controls and combat smoke", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice Bot" }).click();
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await expect(page.locator("#roundState")).toContainText("ACTIVE", { timeout: 5000 });

  const startX = Number(await page.locator("#hud-root").evaluate((element) => element.dataset.localX ?? "0"));
  await page.keyboard.down("d");
  await page.waitForTimeout(450);
  await page.keyboard.up("d");
  const movedX = Number(await page.locator("#hud-root").evaluate((element) => element.dataset.localX ?? "0"));
  expect(movedX).toBeGreaterThan(startX);

  const groundY = Number(await page.locator("#hud-root").evaluate((element) => element.dataset.localY ?? "0"));
  await page.keyboard.press("Space");
  await page.waitForTimeout(120);
  const jumpY = Number(await page.locator("#hud-root").evaluate((element) => element.dataset.localY ?? "0"));
  expect(jumpY).toBeLessThan(groundY);

  await page.keyboard.press("2");
  await expect(page.locator("#selectedAmmo")).toHaveText("Shotput");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-selected-ammo", "shotput");

  await page.keyboard.press("q");
  await expect(page.locator("#selectedAmmo")).toHaveText("Javelin");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-selected-ammo", "javelin");

  await page.keyboard.press("e");
  await expect(page.locator("#selectedAmmo")).toHaveText("Shotput");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-selected-ammo", "shotput");

  await page.keyboard.press("1");
  await expect(page.locator("#selectedAmmo")).toHaveText("Javelin");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-selected-ammo", "javelin");

  await page.keyboard.press("3");
  await expect(page.locator("#selectedAmmo")).toHaveText("Splitter");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-selected-ammo", "splitter");

  const canvasBox = await page.locator("canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) return;
  await page.mouse.move(canvasBox.x + 620, canvasBox.y + 360);
  await page.mouse.down();
  await page.waitForTimeout(360);
  await page.mouse.up();

  await page.waitForFunction(() => {
    const hud = document.querySelector<HTMLElement>("#hud-root");
    const projectileAmmoTypes = hud?.dataset.projectileAmmoTypes ?? "";
    const lastDistance = Number(hud?.dataset.localLastDistance ?? "0");
    return projectileAmmoTypes.split(",").includes("splitter") || lastDistance > 0;
  });

  const screenshotPath = testInfo.outputPath("splitter-fx.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("splitter-fx", { path: screenshotPath, contentType: "image/png" });
});
