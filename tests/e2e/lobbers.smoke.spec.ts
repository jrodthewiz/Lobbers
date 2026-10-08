import { expect, test, type Page } from "@playwright/test";

type HudBox = {
  selector: string;
  visible: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const boxesOverlap = (a: HudBox, b: HudBox): boolean => (
  a.visible
  && b.visible
  && a.left < b.right
  && a.right > b.left
  && a.top < b.bottom
  && a.bottom > b.top
);

const activeRoundLabel = /COUNTDOWN|ACTIVE|YOUR MOVE|MOVE|YOUR SHOT|AIM|RESOLVE/;

const waitForLocalTurnPhase = async (
  page: Page,
  phase: "move" | "fire",
  minimumRemainingMs = 0,
): Promise<void> => {
  await page.waitForFunction(({ expectedPhase, minimumRemainingMs: minimumMs }) => {
    const hud = document.querySelector<HTMLElement>("#hud-root");
    return hud?.dataset.localTurn === "true"
      && hud.dataset.turnPhase === expectedPhase
      && Number(hud.dataset.turnRemainingMs ?? "0") >= minimumMs;
  }, { expectedPhase: phase, minimumRemainingMs }, { timeout: 15_000 });
};

test("host and join lobby smoke", async ({ browser }) => {
  test.setTimeout(60_000);
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  await hostPage.goto("/");
  await hostPage.getByRole("button", { name: "Host Lobby" }).click();
  await expect(hostPage.locator("#roomCode")).not.toHaveText("------");
  const code = (await hostPage.locator("#roomCode").textContent())?.trim() ?? "";
  expect(code).toHaveLength(6);

  await guestPage.goto("/");
  await guestPage.getByRole("button", { name: "Browse Lobbies" }).click();
  await expect(guestPage.locator("#lobbyListRows")).toContainText(code);
  await guestPage.locator("#joinCodeInput").fill(code);
  await guestPage.getByRole("button", { name: "Join By Code" }).click();
  await expect(guestPage.locator("#roomCode")).toHaveText(code);

  await hostPage.getByRole("button", { name: "Mark Ready" }).click();
  await guestPage.getByRole("button", { name: "Mark Ready" }).click();
  await expect(hostPage.locator("#roundEventToast")).toContainText(/Throw in [12]/, { timeout: 1000 });
  await expect(hostPage.locator("#roundState")).toContainText(activeRoundLabel);
  await expect(hostPage.locator("#roomChip")).toHaveAttribute("data-round-state", /countdown|active/);

  await hostPage.close();
  await guestPage.close();
});

test("practice bot smoke", async ({ page }, testInfo) => {
  await page.goto("/");
  const lobbyScreenshotPath = testInfo.outputPath("lobby-menu.png");
  await page.screenshot({ path: lobbyScreenshotPath });
  await testInfo.attach("lobby-menu", { path: lobbyScreenshotPath, contentType: "image/png" });
  await page.getByRole("button", { name: "Practice Bot" }).click();
  await expect(page.locator("#redName")).toContainText("Practice Bot");
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await expect(page.locator("#roundEventToast")).toContainText(/Throw in [12]/, { timeout: 1000 });
  await expect(page.locator("#roundState")).toContainText(activeRoundLabel);
  await expect(page.locator("#roomChip")).toHaveAttribute("data-round-state", /countdown|active/);
});

test("practice controls and combat smoke", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Practice Bot" }).click();
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await expect(page.locator("#roomChip")).toHaveAttribute("data-round-state", "active");
  await waitForLocalTurnPhase(page, "move", 4500);
  await expect(page.locator("#hud-root")).toHaveAttribute("data-turn-phase", "move");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-local-turn", "true");
  await expect(page.locator("#roundState")).toContainText(/YOUR MOVE|MOVE/);

  const startX = Number(await page.locator("#hud-root").evaluate((element) => element.dataset.localX ?? "0"));
  await expect(page.locator("#hud-root")).toHaveAttribute("data-dash-cooldown-progress", "100");
  await page.locator("#dashButton").click();
  await expect(page.locator("#hud-root")).toHaveAttribute("data-dash-ready", "false");
  await expect(page.locator("#dashButton")).toHaveAttribute("data-ready", "false");
  await expect(page.locator("#dashButton")).toHaveAttribute("data-cooldown-progress", /\d+/);
  await page.locator("#dashButton").evaluate((element) => (element as HTMLElement).blur());
  await page.keyboard.down("d");
  await page.waitForTimeout(450);
  await page.keyboard.up("d");
  const movedX = Number(await page.locator("#hud-root").evaluate((element) => element.dataset.localX ?? "0"));
  expect(movedX).toBeGreaterThan(startX);

  const groundY = Number(await page.locator("#hud-root").evaluate((element) => element.dataset.localY ?? "0"));
  await page.keyboard.press("Space");
  const jumpDiagnostics = await page.waitForFunction((previousY) => {
    const hud = document.querySelector<HTMLElement>("#hud-root");
    const y = Number(hud?.dataset.localY ?? "0");
    const airborne = hud?.dataset.localGrounded === "false";
    return airborne || y < Number(previousY) - 1 ? { airborne, y } : false;
  }, groundY, { timeout: 1500 }).then((handle) => handle.jsonValue() as Promise<{ airborne: boolean; y: number }>);
  expect(jumpDiagnostics.airborne || jumpDiagnostics.y < groundY).toBe(true);
  await expect(page.locator("#hud-root")).toHaveAttribute("data-world-prop-count", /[1-9]\d*/);
  await expect(page.locator("#hud-root")).toHaveAttribute("data-blue-health-state", "healthy");
  await expect(page.locator("#bluePlayerCard")).toHaveAttribute("data-health-state", "healthy");

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

  for (const ammoType of ["discus", "mortar", "needle", "cluster", "anvil"] as const) {
    const button = page.locator(`.ammo-button[data-ammo-type="${ammoType}"]`);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("data-locked", "true");
    await expect(button.locator(".ammo-badge")).toHaveText("Find");
  }

  await page.keyboard.press("4");
  await expect(page.locator("#selectedAmmo")).toHaveText("Splitter");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-selected-ammo", "splitter");

  await page.keyboard.press("z");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-mode", "overview");
  await expect(page.locator("#cameraModeLabel")).toHaveText("Map");
  await page.keyboard.press("z");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-mode", "follow");
  await page.keyboard.press("-");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-zoom", /0\.(8|9)\d?/);
  await page.keyboard.press("0");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-zoom", "1");

  const canvasBox = await page.locator("canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) return;
  await page.mouse.move(canvasBox.x + 800, canvasBox.y + 450);
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, 900);
  }
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-mode", "follow");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-zoom", /0\.(4|5|6)\d?/);
  await page.mouse.wheel(0, -900);
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-zoom", /0\.(5|6|7)\d?/);
  await page.keyboard.press("0");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-zoom", "1");

  await page.mouse.move(canvasBox.x + 800, canvasBox.y + 450);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-mode", "free");
  await expect(page.locator("#cameraModeLabel")).toHaveText("Free");
  await page.mouse.wheel(0, -900);
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-mode", "free");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-zoom", /1\.(0[89]|1\d)/);
  const freeCameraBeforePan = await page.evaluate(() => {
    const state = (window as unknown as {
      __LOBBERS_SCENE_DIAGNOSTICS__?: {
        state?: {
          camera?: {
            scrollX?: number;
          };
        };
      };
    }).__LOBBERS_SCENE_DIAGNOSTICS__?.state;
    return Number(state?.camera?.scrollX ?? 0);
  });
  await page.mouse.down({ button: "right" });
  await page.mouse.move(canvasBox.x + 540, canvasBox.y + 472, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await page.waitForFunction((beforePan) => {
    const state = (window as unknown as {
      __LOBBERS_SCENE_DIAGNOSTICS__?: {
        state?: {
          camera?: {
            scrollX?: number;
          };
        };
      };
    }).__LOBBERS_SCENE_DIAGNOSTICS__?.state;
    return Number(state?.camera?.scrollX ?? 0) > Number(beforePan) + 20;
  }, freeCameraBeforePan);
  await page.keyboard.press("0");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-mode", "follow");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-camera-zoom", "1");

  await waitForLocalTurnPhase(page, "fire", 1000);
  await expect(page.locator("#hud-root")).toHaveAttribute("data-turn-phase", "fire");
  await expect(page.locator("#hud-root")).toHaveAttribute("data-local-turn", "true");
  await expect(page.locator("#roundState")).toContainText(/YOUR SHOT|AIM/);
  await expect(page.locator("#hud-root")).toHaveAttribute("data-charge-state", "idle");
  await expect(page.locator("#chargeMeter")).toHaveAttribute("data-charge-state", "idle");
  await page.mouse.move(canvasBox.x + 620, canvasBox.y + 360);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 520, canvasBox.y + 450, { steps: 8 });
  await page.waitForTimeout(360);
  const chargeDiagnostics = await page.locator("#hud-root").evaluate((element) => {
    const meter = document.querySelector<HTMLElement>("#chargeMeter");
    return {
      rootState: element.dataset.chargeState ?? "",
      meterState: meter?.dataset.chargeState ?? "",
      ratio: Number(element.dataset.chargeRatio ?? "0"),
    };
  });
  expect(["building", "primed", "full"]).toContain(chargeDiagnostics.rootState);
  expect(chargeDiagnostics.meterState).toBe(chargeDiagnostics.rootState);
  expect(chargeDiagnostics.ratio).toBeGreaterThan(8);
  const windAimDiagnostics = await page.evaluate(() => {
    const state = (window as unknown as {
      __LOBBERS_SCENE_DIAGNOSTICS__?: {
        state?: {
          windAccelerationX?: number;
          windRibbonCount?: number;
          windAimCueVisible?: boolean;
          aim?: {
            charging?: boolean;
            aimX?: number;
            aimY?: number;
            pullAnchorDx?: number;
            pullAnchorDy?: number;
            previewActive?: boolean;
            landingX?: number;
            landingY?: number;
            targetDistance?: number;
            targetDangerRadius?: number;
            targetWillHit?: boolean;
          };
        };
      };
      __LOBBERS_DIAGNOSTICS__?: {
        state?: {
          windAccelerationX?: number;
          windRibbonCount?: number;
          windAimCueVisible?: boolean;
          aim?: {
            charging?: boolean;
            aimX?: number;
            aimY?: number;
            pullAnchorDx?: number;
            pullAnchorDy?: number;
            previewActive?: boolean;
            landingX?: number;
            landingY?: number;
            targetDistance?: number;
            targetDangerRadius?: number;
            targetWillHit?: boolean;
          };
        };
      };
    }).__LOBBERS_SCENE_DIAGNOSTICS__?.state
      ?? (window as unknown as {
        __LOBBERS_DIAGNOSTICS__?: {
          state?: {
            windAccelerationX?: number;
            windRibbonCount?: number;
            windAimCueVisible?: boolean;
            aim?: {
              charging?: boolean;
              aimX?: number;
              aimY?: number;
              pullAnchorDx?: number;
              pullAnchorDy?: number;
              previewActive?: boolean;
              landingX?: number;
              landingY?: number;
              targetDistance?: number;
              targetDangerRadius?: number;
              targetWillHit?: boolean;
            };
          };
        };
      }).__LOBBERS_DIAGNOSTICS__?.state;
    return {
      windAccelerationX: Number(state?.windAccelerationX ?? 0),
      windRibbonCount: Number(state?.windRibbonCount ?? 0),
      windAimCueVisible: state?.windAimCueVisible === true,
      aim: {
        charging: state?.aim?.charging === true,
        aimX: Number(state?.aim?.aimX ?? 0),
        aimY: Number(state?.aim?.aimY ?? 0),
        pullAnchorDx: Number(state?.aim?.pullAnchorDx ?? 0),
        pullAnchorDy: Number(state?.aim?.pullAnchorDy ?? 0),
        previewActive: state?.aim?.previewActive === true,
        landingX: Number(state?.aim?.landingX ?? 0),
        landingY: Number(state?.aim?.landingY ?? 0),
        targetDistance: Number(state?.aim?.targetDistance ?? 0),
        targetDangerRadius: Number(state?.aim?.targetDangerRadius ?? 0),
        targetWillHit: state?.aim?.targetWillHit === true,
      },
    };
  });
  expect(windAimDiagnostics.aim.charging).toBe(true);
  expect(windAimDiagnostics.aim.aimX).toBeGreaterThan(0.5);
  expect(windAimDiagnostics.aim.aimY).toBeLessThan(-0.2);
  expect(windAimDiagnostics.aim.pullAnchorDx).toBeLessThan(0);
  expect(windAimDiagnostics.aim.pullAnchorDy).toBeGreaterThan(0);
  expect(Math.hypot(
    windAimDiagnostics.aim.pullAnchorDx,
    windAimDiagnostics.aim.pullAnchorDy,
  )).toBeGreaterThan(20);
  expect(windAimDiagnostics.aim.previewActive).toBe(true);
  expect(windAimDiagnostics.aim.landingX).toBeGreaterThan(0);
  expect(windAimDiagnostics.aim.landingY).toBeGreaterThan(0);
  expect(windAimDiagnostics.aim.targetDangerRadius).toBeGreaterThan(0);
  if (windAimDiagnostics.aim.targetWillHit) {
    expect(windAimDiagnostics.aim.targetDistance).toBeLessThanOrEqual(windAimDiagnostics.aim.targetDangerRadius + 40);
  }
  if (Math.abs(windAimDiagnostics.windAccelerationX) >= 6) {
    expect(windAimDiagnostics.windRibbonCount).toBeGreaterThan(0);
    expect(windAimDiagnostics.windRibbonCount).toBeLessThanOrEqual(24);
    expect(windAimDiagnostics.windAimCueVisible).toBe(true);
  }
  await page.mouse.up();
  await expect(page.locator("#hud-root")).toHaveAttribute("data-charge-state", "idle", { timeout: 1500 });
  await expect(page.locator("#chargeMeter")).toHaveAttribute("data-charge-state", "idle");

  await page.waitForFunction(() => {
    const hud = document.querySelector<HTMLElement>("#hud-root");
    const projectileAmmoTypes = hud?.dataset.projectileAmmoTypes ?? "";
    const lastDistance = Number(hud?.dataset.localLastDistance ?? "0");
    return projectileAmmoTypes.split(",").includes("splitter") || lastDistance > 0;
  });
  await page.waitForFunction(() => {
    const state = (window as unknown as {
      __LOBBERS_SCENE_DIAGNOSTICS__?: {
        state?: {
          camera?: {
            projectileFocusActive?: boolean;
          };
        };
      };
    }).__LOBBERS_SCENE_DIAGNOSTICS__?.state;
    return state?.camera?.projectileFocusActive === true;
  });
  const cameraDiagnostics = await page.evaluate(() => {
    const state = (window as unknown as {
      __LOBBERS_SCENE_DIAGNOSTICS__?: {
        state?: {
          cameraMode?: string;
          camera?: {
            mode?: string;
            scrollX?: number;
            scrollY?: number;
            worldWidth?: number;
            projectileFocusActive?: boolean;
            projectileFocusId?: string;
            projectileFocusX?: number;
            projectileFocusY?: number;
            projectileFocusBlend?: number;
          };
        };
      };
    }).__LOBBERS_SCENE_DIAGNOSTICS__?.state;
    return {
      mode: state?.camera?.mode ?? state?.cameraMode ?? "",
      scrollX: Number(state?.camera?.scrollX ?? Number.NaN),
      scrollY: Number(state?.camera?.scrollY ?? Number.NaN),
      worldWidth: Number(state?.camera?.worldWidth ?? 0),
      projectileFocusActive: state?.camera?.projectileFocusActive === true,
      projectileFocusId: state?.camera?.projectileFocusId ?? "",
      projectileFocusX: Number(state?.camera?.projectileFocusX ?? 0),
      projectileFocusY: Number(state?.camera?.projectileFocusY ?? 0),
      projectileFocusBlend: Number(state?.camera?.projectileFocusBlend ?? 0),
    };
  });
  expect(cameraDiagnostics.mode).toBe("follow");
  expect(cameraDiagnostics.projectileFocusActive).toBe(true);
  expect(cameraDiagnostics.projectileFocusId.length).toBeGreaterThan(0);
  expect(cameraDiagnostics.projectileFocusBlend).toBeCloseTo(0.45, 2);
  expect(cameraDiagnostics.projectileFocusX).toBeGreaterThan(0);
  expect(cameraDiagnostics.projectileFocusY).toBeGreaterThan(0);
  expect(cameraDiagnostics.scrollX).toBeGreaterThanOrEqual(0);
  expect(cameraDiagnostics.scrollX).toBeLessThanOrEqual(cameraDiagnostics.worldWidth);
  expect(cameraDiagnostics.scrollY).toBeGreaterThanOrEqual(0);
  const healthDiagnostics = await page.locator("#hud-root").evaluate((element) => {
    const hp = Number(element.dataset.blueHp ?? "0");
    const card = document.querySelector<HTMLElement>("#bluePlayerCard");
    return {
      hp,
      rootState: element.dataset.blueHealthState ?? "",
      cardState: card?.dataset.healthState ?? "",
    };
  });
  const expectedHealthState = healthDiagnostics.hp <= 0
    ? "down"
    : healthDiagnostics.hp <= 20
      ? "critical"
      : healthDiagnostics.hp <= 45
        ? "low"
        : "healthy";
  expect(healthDiagnostics.rootState).toBe(expectedHealthState);
  expect(healthDiagnostics.cardState).toBe(expectedHealthState);

  const screenshotPath = testInfo.outputPath("splitter-fx.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("splitter-fx", { path: screenshotPath, contentType: "image/png" });
});

