import type { AmmoType } from "../../../shared/game/types";
import spriteAtlasJsonUrl from "../assets/lobbers-minimal-atlas.json?url";
import spriteAtlasImageUrl from "../assets/lobbers-minimal-atlas.png";

export { spriteAtlasImageUrl, spriteAtlasJsonUrl };

export const SPRITE_ATLAS_KEY = "lobbers-minimal-atlas";

export const SPRITES = {
  ammo: {
    javelin: "ammo/javelin",
    shotput: "ammo/shotput",
    splitter: "ammo/splitter",
  },
  ui: {
    ammoJavelin: "ui/ammo-javelin",
    ammoShotput: "ui/ammo-shotput",
    ammoSplitter: "ui/ammo-splitter",
    medalGold: "ui/medal-gold",
    targetRed: "ui/target-red",
    targetBlue: "ui/target-blue",
    arrowGold: "ui/arrow-gold",
    crateStar: "ui/crate-star",
  },
  props: {
    barrierStriped: "props/barrier-striped",
    flagBlue: "props/flag-blue",
    flagRed: "props/flag-red",
    rackJavelin: "props/rack-javelin",
    rackShotput: "props/rack-shotput",
    rackDiscs: "props/rack-discs",
    equipmentCrate: "props/equipment-crate",
    coneStack: "props/cone-stack",
    scoreboard: "props/scoreboard",
    torch: "props/torch",
    pennants: "props/pennants",
  },
  fx: {
    confettiSmall: "fx/confetti-small",
    confettiBurst: "fx/confetti-burst",
    impactJavelin: "fx/impact-javelin",
    impactShotput: "fx/impact-shotput",
    sparkBlue: "fx/spark-blue",
    sparkPurple: "fx/spark-purple",
    sparkGreen: "fx/spark-green",
    trailGold: "fx/trail-gold",
    trailBlue: "fx/trail-blue",
    trailRed: "fx/trail-red",
    trailGreen: "fx/trail-green",
    smokeSmall: "fx/smoke-small",
    smokeMedium: "fx/smoke-medium",
    smokeLarge: "fx/smoke-large",
  },
} as const;

export const AMMO_SPRITE_FRAMES: Record<AmmoType, string> = {
  javelin: SPRITES.ammo.javelin,
  shotput: SPRITES.ammo.shotput,
  splitter: SPRITES.ammo.splitter,
};

export const AMMO_UI_FRAMES: Record<AmmoType, string> = {
  javelin: SPRITES.ui.ammoJavelin,
  shotput: SPRITES.ui.ammoShotput,
  splitter: SPRITES.ui.ammoSplitter,
};

export const AMMO_FX_FRAMES: Record<AmmoType, {
  trail: string;
  impact: string;
  smoke: string;
}> = {
  javelin: {
    trail: SPRITES.fx.trailGold,
    impact: SPRITES.fx.impactJavelin,
    smoke: SPRITES.fx.smokeSmall,
  },
  shotput: {
    trail: SPRITES.fx.trailBlue,
    impact: SPRITES.fx.impactShotput,
    smoke: SPRITES.fx.smokeLarge,
  },
  splitter: {
    trail: SPRITES.fx.trailGreen,
    impact: SPRITES.fx.confettiBurst,
    smoke: SPRITES.fx.smokeMedium,
  },
};
