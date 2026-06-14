import { describe, expect, it } from "vitest";
import { AMMO_DEFINITIONS } from "../../shared/game/ammo";
import {
  buildProjectilePhysicsProfile,
  findEarliestProjectileImpact,
  integrateBallisticProjectile,
} from "../../shared/game/ballistics";
import { WORLD } from "../../shared/game/constants";
import {
  buildLaunchVelocity,
  circleIntersectsRect,
  integrateProjectile,
  normalizeAimForSide,
  resolveBlastDamage,
  resolveChargeRatio,
  resolveShoulderPosition,
  resolveThrowHandPosition,
  resolveThrowDistanceMeters,
} from "../../shared/game/math";

describe("shared projectile math", () => {
  it("clamps charge ratio", () => {
    expect(resolveChargeRatio(-10)).toBe(0);
    expect(resolveChargeRatio(999_999)).toBe(1);
  });

  it("forces aim toward the correct side", () => {
    const blueAim = normalizeAimForSide({ aimX: -1, aimY: -0.4 }, "blue");
    const redAim = normalizeAimForSide({ aimX: 1, aimY: -0.4 }, "red");
    expect(blueAim.x).toBeGreaterThan(0);
    expect(redAim.x).toBeLessThan(0);
  });

  it("builds faster launches with more charge", () => {
    const ammo = AMMO_DEFINITIONS.javelin;
    const aim = normalizeAimForSide({ aimX: 1, aimY: -0.5 }, "blue");
    const slow = buildLaunchVelocity(ammo, 120, aim);
    const fast = buildLaunchVelocity(ammo, 1600, aim);
    expect(Math.hypot(fast.x, fast.y)).toBeGreaterThan(Math.hypot(slow.x, slow.y));
  });

  it("integrates downward gravity in screen coordinates", () => {
    const next = integrateProjectile({ x: 0, y: 100, vx: 100, vy: -100, radius: 5 }, 0.5, 1);
    expect(next.x).toBeGreaterThan(0);
    expect(next.vy).toBeGreaterThan(-100);
  });

  it("applies ammo drag without changing deterministic fixed-step shape", () => {
    const next = integrateBallisticProjectile(
      { x: 0, y: 100, vx: 1000, vy: -200, radius: 5 },
      1 / 60,
      buildProjectilePhysicsProfile(1, 0.6),
    );
    expect(next.vx).toBeLessThan(1000);
    expect(next.x).toBeGreaterThan(0);
  });

  it("sweeps fast projectiles into thin colliders", () => {
    const impact = findEarliestProjectileImpact({
      start: { x: 0, y: 100, vx: 2200, vy: 0, radius: 4 },
      end: { x: 120, y: 100, vx: 2200, vy: 0, radius: 4 },
      colliders: [{
        id: "thin-flag",
        rect: { x: 58, y: 80, width: 3, height: 60 },
        directHitSessionId: null,
      }],
      groundY: WORLD.groundY,
    });
    expect(impact?.colliderId).toBe("thin-flag");
    expect(impact?.x).toBeGreaterThan(50);
    expect(impact?.x).toBeLessThan(70);
  });

  it("measures throw distance in court meters", () => {
    expect(resolveThrowDistanceMeters(100, 250)).toBe(15);
  });

  it("places the throw hand in front of the shoulder", () => {
    const aim = normalizeAimForSide({ aimX: 1, aimY: -0.4 }, "blue");
    const shoulder = resolveShoulderPosition(170, WORLD.groundY - WORLD.tankHeight, "blue");
    const hand = resolveThrowHandPosition(170, WORLD.groundY - WORLD.tankHeight, "blue", aim);
    expect(hand.x).toBeGreaterThan(shoulder.x);
    expect(hand.y).toBeLessThan(shoulder.y);
  });

  it("checks circle and rectangle collision", () => {
    expect(circleIntersectsRect({ x: 10, y: 10, radius: 5 }, { x: 12, y: 8, width: 20, height: 20 })).toBe(true);
    expect(circleIntersectsRect({ x: 0, y: 0, radius: 3 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(false);
  });

  it("falls off blast damage with distance", () => {
    const ammo = AMMO_DEFINITIONS.shotput;
    const close = resolveBlastDamage(ammo, 0, false);
    const far = resolveBlastDamage(ammo, WORLD.width, false);
    const direct = resolveBlastDamage(ammo, 0, true);
    expect(close).toBeGreaterThan(far);
    expect(direct).toBeGreaterThan(close);
  });
});
