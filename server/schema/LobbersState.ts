import { defineTypes, MapSchema, Schema } from "@colyseus/schema";
import { ROUND } from "../../shared/game/constants";
import type { AmmoType, RoundState, Side } from "../../shared/game/types";

export class PlayerState extends Schema {
  side: Side | "" = "";
  name = "Lobber";
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  hp: number = ROUND.startingHp;
  aimX = 1;
  aimY = -0.35;
  selectedAmmo: AmmoType = "javelin";
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

export class LobbersState extends Schema {
  players = new MapSchema<PlayerState>();
  projectiles = new MapSchema<ProjectileState>();
  roundState: RoundState = "waiting";
  winnerSide: Side | "" = "";
  serverTick = 0;
  code = "";
  hostName = "Host";
  countdownEndsAtMs = 0;
}

defineTypes(PlayerState, {
  side: "string",
  name: "string",
  x: "number",
  y: "number",
  vx: "number",
  vy: "number",
  hp: "number",
  aimX: "number",
  aimY: "number",
  selectedAmmo: "string",
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

defineTypes(LobbersState, {
  players: { map: PlayerState },
  projectiles: { map: ProjectileState },
  roundState: "string",
  winnerSide: "string",
  serverTick: "number",
  code: "string",
  hostName: "string",
  countdownEndsAtMs: "number",
});
