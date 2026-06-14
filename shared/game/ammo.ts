import type { AmmoType } from "./types";

export type AmmoDefinition = {
  type: AmmoType;
  label: string;
  radius: number;
  minSpeed: number;
  maxSpeed: number;
  gravityScale: number;
  dragPerSecond: number;
  directDamage: number;
  blastDamage: number;
  blastRadius: number;
  chargeCurve: number;
  fuseSeconds: number | null;
  fragmentCount: number;
  fragmentSpeed: number;
  fragmentRadius: number;
  fragmentDamage: number;
  fragmentBlastRadius: number;
};

export const AMMO_TYPES = ["javelin", "shotput", "splitter"] as const satisfies readonly AmmoType[];

export const AMMO_DEFINITIONS: Record<AmmoType, AmmoDefinition> = {
  javelin: {
    type: "javelin",
    label: "Javelin",
    radius: 4,
    minSpeed: 620,
    maxSpeed: 1120,
    gravityScale: 0.72,
    dragPerSecond: 0.014,
    directDamage: 24,
    blastDamage: 4,
    blastRadius: 32,
    chargeCurve: 0.82,
    fuseSeconds: null,
    fragmentCount: 0,
    fragmentSpeed: 0,
    fragmentRadius: 0,
    fragmentDamage: 0,
    fragmentBlastRadius: 0,
  },
  shotput: {
    type: "shotput",
    label: "Shotput",
    radius: 14,
    minSpeed: 430,
    maxSpeed: 760,
    gravityScale: 1.1,
    dragPerSecond: 0.008,
    directDamage: 36,
    blastDamage: 28,
    blastRadius: 110,
    chargeCurve: 1.06,
    fuseSeconds: null,
    fragmentCount: 0,
    fragmentSpeed: 0,
    fragmentRadius: 0,
    fragmentDamage: 0,
    fragmentBlastRadius: 0,
  },
  splitter: {
    type: "splitter",
    label: "Splitter",
    radius: 8,
    minSpeed: 500,
    maxSpeed: 830,
    gravityScale: 0.94,
    dragPerSecond: 0.018,
    directDamage: 12,
    blastDamage: 10,
    blastRadius: 48,
    chargeCurve: 1,
    fuseSeconds: 0.95,
    fragmentCount: 7,
    fragmentSpeed: 430,
    fragmentRadius: 4,
    fragmentDamage: 7,
    fragmentBlastRadius: 22,
  },
};

export const isAmmoType = (value: unknown): value is AmmoType => (
  typeof value === "string" && (AMMO_TYPES as readonly string[]).includes(value)
);

export const getAmmoDefinition = (value: unknown): AmmoDefinition => {
  if (isAmmoType(value)) return AMMO_DEFINITIONS[value];
  return AMMO_DEFINITIONS.javelin;
};
