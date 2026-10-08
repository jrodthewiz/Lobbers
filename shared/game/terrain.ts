import { MOVEMENT, SPAWN_BY_SIDE, TERRAIN, WORLD } from "./constants";
import type { ProjectileKinematics, Side, Vec2 } from "./types";

export type TerrainSample = Readonly<{
  x: number;
  y: number;
}>;

export type TerrainSurfaceKind = "ground" | "ramp" | "cliff" | "platform" | "spawnShelf";

export type TerrainSegment = Readonly<{
  id: string;
  kind: TerrainSurfaceKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  walkable: boolean;
  projectileCollidable: boolean;
}>;

export type TerrainLane = Readonly<{
  seed: number;
  version: number;
  width: number;
  baseGroundY: number;
  stepPx: number;
  samples: readonly TerrainSample[];
  segments: readonly TerrainSegment[];
  spawnShelves: Readonly<Record<Side, TerrainSegment>>;
}>;

export type TerrainImpact = Readonly<{
  x: number;
  y: number;
  t: number;
  normal: Vec2;
}>;

export type TerrainSpawn = Readonly<{
  x: number;
  y: number;
  groundY: number;
  normal: Vec2;
}>;

export type TerrainStandSurface = Readonly<{
  id: string;
  kind: TerrainSurfaceKind;
  x: number;
  y: number;
  normal: Vec2;
  segment: TerrainSegment | null;
}>;

const hashSeed = (seed: string | number): number => {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const normalize = (x: number, y: number, fallback: Vec2): Vec2 => {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= 0.0001) return fallback;
  return {
    x: x / length,
    y: y / length,
  };
};

const seededNoise = (seed: number, index: number): number => {
  let value = Math.imul(seed ^ Math.imul(index + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x27d4eb2d);
  value ^= value >>> 15;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
};

const seededRange = (seed: number, index: number, min: number, max: number): number => (
  min + (((seededNoise(seed, index) + 1) / 2) * (max - min))
);

const interpolateProfile = (
  controls: readonly TerrainSample[],
  x: number,
  fallbackY: number,
): number => {
  if (controls.length === 0) return fallbackY;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!first || !last) return fallbackY;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let index = 1; index < controls.length; index += 1) {
    const right = controls[index];
    const left = controls[index - 1];
    if (!left || !right || x > right.x) continue;
    const span = Math.max(1, right.x - left.x);
    const ratio = clamp((x - left.x) / span, 0, 1);
    return left.y + ((right.y - left.y) * ratio);
  }
  return fallbackY;
};

const buildFeatureProfile = (seed: number, width: number, baseGroundY: number): readonly TerrainSample[] => {
  const ridge = Math.round(seededRange(seed, 1, 190, 290));
  const valley = Math.round(seededRange(seed, 2, 42, 96));
  const centerLift = Math.round(seededRange(seed, 3, 320, 460));
  const shelfHalf = TERRAIN.spawnShelfWidthPx / 2;
  const blueSpawnX = SPAWN_BY_SIDE.blue.x;
  const redSpawnX = width - SPAWN_BY_SIDE.blue.x;
  const center = width / 2;
  const shelfRight = blueSpawnX + shelfHalf;
  const rampTopX = shelfRight + Math.max(360, ridge * 2.15);
  const valleyStartX = center - (width * 0.23);
  const valleyEndX = center - (width * 0.145);
  const centerRampTopX = center - Math.max(190, centerLift * 0.34);
  const centerRampStartX = valleyEndX + Math.max(64, width * 0.015);
  const centerRampMidX = centerRampStartX + ((centerRampTopX - centerRampStartX) * 0.5);
  const centerRampMidY = baseGroundY + valley - Math.round((centerLift + valley) * 0.5);
  const centerShelfEndX = Math.min(center - 126, centerRampTopX + 72);
  const centerInnerWallX = Math.min(center - 72, centerShelfEndX + 64);
  const centerInnerWallY = baseGroundY - Math.round(centerLift * 0.45);
  const leftControls = [
    { x: 0, y: baseGroundY + 8 },
    { x: Math.max(0, blueSpawnX - shelfHalf - 56), y: baseGroundY },
    { x: Math.max(0, blueSpawnX - shelfHalf), y: baseGroundY },
    { x: shelfRight, y: baseGroundY },
    { x: shelfRight + 160, y: baseGroundY - Math.round(ridge * 0.34) },
    { x: shelfRight + 280, y: baseGroundY - Math.round(ridge * 0.68) },
    { x: rampTopX, y: baseGroundY - ridge },
    { x: valleyStartX, y: baseGroundY - ridge },
    { x: valleyStartX + 160, y: baseGroundY - Math.round(ridge * 0.52) },
    { x: valleyEndX, y: baseGroundY + valley },
    { x: centerRampStartX, y: baseGroundY + valley },
    { x: centerRampMidX, y: centerRampMidY },
    { x: centerRampTopX, y: baseGroundY - centerLift },
    { x: centerShelfEndX, y: baseGroundY - centerLift },
    { x: centerInnerWallX, y: centerInnerWallY },
  ];
  const mirrored = leftControls
    .map((point) => ({ x: width - point.x, y: point.y }))
    .reverse();
  return [
    ...leftControls,
    { x: center, y: baseGroundY - centerLift - Math.round(seededRange(seed, 4, 16, 54)) },
    ...mirrored,
    { x: Math.min(width, redSpawnX + shelfHalf), y: baseGroundY },
    { x: width, y: baseGroundY + 8 },
  ].sort((a, b) => a.x - b.x);
};

