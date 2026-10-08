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

export const AMMO_TYPES = [
  "javelin",
  "shotput",
  "splitter",
  "discus",
  "mortar",
  "needle",
  "cluster",
  "anvil",
] as const satisfies readonly AmmoType[];

export const AMMO_DEFINITIONS: Record<AmmoType, AmmoDefinition> = {
  javelin: {
    type: "javelin",
    label: "Javelin",
    radius: 4,
    minSpeed: 760,
    maxSpeed: 1680,
    gravityScale: 0.64,
    dragPerSecond: 0.01,
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
    minSpeed: 520,
    maxSpeed: 1300,
    gravityScale: 1.02,
    dragPerSecond: 0.006,
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
    minSpeed: 620,
    maxSpeed: 1320,
    gravityScale: 0.84,
    dragPerSecond: 0.014,
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
  discus: {
    type: "discus",
    label: "Discus",
    radius: 9,
    minSpeed: 640,
    maxSpeed: 1560,
    gravityScale: 0.48,
    dragPerSecond: 0.034,
    directDamage: 18,
    blastDamage: 8,
    blastRadius: 42,
    chargeCurve: 0.95,
    fuseSeconds: null,
    fragmentCount: 0,
    fragmentSpeed: 0,
    fragmentRadius: 0,
    fragmentDamage: 0,
    fragmentBlastRadius: 0,
  },
  mortar: {
    type: "mortar",
    label: "Mortar",
    radius: 11,
    minSpeed: 470,
    maxSpeed: 1500,
    gravityScale: 1.15,
    dragPerSecond: 0.004,
    directDamage: 16,
    blastDamage: 34,
    blastRadius: 126,
    chargeCurve: 1.12,
    fuseSeconds: null,
    fragmentCount: 0,
    fragmentSpeed: 0,
    fragmentRadius: 0,
    fragmentDamage: 0,
    fragmentBlastRadius: 0,
  },
  needle: {
    type: "needle",
    label: "Needle",
    radius: 3,
    minSpeed: 900,
    maxSpeed: 2050,
    gravityScale: 0.48,
    dragPerSecond: 0.008,
    directDamage: 32,
    blastDamage: 0,
    blastRadius: 0,
    chargeCurve: 0.78,
    fuseSeconds: null,
    fragmentCount: 0,
    fragmentSpeed: 0,
    fragmentRadius: 0,
    fragmentDamage: 0,
    fragmentBlastRadius: 0,
  },
  cluster: {
    type: "cluster",
    label: "Cluster",
    radius: 12,
    minSpeed: 520,
    maxSpeed: 1350,
    gravityScale: 0.98,
    dragPerSecond: 0.008,
    directDamage: 10,
    blastDamage: 8,
    blastRadius: 46,
    chargeCurve: 1.02,
    fuseSeconds: 0.8,
    fragmentCount: 5,
    fragmentSpeed: 360,
    fragmentRadius: 5,
    fragmentDamage: 8,
    fragmentBlastRadius: 28,
  },
  anvil: {
    type: "anvil",
    label: "Anvil",
    radius: 16,
    minSpeed: 390,
    maxSpeed: 1700,
    gravityScale: 1.32,
    dragPerSecond: 0.003,
    directDamage: 44,
    blastDamage: 16,
    blastRadius: 72,
    chargeCurve: 1.16,
    fuseSeconds: null,
    fragmentCount: 0,
    fragmentSpeed: 0,
    fragmentRadius: 0,
    fragmentDamage: 0,
    fragmentBlastRadius: 0,
  },
};

export const isAmmoType = (value: unknown): value is AmmoType => (
  typeof value === "string" && (AMMO_TYPES as readonly string[]).includes(value)
);

export const getAmmoDefinition = (value: unknown): AmmoDefinition => {
  if (isAmmoType(value)) return AMMO_DEFINITIONS[value];
  return AMMO_DEFINITIONS.javelin;
};
