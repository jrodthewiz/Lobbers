import { WORLD } from "./constants";
import type { CourtFixture } from "./types";

const CENTER_X = WORLD.width / 2;

export const COURT_FIXTURES: readonly CourtFixture[] = [
  {
    id: "center-cage-left-post",
    kind: "cage",
    x: CENTER_X - 92,
    y: WORLD.groundY - 210,
    width: 14,
    height: 210,
    collidable: true,
  },
  {
    id: "center-cage-right-post",
    kind: "cage",
    x: CENTER_X + 78,
    y: WORLD.groundY - 210,
    width: 14,
    height: 210,
    collidable: true,
  },
  {
    id: "center-cage-crossbar",
    kind: "cage",
    x: CENTER_X - 92,
    y: WORLD.groundY - 210,
    width: 184,
    height: 12,
    collidable: true,
  },
  {
    id: "left-field-flag",
    kind: "flag",
    x: CENTER_X - 540,
    y: WORLD.groundY - 132,
    width: 9,
    height: 132,
    collidable: true,
  },
  {
    id: "right-field-flag",
    kind: "flag",
    x: CENTER_X + 532,
    y: WORLD.groundY - 132,
    width: 9,
    height: 132,
    collidable: true,
  },
  {
    id: "low-center-barrier",
    kind: "barrier",
    x: CENTER_X - 62,
    y: WORLD.groundY - 32,
    width: 124,
    height: 32,
    collidable: true,
  },
  {
    id: "shotput-ring-marker",
    kind: "marker",
    x: CENTER_X - 26,
    y: WORLD.groundY - 5,
    width: 52,
    height: 5,
    collidable: false,
  },
];

export const getCollidableFixtures = (): readonly CourtFixture[] => (
  COURT_FIXTURES.filter((fixture) => fixture.collidable)
);
