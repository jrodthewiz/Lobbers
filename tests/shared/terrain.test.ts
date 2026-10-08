import { describe, expect, it } from "vitest";
import { AMMO_DEFINITIONS, AMMO_TYPES } from "../../shared/game/ammo";
import { findEarliestProjectileImpact } from "../../shared/game/ballistics";
import { MOVEMENT, WORLD } from "../../shared/game/constants";
import { predictTrajectory } from "../../shared/game/math";
import {
  canMoveBetweenSurfaces,
  findLandingSurface,
  generateTerrainLane,
  getTerrainNormal,
  getTerrainY,
  resolveStandingSurface,
  resolveTerrainSpawn,
} from "../../shared/game/terrain";
import type { TerrainLane } from "../../shared/game/terrain";

const testTerrain: TerrainLane = {
  seed: 1,
  version: 999,
  width: 400,
  baseGroundY: 300,
  stepPx: 100,
  samples: [
    { x: 0, y: 300 },
    { x: 100, y: 300 },
    { x: 200, y: 120 },
    { x: 300, y: 120 },
    { x: 400, y: 300 },
  ],
  segments: [
    { id: "ground-flat", kind: "ground", x0: 0, x1: 100, y0: 300, y1: 300, walkable: true, projectileCollidable: true },
    { id: "ground-cliff-up", kind: "cliff", x0: 100, x1: 200, y0: 300, y1: 120, walkable: false, projectileCollidable: true },
    { id: "ground-high", kind: "ground", x0: 200, x1: 300, y0: 120, y1: 120, walkable: true, projectileCollidable: true },
    { id: "ground-cliff-down", kind: "cliff", x0: 300, x1: 400, y0: 120, y1: 300, walkable: false, projectileCollidable: true },
    { id: "platform-high", kind: "platform", x0: 40, x1: 160, y0: 180, y1: 180, walkable: true, projectileCollidable: true },
  ],
  spawnShelves: {
    blue: { id: "spawn-blue", kind: "spawnShelf", x0: 0, x1: 80, y0: 300, y1: 300, walkable: true, projectileCollidable: true },
    red: { id: "spawn-red", kind: "spawnShelf", x0: 320, x1: 400, y0: 300, y1: 300, walkable: true, projectileCollidable: true },
  },
};

