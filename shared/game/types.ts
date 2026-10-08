export type Side = "blue" | "red";
export type RoundState = "waiting" | "countdown" | "active" | "ended";
export type TurnPhase = "move" | "fire" | "resolving";
export type AmmoType = "javelin" | "shotput" | "splitter" | "discus" | "mortar" | "needle" | "cluster" | "anvil";
export type AbilityType = "dash";
export type PickupType = "armor" | "clusterAmmo" | "dashCharge" | "repair" | "ammoCache";
export type PickupKind = "armor" | "ammo" | "ability";
export type WorldPropType = "oilBarrel" | "supplyCrate";
export type BiomeId = "stadium" | "dunes" | "tundra" | "foundry" | "garden";
export type TerrainMode = "classic" | "procedural";

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
  maxPlayers: number;
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

export type UseAbilityPayload = {
  ability: AbilityType;
};

export type ProjectileKinematics = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};