test("active HUD controls do not overlap across key viewports", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Practice Bot" }).click();
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await expect(page.locator("#roomChip")).toHaveAttribute("data-round-state", "active", { timeout: 5000 });
  await expect(page.locator("#hud-root")).toHaveAttribute("data-turn-phase", "move");
  await expect(page.locator("#roundState")).toContainText(/YOUR MOVE|MOVE/);

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 760, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      const toast = document.querySelector<HTMLElement>("#pickupToast");
      if (!toast) return;
      toast.hidden = false;
      toast.dataset.pickupKind = "armor";
      toast.classList.add("is-visible");
      toast.replaceChildren();
      const glyph = document.createElement("span");
      glyph.className = "pickup-toast-glyph";
      glyph.textContent = "SH";
      const label = document.createElement("span");
      label.textContent = "Armor +28";
      toast.append(glyph, label);
    });
    const boxes = await page.evaluate(() => {
      const selectors = [".ammo-loadout", ".ability-cluster", ".distance-strip", ".charge-meter", ".camera-controls", ".pickup-toast"];
      return selectors.map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        const rect = element?.getBoundingClientRect();
        return {
          selector,
          visible: Boolean(element && rect && !element.hidden && rect.width > 0 && rect.height > 0),
          left: rect?.left ?? 0,
          right: rect?.right ?? 0,
          top: rect?.top ?? 0,
          bottom: rect?.bottom ?? 0,
        };
      });
    });

    for (const box of boxes.filter((item) => item.visible)) {
      expect(box.left, `${viewport.width} ${box.selector} left`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${viewport.width} ${box.selector} right`).toBeLessThanOrEqual(viewport.width);
      expect(box.top, `${viewport.width} ${box.selector} top`).toBeGreaterThanOrEqual(0);
      expect(box.bottom, `${viewport.width} ${box.selector} bottom`).toBeLessThanOrEqual(viewport.height);
    }

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const left = boxes[i];
        const right = boxes[j];
        if (!left || !right || left.selector === ".pickup-toast" || right.selector === ".pickup-toast") continue;
        expect(boxesOverlap(left, right), `${viewport.width} ${left.selector} overlaps ${right.selector}`).toBe(false);
      }
    }

    const weaponLayout = await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>("#ammoButtons");
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".ammo-button"));
      const buttonBoxes = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          ammoType: button.dataset.ammoType ?? "",
          visible: rect.width > 0 && rect.height > 0,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
      return {
        stripClientWidth: strip?.clientWidth ?? 0,
        stripScrollWidth: strip?.scrollWidth ?? 0,
        buttonBoxes,
      };
    });
    expect(weaponLayout.buttonBoxes, `${viewport.width} weapon count`).toHaveLength(8);
    expect(weaponLayout.stripScrollWidth, `${viewport.width} weapon strip scroll`).toBeLessThanOrEqual(weaponLayout.stripClientWidth + 1);
    for (const button of weaponLayout.buttonBoxes) {
      expect(button.visible, `${viewport.width} ${button.ammoType} visible`).toBe(true);
      expect(button.left, `${viewport.width} ${button.ammoType} left`).toBeGreaterThanOrEqual(0);
      expect(button.right, `${viewport.width} ${button.ammoType} right`).toBeLessThanOrEqual(viewport.width);
    }
    for (let i = 0; i < weaponLayout.buttonBoxes.length; i += 1) {
      for (let j = i + 1; j < weaponLayout.buttonBoxes.length; j += 1) {
        const left = weaponLayout.buttonBoxes[i];
        const right = weaponLayout.buttonBoxes[j];
        if (!left || !right) continue;
        expect(boxesOverlap({ selector: left.ammoType, ...left }, { selector: right.ammoType, ...right })).toBe(false);
      }
    }
  }
});
