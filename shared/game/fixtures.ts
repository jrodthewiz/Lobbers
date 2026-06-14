import { WORLD } from "./constants";
import type { CourtFixture } from "./types";

export const COURT_FIXTURES: readonly CourtFixture[] = [
  {
    id: "center-cage-left-post",
    kind: "cage",
    x: 708,
    y: WORLD.groundY - 210,
    width: 14,
    height: 210,
    collidable: true,
  },
  {
    id: "center-cage-right-post",
    kind: "cage",
    x: 878,
    y: WORLD.groundY - 210,
    width: 14,
    height: 210,
    collidable: true,
  },
  {
    id: "center-cage-crossbar",
    kind: "cage",
    x: 708,
    y: WORLD.groundY - 210,
    width: 184,
    height: 12,
    collidable: true,
  },
  {
    id: "left-field-flag",
    kind: "flag",
    x: 520,
    y: WORLD.groundY - 132,
    width: 9,
    height: 132,
    collidable: true,
  },
  {
    id: "right-field-flag",
    kind: "flag",
    x: 1072,
    y: WORLD.groundY - 132,
    width: 9,
    height: 132,
    collidable: true,
  },
  {
    id: "low-center-barrier",
    kind: "barrier",
    x: 738,
    y: WORLD.groundY - 32,
    width: 124,
    height: 32,
    collidable: true,
  },
  {
    id: "shotput-ring-marker",
    kind: "marker",
    x: 774,
    y: WORLD.groundY - 5,
    width: 52,
    height: 5,
    collidable: false,
  },
];

export const getCollidableFixtures = (): readonly CourtFixture[] => (
  COURT_FIXTURES.filter((fixture) => fixture.collidable)
);
