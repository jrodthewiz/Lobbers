import { describe, expect, it } from "vitest";
import {
  AIM_DRAG_DEADZONE_PX,
  resolveDirectPointerAim,
  resolvePointerAim,
  resolveSlingshotDragAim,
} from "../../client/src/game/aim";

describe("client pointer aiming", () => {
  it("uses direct cursor-to-shoulder aim while hovering", () => {
    const aim = resolveDirectPointerAim(
      { x: 260, y: 340 },
      { x: 160, y: 390 },
      "blue",
    );

    expect(aim.x).toBeGreaterThan(0);
    expect(aim.y).toBeLessThan(0);
  });

  it("inverts blue charge drags so pulling back/down lobs forward/up", () => {
    const aim = resolveSlingshotDragAim(
      { x: 100, y: 460 },
      { x: 170, y: 390 },
      "blue",
      { x: 1, y: -0.35 },
    );

    expect(aim.x).toBeGreaterThan(0);
    expect(aim.y).toBeLessThan(0);
  });

  it("inverts red charge drags so pulling back/down lobs forward/up", () => {
    const aim = resolveSlingshotDragAim(
      { x: 1500, y: 460 },
      { x: 1430, y: 390 },
      "red",
      { x: -1, y: -0.35 },
    );

    expect(aim.x).toBeLessThan(0);
    expect(aim.y).toBeLessThan(0);
  });

  it("keeps the current aim inside the charge deadzone", () => {
    const currentAim = { x: 0.86, y: -0.51 };
    const aim = resolveSlingshotDragAim(
      { x: 170 + (AIM_DRAG_DEADZONE_PX / 2), y: 390 },
      { x: 170, y: 390 },
      "blue",
      currentAim,
    );

    expect(aim.x).toBeCloseTo(currentAim.x / Math.hypot(currentAim.x, currentAim.y), 5);
    expect(aim.y).toBeCloseTo(currentAim.y / Math.hypot(currentAim.x, currentAim.y), 5);
  });

  it("keeps charged aim aligned to the cursor instead of the drag delta", () => {
    const hoverAim = resolvePointerAim({
      pointer: { x: 250, y: 350 },
      shoulder: { x: 170, y: 400 },
      side: "blue",
      currentAim: { x: 1, y: -0.35 },
      dragStart: { x: 170, y: 400 },
      isCharging: false,
    });
    const chargeAim = resolvePointerAim({
      pointer: { x: 250, y: 350 },
      shoulder: { x: 170, y: 400 },
      side: "blue",
      currentAim: hoverAim,
      dragStart: { x: 170, y: 400 },
      isCharging: true,
    });

    expect(hoverAim.x).toBeGreaterThan(0);
    expect(hoverAim.y).toBeLessThan(0);
    expect(chargeAim.x).toBeCloseTo(hoverAim.x, 5);
    expect(chargeAim.y).toBeCloseTo(hoverAim.y, 5);
  });
});
