export type Side = "blue" | "red";
export type RoundState = "waiting" | "countdown" | "active" | "ended";
export type AmmoType = "javelin" | "shotput" | "splitter";

export type Vec2 = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CourtFixtureKind = "cage" | "flag" | "barrier" | "marker";

export type CourtFixture = Rect & {
  id: string;
  kind: CourtFixtureKind;
  collidable: boolean;
};

export type LobbyInfo = {
  roomId: string;
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: 2;
  roundState: RoundState;
};

export type ThrowReleasePayload = {
  aimX: number;
  aimY: number;
};

export type SelectAmmoPayload = {
  ammoType: AmmoType;
};

export type ChargeStartPayload = {
  ammoType: AmmoType;
};

export type SetReadyPayload = {
  ready: boolean;
};

export type MoveInputPayload = {
  moveX: number;
  jump: boolean;
};

export type ProjectileKinematics = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};
