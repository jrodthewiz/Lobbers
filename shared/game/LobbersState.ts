import { defineTypes, MapSchema, Schema } from "@colyseus/schema";
import { ARMOR, DASH, ROUND } from "./constants";
import type { AmmoType, PickupType, RoundState, Side, TerrainMode, TurnPhase, WorldPropType } from "./types";

export class PlayerState extends Schema {
  side: Side | "" = "";
  laneIndex = 0;
  spawnIndex = 0;
  name = "Lobber";
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  hp: number = ROUND.startingHp;
  aimX = 1;
  aimY = -0.35;
  selectedAmmo: AmmoType = "javelin";
  javelinAmmo = -1;
  shotputAmmo = -1;
  splitterAmmo = -1;
  discusAmmo = 0;
  mortarAmmo = 0;
  needleAmmo = 0;
  clusterAmmo = 0;
  anvilAmmo = 0;
  shieldHp = 0;
  shieldMaxHp = ARMOR.max;
  dashCooldownMs = DASH.cooldownMs;
  dashCooldownEndsAtMs = 0;
  dashSeq = 0;
  pickupSeq = 0;
  lastPickupLabel = "";
  lastThrowDistance = 0;
  bestThrowDistance = 0;
  throwSeq = 0;
  charging = false;
  connected = true;
  ready = false;
  rematchRequested = false;
  isHost = false;
  isBot = false;
  grounded = true;
}

export class ProjectileState extends Schema {
  id = "";
  ammoType: AmmoType = "javelin";
  ownerSessionId = "";
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 0;
  alive = true;
}

export class PickupState extends Schema {
  id = "";
  type: PickupType = "armor";
  laneIndex = 0;
  x = 0;
  y = 0;
  radius = 0;
  active = true;
  respawnAtMs = 0;
}

export class WorldPropState extends Schema {
  id = "";
  type: WorldPropType = "oilBarrel";
  laneIndex = 0;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  hp = 0;
  active = true;
  triggeredSeq = 0;
}

export class LobbersState extends Schema {
  players = new MapSchema<PlayerState>();
  projectiles = new MapSchema<ProjectileState>();
  pickups = new MapSchema<PickupState>();
  worldProps = new MapSchema<WorldPropState>();
  roundState: RoundState = "waiting";
  winnerSide: Side | "" = "";
  serverTick = 0;
  worldWidth = 0;
  code = "";
  hostName = "Host";
  countdownEndsAtMs = 0;
  currentTurnSessionId = "";
  turnPhase: TurnPhase = "move";
  turnStartedAtMs = 0;
  turnEndsAtMs = 0;
  turnNumber = 0;
  terrainSeed = "";
  terrainMode: TerrainMode = "procedural";
  terrainVersion = 1;
  biomeId = "stadium";
  windAccelerationX = 0;
}

defineTypes(PlayerState, {
  side: "string",
  laneIndex: "number",
  spawnIndex: "number",
  name: "string",
  x: "number",
  y: "number",
  vx: "number",
  vy: "number",
  hp: "number",
  aimX: "number",
  aimY: "number",
  selectedAmmo: "string",
  javelinAmmo: "number",
  shotputAmmo: "number",
  splitterAmmo: "number",
  discusAmmo: "number",
  mortarAmmo: "number",
  needleAmmo: "number",
  clusterAmmo: "number",
  anvilAmmo: "number",
  shieldHp: "number",
  shieldMaxHp: "number",
  dashCooldownMs: "number",
  dashCooldownEndsAtMs: "number",
  dashSeq: "number",
  pickupSeq: "number",
  lastPickupLabel: "string",
  lastThrowDistance: "number",
  bestThrowDistance: "number",
  throwSeq: "number",
  charging: "boolean",
  connected: "boolean",
  ready: "boolean",
  rematchRequested: "boolean",
  isHost: "boolean",
  isBot: "boolean",
  grounded: "boolean",
});

defineTypes(ProjectileState, {
  id: "string",
  ammoType: "string",
  ownerSessionId: "string",
  x: "number",
  y: "number",
  vx: "number",
  vy: "number",
  radius: "number",
  alive: "boolean",
});

defineTypes(PickupState, {
  id: "string",
  type: "string",
  laneIndex: "number",
  x: "number",
  y: "number",
  radius: "number",
  active: "boolean",
  respawnAtMs: "number",
});

defineTypes(WorldPropState, {
  id: "string",
  type: "string",
  laneIndex: "number",
  x: "number",
  y: "number",
  width: "number",
  height: "number",
  hp: "number",
  active: "boolean",
  triggeredSeq: "number",
});

defineTypes(LobbersState, {
  players: { map: PlayerState },
  projectiles: { map: ProjectileState },
  pickups: { map: PickupState },
  worldProps: { map: WorldPropState },
  roundState: "string",
  winnerSide: "string",
  serverTick: "number",
  worldWidth: "number",
  code: "string",
  hostName: "string",
  countdownEndsAtMs: "number",
  currentTurnSessionId: "string",
  turnPhase: "string",
  turnStartedAtMs: "number",
  turnEndsAtMs: "number",
  turnNumber: "number",
  terrainSeed: "string",
  terrainMode: "string",
  terrainVersion: "number",
  biomeId: "string",
  windAccelerationX: "number",
});
