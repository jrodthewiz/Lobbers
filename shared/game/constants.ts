import type { Side } from "./types";

export const ROOM_NAME = "lobbers_throw_room";

export const WORLD = {
  width: 1600,
  height: 900,
  groundY: 720,
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
  maxPlayers: 2,
  startingHp: 100,
  countdownMs: 1500,
} as const;

export const CHARGE = {
  minMs: 120,
  maxMs: 1600,
} as const;

export const MOVEMENT = {
  moveSpeedPxPerSecond: 260,
  jumpVelocityPxPerSecond: -390,
  maxFallSpeedPxPerSecond: 920,
  sideBoundaryPadding: 88,
  centerNoCrossPadding: 136,
} as const;

export const SPAWN_BY_SIDE: Record<Side, { x: number; y: number }> = {
  blue: {
    x: 170,
    y: WORLD.groundY - WORLD.tankHeight,
  },
  red: {
    x: WORLD.width - 170,
    y: WORLD.groundY - WORLD.tankHeight,
  },
};

export const SIDE_SIGN: Record<Side, 1 | -1> = {
  blue: 1,
  red: -1,
};
