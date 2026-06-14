export const CLIENT_MESSAGES = {
  CHARGE_START: "chargeStart",
  CHARGE_CANCEL: "chargeCancel",
  THROW_RELEASE: "throwRelease",
  SELECT_AMMO: "selectAmmo",
  SET_READY: "setReady",
  REMATCH: "rematch",
} as const;

export const SERVER_MESSAGES = {
  ERROR: "errorMessage",
  ROUND_EVENT: "roundEvent",
} as const;
