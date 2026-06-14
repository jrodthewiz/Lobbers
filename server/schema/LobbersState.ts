import { MapSchema, Schema, type } from "@colyseus/schema";
import { ROUND } from "../../shared/game/constants";
import type { AmmoType, RoundState, Side } from "../../shared/game/types";

export class PlayerState extends Schema {
  @type("string") side: Side | "" = "";
  @type("string") name = "Lobber";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp: number = ROUND.startingHp;
  @type("number") aimX = 1;
  @type("number") aimY = -0.35;
  @type("string") selectedAmmo: AmmoType = "javelin";
  @type("number") lastThrowDistance = 0;
  @type("number") bestThrowDistance = 0;
  @type("boolean") charging = false;
  @type("boolean") connected = true;
  @type("boolean") ready = false;
  @type("boolean") rematchRequested = false;
  @type("boolean") isHost = false;
}

export class ProjectileState extends Schema {
  @type("string") id = "";
  @type("string") ammoType: AmmoType = "javelin";
  @type("string") ownerSessionId = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") radius = 0;
  @type("boolean") alive = true;
}

export class LobbersState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
  @type("string") roundState: RoundState = "waiting";
  @type("string") winnerSide: Side | "" = "";
  @type("number") serverTick = 0;
  @type("string") code = "";
  @type("string") hostName = "Host";
  @type("number") countdownEndsAtMs = 0;
}
