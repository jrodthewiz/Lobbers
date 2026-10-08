import type { Side } from "./types";

export const ROOM_NAME = "lobbers_throw_room";

export const WORLD = {
  width: 4000,
  height: 1600,
  groundY: 1280,
  metersPerPixel: 0.1,
  gravityPxPerSecondSq: 980,
  tankWidth: 88,
  tankHeight: 38,
  tankHitboxHeight: 54,
  pilotRadius: 12,
  turretLength: 58,
  armUpperLength: 40,
  armForearmLength: 48,
  elbowGearRadius: 13,
} as const;

export const SIMULATION = {
  tickHz: 60,
  patchHz: 20,
  stepSeconds: 1 / 60,
} as const;

export const ROUND = {
  maxPlayers: 8,
  startingHp: 100,
  countdownMs: 1500,
  turnMoveMs: 6500,
  turnFireMs: 7000,
  turnResolveMaxMs: 7500,
  spawnSpacingPx: 170,
} as const;

export const CHARGE = {
  minMs: 120,
  maxMs: 1600,
} as const;

export const MOVEMENT = {
  moveSpeedPxPerSecond: 260,
  jumpVelocityPxPerSecond: -620,
  maxFallSpeedPxPerSecond: 920,
  airControlAccelerationPxPerSecondSq: 620,
  airDragPerSecond: 1.35,
  airMaxSpeedPxPerSecond: 560,
  blastKnockbackMaxPxPerSecond: 540,
  blastLiftPxPerSecond: 380,
  sideBoundaryPadding: 88,
  centerNoCrossPadding: 136,
  maxTerrainStepPx: 34,
} as const;

export const TERRAIN = {
  version: 6,
  stepPx: 16,
  maxDeltaY: 540,
  spawnShelfWidthPx: 420,
  platformMinWidthPx: 300,
  platformClearancePx: 210,
  modeDefault: "procedural",
} as const;

export const WIND = {
  maxAccelerationPxPerSecondSq: 44,
  calmThresholdPxPerSecondSq: 6,
} as const;

export const WORLD_PROPS = {
  oilBarrelHp: 28,
  oilBarrelWidth: 46,
  oilBarrelHeight: 62,
  oilBarrelExplosionDamage: 38,
  oilBarrelExplosionRadius: 170,
  supplyCrateHp: 24,
  supplyCrateWidth: 58,
  supplyCrateHeight: 50,
} as const;

export const DASH = {
  cooldownMs: 1050,
  impulsePxPerSecond: 760,
  carrySeconds: 0.18,
} as const;

export const ARMOR = {
  max: 50,
  pickupAmount: 28,
} as const;

export const REPAIR = {
  pickupAmount: 22,
} as const;

export const PICKUPS = {
  radius: 20,
  respawnMs: 12000,
  collectionRadius: 42,
} as const;

export const SPAWN_BY_SIDE: Record<Side, { x: number; y: number }> = {
  blue: {
    x: 260,
    y: WORLD.groundY - WORLD.tankHeight,
  },
  red: {
    x: WORLD.width - 260,
    y: WORLD.groundY - WORLD.tankHeight,
  },
};

export const SIDE_SIGN: Record<Side, 1 | -1> = {
  blue: 1,
  red: -1,
};
