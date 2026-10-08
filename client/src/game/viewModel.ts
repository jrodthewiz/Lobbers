import { TERRAIN, WORLD } from "../../../shared/game/constants";
import type { AmmoType, PickupType, RoundState, Side, TerrainMode, TurnPhase, WorldPropType } from "../../../shared/game/types";

export type PlayerView = {
  sessionId: string;
  side: Side;
  laneIndex: number;
  spawnIndex: number;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  aimX: number;
  aimY: number;
  selectedAmmo: AmmoType;
  ammoCounts: Record<AmmoType, number>;
  shieldHp: number;
  shieldMaxHp: number;
  dashCooldownMs: number;
  dashCooldownRemainingMs: number;
  dashSeq: number;
  pickupSeq: number;
  lastPickupLabel: string;
  lastThrowDistance: number;
  bestThrowDistance: number;
  throwSeq: number;
  charging: boolean;
  connected: boolean;
  ready: boolean;
  rematchRequested: boolean;
  isHost: boolean;
  isBot: boolean;
  grounded: boolean;
};

export type ProjectileView = {
  id: string;
  ammoType: AmmoType;
  ownerSessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alive: boolean;
};

export type PickupView = {
  id: string;
  type: PickupType;
  laneIndex: number;
  x: number;
  y: number;
  radius: number;
  active: boolean;
};

export type WorldPropView = {
  id: string;
  type: WorldPropType;
  laneIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  active: boolean;
  triggeredSeq: number;
};

export type GameSnapshot = {
  players: PlayerView[];
  projectiles: ProjectileView[];
  pickups: PickupView[];
  worldProps: WorldPropView[];
  roundState: RoundState;
  winnerSide: Side | "";
  serverTick: number;
  worldWidth: number;
  code: string;
  hostName: string;
  countdownEndsAtMs: number;
  currentTurnSessionId: string;
  turnPhase: TurnPhase;
  turnStartedAtMs: number;
  turnEndsAtMs: number;
  turnNumber: number;
  terrainSeed: string;
  terrainMode: TerrainMode;
  terrainVersion: number;
  biomeId: string;
  windAccelerationX: number;
};

export const EMPTY_SNAPSHOT: GameSnapshot = {
  players: [],
  projectiles: [],
  pickups: [],
  worldProps: [],
  roundState: "waiting",
  winnerSide: "",
  serverTick: 0,
  worldWidth: WORLD.width,
  code: "",
  hostName: "Host",
  countdownEndsAtMs: 0,
  currentTurnSessionId: "",
  turnPhase: "move",
  turnStartedAtMs: 0,
  turnEndsAtMs: 0,
  turnNumber: 0,
  terrainSeed: "Lobbers",
  terrainMode: "procedural",
  terrainVersion: TERRAIN.version,
  biomeId: "stadium",
  windAccelerationX: 0,
};
