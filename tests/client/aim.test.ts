import { describe, expect, it } from "vitest";
import {
  AIM_DRAG_DEADZONE_PX,
  resolveDirectPointerAim,
  resolvePointerAim,
  resolveSlingshotDragAim,
  resolveSlingshotPullAnchor,
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

  it("places the pull guide anchor opposite the launch aim", () => {
    const aim = resolveSlingshotDragAim(
      { x: 100, y: 470 },
      { x: 170, y: 400 },
      "blue",
      { x: 1, y: -0.35 },
    );
    const anchor = resolveSlingshotPullAnchor(
      { x: 200, y: 360 },
      aim,
      80,
    );

    expect(anchor.x).toBeLessThan(200);
    expect(anchor.y).toBeGreaterThan(360);
    expect((200 - anchor.x) / Math.hypot(200 - anchor.x, 360 - anchor.y)).toBeCloseTo(aim.x, 5);
    expect((360 - anchor.y) / Math.hypot(200 - anchor.x, 360 - anchor.y)).toBeCloseTo(aim.y, 5);
  });

  it("clamps distant pull guide anchors", () => {
    const anchor = resolveSlingshotPullAnchor(
      { x: 200, y: 360 },
      { x: 1, y: -1 },
      800,
      120,
    );
    const distance = Math.hypot(anchor.x - 200, anchor.y - 360);

    expect(distance).toBeCloseTo(120, 5);
  });

  it("uses direct cursor aim before charging even when drag start is present", () => {
    const aim = resolvePointerAim({
      pointer: { x: 250, y: 350 },
      shoulder: { x: 170, y: 400 },
      side: "blue",
      currentAim: { x: 1, y: -0.35 },
      dragStart: { x: 170, y: 400 },
      isCharging: false,
    });
    const directAim = resolveDirectPointerAim(
      { x: 250, y: 350 },
      { x: 170, y: 400 },
      "blue",
    );

    expect(aim.x).toBeCloseTo(directAim.x, 5);
    expect(aim.y).toBeCloseTo(directAim.y, 5);
  });

  it("uses slingshot drag aim while charging", () => {
    const hoverAim = resolvePointerAim({
      pointer: { x: 250, y: 350 },
      shoulder: { x: 170, y: 400 },
      side: "blue",
      currentAim: { x: 1, y: -0.35 },
      dragStart: { x: 170, y: 400 },
      isCharging: false,
    });
    const chargeAim = resolvePointerAim({
      pointer: { x: 100, y: 470 },
      shoulder: { x: 170, y: 400 },
      side: "blue",
      currentAim: hoverAim,
      dragStart: { x: 170, y: 400 },
      isCharging: true,
    });

    expect(hoverAim.x).toBeGreaterThan(0);
    expect(hoverAim.y).toBeLessThan(0);
    expect(chargeAim.x).toBeGreaterThan(0);
    expect(chargeAim.y).toBeLessThan(0);
    expect(chargeAim.x).not.toBeCloseTo(hoverAim.x, 3);
    expect(chargeAim.y).not.toBeCloseTo(hoverAim.y, 3);
  });
});
