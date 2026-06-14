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