describe("terrain and expanded gameplay contracts", () => {
  it("generates deterministic mirrored terrain", () => {
    const first = generateTerrainLane("seed-a");
    const second = generateTerrainLane("seed-a");
    expect(second.samples).toEqual(first.samples);
    expect(getTerrainY(first, 240)).toBeCloseTo(getTerrainY(first, WORLD.width - 240), 1);
  });

  it("keeps spawn shelves flat and side-safe", () => {
    const terrain = generateTerrainLane("spawn-seed");
    const blue = resolveTerrainSpawn(terrain, "blue");
    const red = resolveTerrainSpawn(terrain, "red");
    expect(blue.x).toBeLessThan(WORLD.width / 2);
    expect(red.x).toBeGreaterThan(WORLD.width / 2);
    expect(blue.y).toBeCloseTo(red.y, 1);
    expect(getTerrainNormal(terrain, blue.x).y).toBeLessThanOrEqual(0);
  });

  it("builds explicit terrain features instead of only a noisy flat floor", () => {
    const terrain = generateTerrainLane("vertical-seed");
    const platforms = terrain.segments.filter((segment) => segment.kind === "platform");
    const cliffs = terrain.segments.filter((segment) => segment.kind === "cliff");
    expect(platforms.length).toBeGreaterThanOrEqual(3);
    expect(cliffs.length).toBeGreaterThan(0);
    expect(Math.min(...platforms.map((segment) => segment.y0))).toBeLessThan(WORLD.groundY - 120);
    expect(Math.max(...terrain.samples.map((sample) => sample.y)) - Math.min(...terrain.samples.map((sample) => sample.y))).toBeGreaterThan(120);
  });

  it("keeps generated side routes walkable out of spawn", () => {
    for (const seed of ["vertical-seed", "spawn-seed", "movement-seed"]) {
      const terrain = generateTerrainLane(seed);
      let x = 170;
      let surface = resolveStandingSurface(terrain, x, getTerrainY(terrain, x));
      const targetX = (WORLD.width / 2) - 190;
      while (x < targetX) {
        const nextX = Math.min(targetX, x + 12);
        const nextSurface = resolveStandingSurface(terrain, nextX, surface.y);
        expect(nextSurface.kind, `${seed} blocked at ${nextX}`).not.toBe("cliff");
        const canMove = canMoveBetweenSurfaces(surface, nextSurface);
        const isWalkableDrop = nextSurface.y > surface.y + MOVEMENT.maxTerrainStepPx;
        expect(canMove || isWalkableDrop, `${seed} step ${x}->${nextX}`).toBe(true);
        x = nextX;
        surface = nextSurface;
      }
    }
  });

  it("places at least one low platform within jumpable height from nearby terrain", () => {
    const terrain = generateTerrainLane("vertical-platform-route");
    const jumpReach = Math.abs(MOVEMENT.jumpVelocityPxPerSecond ** 2 / (2 * WORLD.gravityPxPerSecondSq));
    const reachable = terrain.segments
      .filter((segment) => segment.kind === "platform")
      .some((platform) => {
        const sampleX = (platform.x0 + platform.x1) / 2;
        const nearbyGroundY = getTerrainY(terrain, sampleX);
        return nearbyGroundY - platform.y0 <= jumpReach + WORLD.tankHeight;
      });
    expect(reachable).toBe(true);
  });

  it("exposes elevated standing surfaces for multi-story traversal", () => {
    const terrain = generateTerrainLane("vertical-walk-seed");
    const platform = terrain.segments.find((segment) => segment.kind === "platform");
    expect(platform).toBeTruthy();
    if (!platform) return;
    const platformX = (platform.x0 + platform.x1) / 2;
    const groundSurface = resolveStandingSurface(terrain, platformX);
    const platformSurface = resolveStandingSurface(terrain, platformX, platform.y0 + MOVEMENT.maxTerrainStepPx);
    expect(platformSurface.kind).toBe("platform");
    expect(platformSurface.y).toBeLessThan(groundSurface.y);
    expect(canMoveBetweenSurfaces(platformSurface, groundSurface)).toBe(false);

    const landing = findLandingSurface(
      terrain,
      platformX,
      platform.y0 - 80,
      platform.y0 + WORLD.tankHeight,
    );
    expect(landing?.id).toBe(platform.id);
  });

  it("blocks cliff walking and ignores unreachable overhead platforms", () => {
    const flat = resolveStandingSurface(testTerrain, 80, 300);
    const cliff = resolveStandingSurface(testTerrain, 150, 300);
    expect(flat.id).toBe("ground-flat");
    expect(cliff.kind).toBe("cliff");
    expect(canMoveBetweenSurfaces(flat, cliff)).toBe(false);

    const underPlatform = resolveStandingSurface(testTerrain, 80, 300);
    expect(underPlatform.id).toBe("ground-flat");
    expect(underPlatform.kind).toBe("ground");

    const nearPlatform = resolveStandingSurface(testTerrain, 80, 180 + MOVEMENT.maxTerrainStepPx - 1);
    expect(nearPlatform.id).toBe("platform-high");
  });

  it("predicts lane-offset terrain impacts in global coordinates", () => {
    const laneOffset = WORLD.width;
    const platform = testTerrain.segments.find((segment) => segment.id === "platform-high");
    expect(platform).toBeTruthy();
    if (!platform) return;

    const x = laneOffset + ((platform.x0 + platform.x1) / 2);
    const points = predictTrajectory(
      { x, y: platform.y0 - 90, vx: 0, vy: 540, radius: 8 },
      { gravityScale: 0, dragPerSecond: 0, windAccelerationX: 0 },
      20,
      1 / 30,
      laneOffset + testTerrain.width,
      testTerrain,
      laneOffset,
      WORLD.height,
    );
    const last = points.at(-1);
    expect(last?.x).toBeCloseTo(x, 1);
    expect(last?.y).toBeCloseTo(platform.y0 - 8, 1);
  });

  it("lets projectile sweeps hit elevated platform terrain", () => {
    const terrain = generateTerrainLane("platform-impact-seed");
    const platform = terrain.segments.find((segment) => segment.kind === "platform");
    expect(platform).toBeTruthy();
    if (!platform) return;
    const x = (platform.x0 + platform.x1) / 2;
    const impact = findEarliestProjectileImpact({
      start: { x, y: platform.y0 - 120, vx: 0, vy: 700, radius: 8 },
      end: { x, y: platform.y0 + 40, vx: 0, vy: 700, radius: 8 },
      colliders: [],
      terrain,
      worldWidth: WORLD.width,
    });
    expect(impact?.colliderId).toBe("terrain");
    expect(impact?.y).toBeCloseTo(platform.y0 - 8, 1);
  });

  it("lets projectile sweeps hit terrain before flat world bottom", () => {
    const terrain = generateTerrainLane("impact-seed");
    const x = terrain.samples.find((sample) => (
      !terrain.segments.some((segment) => segment.kind === "platform" && sample.x >= segment.x0 && sample.x <= segment.x1)
      && sample.x > 420
      && sample.x < WORLD.width - 420
    ))?.x ?? 500;
    const terrainY = getTerrainY(terrain, x);
    const impact = findEarliestProjectileImpact({
      start: { x, y: terrainY - 120, vx: 0, vy: 800, radius: 8 },
      end: { x, y: terrainY + 40, vx: 0, vy: 800, radius: 8 },
      colliders: [],
      terrain,
      worldWidth: WORLD.width,
    });
    expect(impact?.colliderId).toBe("terrain");
    expect(impact?.y).toBeCloseTo(terrainY - 8, 1);
  });

  it("has complete ammo definitions for every expanded ammo type", () => {
    for (const ammoType of AMMO_TYPES) {
      const ammo = AMMO_DEFINITIONS[ammoType];
      expect(ammo.label.length).toBeGreaterThan(0);
      expect(ammo.radius).toBeGreaterThan(0);
      expect(ammo.maxSpeed).toBeGreaterThan(ammo.minSpeed);
      expect(ammo.gravityScale).toBeGreaterThan(0);
      expect(ammo.directDamage + ammo.blastDamage + ammo.fragmentDamage).toBeGreaterThan(0);
      if (ammo.fragmentCount > 0) {
        expect(ammo.fuseSeconds).toBeGreaterThan(0);
        expect(ammo.fragmentSpeed).toBeGreaterThan(0);
        expect(ammo.fragmentRadius).toBeGreaterThan(0);
      }
    }
  });
});