const classifySegment = (
  id: string,
  left: TerrainSample,
  right: TerrainSample,
  width: number,
): TerrainSegment => {
  const spawnShelfHalf = TERRAIN.spawnShelfWidthPx / 2;
  const blueSpawnX = SPAWN_BY_SIDE.blue.x;
  const redSpawnX = width - SPAWN_BY_SIDE.blue.x;
  const midX = (left.x + right.x) / 2;
  const deltaY = right.y - left.y;
  const slope = Math.abs(deltaY) / Math.max(1, right.x - left.x);
  const onSpawnShelf = (
    Math.abs(midX - blueSpawnX) <= spawnShelfHalf
    || Math.abs(midX - redSpawnX) <= spawnShelfHalf
  );
  const kind: TerrainSurfaceKind = onSpawnShelf
    ? "spawnShelf"
    : slope > 0.92 && Math.abs(deltaY) > MOVEMENT.maxTerrainStepPx
      ? "cliff"
      : slope > 0.18
        ? "ramp"
        : "ground";
  return {
    id,
    kind,
    x0: left.x,
    x1: right.x,
    y0: left.y,
    y1: right.y,
    walkable: kind !== "cliff",
    projectileCollidable: true,
  };
};

const buildPlatformSegments = (seed: number, width: number, baseGroundY: number): readonly TerrainSegment[] => {
  const highY = baseGroundY - Math.round(seededRange(seed, 11, 390, 560));
  const midY = baseGroundY - Math.round(seededRange(seed, 12, 240, 340));
  const lowY = baseGroundY - Math.round(seededRange(seed, 13, 140, 220));
  const center = width / 2;
  const sideWidth = Math.round(seededRange(seed, 14, TERRAIN.platformMinWidthPx, TERRAIN.platformMinWidthPx + 120));
  const lowWidth = Math.round(seededRange(seed, 15, TERRAIN.platformMinWidthPx, TERRAIN.platformMinWidthPx + 90));
  const centerWidth = Math.round(seededRange(seed, 16, 320, 460));
  const sideX0 = center - (width * 0.31);
  const lowX0 = center - (width * 0.19);
  const side: TerrainSegment = {
    id: "platform-blue-mid",
    kind: "platform",
    x0: sideX0,
    x1: sideX0 + sideWidth,
    y0: midY,
    y1: midY,
    walkable: true,
    projectileCollidable: true,
  };
  const mirrored: TerrainSegment = {
    ...side,
    id: "platform-red-mid",
    x0: width - side.x1,
    x1: width - side.x0,
  };
  const low: TerrainSegment = {
    id: "platform-blue-low",
    kind: "platform",
    x0: lowX0,
    x1: lowX0 + lowWidth,
    y0: lowY,
    y1: lowY,
    walkable: true,
    projectileCollidable: true,
  };
  const mirroredLow: TerrainSegment = {
    ...low,
    id: "platform-red-low",
    x0: width - low.x1,
    x1: width - low.x0,
  };
  const centerPlatform: TerrainSegment = {
    id: "platform-center-high",
    kind: "platform",
    x0: center - (centerWidth / 2),
    x1: center + (centerWidth / 2),
    y0: highY,
    y1: highY,
    walkable: true,
    projectileCollidable: true,
  };
  return [side, low, centerPlatform, mirroredLow, mirrored];
};

