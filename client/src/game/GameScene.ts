import Phaser from "phaser";
import { getAmmoDefinition } from "../../../shared/game/ammo";
import { buildProjectilePhysicsProfile } from "../../../shared/game/ballistics";
import { COURT_FIXTURES } from "../../../shared/game/fixtures";
import { CHARGE, SIDE_SIGN, WORLD } from "../../../shared/game/constants";
import {
  buildLaunchVelocity,
  buildTankHitbox,
  normalize,
  predictTrajectory,
  resolveChargeRatio,
  resolveShoulderPosition,
  resolveThrowHandPosition,
} from "../../../shared/game/math";
import type { AmmoType, CourtFixture, Side, Vec2 } from "../../../shared/game/types";
import { ProceduralBackground } from "./ProceduralBackground";
import { resolvePointerAim } from "./aim";
import {
  AMMO_FX_FRAMES,
  AMMO_SPRITE_FRAMES,
  SPRITE_ATLAS_KEY,
  SPRITES,
  spriteAtlasImageUrl,
  spriteAtlasJsonUrl,
} from "./spriteAtlas";
import type { GameSnapshot, PlayerView, ProjectileView } from "./viewModel";
import { EMPTY_SNAPSHOT } from "./viewModel";

type GameSceneCallbacks = {
  chargeStart: () => void;
  chargeCancel: () => void;
  throwRelease: (aim: Vec2) => void;
};

type ArmPose = {
  shoulder: Vec2;
  elbow: Vec2;
  hand: Vec2;
  gearAngle: number;
  chargeRatio: number;
  releaseProgress: number;
};

type AmmoFxProfile = {
  core: number;
  glow: number;
  hot: number;
  shadow: number;
  spark: number;
  accent: number;
  particleCount: number;
};

type ImpactFx = {
  id: string;
  ammoType: AmmoType;
  x: number;
  y: number;
  radius: number;
  strength: number;
  startedAtMs: number;
  sprites: Phaser.GameObjects.Image[];
};

type TankSpriteSet = {
  shadow: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  pilot: Phaser.GameObjects.Image;
};

const COLORS = {
  court: 0x42513a,
  lane: 0x7b8f59,
  line: 0xd7e6b0,
  cage: 0xd8dee9,
  flagBlue: 0x38bdf8,
  flagRed: 0xfb7185,
  marker: 0xfacc15,
  blue: 0x2563eb,
  blueLight: 0x7dd3fc,
  red: 0xdc2626,
  redLight: 0xfda4af,
  worm: 0xf5d0a9,
  javelin: 0xfacc15,
  shotput: 0xe5e7eb,
  splitter: 0x34d399,
  preview: 0xfef3c7,
} as const;

const AMMO_FX: Record<AmmoType, AmmoFxProfile> = {
  javelin: {
    core: COLORS.javelin,
    glow: 0xfff1a8,
    hot: 0xffffff,
    shadow: 0x713f12,
    spark: 0xf97316,
    accent: COLORS.flagBlue,
    particleCount: 9,
  },
  shotput: {
    core: COLORS.shotput,
    glow: 0x93c5fd,
    hot: 0xffffff,
    shadow: 0x334155,
    spark: 0x60a5fa,
    accent: COLORS.flagRed,
    particleCount: 11,
  },
  splitter: {
    core: COLORS.splitter,
    glow: 0xa7f3d0,
    hot: 0xf0fdf4,
    shadow: 0x064e3b,
    spark: 0xf0abfc,
    accent: 0x22d3ee,
    particleCount: 13,
  },
};

const colorForSide = (side: Side): number => (side === "blue" ? COLORS.blue : COLORS.red);
const lightColorForSide = (side: Side): number => (side === "blue" ? COLORS.blueLight : COLORS.redLight);

const colorForAmmo = (ammoType: AmmoType): number => AMMO_FX[ammoType].core;

type ArenaDecorConfig = {
  frame: string;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  depth: number;
  sway: number;
  bob: number;
  phase: number;
};

const ARENA_DECOR_LAYOUT: ArenaDecorConfig[] = [
  { frame: SPRITES.props.pennants, x: WORLD.width / 2, y: 118, scale: 1.15, alpha: 0.58, depth: 8, sway: 16, bob: 3, phase: 0.1 },
  { frame: SPRITES.props.scoreboard, x: WORLD.width / 2, y: 286, scale: 0.66, alpha: 0.62, depth: 8, sway: 10, bob: 1.5, phase: 1.2 },
  { frame: SPRITES.props.rackJavelin, x: 166, y: WORLD.groundY - 70, scale: 0.68, alpha: 0.92, depth: 11, sway: 7, bob: 0.6, phase: 2.4 },
  { frame: SPRITES.props.equipmentCrate, x: 62, y: WORLD.groundY - 48, scale: 0.58, alpha: 0.78, depth: 11, sway: 4, bob: 0.5, phase: 0.7 },
  { frame: SPRITES.props.rackShotput, x: 350, y: WORLD.groundY - 70, scale: 0.54, alpha: 0.86, depth: 11, sway: 8, bob: 0.6, phase: 3.1 },
  { frame: SPRITES.props.torch, x: WORLD.width / 2 - 332, y: WORLD.groundY - 68, scale: 0.52, alpha: 0.72, depth: 11, sway: 5, bob: 0.7, phase: 4.4 },
  { frame: SPRITES.props.torch, x: WORLD.width / 2 + 332, y: WORLD.groundY - 68, scale: 0.52, alpha: 0.72, depth: 11, sway: 5, bob: 0.7, phase: 5.2 },
  { frame: SPRITES.props.rackDiscs, x: WORLD.width - 344, y: WORLD.groundY - 70, scale: 0.54, alpha: 0.86, depth: 11, sway: 8, bob: 0.6, phase: 1.8 },
  { frame: SPRITES.props.coneStack, x: WORLD.width - 164, y: WORLD.groundY - 56, scale: 0.55, alpha: 0.82, depth: 11, sway: 5, bob: 0.5, phase: 2.7 },
  { frame: SPRITES.props.equipmentCrate, x: WORLD.width - 62, y: WORLD.groundY - 48, scale: 0.58, alpha: 0.78, depth: 11, sway: 4, bob: 0.5, phase: 3.8 },
];

export class GameScene extends Phaser.Scene {
  private background!: ProceduralBackground;
  private graphics!: Phaser.GameObjects.Graphics;
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private localSessionId = "";
  private selectedAmmo: AmmoType = "javelin";
  private callbacks: GameSceneCallbacks | null = null;
  private pointerAim: Vec2 = { x: 1, y: -0.35 };
  private aimDragStartWorld: Vec2 | null = null;
  private aimDragCurrentWorld: Vec2 | null = null;
  private chargingStartedAtMs: number | null = null;
  private readonly lastThrowSeqBySessionId = new Map<string, number>();
  private readonly throwAnimationStartedAtBySessionId = new Map<string, number>();
  private readonly fixtureSpritesById = new Map<string, Phaser.GameObjects.Image>();
  private readonly projectileSpritesById = new Map<string, Phaser.GameObjects.Image>();
  private readonly projectileTrailSpritesById = new Map<string, Phaser.GameObjects.Image>();
  private readonly tankSpritesBySessionId = new Map<string, TankSpriteSet>();
  private readonly lastProjectilesById = new Map<string, ProjectileView>();
  private readonly lastHpBySessionId = new Map<string, number>();
  private readonly impactFx: ImpactFx[] = [];
  private readonly arenaDecorSprites: Phaser.GameObjects.Image[] = [];
  private environmentKey = "";
  private cameraVignette: Phaser.FX.Vignette | null = null;
  private cameraColorMatrix: Phaser.FX.ColorMatrix | null = null;
  private heldAmmoSprite: Phaser.GameObjects.Image | null = null;

  constructor() {
    super("GameScene");
  }

  preload(): void {
    this.load.atlas(SPRITE_ATLAS_KEY, spriteAtlasImageUrl, spriteAtlasJsonUrl);
  }

  create(): void {
    this.background = new ProceduralBackground(this);
    this.background.create();
    this.installCameraPostFx();
    this.graphics = this.add.graphics().setDepth(10);
    this.fxGraphics = this.add.graphics().setDepth(22);
    this.fxGraphics.setBlendMode(Phaser.BlendModes.ADD);
    this.createFixtureSprites();
    this.createArenaDecorSprites();
    this.applyArenaDecorLayout("Lobbers");
    this.heldAmmoSprite = this.add
      .image(0, 0, SPRITE_ATLAS_KEY, SPRITES.ammo.javelin)
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.input.keyboard?.on("keydown-ESC", () => this.cancelCharge());
  }

