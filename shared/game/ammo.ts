import type { AmmoType } from "./types";

export type AmmoDefinition = {
  type: AmmoType;
  label: string;
  radius: number;
  minSpeed: number;
  maxSpeed: number;
  gravityScale: number;
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
    radius: 5,
    minSpeed: 560,
    maxSpeed: 980,
    gravityScale: 0.86,
    directDamage: 20,
    blastDamage: 8,
    blastRadius: 42,
    chargeCurve: 0.9,
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
    radius: 12,
    minSpeed: 380,
    maxSpeed: 690,
    gravityScale: 1.18,
    directDamage: 30,
    blastDamage: 22,
    blastRadius: 88,
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
    minSpeed: 440,
    maxSpeed: 780,
    gravityScale: 1,
    directDamage: 14,
    blastDamage: 10,
    blastRadius: 54,
    chargeCurve: 1,
    fuseSeconds: 1.15,
    fragmentCount: 5,
    fragmentSpeed: 360,
    fragmentRadius: 4,
    fragmentDamage: 8,
    fragmentBlastRadius: 24,
  },
};

export const isAmmoType = (value: unknown): value is AmmoType => (
  typeof value === "string" && (AMMO_TYPES as readonly string[]).includes(value)
);

export const getAmmoDefinition = (value: unknown): AmmoDefinition => {
  if (isAmmoType(value)) return AMMO_DEFINITIONS[value];
  return AMMO_DEFINITIONS.javelin;
};
