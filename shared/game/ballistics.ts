import { WORLD } from "./constants";
import type { ProjectileKinematics, Rect, Vec2 } from "./types";

export type ProjectilePhysicsProfile = {
  gravityScale: number;
  dragPerSecond: number;
  windAccelerationX: number;
};

export type ProjectileCollider = {
  id: string;
  rect: Rect;
  directHitSessionId: string | null;
};

export type ProjectileImpact = {
  x: number;
  y: number;
  t: number;
  colliderId: string;
  directHitSessionId: string | null;
  outOfBounds: boolean;
};

export type ProjectileSweepInput = {
  start: ProjectileKinematics;
  end: ProjectileKinematics;
  colliders: readonly ProjectileCollider[];
  worldWidth?: number;
  worldHeight?: number;
  groundY?: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);

export const buildProjectilePhysicsProfile = (
  gravityScale: number,
  dragPerSecond = 0,
  windAccelerationX = 0,
): ProjectilePhysicsProfile => ({
  gravityScale: Number.isFinite(gravityScale) ? gravityScale : 1,
  dragPerSecond: Math.max(0, Number.isFinite(dragPerSecond) ? dragPerSecond : 0),
  windAccelerationX: Number.isFinite(windAccelerationX) ? windAccelerationX : 0,
});

export const integrateBallisticProjectile = (
  projectile: ProjectileKinematics,
  dtSeconds: number,
  profile: ProjectilePhysicsProfile,
): ProjectileKinematics => {
  const dt = Math.max(0, Math.min(0.1, Number.isFinite(dtSeconds) ? dtSeconds : 0));
  const drag = Math.max(0, 1 - (profile.dragPerSecond * dt));
  const nextVx = (projectile.vx + (profile.windAccelerationX * dt)) * drag;
  const nextVy = (projectile.vy + (WORLD.gravityPxPerSecondSq * profile.gravityScale * dt)) * drag;
  return {
    ...projectile,
    x: projectile.x + (nextVx * dt),
    y: projectile.y + (nextVy * dt),
    vx: nextVx,
    vy: nextVy,
  };
};

const sweepCircleVsExpandedRect = (
  start: Vec2,
  end: Vec2,
  radius: number,
  rect: Rect,
): number | null => {
  const minX = rect.x - radius;
  const maxX = rect.x + rect.width + radius;
  const minY = rect.y - radius;
  const maxY = rect.y + rect.height + radius;

  if (start.x >= minX && start.x <= maxX && start.y >= minY && start.y <= maxY) {
    return 0;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 0.000001) {
    if (start.x < minX || start.x > maxX) return null;
  } else {
    const invDx = 1 / dx;
    const tx1 = (minX - start.x) * invDx;
    const tx2 = (maxX - start.x) * invDx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }

  if (Math.abs(dy) < 0.000001) {
    if (start.y < minY || start.y > maxY) return null;
  } else {
    const invDy = 1 / dy;
    const ty1 = (minY - start.y) * invDy;
    const ty2 = (maxY - start.y) * invDy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }

  if (tMax < tMin || tMin < 0 || tMin > 1) return null;
  return clamp01(tMin);
};

export const findEarliestProjectileImpact = ({
  start,
  end,
  colliders,
  worldWidth = WORLD.width,
  worldHeight = WORLD.height,
  groundY = WORLD.groundY,
}: ProjectileSweepInput): ProjectileImpact | null => {
  let best: ProjectileImpact | null = null;
  const consider = (impact: ProjectileImpact): void => {
    if (!best || impact.t < best.t) {
      best = impact;
    }
  };

  if (start.y + start.radius < groundY && end.y + end.radius >= groundY) {
    const t = clamp01((groundY - start.radius - start.y) / Math.max(0.000001, end.y - start.y));
    consider({
      x: lerp(start.x, end.x, t),
      y: groundY - start.radius,
      t,
      colliderId: "ground",
      directHitSessionId: null,
      outOfBounds: false,
    });
  }

  if (end.x < -end.radius || end.x > worldWidth + end.radius || end.y > worldHeight + end.radius) {
    consider({
      x: Math.max(0, Math.min(worldWidth, end.x)),
      y: Math.max(0, Math.min(worldHeight, end.y)),
      t: 1,
      colliderId: "out-of-bounds",
      directHitSessionId: null,
      outOfBounds: true,
    });
  }

  for (const collider of colliders) {
    const t = sweepCircleVsExpandedRect(start, end, start.radius, collider.rect);
    if (t === null) continue;
    consider({
      x: lerp(start.x, end.x, t),
      y: lerp(start.y, end.y, t),
      t,
      colliderId: collider.id,
      directHitSessionId: collider.directHitSessionId,
      outOfBounds: false,
    });
  }

  return best;
};
