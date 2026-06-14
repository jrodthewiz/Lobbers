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
    trophyGenerated: "ui/trophy-generated",
    medalSilverGenerated: "ui/medal-silver-generated",
    warningGenerated: "ui/warning-generated",
    readyBadgeGenerated: "ui/ready-badge-generated",
    powerTokenGenerated: "ui/power-token-generated",
    pennantRedGenerated: "ui/pennant-red-generated",
    pennantBlueGenerated: "ui/pennant-blue-generated",
    startButtonGenerated: "ui/start-button-generated",
    scorePlaqueGenerated: "ui/score-plaque-generated",
    speedArrowGenerated: "ui/speed-arrow-generated",
    bracketLeftGenerated: "ui/bracket-left-generated",
    bracketRightGenerated: "ui/bracket-right-generated",
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
    starburstGoldGenerated: "fx/starburst-gold-generated",
    starburstBlueGenerated: "fx/starburst-blue-generated",
    confettiGenerated: "fx/confetti-generated",
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
    impact: SPRITES.fx.starburstGoldGenerated,
    smoke: SPRITES.fx.smokeSmall,
  },
  shotput: {
    trail: SPRITES.fx.trailBlue,
    impact: SPRITES.fx.starburstBlueGenerated,
    smoke: SPRITES.fx.smokeLarge,
  },
  splitter: {
    trail: SPRITES.fx.trailGreen,
    impact: SPRITES.fx.confettiGenerated,
    smoke: SPRITES.fx.smokeMedium,
  },
};