const buildSamplesAndGroundSegments = (
  seed: number,
  width: number,
  baseGroundY: number,
  stepPx: number,
): { samples: readonly TerrainSample[]; segments: readonly TerrainSegment[] } => {
  const controls = buildFeatureProfile(seed, width, baseGroundY);
  const sampleCount = Math.floor(width / stepPx) + 1;
  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const x = Math.min(width, index * stepPx);
    const contour = interpolateProfile(controls, x, baseGroundY);
    const roughX = Math.min(x, width - x);
    const roughness = seededNoise(seed ^ 0x51f15eed, Math.floor(roughX / 96)) * 7;
    const nearSpawn = Math.min(
      Math.abs(x - SPAWN_BY_SIDE.blue.x),
      Math.abs(x - (width - SPAWN_BY_SIDE.blue.x)),
    ) <= TERRAIN.spawnShelfWidthPx / 2;
    const y = nearSpawn ? baseGroundY : clamp(contour + roughness, baseGroundY - TERRAIN.maxDeltaY, baseGroundY + 58);
    return {
      x,
      y: Math.round(y * 10) / 10,
    };
  });
  const segments = samples.slice(1).map((sample, index) => (
    classifySegment(`ground-${index}`, samples[index] ?? sample, sample, width)
  ));
  return { samples, segments };
};

const buildFlatTerrain = (seed: number, width: number, baseGroundY: number, stepPx: number): TerrainLane => {
  const blueShelf: TerrainSegment = {
    id: "spawn-blue",
    kind: "spawnShelf",
    x0: SPAWN_BY_SIDE.blue.x - (TERRAIN.spawnShelfWidthPx / 2),
    x1: SPAWN_BY_SIDE.blue.x + (TERRAIN.spawnShelfWidthPx / 2),
    y0: baseGroundY,
    y1: baseGroundY,
    walkable: true,
    projectileCollidable: true,
  };
  const redShelf: TerrainSegment = {
    ...blueShelf,
    id: "spawn-red",
    x0: width - blueShelf.x1,
    x1: width - blueShelf.x0,
  };
  return {
    seed,
    version: TERRAIN.version,
    width,
    baseGroundY,
    stepPx: width,
    samples: [
      { x: 0, y: baseGroundY },
      { x: width, y: baseGroundY },
    ],
    segments: [{
      id: "flat-ground",
      kind: "ground",
      x0: 0,
      x1: width,
      y0: baseGroundY,
      y1: baseGroundY,
      walkable: true,
      projectileCollidable: true,
    }],
    spawnShelves: {
      blue: blueShelf,
      red: redShelf,
    },
  };
};

export const generateTerrainLane = (
  seedSource: string | number,
  width: number = WORLD.width,
  baseGroundY: number = WORLD.groundY,
  stepPx: number = TERRAIN.stepPx,
): TerrainLane => {
  const seed = hashSeed(seedSource);
  if (stepPx >= width) {
    return buildFlatTerrain(seed, width, baseGroundY, stepPx);
  }
  const { samples, segments } = buildSamplesAndGroundSegments(seed, width, baseGroundY, stepPx);
  const platformSegments = buildPlatformSegments(seed, width, baseGroundY);
  const blueShelf = segments.find((segment) => (
    segment.kind === "spawnShelf" && segment.x0 <= SPAWN_BY_SIDE.blue.x && segment.x1 >= SPAWN_BY_SIDE.blue.x
  )) ?? buildFlatTerrain(seed, width, baseGroundY, stepPx).spawnShelves.blue;
  const redSpawnX = width - SPAWN_BY_SIDE.blue.x;
  const redShelf = segments.find((segment) => (
    segment.kind === "spawnShelf" && segment.x0 <= redSpawnX && segment.x1 >= redSpawnX
  )) ?? buildFlatTerrain(seed, width, baseGroundY, stepPx).spawnShelves.red;

  return {
    seed,
    version: TERRAIN.version,
    width,
    baseGroundY,
    stepPx,
    samples,
    segments: [...segments, ...platformSegments],
    spawnShelves: {
      blue: blueShelf,
      red: redShelf,
    },
  };
};

