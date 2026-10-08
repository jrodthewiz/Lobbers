export const CLIENT_MESSAGES = {
  CHARGE_START: "chargeStart",
  CHARGE_CANCEL: "chargeCancel",
  THROW_RELEASE: "throwRelease",
  SELECT_AMMO: "selectAmmo",
  MOVE_INPUT: "moveInput",
  USE_ABILITY: "useAbility",
  SET_READY: "setReady",
  REMATCH: "rematch",
  VEHICLE_DESIGN: "vehicleDesign",
} as const;

export const SERVER_MESSAGES = {
  ERROR: "errorMessage",
  ROUND_EVENT: "roundEvent",
} as const;
