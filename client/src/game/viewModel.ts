import type { AmmoType, RoundState, Side } from "../../../shared/game/types";

export type PlayerView = {
  sessionId: string;
  side: Side;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  aimX: number;
  aimY: number;
  selectedAmmo: AmmoType;
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

export type GameSnapshot = {
  players: PlayerView[];
  projectiles: ProjectileView[];
  roundState: RoundState;
  winnerSide: Side | "";
  serverTick: number;
  code: string;
  hostName: string;
  countdownEndsAtMs: number;
};

export const EMPTY_SNAPSHOT: GameSnapshot = {
  players: [],
  projectiles: [],
  roundState: "waiting",
  winnerSide: "",
  serverTick: 0,
  code: "",
  hostName: "Host",
  countdownEndsAtMs: 0,
};