export const getTerrainY = (terrain: TerrainLane, x: number): number => {
  const clampedX = clamp(x, 0, terrain.width);
  const rawIndex = clampedX / terrain.stepPx;
  const leftIndex = Math.floor(rawIndex);
  const rightIndex = Math.min(terrain.samples.length - 1, leftIndex + 1);
  const left = terrain.samples[leftIndex] ?? terrain.samples[0];
  const right = terrain.samples[rightIndex] ?? left;
  if (!left || !right) return terrain.baseGroundY;
  const span = Math.max(1, right.x - left.x);
  const ratio = clamp((clampedX - left.x) / span, 0, 1);
  return left.y + ((right.y - left.y) * ratio);
};

export const getTerrainNormal = (terrain: TerrainLane, x: number): Vec2 => {
  const dx = terrain.stepPx;
  const y0 = getTerrainY(terrain, x - dx);
  const y1 = getTerrainY(terrain, x + dx);
  const tangent = normalize(dx * 2, y1 - y0, { x: 1, y: 0 });
  const normal = normalize(-tangent.y, tangent.x, { x: 0, y: -1 });
  return normal.y > 0 ? { x: -normal.x, y: -normal.y } : normal;
};

const sampleSegmentY = (segment: TerrainSegment, x: number): number => {
  const span = Math.max(1, segment.x1 - segment.x0);
  const ratio = clamp((x - segment.x0) / span, 0, 1);
  return segment.y0 + ((segment.y1 - segment.y0) * ratio);
};

const resolveGroundSegmentAt = (terrain: TerrainLane, x: number): TerrainSegment | null => {
  const clampedX = clamp(x, 0, terrain.width);
  return terrain.segments.find((segment) => (
    segment.kind !== "platform"
    && clampedX >= segment.x0
    && clampedX <= segment.x1
  )) ?? null;
};

const getGroundSurfaceAt = (terrain: TerrainLane, x: number): TerrainStandSurface => {
  const clampedX = clamp(x, 0, terrain.width);
  const segment = resolveGroundSegmentAt(terrain, clampedX);
  return {
    id: segment?.id ?? "ground",
    kind: segment?.kind ?? "ground",
    x: clampedX,
    y: getTerrainY(terrain, clampedX),
    normal: getTerrainNormal(terrain, clampedX),
    segment,
  };
};

export const resolveStandingSurface = (
  terrain: TerrainLane,
  x: number,
  feetY = Number.POSITIVE_INFINITY,
): TerrainStandSurface => {
  const clampedX = clamp(x, 0, terrain.width);
  let best = getGroundSurfaceAt(terrain, clampedX);
  const canReachElevatedSurfaces = Number.isFinite(feetY);
  const maxReachY = feetY + MOVEMENT.maxTerrainStepPx;
  for (const segment of terrain.segments) {
    if (!segment.walkable || segment.kind !== "platform") continue;
    if (!canReachElevatedSurfaces) continue;
    if (clampedX < segment.x0 || clampedX > segment.x1) continue;
    const y = sampleSegmentY(segment, clampedX);
    if (Math.abs(y - feetY) > MOVEMENT.maxTerrainStepPx) continue;
    if (y > maxReachY) continue;
    if (y < best.y) {
      best = {
        id: segment.id,
        kind: segment.kind,
        x: clampedX,
        y,
        normal: { x: 0, y: -1 },
        segment,
      };
    }
  }
  return best;
};

