import { AMMO_DEFINITIONS, type AmmoDefinition } from "./ammo";
import { CHARGE, SIDE_SIGN, WORLD } from "./constants";
import type { ProjectileKinematics, Rect, Side, ThrowReleasePayload, Vec2 } from "./types";

export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

export const magnitude = (x: number, y: number): number => Math.hypot(x, y);

export const normalize = (x: number, y: number, fallback: Vec2): Vec2 => {
  const length = magnitude(x, y);
  if (!Number.isFinite(length) || length <= 0.0001) return fallback;
  return {
    x: x / length,
    y: y / length,
  };
};

export const normalizeAimForSide = (payload: ThrowReleasePayload, side: Side): Vec2 => {
  const sideSign = SIDE_SIGN[side];
  const fallback = { x: sideSign, y: -0.35 };
  const rawX = Number(payload.aimX);
  const rawY = Number(payload.aimY);
  const source = normalize(
    Number.isFinite(rawX) ? rawX : fallback.x,
    Number.isFinite(rawY) ? rawY : fallback.y,
    fallback,
  );
  const horizontal = source.x * sideSign < 0.18 ? sideSign * 0.18 : source.x;
  const vertical = clamp(source.y, -0.98, 0.18);
  return normalize(horizontal, vertical, fallback);
};

export const resolveChargeRatio = (chargeMs: number): number => {
  const clamped = clamp(chargeMs, CHARGE.minMs, CHARGE.maxMs);
  return (clamped - CHARGE.minMs) / (CHARGE.maxMs - CHARGE.minMs);
};

export const resolveLaunchSpeed = (ammo: AmmoDefinition, chargeMs: number): number => {
  const curved = Math.pow(resolveChargeRatio(chargeMs), ammo.chargeCurve);
  return ammo.minSpeed + ((ammo.maxSpeed - ammo.minSpeed) * curved);
};

export const buildLaunchVelocity = (
  ammo: AmmoDefinition,
  chargeMs: number,
  aim: Vec2,
): Vec2 => {
  const speed = resolveLaunchSpeed(ammo, chargeMs);
  return {
    x: aim.x * speed,
    y: aim.y * speed,
  };
};

export const integrateProjectile = (
  projectile: ProjectileKinematics,
  dtSeconds: number,
  gravityScale: number,
): ProjectileKinematics => {
  const dt = clamp(dtSeconds, 0, 0.1);
  const nextVy = projectile.vy + (WORLD.gravityPxPerSecondSq * gravityScale * dt);
  return {
    ...projectile,
    x: projectile.x + (projectile.vx * dt),
    y: projectile.y + (nextVy * dt),
    vy: nextVy,
  };
};

export const predictTrajectory = (
  projectile: ProjectileKinematics,
  gravityScale: number,
  steps = 56,
  dtSeconds = 1 / 30,
): Vec2[] => {
  const points: Vec2[] = [];
  let current = { ...projectile };
  for (let i = 0; i < steps; i += 1) {
    current = integrateProjectile(current, dtSeconds, gravityScale);
    if (current.x < 0 || current.x > WORLD.width || current.y > WORLD.height) break;
    points.push({ x: current.x, y: current.y });
    if (current.y + current.radius >= WORLD.groundY) break;
  }
  return points;
};

export const resolveThrowDistanceMeters = (spawnX: number, impactX: number): number => {
  const pixels = Math.abs(impactX - spawnX);
  return Math.round(pixels * WORLD.metersPerPixel * 10) / 10;
};

export const buildTankHitbox = (x: number, y: number): Rect => ({
  x: x - (WORLD.tankWidth / 2),
  y: y - WORLD.tankHitboxHeight,
  width: WORLD.tankWidth,
  height: WORLD.tankHitboxHeight,
});

export const circleIntersectsRect = (
  circle: { x: number; y: number; radius: number },
  rect: Rect,
): boolean => {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return (dx * dx) + (dy * dy) <= circle.radius * circle.radius;
};

export const resolveBlastDamage = (
  ammo: Pick<AmmoDefinition, "blastDamage" | "blastRadius" | "directDamage">,
  distancePixels: number,
  directHit: boolean,
): number => {
  const blastRatio = clamp(1 - (distancePixels / Math.max(1, ammo.blastRadius)), 0, 1);
  const blastDamage = ammo.blastDamage * blastRatio;
  return Math.max(0, Math.round(blastDamage + (directHit ? ammo.directDamage : 0)));
};

export const resolveMuzzlePosition = (x: number, y: number, side: Side): Vec2 => ({
  x: x + (SIDE_SIGN[side] * (WORLD.tankWidth * 0.52)),
  y: y - (WORLD.tankHeight * 0.82),
});

export const defaultProjectile = (
  ammo: AmmoDefinition = AMMO_DEFINITIONS.javelin,
): ProjectileKinematics => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: ammo.radius,
});