  override update(time: number): void {
    this.background.update(time);
    this.updateCameraPostFx(time);
    this.updateArenaDecorSprites(time);
    this.draw();
  }

  setCallbacks(callbacks: GameSceneCallbacks): void {
    this.callbacks = callbacks;
  }

  setSnapshot(snapshot: GameSnapshot): void {
    this.updateEnvironment(snapshot);
    this.trackThrowAnimations(snapshot);
    this.trackImpactFx(snapshot);
    this.snapshot = snapshot;
  }

  setLocalSessionId(sessionId: string): void {
    this.localSessionId = sessionId;
  }

  setSelectedAmmo(ammoType: AmmoType): void {
    this.selectedAmmo = ammoType;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.canCharge()) return;
    this.aimDragStartWorld = this.resolvePointerWorld(pointer);
    this.aimDragCurrentWorld = { ...this.aimDragStartWorld };
    this.updatePointerAim(pointer);
    this.chargingStartedAtMs = performance.now();
    this.callbacks?.chargeStart();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.updatePointerAim(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.chargingStartedAtMs === null) return;
    this.updatePointerAim(pointer);
    const aim = this.pointerAim;
    this.chargingStartedAtMs = null;
    this.aimDragStartWorld = null;
    this.aimDragCurrentWorld = null;
    this.callbacks?.throwRelease(aim);
  }

  private cancelCharge(): void {
    if (this.chargingStartedAtMs === null) return;
    this.chargingStartedAtMs = null;
    this.aimDragStartWorld = null;
    this.aimDragCurrentWorld = null;
    this.callbacks?.chargeCancel();
  }

  private updatePointerAim(pointer: Phaser.Input.Pointer): void {
    const player = this.getLocalPlayer();
    if (!player) return;
    const shoulder = resolveShoulderPosition(player.x, player.y, player.side);
    const pointerWorld = this.resolvePointerWorld(pointer);
    this.aimDragCurrentWorld = pointerWorld;
    this.pointerAim = resolvePointerAim({
      pointer: pointerWorld,
      shoulder,
      side: player.side,
      currentAim: this.pointerAim,
      dragStart: this.aimDragStartWorld,
      isCharging: this.chargingStartedAtMs !== null,
    });
  }

  private resolvePointerWorld(pointer: Phaser.Input.Pointer): Vec2 {
    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return { x: worldPoint.x, y: worldPoint.y };
  }

  private canCharge(): boolean {
    const player = this.getLocalPlayer();
    return Boolean(player && player.connected && player.hp > 0 && this.snapshot.roundState === "active");
  }

  private getLocalPlayer(): PlayerView | null {
    return this.snapshot.players.find((player) => player.sessionId === this.localSessionId) ?? null;
  }

  private updateEnvironment(snapshot: GameSnapshot): void {
    const key = snapshot.code || (snapshot.hostName === "Host" ? "Lobbers" : snapshot.hostName);
    if (key === this.environmentKey) return;
    this.environmentKey = key;
    this.background.setSeed(key);
    this.applyArenaDecorLayout(key);
    this.cameras.main.fadeIn(420, 6, 10, 18);
  }

  private installCameraPostFx(): void {
    if (this.game.renderer.type !== Phaser.WEBGL) return;
    try {
      this.cameraVignette = this.cameras.main.postFX.addVignette(0.5, 0.54, 0.82, 0.18);
      this.cameraColorMatrix = this.cameras.main.postFX.addColorMatrix();
      this.cameraColorMatrix.brightness(1.04);
      this.cameraColorMatrix.saturate(0.12, true);
    } catch {
      this.cameraVignette = null;
      this.cameraColorMatrix = null;
    }
  }

  private updateCameraPostFx(time: number): void {
    if (!this.cameraVignette) return;
    this.cameraVignette.strength = 0.17 + (Math.sin(time * 0.00075) * 0.018);
  }

  private trackThrowAnimations(snapshot: GameSnapshot): void {
    for (const player of snapshot.players) {
      const previousSeq = this.lastThrowSeqBySessionId.get(player.sessionId);
      if (previousSeq !== undefined && player.throwSeq > previousSeq) {
        this.throwAnimationStartedAtBySessionId.set(player.sessionId, performance.now());
        this.pulseThrowCameraFx(player.selectedAmmo);
      }
      this.lastThrowSeqBySessionId.set(player.sessionId, player.throwSeq);
    }
  }

  private trackImpactFx(snapshot: GameSnapshot): void {
    const nextProjectileIds = new Set(snapshot.projectiles.map((projectile) => projectile.id));
    const damageDetected = snapshot.players.some((player) => {
      const previousHp = this.lastHpBySessionId.get(player.sessionId);
      return previousHp !== undefined && player.hp < previousHp;
    });

    for (const [projectileId, projectile] of this.lastProjectilesById.entries()) {
      if (nextProjectileIds.has(projectileId)) continue;
      this.spawnImpactFx(projectile, damageDetected);
    }

    this.lastProjectilesById.clear();
    for (const projectile of snapshot.projectiles) {
      this.lastProjectilesById.set(projectile.id, projectile);
    }

    this.lastHpBySessionId.clear();
    for (const player of snapshot.players) {
      this.lastHpBySessionId.set(player.sessionId, player.hp);
    }
  }

  private spawnImpactFx(projectile: ProjectileView, damageDetected: boolean): void {
    const strength = this.resolveImpactStrength(projectile.ammoType, damageDetected);
    this.pulseImpactCameraFx(projectile.ammoType, strength);
    if (!this.textures.exists(SPRITE_ATLAS_KEY)) return;
    const frames = AMMO_FX_FRAMES[projectile.ammoType];
    const sprites: Phaser.GameObjects.Image[] = [];
    const addSprite = (frame: string, depth: number): Phaser.GameObjects.Image => {
      const sprite = this.add
        .image(projectile.x, projectile.y, SPRITE_ATLAS_KEY, frame)
        .setOrigin(0.5)
        .setDepth(depth)
        .setBlendMode(Phaser.BlendModes.ADD);
      sprites.push(sprite);
      return sprite;
    };

    addSprite(frames.impact, 28);
    addSprite(frames.smoke, 27).setBlendMode(Phaser.BlendModes.NORMAL);
    if (projectile.ammoType === "splitter") {
      addSprite(SPRITES.fx.sparkGreen, 29);
      addSprite(SPRITES.fx.sparkPurple, 29);
    }

    this.impactFx.push({
      id: `${projectile.id}:${performance.now()}`,
      ammoType: projectile.ammoType,
      x: projectile.x,
      y: projectile.y,
      radius: projectile.radius,
      strength,
      startedAtMs: performance.now(),
      sprites,
    });
  }

  private pulseThrowCameraFx(ammoType: AmmoType): void {
    const profile = AMMO_FX[ammoType];
    const strength = ammoType === "shotput" ? 0.0034 : ammoType === "splitter" ? 0.0025 : 0.0018;
    this.cameras.main.shake(70, strength, false);
    if (ammoType !== "javelin") {
      const rgb = rgbFromHex(profile.glow);
      this.cameras.main.flash(54, rgb.r, rgb.g, rgb.b, false);
    }
  }

  private pulseImpactCameraFx(ammoType: AmmoType, strength: number): void {
    const profile = AMMO_FX[ammoType];
    const rgb = rgbFromHex(profile.hot);
    const duration = ammoType === "shotput" ? 130 : 90;
    const shakeScale = ammoType === "shotput" ? 0.0031 : 0.0022;
    this.cameras.main.shake(duration + (strength * 82), shakeScale * strength, true);
    this.cameras.main.flash(86 + (strength * 48), rgb.r, rgb.g, rgb.b, true);
  }

  private resolveImpactStrength(ammoType: AmmoType, damageDetected: boolean): number {
    const base = ammoType === "shotput" ? 1.45 : ammoType === "splitter" ? 1 : 0.82;
    return base * (damageDetected ? 1.35 : 1);
  }

  private draw(): void {
    this.heldAmmoSprite?.setVisible(false);
    this.graphics.clear();
    this.fxGraphics.clear();
    this.drawCourt();
    this.drawFixtures();
    this.drawPlayers();
    this.drawProjectiles();
    this.drawImpactFx();
    this.drawAimPreview();
  }

  private drawCourt(): void {
    const g = this.graphics;
    const laneLeft = 80;
    const laneRight = WORLD.width - 80;
    const laneWidth = laneRight - laneLeft;

    g.fillStyle(0x1a241d, 0.22);
    g.fillRect(0, WORLD.groundY - 46, WORLD.width, 46);
    g.fillStyle(COLORS.court, 0.3);
    g.fillRect(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY);
    g.fillStyle(0x263820, 0.52);
    g.fillRect(0, WORLD.groundY + 92, WORLD.width, WORLD.height - WORLD.groundY - 92);

    g.fillStyle(0x9fb26b, 0.22);
    for (let x = laneLeft; x < laneRight; x += 110) {
      g.fillRect(x, WORLD.groundY - 22, 56, 24);
    }

    g.fillStyle(COLORS.lane, 0.9);
    g.fillRect(laneLeft, WORLD.groundY - 18, laneWidth, 18);
    g.fillStyle(0xf8fafc, 0.18);
    g.fillRect(laneLeft, WORLD.groundY - 18, laneWidth, 3);
    g.fillStyle(0x263820, 0.18);
    g.fillRect(laneLeft, WORLD.groundY - 3, laneWidth, 3);

    g.lineStyle(1, 0xfacc15, 0.5);
    g.beginPath();
    g.moveTo(WORLD.width / 2, WORLD.groundY - 40);
    g.lineTo(WORLD.width / 2, WORLD.groundY + 12);
    g.strokePath();

    g.lineStyle(2, COLORS.line, 0.75);
    g.beginPath();
    g.moveTo(laneLeft, WORLD.groundY);
    g.lineTo(laneRight, WORLD.groundY);
    g.strokePath();

    for (let x = 120; x <= WORLD.width - 120; x += 100) {
      const tall = x % 200 === 0;
      g.lineStyle(tall ? 3 : 1, COLORS.line, tall ? 0.85 : 0.45);
      g.beginPath();
      g.moveTo(x, WORLD.groundY - (tall ? 38 : 24));
      g.lineTo(x, WORLD.groundY + 10);
      g.strokePath();
    }

    g.lineStyle(1, 0xffffff, 0.16);
    for (let y = WORLD.groundY + 30; y <= WORLD.height; y += 30) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(WORLD.width, y);
      g.strokePath();
    }

    g.lineStyle(1, 0x0f172a, 0.11);
    for (let x = -WORLD.height; x < WORLD.width; x += 86) {
      g.beginPath();
      g.moveTo(x, WORLD.height);
      g.lineTo(x + (WORLD.height - WORLD.groundY), WORLD.groundY);
      g.strokePath();
    }
  }

  private drawFixtures(): void {
    const g = this.graphics;
    for (const fixture of COURT_FIXTURES) {
      const sprite = this.fixtureSpritesById.get(fixture.id);
      if (sprite) {
        this.syncFixtureSprite(sprite, fixture);
        continue;
      }

      if (fixture.kind === "flag") {
        const color = fixture.x < WORLD.width / 2 ? COLORS.flagBlue : COLORS.flagRed;
        g.fillStyle(color, 1);
        g.fillRect(fixture.x, fixture.y, fixture.width, fixture.height);
        g.fillTriangle(
          fixture.x + fixture.width,
          fixture.y + 8,
          fixture.x + fixture.width + 42,
          fixture.y + 22,
          fixture.x + fixture.width,
          fixture.y + 38,
        );
        continue;
      }

      if (fixture.kind === "marker") {
        g.fillStyle(COLORS.marker, 0.85);
        g.fillRect(fixture.x, fixture.y, fixture.width, fixture.height);
        continue;
      }

      g.fillStyle(fixture.kind === "cage" ? COLORS.cage : COLORS.marker, fixture.collidable ? 0.92 : 0.35);
      g.fillRect(fixture.x, fixture.y, fixture.width, fixture.height);
    }
  }

  private drawPlayers(): void {
    const activeSessionIds = new Set<string>();
    for (const player of this.snapshot.players) {
      activeSessionIds.add(player.sessionId);
      this.drawTank(player);
    }
    this.destroyInactiveTankSprites(activeSessionIds);
  }

  private drawTank(player: PlayerView): void {
    const g = this.graphics;
    const sideColor = colorForSide(player.side);
    const lightColor = lightColorForSide(player.side);
    const hitbox = buildTankHitbox(player.x, player.y);
    const bodyY = player.y - WORLD.tankHeight;
    const bodyX = player.x - (WORLD.tankWidth / 2);

    if (!this.syncTankSprites(player)) {
      g.fillStyle(sideColor, player.connected ? 1 : 0.42);
      g.fillRoundedRect(bodyX, bodyY, WORLD.tankWidth, WORLD.tankHeight, 8);
      g.fillStyle(0x0f172a, 0.9);
      g.fillCircle(bodyX + 20, player.y + 2, 9);
      g.fillCircle(bodyX + WORLD.tankWidth - 20, player.y + 2, 9);

      g.fillStyle(COLORS.worm, player.connected ? 1 : 0.45);
      g.fillCircle(player.x, bodyY - 9, WORLD.pilotRadius);
      g.fillStyle(lightColor, 1);
      g.fillCircle(player.x + (SIDE_SIGN[player.side] * 4), bodyY - 12, 3);
    }

    const aim = this.resolvePlayerAim(player);
    const armPose = this.resolveArmPose(player, aim);
    this.drawThrowingArm(player, armPose, lightColor, aim);

    if (player.hp <= 0) {
      g.lineStyle(3, 0xffffff, 0.7);
      g.strokeRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
    }
  }

  private syncTankSprites(player: PlayerView): boolean {
    if (!this.hasAtlasFrame(SPRITES.tank.shadow)) return false;
    const sideSprites = SPRITES.tank[player.side];
    const treadIndex = Math.floor((performance.now() * 0.008) + (player.x * 0.05)) % sideSprites.treads.length;
    const isLocallyCharging = player.sessionId === this.localSessionId && this.chargingStartedAtMs !== null;
    const bodyFrame = player.hp <= 0
      ? sideSprites.bodyDamaged
      : (player.charging || isLocallyCharging ? sideSprites.treads[treadIndex] ?? sideSprites.bodyIdle : sideSprites.bodyIdle);
    if (!this.hasAtlasFrame(bodyFrame) || !this.hasAtlasFrame(sideSprites.pilot)) return false;

    const sprites = this.getTankSprites(player.sessionId, bodyFrame, sideSprites.pilot);
    const alpha = player.connected ? 1 : 0.46;
    const bodyScale = this.resolveFrameScale(bodyFrame, 112);
    const shadowScale = this.resolveFrameScale(SPRITES.tank.shadow, 112);
    const pilotScale = this.resolveFrameScale(sideSprites.pilot, 46);
    const facingScaleX = player.side === "red" ? -bodyScale : bodyScale;
    const pilotFacingScaleX = player.side === "red" ? -pilotScale : pilotScale;
    const bob = Math.sin(performance.now() * 0.004 + player.x * 0.03) * (player.charging ? 1.4 : 0.45);
    const bodyBottomY = player.y + 8 + bob;
    const pilotBottomY = player.y - WORLD.tankHeight + 8 + (bob * 0.55);

    sprites.shadow
      .setTexture(SPRITE_ATLAS_KEY, SPRITES.tank.shadow)
      .setPosition(player.x, player.y + 14)
      .setScale(shadowScale, shadowScale * 0.9)
      .setAlpha(alpha * 0.52)
      .setVisible(true);
    sprites.body
      .setTexture(SPRITE_ATLAS_KEY, bodyFrame)
      .setPosition(player.x, bodyBottomY)
      .setScale(facingScaleX, bodyScale)
      .setAlpha(alpha)
      .setVisible(true);
    sprites.pilot
      .setTexture(SPRITE_ATLAS_KEY, sideSprites.pilot)
      .setPosition(player.x, pilotBottomY)
      .setScale(pilotFacingScaleX, pilotScale)
      .setAlpha(alpha)
      .setVisible(true);

    return true;
  }

  private getTankSprites(sessionId: string, bodyFrame: string, pilotFrame: string): TankSpriteSet {
    const existing = this.tankSpritesBySessionId.get(sessionId);
    if (existing) return existing;
    const sprites = {
      shadow: this.add.image(0, 0, SPRITE_ATLAS_KEY, SPRITES.tank.shadow).setOrigin(0.5, 1).setDepth(16),
      body: this.add.image(0, 0, SPRITE_ATLAS_KEY, bodyFrame).setOrigin(0.5, 1).setDepth(18),
      pilot: this.add.image(0, 0, SPRITE_ATLAS_KEY, pilotFrame).setOrigin(0.5, 1).setDepth(19),
    };
    this.tankSpritesBySessionId.set(sessionId, sprites);
    return sprites;
  }

  private hasAtlasFrame(frame: string): boolean {
    if (!this.textures.exists(SPRITE_ATLAS_KEY)) return false;
    return this.textures.getFrame(SPRITE_ATLAS_KEY, frame) !== null;
  }

  private resolveFrameScale(frame: string, targetWidth: number): number {
    const atlasFrame = this.textures.getFrame(SPRITE_ATLAS_KEY, frame);
    return targetWidth / Math.max(1, atlasFrame?.width ?? targetWidth);
  }

  private destroyInactiveTankSprites(activeSessionIds: Set<string>): void {
    for (const [sessionId, sprites] of this.tankSpritesBySessionId.entries()) {
      if (activeSessionIds.has(sessionId)) continue;
      sprites.shadow.destroy();
      sprites.body.destroy();
      sprites.pilot.destroy();
      this.tankSpritesBySessionId.delete(sessionId);
    }
  }

  private resolvePlayerAim(player: PlayerView): Vec2 {
    return player.sessionId === this.localSessionId
      ? this.pointerAim
      : normalize(player.aimX, player.aimY, { x: SIDE_SIGN[player.side], y: -0.35 });
  }

  private resolveArmPose(player: PlayerView, aim: Vec2): ArmPose {
    const now = performance.now();
    const sideSign = SIDE_SIGN[player.side];
    const shoulder = resolveShoulderPosition(player.x, player.y, player.side);
    const localCharging = player.sessionId === this.localSessionId && this.chargingStartedAtMs !== null;
    const observedCharging = localCharging || player.charging;
    const chargeMs = localCharging && this.chargingStartedAtMs !== null
      ? now - this.chargingStartedAtMs
      : (observedCharging ? CHARGE.maxMs * 0.72 : 0);
    const chargeRatio = observedCharging ? resolveChargeRatio(chargeMs) : 0;
    const aimAngle = Math.atan2(aim.y, aim.x);
    const idleAngle = Math.atan2(-0.48, sideSign * 0.88);
    const throwStart = this.throwAnimationStartedAtBySessionId.get(player.sessionId) ?? null;
    const releaseAgeMs = throwStart === null ? Number.POSITIVE_INFINITY : now - throwStart;
    const releaseProgress = releaseAgeMs <= 180 ? clamp01(releaseAgeMs / 180) : 0;
    const recoverProgress = releaseAgeMs > 180 && releaseAgeMs <= 520 ? clamp01((releaseAgeMs - 180) / 340) : 0;
    const easedRelease = easeOutCubic(releaseProgress);
    const easedRecover = easeOutCubic(recoverProgress);
    const activelyAiming = observedCharging || releaseAgeMs <= 180;
    const baseAngle = activelyAiming
      ? aimAngle
      : (releaseAgeMs <= 520 ? lerp(aimAngle, idleAngle, easedRecover) : idleAngle);
    const bend = activelyAiming
      ? 0
      : (releaseAgeMs <= 520 ? lerp(0, 0.22, easedRecover) : 0.22);
    const upperAngle = baseAngle - (sideSign * bend * 0.62);
    const forearmAngle = baseAngle + (sideSign * bend * 0.88);
    const elbow = {
      x: shoulder.x + (Math.cos(upperAngle) * WORLD.armUpperLength),
      y: shoulder.y + (Math.sin(upperAngle) * WORLD.armUpperLength),
    };
    const hand = activelyAiming
      ? resolveThrowHandPosition(player.x, player.y, player.side, aim)
      : {
          x: elbow.x + (Math.cos(forearmAngle) * WORLD.armForearmLength),
          y: elbow.y + (Math.sin(forearmAngle) * WORLD.armForearmLength),
        };
    const spinRate = observedCharging ? 0.036 : 0.006;
    return {
      shoulder,
      elbow,
      hand,
      gearAngle: (now * spinRate * sideSign) + (player.throwSeq * 0.85),
      chargeRatio,
      releaseProgress: easedRelease,
    };
  }

  private drawThrowingArm(player: PlayerView, pose: ArmPose, lightColor: number, aim: Vec2): void {
    const g = this.graphics;
    const armColor = player.connected ? lightColor : 0x94a3b8;
    const metalColor = 0xd8dee9;
    const heldAmmoType = player.sessionId === this.localSessionId ? this.selectedAmmo : player.selectedAmmo;
    const heldAmmo = getAmmoDefinition(heldAmmoType);

    g.lineStyle(10, armColor, player.connected ? 1 : 0.45);
    g.beginPath();
    g.moveTo(pose.shoulder.x, pose.shoulder.y);
    g.lineTo(pose.elbow.x, pose.elbow.y);
    g.strokePath();

    g.lineStyle(8, armColor, player.connected ? 0.94 : 0.42);
    g.beginPath();
    g.moveTo(pose.elbow.x, pose.elbow.y);
    g.lineTo(pose.hand.x, pose.hand.y);
    g.strokePath();

    g.fillStyle(metalColor, 0.95);
    g.fillCircle(pose.shoulder.x, pose.shoulder.y, 8);
    this.drawGear(pose.elbow, pose.gearAngle, pose.chargeRatio, player.connected);

    g.fillStyle(metalColor, 1);
    g.fillCircle(pose.hand.x, pose.hand.y, 6);
    this.drawAmmoLauncher(heldAmmoType, pose, aim, player.connected);

    if (player.charging || (player.sessionId === this.localSessionId && this.chargingStartedAtMs !== null)) {
      this.drawHeldAmmoChargeFx(heldAmmoType, pose.hand, aim, pose.chargeRatio);
      const renderedSprite = this.syncHeldAmmoSprite(
        heldAmmoType,
        pose.hand.x,
        pose.hand.y,
        Math.max(5, heldAmmo.radius),
        aim.x,
        aim.y,
        0.96,
      );
      if (!renderedSprite) {
        this.drawAmmoShape(
          heldAmmoType,
          pose.hand.x,
          pose.hand.y,
          Math.max(5, heldAmmo.radius),
          aim.x,
          aim.y,
          0.96,
        );
      }
    }

    if (pose.releaseProgress > 0) {
      g.lineStyle(3, COLORS.preview, 0.45 * (1 - pose.releaseProgress));
      g.strokeCircle(pose.elbow.x, pose.elbow.y, WORLD.elbowGearRadius + (pose.releaseProgress * 22));
    }
  }

  private drawAmmoLauncher(ammoType: AmmoType, pose: ArmPose, aim: Vec2, connected: boolean): void {
    const g = this.graphics;
    const fx = this.fxGraphics;
    const profile = AMMO_FX[ammoType];
    const alpha = connected ? 1 : 0.42;
    const direction = normalize(aim.x, aim.y, { x: 1, y: 0 });
    const normal = { x: -direction.y, y: direction.x };
    const time = performance.now();
    const pulse = 0.5 + (Math.sin(time * 0.012) * 0.5);
    const releaseBoost = pose.releaseProgress > 0 ? 1 - pose.releaseProgress : 0;
    const intensity = clamp01(0.2 + (pose.chargeRatio * 0.68) + (releaseBoost * 0.9) + (pulse * 0.1));
    const hand = pose.hand;

    if (ammoType === "javelin") {
      const back = pointAlong(hand, direction, -22);
      const front = pointAlong(hand, direction, 54);
      const tip = pointAlong(front, direction, 12);

      g.lineStyle(8, profile.shadow, 0.88 * alpha);
      g.beginPath();
      g.moveTo(back.x, back.y);
      g.lineTo(front.x, front.y);
      g.strokePath();

      for (const offset of [-5, 5]) {
        g.lineStyle(3, profile.core, 0.95 * alpha);
        g.beginPath();
        g.moveTo(back.x + (normal.x * offset), back.y + (normal.y * offset));
        g.lineTo(front.x + (normal.x * offset), front.y + (normal.y * offset));
        g.strokePath();
      }

      g.fillStyle(profile.hot, 0.95 * alpha);
      g.fillTriangle(
        tip.x,
        tip.y,
        front.x + (normal.x * 8),
        front.y + (normal.y * 8),
        front.x - (normal.x * 8),
        front.y - (normal.y * 8),
      );
      fx.lineStyle(10, profile.glow, (0.1 + (intensity * 0.24)) * alpha);
      fx.beginPath();
      fx.moveTo(back.x, back.y);
      fx.lineTo(tip.x, tip.y);
      fx.strokePath();
      fx.lineStyle(2, profile.hot, (0.35 + (intensity * 0.4)) * alpha);
      fx.strokeCircle(front.x, front.y, 8 + (pose.chargeRatio * 12));
      return;
    }

    if (ammoType === "shotput") {
      const back = pointAlong(hand, direction, -28);
      const front = pointAlong(hand, direction, 38);
      const boreRadius = 13 + (pose.chargeRatio * 5);

      g.lineStyle(24, 0x0f172a, 0.9 * alpha);
      g.beginPath();
      g.moveTo(back.x, back.y);
      g.lineTo(front.x, front.y);
      g.strokePath();
      g.lineStyle(17, profile.shadow, alpha);
      g.beginPath();
      g.moveTo(back.x, back.y);
      g.lineTo(front.x, front.y);
      g.strokePath();
      g.lineStyle(5, profile.core, 0.88 * alpha);
      g.beginPath();
      g.moveTo(back.x + (normal.x * 8), back.y + (normal.y * 8));
      g.lineTo(front.x + (normal.x * 8), front.y + (normal.y * 8));
      g.moveTo(back.x - (normal.x * 8), back.y - (normal.y * 8));
      g.lineTo(front.x - (normal.x * 8), front.y - (normal.y * 8));
      g.strokePath();
      g.fillStyle(0x020617, alpha);
      g.fillCircle(front.x, front.y, boreRadius);
      g.lineStyle(4, profile.hot, (0.7 + (pose.chargeRatio * 0.3)) * alpha);
      g.strokeCircle(front.x, front.y, boreRadius);

      fx.fillStyle(profile.glow, (0.08 + (intensity * 0.18)) * alpha);
      fx.fillCircle(front.x, front.y, 22 + (pose.chargeRatio * 24));
      for (let i = 0; i < 3; i += 1) {
        fx.lineStyle(2, i === 1 ? profile.hot : profile.glow, (0.18 + (intensity * 0.26)) * alpha * (1 - (i * 0.2)));
        fx.strokeCircle(front.x, front.y, boreRadius + 7 + (i * 9) + (pulse * 7));
      }
      return;
    }

    const hub = pointAlong(hand, direction, -12);
    const front = pointAlong(hand, direction, 42);
    const branchOffsets = [-11, 0, 11];

    g.fillStyle(0x052e2b, 0.9 * alpha);
    g.fillCircle(hub.x, hub.y, 13);
    g.lineStyle(4, profile.core, 0.92 * alpha);
    g.strokeCircle(hub.x, hub.y, 12);
    for (const offset of branchOffsets) {
      const tip = {
        x: front.x + (normal.x * offset),
        y: front.y + (normal.y * offset),
      };
      g.lineStyle(offset === 0 ? 7 : 5, offset === 0 ? profile.core : profile.accent, 0.94 * alpha);
      g.beginPath();
      g.moveTo(hub.x, hub.y);
      g.lineTo(tip.x, tip.y);
      g.strokePath();
      fx.lineStyle(offset === 0 ? 9 : 6, offset === 0 ? profile.glow : profile.spark, (0.09 + (intensity * 0.18)) * alpha);
      fx.beginPath();
      fx.moveTo(hub.x, hub.y);
      fx.lineTo(tip.x, tip.y);
      fx.strokePath();
      fx.fillStyle(offset === 0 ? profile.hot : profile.spark, (0.26 + (intensity * 0.36)) * alpha);
      fx.fillCircle(tip.x, tip.y, 4 + (pose.chargeRatio * 5));
    }

    for (let i = 0; i < 3; i += 1) {
      const orbit = (time * 0.004) + ((Math.PI * 2 * i) / 3);
      fx.fillStyle(i === 1 ? profile.spark : profile.hot, (0.22 + (intensity * 0.36)) * alpha);
      fx.fillCircle(
        hub.x + (Math.cos(orbit) * (16 + (pose.chargeRatio * 7))),
        hub.y + (Math.sin(orbit) * (16 + (pose.chargeRatio * 7))),
        2.5 + (pose.chargeRatio * 2.5),
      );
    }
  }

  private drawHeldAmmoChargeFx(ammoType: AmmoType, hand: Vec2, aim: Vec2, chargeRatio: number): void {
    const profile = AMMO_FX[ammoType];
    const fx = this.fxGraphics;
    const direction = normalize(aim.x, aim.y, { x: 1, y: 0 });
    const time = performance.now();
    const pulse = 0.5 + (Math.sin(time * 0.018) * 0.5);
    const radius = ammoType === "shotput" ? 24 : ammoType === "splitter" ? 20 : 16;

    fx.fillStyle(profile.glow, 0.1 + (chargeRatio * 0.2));
    fx.fillCircle(hand.x, hand.y, radius + (chargeRatio * 22) + (pulse * 5));
    fx.lineStyle(2, profile.hot, 0.32 + (chargeRatio * 0.42));
    fx.strokeCircle(hand.x, hand.y, radius + (chargeRatio * 18));
    this.drawEnergyParticles(
      ammoType,
      hand.x,
      hand.y,
      direction.x,
      direction.y,
      radius,
      0.75 + chargeRatio,
      0.88,
    );
  }

  private drawGear(center: Vec2, angle: number, chargeRatio: number, connected: boolean): void {
    const g = this.graphics;
    const radius = WORLD.elbowGearRadius;
    const alpha = connected ? 1 : 0.4;
    g.fillStyle(0x0f172a, 0.9 * alpha);
    g.fillCircle(center.x, center.y, radius + 3);
    g.lineStyle(3, COLORS.marker, alpha);
    g.strokeCircle(center.x, center.y, radius);
    g.lineStyle(2, COLORS.marker, Math.min(1, 0.45 + chargeRatio));
    for (let i = 0; i < 8; i += 1) {
      const spokeAngle = angle + ((Math.PI * 2 * i) / 8);
      g.beginPath();
      g.moveTo(
        center.x + (Math.cos(spokeAngle) * 3),
        center.y + (Math.sin(spokeAngle) * 3),
      );
      g.lineTo(
        center.x + (Math.cos(spokeAngle) * (radius + 7)),
        center.y + (Math.sin(spokeAngle) * (radius + 7)),
      );
      g.strokePath();
    }
  }

  private drawProjectiles(): void {
    const g = this.graphics;
    const activeProjectileIds = new Set<string>();

    for (const projectile of this.snapshot.projectiles) {
      activeProjectileIds.add(projectile.id);
      const alpha = projectile.alive ? 1 : 0.4;
      const color = colorForAmmo(projectile.ammoType);
      this.drawProjectileFx(
        projectile.ammoType,
        projectile.x,
        projectile.y,
        projectile.radius,
        projectile.vx,
        projectile.vy,
        alpha,
      );
      this.syncProjectileTrailSprite(projectile, alpha);
      g.lineStyle(projectile.ammoType === "javelin" ? 2 : 3, color, 0.28);
      g.beginPath();
      g.moveTo(projectile.x, projectile.y);
      g.lineTo(projectile.x - (projectile.vx * 0.045), projectile.y - (projectile.vy * 0.045));
      g.strokePath();
      if (!this.syncProjectileSprite(projectile, alpha)) {
        this.drawAmmoShape(
          projectile.ammoType,
          projectile.x,
          projectile.y,
          projectile.radius,
          projectile.vx,
          projectile.vy,
          alpha,
        );
      }
    }

    this.destroyInactiveProjectileSprites(activeProjectileIds);
  }

  private drawAmmoShape(
    ammoType: AmmoType,
    x: number,
    y: number,
    radius: number,
    vx: number,
    vy: number,
    alpha: number,
  ): void {
    const g = this.graphics;
    const fx = this.fxGraphics;
    const color = colorForAmmo(ammoType);
    const profile = AMMO_FX[ammoType];
    const angle = Math.atan2(vy, vx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    if (ammoType === "javelin") {
      const length = Math.max(28, radius * 7);
      const backX = x - (cos * length * 0.46);
      const backY = y - (sin * length * 0.46);
      const tipX = x + (cos * length * 0.54);
      const tipY = y + (sin * length * 0.54);
      const wingX = x - (cos * length * 0.18);
      const wingY = y - (sin * length * 0.18);
      fx.lineStyle(Math.max(8, radius * 2.3), profile.glow, alpha * 0.18);
      fx.beginPath();
      fx.moveTo(backX, backY);
      fx.lineTo(tipX, tipY);
      fx.strokePath();
      fx.fillStyle(profile.hot, alpha * 0.52);
      fx.fillCircle(tipX, tipY, Math.max(5, radius * 1.7));
      g.lineStyle(Math.max(3, radius * 0.7), color, alpha);
      g.beginPath();
      g.moveTo(backX, backY);
      g.lineTo(tipX, tipY);
      g.strokePath();
      g.fillStyle(0xfef3c7, alpha);
      g.fillTriangle(
        tipX,
        tipY,
        wingX + (-sin * radius * 1.6),
        wingY + (cos * radius * 1.6),
        wingX + (sin * radius * 1.6),
        wingY + (-cos * radius * 1.6),
      );
      return;
    }

    if (ammoType === "shotput") {
      fx.fillStyle(profile.glow, alpha * 0.14);
      fx.fillCircle(x, y, radius * 2.55);
      fx.lineStyle(2, profile.hot, alpha * 0.26);
      fx.strokeCircle(x, y, radius * 1.72);
      g.fillStyle(color, alpha);
      g.fillCircle(x, y, radius);
      g.lineStyle(3, 0x475569, alpha * 0.7);
      g.strokeCircle(x, y, radius);
      g.fillStyle(0xffffff, alpha * 0.5);
      g.fillCircle(x - (radius * 0.32), y - (radius * 0.36), Math.max(2, radius * 0.24));
      return;
    }

    fx.fillStyle(profile.glow, alpha * 0.16);
    fx.fillCircle(x, y, radius * 2.3);
    fx.lineStyle(2, profile.spark, alpha * 0.36);
    fx.strokeCircle(x, y, radius * 1.75);
    g.fillStyle(color, alpha);
    g.fillCircle(x, y, radius);
    g.lineStyle(2, 0xecfdf5, alpha * 0.78);
    g.strokeCircle(x, y, radius + 1);
    for (let i = 0; i < 3; i += 1) {
      const spoke = angle + ((Math.PI * 2 * i) / 3);
      g.lineStyle(2, 0x064e3b, alpha * 0.7);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.cos(spoke) * radius * 0.9), y + (Math.sin(spoke) * radius * 0.9));
      g.strokePath();
    }
  }

  private drawProjectileFx(
    ammoType: AmmoType,
    x: number,
    y: number,
    radius: number,
    vx: number,
    vy: number,
    alpha: number,
  ): void {
    const fx = this.fxGraphics;
    const profile = AMMO_FX[ammoType];
    const direction = normalize(vx, vy, { x: 1, y: 0 });
    const speedRatio = clamp01(Math.hypot(vx, vy) / 1120);
    const normal = { x: -direction.y, y: direction.x };
    const trail = Math.max(radius * 3, 28 + (speedRatio * 62));
    const tail = pointAlong({ x, y }, direction, -trail);
    const time = performance.now();
    const pulse = 0.5 + (Math.sin(time * 0.018) * 0.5);

    if (ammoType === "javelin") {
      fx.lineStyle(Math.max(9, radius * 3), profile.glow, alpha * (0.18 + (speedRatio * 0.16)));
      fx.beginPath();
      fx.moveTo(x, y);
      fx.lineTo(tail.x, tail.y);
      fx.strokePath();
      fx.lineStyle(Math.max(3, radius * 0.9), profile.hot, alpha * (0.38 + (speedRatio * 0.24)));
      fx.beginPath();
      fx.moveTo(x, y);
      fx.lineTo(
        tail.x + (normal.x * Math.sin(time * 0.016) * 5),
        tail.y + (normal.y * Math.sin(time * 0.016) * 5),
      );
      fx.strokePath();
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.8 + speedRatio, alpha);
      return;
    }

    if (ammoType === "shotput") {
      fx.fillStyle(profile.glow, alpha * (0.12 + (speedRatio * 0.14)));
      fx.fillCircle(x, y, radius * (2.2 + (speedRatio * 0.8)));
      fx.lineStyle(3, profile.hot, alpha * (0.22 + (pulse * 0.28)));
      fx.strokeCircle(x, y, radius * (1.6 + (speedRatio * 0.8)));
      fx.lineStyle(5, profile.spark, alpha * 0.18);
      fx.beginPath();
      fx.moveTo(x - (direction.x * radius * 0.6), y - (direction.y * radius * 0.6));
      fx.lineTo(tail.x, tail.y);
      fx.strokePath();
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.72 + (speedRatio * 0.82), alpha);
      return;
    }

    fx.fillStyle(profile.glow, alpha * (0.12 + (pulse * 0.08)));
    fx.fillCircle(x, y, radius * (2.5 + (speedRatio * 0.7)));
    for (let i = 0; i < 3; i += 1) {
      const angle = (time * 0.008) + ((Math.PI * 2 * i) / 3);
      const orbit = radius * (2.1 + (speedRatio * 0.7));
      fx.fillStyle(i === 1 ? profile.spark : profile.hot, alpha * 0.38);
      fx.fillCircle(x + (Math.cos(angle) * orbit), y + (Math.sin(angle) * orbit), Math.max(2, radius * 0.32));
      fx.lineStyle(2, i === 1 ? profile.spark : profile.accent, alpha * 0.26);
      fx.beginPath();
      fx.moveTo(x, y);
      fx.lineTo(x + (Math.cos(angle) * orbit), y + (Math.sin(angle) * orbit));
      fx.strokePath();
    }
    this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.9 + speedRatio, alpha);
  }

  private drawEnergyParticles(
    ammoType: AmmoType,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    intensity: number,
    alpha: number,
  ): void {
    const fx = this.fxGraphics;
    const profile = AMMO_FX[ammoType];
    const direction = normalize(vx, vy, { x: 1, y: 0 });
    const baseAngle = Math.atan2(direction.y, direction.x);
    const count = Math.max(4, Math.round(profile.particleCount * clamp01(intensity)));
    const time = performance.now() * 0.003;
    const spreadScale = ammoType === "splitter" ? 1.35 : ammoType === "shotput" ? 1.05 : 0.72;
    const tailLength = Math.max(radius * 3, ammoType === "javelin" ? 70 : ammoType === "shotput" ? 46 : 54);

    for (let i = 0; i < count; i += 1) {
      const seed = (i + 1) * (ammoType === "javelin" ? 13.7 : ammoType === "shotput" ? 19.3 : 23.9);
      const phase = fract((time * (ammoType === "shotput" ? 0.7 : 1.1)) + pseudoRandom(seed));
      const spread = (pseudoRandom(seed + 5.1) - 0.5) * spreadScale;
      const angle = baseAngle + Math.PI + spread;
      const distance = radius + (phase * tailLength * (0.65 + clamp01(intensity)));
      const particleX = x + (Math.cos(angle) * distance);
      const particleY = y + (Math.sin(angle) * distance);
      const lineLength = 5 + (pseudoRandom(seed + 11.2) * 18 * clamp01(intensity));
      const particleAlpha = alpha * (1 - phase) * (0.3 + (0.55 * clamp01(intensity)));
      const color = i % 4 === 0 ? profile.hot : i % 3 === 0 ? profile.spark : profile.glow;

      fx.lineStyle(ammoType === "shotput" ? 3 : 2, color, particleAlpha);
      fx.beginPath();
      fx.moveTo(particleX, particleY);
      fx.lineTo(particleX + (Math.cos(angle) * lineLength), particleY + (Math.sin(angle) * lineLength));
      fx.strokePath();
      fx.fillStyle(color, particleAlpha * 0.86);
      fx.fillCircle(particleX, particleY, ammoType === "splitter" ? 2.8 : 2.2);
    }
  }

  private drawImpactFx(): void {
    const now = performance.now();
    const g = this.graphics;
    const fx = this.fxGraphics;

    for (let index = this.impactFx.length - 1; index >= 0; index -= 1) {
      const impact = this.impactFx[index];
      if (!impact) continue;
      const age = now - impact.startedAtMs;
      const progress = clamp01(age / (impact.ammoType === "shotput" ? 760 : 660));
      const inverse = 1 - progress;
      const profile = AMMO_FX[impact.ammoType];
      const ease = easeOutCubic(progress);
      const baseScale = impact.ammoType === "shotput" ? 0.52 : impact.ammoType === "splitter" ? 0.36 : 0.3;
      const strength = impact.strength;

      if (progress >= 1) {
        for (const sprite of impact.sprites) sprite.destroy();
        this.impactFx.splice(index, 1);
        continue;
      }

      impact.sprites.forEach((sprite, spriteIndex) => {
        const spriteScale = baseScale + (ease * strength * (impact.ammoType === "shotput" ? 0.72 : 0.46)) + (spriteIndex * 0.08);
        sprite
          .setPosition(
            impact.x + (spriteIndex > 1 ? Math.cos((now * 0.012) + spriteIndex) * 24 * ease : 0),
            impact.y + (spriteIndex > 1 ? Math.sin((now * 0.01) + spriteIndex) * 16 * ease : 0),
          )
          .setScale(spriteScale)
          .setRotation((now * 0.002 * (spriteIndex + 1)) + (spriteIndex * 0.7))
          .setAlpha(Math.max(0, inverse * (spriteIndex === 1 ? 0.5 : 0.84)));
      });

      fx.lineStyle(4 + (impact.radius * 0.1), profile.hot, inverse * 0.58);
      fx.strokeCircle(impact.x, impact.y, 20 + (ease * strength * (impact.radius * 5 + 82)));
      fx.lineStyle(2, profile.glow, inverse * 0.38);
      fx.strokeCircle(impact.x, impact.y, 9 + (ease * strength * (impact.radius * 3.5 + 42)));

      if (impact.ammoType === "javelin") {
        fx.lineStyle(4, profile.spark, inverse * 0.46);
        fx.beginPath();
        fx.moveTo(impact.x - 44 - (ease * strength * 28), impact.y + 8);
        fx.lineTo(impact.x + 44 + (ease * strength * 28), impact.y - 8);
        fx.strokePath();
      } else if (impact.ammoType === "shotput") {
        g.lineStyle(4, 0xffffff, inverse * 0.3);
        g.strokeCircle(impact.x, impact.y, 30 + (ease * strength * 110));
        fx.lineStyle(6, profile.spark, inverse * 0.18);
        fx.strokeCircle(impact.x, impact.y, 44 + (ease * strength * 150));
        fx.fillStyle(profile.glow, inverse * 0.11);
        fx.fillCircle(impact.x, impact.y, 38 + (ease * strength * 96));
        for (let i = 0; i < 10; i += 1) {
          const angle = (-Math.PI * 0.92) + ((Math.PI * 1.84 * i) / 9);
          const distance = 30 + (ease * strength * (70 + (i % 3) * 18));
          const sparkX = impact.x + (Math.cos(angle) * distance);
          const sparkY = impact.y + (Math.sin(angle) * distance * 0.74);
          fx.lineStyle(i % 2 === 0 ? 3 : 2, i % 2 === 0 ? profile.hot : profile.spark, inverse * 0.48);
          fx.beginPath();
          fx.moveTo(impact.x + (Math.cos(angle) * 16), impact.y + (Math.sin(angle) * 10));
          fx.lineTo(sparkX, sparkY);
          fx.strokePath();
          fx.fillStyle(profile.shadow, inverse * 0.22);
          fx.fillCircle(sparkX, sparkY + (ease * 12), 4.5 + (inverse * 3));
        }
      } else {
        for (let i = 0; i < 7; i += 1) {
          const angle = (Math.PI * 2 * i) / 7;
          const distance = 22 + (ease * strength * 74);
          const dotX = impact.x + (Math.cos(angle) * distance);
          const dotY = impact.y + (Math.sin(angle) * distance);
          fx.fillStyle(i % 2 === 0 ? profile.spark : profile.accent, inverse * 0.62);
          fx.fillCircle(dotX, dotY, 3.5 + (inverse * 2));
        }
      }
    }
  }

  private drawAimPreview(): void {
    const player = this.getLocalPlayer();
    if (!player || this.snapshot.roundState !== "active") return;

    const startedAtMs = this.chargingStartedAtMs;
    const isCharging = startedAtMs !== null;
    const chargeMs = isCharging ? performance.now() - startedAtMs : 700;
    const ammo = getAmmoDefinition(this.selectedAmmo);
    const hand = resolveThrowHandPosition(player.x, player.y, player.side, this.pointerAim);
    const velocity = buildLaunchVelocity(ammo, chargeMs, this.pointerAim);
    const points = predictTrajectory(
      {
        x: hand.x,
        y: hand.y,
        vx: velocity.x,
        vy: velocity.y,
        radius: ammo.radius,
      },
      buildProjectilePhysicsProfile(ammo.gravityScale, ammo.dragPerSecond),
      isCharging ? 62 : 32,
      1 / 34,
    );

    const g = this.graphics;
    const ratio = resolveChargeRatio(chargeMs);
    g.lineStyle(2, COLORS.preview, isCharging ? 0.8 : 0.35);
    for (let i = 0; i < points.length; i += 3) {
      const point = points[i];
      if (!point) continue;
      g.fillStyle(COLORS.preview, isCharging ? 0.25 + (ratio * 0.5) : 0.25);
      g.fillCircle(point.x, point.y, 3);
    }

    if (isCharging) {
      this.drawAimPullGuide(hand, ratio);
      this.drawAimChargePreview(this.selectedAmmo, hand, this.pointerAim, ratio);
      g.lineStyle(5, colorForAmmo(this.selectedAmmo), 0.85);
      g.beginPath();
      g.moveTo(hand.x, hand.y);
      g.lineTo(hand.x + (this.pointerAim.x * (50 + (ratio * 50))), hand.y + (this.pointerAim.y * (50 + (ratio * 50))));
      g.strokePath();
    }
  }

  private drawAimChargePreview(ammoType: AmmoType, hand: Vec2, aim: Vec2, chargeRatio: number): void {
    const fx = this.fxGraphics;
    const profile = AMMO_FX[ammoType];
    const direction = normalize(aim.x, aim.y, { x: 1, y: 0 });
    const normal = { x: -direction.y, y: direction.x };
    const reach = 72 + (chargeRatio * 74);
    const end = pointAlong(hand, direction, reach);
    const time = performance.now();
    const wobble = Math.sin(time * 0.018) * (ammoType === "splitter" ? 12 : 5);

    fx.lineStyle(ammoType === "shotput" ? 14 : 8, profile.glow, 0.12 + (chargeRatio * 0.18));
    fx.beginPath();
    fx.moveTo(hand.x, hand.y);
    fx.lineTo(end.x, end.y);
    fx.strokePath();
    fx.lineStyle(ammoType === "javelin" ? 3 : 2, profile.hot, 0.32 + (chargeRatio * 0.38));
    fx.beginPath();
    fx.moveTo(hand.x + (normal.x * wobble), hand.y + (normal.y * wobble));
    fx.lineTo(end.x - (normal.x * wobble), end.y - (normal.y * wobble));
    fx.strokePath();
    fx.fillStyle(profile.hot, 0.24 + (chargeRatio * 0.36));
    fx.fillCircle(end.x, end.y, ammoType === "shotput" ? 10 + (chargeRatio * 11) : 6 + (chargeRatio * 8));
    this.drawEnergyParticles(ammoType, end.x, end.y, direction.x, direction.y, 14, 0.8 + chargeRatio, 0.82);
  }

  private drawAimPullGuide(hand: Vec2, chargeRatio: number): void {
    if (!this.aimDragStartWorld || !this.aimDragCurrentWorld) return;
    const pullDistance = Math.min(120, Math.hypot(
      this.aimDragCurrentWorld.x - this.aimDragStartWorld.x,
      this.aimDragCurrentWorld.y - this.aimDragStartWorld.y,
    ));
    const guideAlpha = 0.18 + (chargeRatio * 0.26);
    const anchor = pointAlong(hand, this.pointerAim, -Math.max(24, pullDistance * 0.45));

    const fx = this.fxGraphics;
    fx.lineStyle(3, COLORS.preview, guideAlpha);
    fx.beginPath();
    fx.moveTo(anchor.x, anchor.y);
    fx.lineTo(hand.x, hand.y);
    fx.strokePath();
    fx.fillStyle(COLORS.preview, guideAlpha + 0.08);
    fx.fillCircle(anchor.x, anchor.y, 5 + (chargeRatio * 3));
  }

  private createFixtureSprites(): void {
    if (!this.textures.exists(SPRITE_ATLAS_KEY)) return;

    this.fixtureSpritesById.set(
      "left-field-flag",
      this.add.image(0, 0, SPRITE_ATLAS_KEY, SPRITES.props.flagBlue).setOrigin(0.24, 1).setDepth(12),
    );
    this.fixtureSpritesById.set(
      "right-field-flag",
      this.add.image(0, 0, SPRITE_ATLAS_KEY, SPRITES.props.flagRed).setOrigin(0.24, 1).setDepth(12),
    );
    this.fixtureSpritesById.set(
      "low-center-barrier",
      this.add.image(0, 0, SPRITE_ATLAS_KEY, SPRITES.props.barrierStriped).setOrigin(0.5, 1).setDepth(12),
    );
  }

  private createArenaDecorSprites(): void {
    if (!this.textures.exists(SPRITE_ATLAS_KEY)) return;
    for (const item of ARENA_DECOR_LAYOUT) {
      this.arenaDecorSprites.push(
        this.add
          .image(item.x, item.y, SPRITE_ATLAS_KEY, item.frame)
          .setOrigin(0.5, 1)
          .setScale(item.scale)
          .setAlpha(item.alpha)
          .setDepth(item.depth),
      );
    }
  }

  private updateArenaDecorSprites(time: number): void {
    this.arenaDecorSprites.forEach((sprite, index) => {
      const config = ARENA_DECOR_LAYOUT[index];
      if (!config) return;
      const wave = Math.sin((time * 0.0011) + config.phase);
      const flutter = Math.sin((time * 0.0024) + (config.phase * 1.7));
      const originY = sprite.getData("originY");
      const baseY = typeof originY === "number" ? originY : sprite.y;
      sprite
        .setY(baseY + (wave * config.bob))
        .setRotation(flutter * config.sway * 0.0009);
    });
  }

  private applyArenaDecorLayout(seedSource: string): void {
    if (this.arenaDecorSprites.length === 0) return;
    const seed = hashText(seedSource);
    const jitter = (index: number, amount: number): number => (seededUnit(index, seed) - 0.5) * amount;
    const layout = [
      { x: WORLD.width / 2 + jitter(1, 150), y: 112 + jitter(2, 18), scale: 1.02 + (seededUnit(3, seed) * 0.24), alpha: 0.5 },
      { x: WORLD.width / 2 + jitter(4, 190), y: 270 + jitter(5, 36), scale: 0.58 + (seededUnit(6, seed) * 0.16), alpha: 0.58 },
      { x: 136 + jitter(7, 52), y: WORLD.groundY - 66 + jitter(8, 12), scale: 0.62 + (seededUnit(9, seed) * 0.13), alpha: 0.9 },
      { x: 72 + jitter(10, 32), y: WORLD.groundY - 42 + jitter(11, 8), scale: 0.52 + (seededUnit(12, seed) * 0.1), alpha: 0.76 },
      { x: 312 + jitter(13, 62), y: WORLD.groundY - 70 + jitter(14, 12), scale: 0.48 + (seededUnit(15, seed) * 0.14), alpha: 0.84 },
      { x: WORLD.width / 2 - 336 + jitter(16, 48), y: WORLD.groundY - 66 + jitter(17, 10), scale: 0.48 + (seededUnit(18, seed) * 0.1), alpha: 0.72 },
      { x: WORLD.width / 2 + 336 + jitter(19, 48), y: WORLD.groundY - 66 + jitter(20, 10), scale: 0.48 + (seededUnit(21, seed) * 0.1), alpha: 0.72 },
      { x: WORLD.width - 334 + jitter(22, 70), y: WORLD.groundY - 68 + jitter(23, 14), scale: 0.48 + (seededUnit(24, seed) * 0.14), alpha: 0.84 },
      { x: WORLD.width - 142 + jitter(25, 62), y: WORLD.groundY - 52 + jitter(26, 12), scale: 0.5 + (seededUnit(27, seed) * 0.12), alpha: 0.8 },
      { x: WORLD.width - 72 + jitter(28, 32), y: WORLD.groundY - 42 + jitter(29, 8), scale: 0.52 + (seededUnit(30, seed) * 0.1), alpha: 0.76 },
    ];

    this.arenaDecorSprites.forEach((sprite, index) => {
      const item = layout[index];
      if (!item) return;
      sprite
        .setPosition(item.x, item.y)
        .setScale(item.scale)
        .setAlpha(item.alpha);
      sprite.setData("originY", item.y);
    });
  }

  private syncFixtureSprite(sprite: Phaser.GameObjects.Image, fixture: CourtFixture): void {
    const frameWidth = Math.max(1, sprite.frame.width);
    const frameHeight = Math.max(1, sprite.frame.height);
    const bottomY = fixture.y + fixture.height;

    if (fixture.id.includes("flag")) {
      const scale = fixture.height / frameHeight;
      sprite
        .setPosition(fixture.x + (fixture.width / 2), bottomY)
        .setScale(scale)
        .setAlpha(fixture.collidable ? 1 : 0.45)
        .setVisible(true);
      return;
    }

    const scale = fixture.width / frameWidth;
    sprite
      .setPosition(fixture.x + (fixture.width / 2), bottomY)
      .setScale(scale)
      .setAlpha(fixture.collidable ? 1 : 0.45)
      .setVisible(true);
  }

  private syncHeldAmmoSprite(
    ammoType: AmmoType,
    x: number,
    y: number,
    radius: number,
    vx: number,
    vy: number,
    alpha: number,
  ): boolean {
    if (!this.heldAmmoSprite || !this.textures.exists(SPRITE_ATLAS_KEY)) return false;
    this.syncAmmoSprite(this.heldAmmoSprite, ammoType, x, y, radius, vx, vy, alpha);
    this.heldAmmoSprite.setDepth(26);
    return true;
  }

  private syncProjectileSprite(projectile: ProjectileView, alpha: number): boolean {
    if (!this.textures.exists(SPRITE_ATLAS_KEY)) return false;

    let sprite = this.projectileSpritesById.get(projectile.id);
    if (!sprite) {
      sprite = this.add
        .image(projectile.x, projectile.y, SPRITE_ATLAS_KEY, AMMO_SPRITE_FRAMES[projectile.ammoType])
        .setOrigin(0.5)
        .setDepth(24);
      this.projectileSpritesById.set(projectile.id, sprite);
    }

    this.syncAmmoSprite(
      sprite,
      projectile.ammoType,
      projectile.x,
      projectile.y,
      projectile.radius,
      projectile.vx,
      projectile.vy,
      alpha,
    );
    return true;
  }

  private syncProjectileTrailSprite(projectile: ProjectileView, alpha: number): void {
    if (!this.textures.exists(SPRITE_ATLAS_KEY)) return;
    const frame = AMMO_FX_FRAMES[projectile.ammoType].trail;
    const direction = normalize(projectile.vx, projectile.vy, { x: 1, y: 0 });
    const distance = Math.max(24, projectile.radius * 3.2);
    let sprite = this.projectileTrailSpritesById.get(projectile.id);
    if (!sprite) {
      sprite = this.add
        .image(projectile.x, projectile.y, SPRITE_ATLAS_KEY, frame)
        .setOrigin(0.75, 0.5)
        .setDepth(23)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.projectileTrailSpritesById.set(projectile.id, sprite);
    }

    sprite
      .setTexture(SPRITE_ATLAS_KEY, frame)
      .setPosition(projectile.x - (direction.x * distance), projectile.y - (direction.y * distance))
      .setRotation(Math.atan2(projectile.vy, projectile.vx))
      .setScale(projectile.ammoType === "shotput" ? 0.62 : projectile.ammoType === "splitter" ? 0.52 : 0.72)
      .setAlpha(alpha * 0.68)
      .setVisible(true);
  }

  private syncAmmoSprite(
    sprite: Phaser.GameObjects.Image,
    ammoType: AmmoType,
    x: number,
    y: number,
    radius: number,
    vx: number,
    vy: number,
    alpha: number,
  ): void {
    sprite.setTexture(SPRITE_ATLAS_KEY, AMMO_SPRITE_FRAMES[ammoType]);
    const targetSize = this.resolveAmmoSpriteSize(ammoType, radius);
    const largestFrameSide = Math.max(1, sprite.frame.width, sprite.frame.height);
    const velocityAngle = Math.atan2(vy, vx);
    const rotation = ammoType === "javelin" ? velocityAngle + (Math.PI / 4) : performance.now() * 0.0025;

    sprite
      .setPosition(x, y)
      .setScale(targetSize / largestFrameSide)
      .setRotation(rotation)
      .setAlpha(alpha)
      .setVisible(true);
  }

  private resolveAmmoSpriteSize(ammoType: AmmoType, radius: number): number {
    if (ammoType === "javelin") return Math.max(52, radius * 13);
    if (ammoType === "shotput") return Math.max(30, radius * 2.45);
    return Math.max(32, radius * 4.1);
  }

  private destroyInactiveProjectileSprites(activeProjectileIds: Set<string>): void {
    for (const [projectileId, sprite] of this.projectileSpritesById.entries()) {
      if (activeProjectileIds.has(projectileId)) continue;
      sprite.destroy();
      this.projectileSpritesById.delete(projectileId);
    }
    for (const [projectileId, sprite] of this.projectileTrailSpritesById.entries()) {
      if (activeProjectileIds.has(projectileId)) continue;
      sprite.destroy();
      this.projectileTrailSpritesById.delete(projectileId);
    }
  }
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);
const easeOutCubic = (value: number): number => 1 - Math.pow(1 - clamp01(value), 3);
const fract = (value: number): number => value - Math.floor(value);
const pseudoRandom = (seed: number): number => fract(Math.sin(seed * 12.9898) * 43758.5453);
const hashText = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const seededUnit = (index: number, seed: number): number => {
  let value = Math.imul((index + 0x9e3779b9) ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
};
const rgbFromHex = (color: number): { r: number; g: number; b: number } => ({
  r: (color >> 16) & 0xff,
  g: (color >> 8) & 0xff,
  b: color & 0xff,
});
const pointAlong = (origin: Vec2, direction: Vec2, distance: number): Vec2 => ({
  x: origin.x + (direction.x * distance),
  y: origin.y + (direction.y * distance),
});