export const findLandingSurface = (
  terrain: TerrainLane,
  x: number,
  previousFeetY: number,
  nextFeetY: number,
): TerrainStandSurface | null => {
  const clampedX = clamp(x, 0, terrain.width);
  const topY = Math.min(previousFeetY, nextFeetY);
  const bottomY = Math.max(previousFeetY, nextFeetY);
  let best: TerrainStandSurface | null = null;
  const consider = (surface: TerrainStandSurface): void => {
    if (surface.y < topY - 0.5 || surface.y > bottomY + 0.5) return;
    if (!best || surface.y < best.y) best = surface;
  };
  consider(getGroundSurfaceAt(terrain, clampedX));
  for (const segment of terrain.segments) {
    if (!segment.walkable || segment.kind !== "platform") continue;
    if (clampedX < segment.x0 || clampedX > segment.x1) continue;
    const y = sampleSegmentY(segment, clampedX);
    consider({
      id: segment.id,
      kind: segment.kind,
      x: clampedX,
      y,
      normal: { x: 0, y: -1 },
      segment,
    });
  }
  return best;
};

export const canMoveBetweenSurfaces = (
  from: TerrainStandSurface,
  to: TerrainStandSurface,
): boolean => (
  to.segment?.walkable !== false
  && to.kind !== "cliff"
  && to.y <= from.y + MOVEMENT.maxTerrainStepPx
  && Math.abs(to.y - from.y) <= MOVEMENT.maxTerrainStepPx
);

export const resolveTerrainSpawn = (terrain: TerrainLane, side: Side, laneIndex = 0): TerrainSpawn => {
  const localX = side === "blue" ? SPAWN_BY_SIDE.blue.x : WORLD.width - SPAWN_BY_SIDE.blue.x;
  const groundY = resolveStandingSurface(terrain, localX).y;
  const offsetX = laneIndex * WORLD.width;
  return {
    x: offsetX + localX,
    y: groundY - WORLD.tankHeight,
    groundY,
    normal: getTerrainNormal(terrain, localX),
  };
};

export const findTerrainImpact = (
  terrain: TerrainLane,
  start: ProjectileKinematics,
  end: ProjectileKinematics,
): TerrainImpact | null => {
  let best: TerrainImpact | null = null;
  const consider = (impact: TerrainImpact): void => {
    if (!best || impact.t < best.t) best = impact;
  };

  for (const segment of terrain.segments) {
    if (segment.kind !== "platform" || !segment.projectileCollidable) continue;
    const platformY = segment.y0 - end.radius;
    const dy = end.y - start.y;
    if (Math.abs(dy) < 0.000001) continue;
    const t = (platformY - start.y) / dy;
    if (t < 0 || t > 1) continue;
    const hitX = start.x + ((end.x - start.x) * t);
    if (hitX < segment.x0 - end.radius || hitX > segment.x1 + end.radius) continue;
    consider({
      x: hitX,
      y: platformY,
      t,
      normal: { x: 0, y: -1 },
    });
  }

  const clearance = (projectile: ProjectileKinematics): number => (
    projectile.y + projectile.radius - getTerrainY(terrain, projectile.x)
  );
  const startClearance = clearance(start);
  const endClearance = clearance(end);
  if (startClearance >= 0 && endClearance >= 0) {
    consider({
      x: start.x,
      y: getTerrainY(terrain, start.x) - start.radius,
      t: 0,
      normal: getTerrainNormal(terrain, start.x),
    });
    return best;
  }
  if (startClearance >= -0.5 || endClearance < 0) return best;

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 10; i += 1) {
    const mid = (lo + hi) / 2;
    const projectile = {
      ...start,
      x: start.x + ((end.x - start.x) * mid),
      y: start.y + ((end.y - start.y) * mid),
      vx: start.vx + ((end.vx - start.vx) * mid),
      vy: start.vy + ((end.vy - start.vy) * mid),
    };
    if (clearance(projectile) >= 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const x = start.x + ((end.x - start.x) * hi);
  consider({
    x,
    y: getTerrainY(terrain, x) - end.radius,
    t: hi,
    normal: getTerrainNormal(terrain, x),
  });

  return best;
};

export const canStepTerrain = (terrain: TerrainLane, fromX: number, toX: number): boolean => (
  canMoveBetweenSurfaces(
    resolveStandingSurface(terrain, fromX),
    resolveStandingSurface(terrain, toX),
  )
);
