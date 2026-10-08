import Phaser from "phaser";
import { getAmmoDefinition, type AmmoDefinition } from "../../../shared/game/ammo";
import { buildProjectilePhysicsProfile, type ProjectileCollider } from "../../../shared/game/ballistics";
import { COURT_FIXTURES } from "../../../shared/game/fixtures";
import { CHARGE, MOVEMENT, SIDE_SIGN, WIND, WORLD, WORLD_PROPS } from "../../../shared/game/constants";
import {
  buildLaunchVelocity,
  buildTankHitbox,
  circleIntersectsRect,
  clamp,
  normalize,
  predictTrajectory,
  resolveChargeRatio,
  resolveShoulderPosition,
  resolveThrowHandPosition,
} from "../../../shared/game/math";
import type { AmmoType, CourtFixture, Side, Vec2 } from "../../../shared/game/types";
import { ProceduralBackground } from "./ProceduralBackground";
import { BattleSpectacle } from "./BattleSpectacle";
import { readArenaTheme } from "./arenaTheme";
import { VehicleRenderer } from "./VehicleRenderer";
import { resolvePointerAim, resolveSlingshotPullAnchor } from "./aim";
import {
  AMMO_FX_FRAMES,
  AMMO_SPRITE_FRAMES,
  PICKUP_FRAMES,
  SPRITE_ATLAS_KEY,
  SPRITES,
  WORLD_PROP_FRAMES,
  spriteAtlasImageUrl,
  spriteAtlasJsonUrl,
} from "./spriteAtlas";
import {
  generateTerrainLane,
  getTerrainY,
  type TerrainLane,
  type TerrainSegment,
} from "../../../shared/game/terrain";
import type { GameSnapshot, PickupView, PlayerView, ProjectileView, WorldPropView } from "./viewModel";
import { EMPTY_SNAPSHOT } from "./viewModel";

type GameSceneCallbacks = {
  chargeStart: () => void;
  chargeCancel: () => void;
  throwRelease: (aim: Vec2) => void;
};

export type CameraViewMode = "follow" | "overview" | "free";

export type CameraViewState = {
  mode: CameraViewMode;
  zoom: number;
};

export type CameraZoomAnchor = {
  clientX: number;
  clientY: number;
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
  vx: number;
  vy: number;
  radius: number;
  strength: number;
  startedAtMs: number;
  sprites: Phaser.GameObjects.Image[];
};

type CombatText = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: number;
  startedAtMs: number;
  driftX: number;
  label: Phaser.GameObjects.Text;
};

type DashBurst = {
  id: string;
  side: Side;
  direction: -1 | 1;
  x: number;
  y: number;
  startedAtMs: number;
};

type AimDiagnosticState = {
  charging: boolean;
  aimX: number;
  aimY: number;
  pullAnchorDx: number;
  pullAnchorDy: number;
  previewActive: boolean;
  landingX: number;
  landingY: number;
  targetDistance: number;
  targetDangerRadius: number;
  targetWillHit: boolean;
  propDistance: number;
  propWillHit: boolean;
  propType: WorldPropView["type"] | "";
};

type AimPreviewDiagnosticState = Pick<
  AimDiagnosticState,
  | "previewActive"
  | "landingX"
  | "landingY"
  | "targetDistance"
  | "targetDangerRadius"
  | "targetWillHit"
  | "propDistance"
  | "propWillHit"
  | "propType"
>;

type AimPreviewPropTarget = {
  prop: WorldPropView | null;
  distance: number;
  willHit: boolean;
};

type ProjectileCameraFocus = Vec2 & {
  projectileId: string;
  blend: number;
};

type FreeCameraDrag = {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startScrollX: number;
  startScrollY: number;
};

type TankSpriteSet = {
  shadow: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  pilot: Phaser.GameObjects.Image;
};

type PlayerRenderState = {
  x: number;
  y: number;
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

const CAMERA_ZOOM = {
  min: 0.42,
  overviewMin: 0.28,
  overviewMax: 0.72,
  followMax: 1.18,
  freeMax: 1.65,
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
    core: 0xcbd5e1,
    glow: 0xfbbf24,
    hot: 0xffffff,
    shadow: 0x334155,
    spark: 0xf97316,
    accent: 0x64748b,
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
  discus: {
    core: COLORS.blueLight,
    glow: 0xbfdbfe,
    hot: 0xffffff,
    shadow: 0x1e3a8a,
    spark: 0x60a5fa,
    accent: COLORS.javelin,
    particleCount: 8,
  },
  mortar: {
    core: 0xfb923c,
    glow: 0xfed7aa,
    hot: 0xffffff,
    shadow: 0x7c2d12,
    spark: COLORS.flagRed,
    accent: COLORS.shotput,
    particleCount: 12,
  },
  needle: {
    core: 0xfef08a,
    glow: 0xfef9c3,
    hot: 0xffffff,
    shadow: 0x713f12,
    spark: 0x22d3ee,
    accent: COLORS.blueLight,
    particleCount: 7,
  },
  cluster: {
    core: 0xfb923c,
    glow: 0xfed7aa,
    hot: 0xffffff,
    shadow: 0x7c2d12,
    spark: 0xfacc15,
    accent: 0xef4444,
    particleCount: 12,
  },
  anvil: {
    core: 0xcbd5e1,
    glow: 0x93c5fd,
    hot: 0xffffff,
    shadow: 0x1f2937,
    spark: 0xf97316,
    accent: COLORS.flagRed,
    particleCount: 10,
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
  private staticGraphics!: Phaser.GameObjects.Graphics;
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
  private readonly pickupSpritesById = new Map<string, Phaser.GameObjects.Image>();
  private readonly worldPropSpritesById = new Map<string, Phaser.GameObjects.Image>();
  private readonly tankSpritesBySessionId = new Map<string, TankSpriteSet>();
  private readonly playerRenderStateBySessionId = new Map<string, PlayerRenderState>();
  private readonly lastProjectilesById = new Map<string, ProjectileView>();
  private readonly lastHpBySessionId = new Map<string, number>();
  private readonly lastShieldBySessionId = new Map<string, number>();
  private readonly lastPickupSeqBySessionId = new Map<string, number>();
  private readonly lastDashSeqBySessionId = new Map<string, number>();
  private readonly impactFx: ImpactFx[] = [];
  private readonly combatTexts: CombatText[] = [];
  private readonly dashBursts: DashBurst[] = [];
  private readonly arenaDecorSprites: Phaser.GameObjects.Image[] = [];
  private windAimCueVisible = false;
  private windRibbonCount = 0;
  private aimPreviewDiagnostic: AimPreviewDiagnosticState = {
    previewActive: false,
    landingX: 0,
    landingY: 0,
    targetDistance: 0,
    targetDangerRadius: 0,
    targetWillHit: false,
    propDistance: 0,
    propWillHit: false,
    propType: "",
  };
  private environmentKey = "";
  private terrainKey = "";
  private staticWorldKey = "";
  private terrainLane: TerrainLane = generateTerrainLane("Lobbers");
  private cameraViewMode: CameraViewMode = "follow";
  private followZoom = 1;
  private freeCameraZoom = 1;
  private freeCameraDrag: FreeCameraDrag | null = null;
  private localProjectileCameraFocus: ProjectileCameraFocus | null = null;
  private cameraVignette: Phaser.FX.Vignette | null = null;
  private cameraColorMatrix: Phaser.FX.ColorMatrix | null = null;
  private heldAmmoSprite: Phaser.GameObjects.Image | null = null;
  private spectacle: BattleSpectacle | null = null;
  private readonly vehicleRenderer = new VehicleRenderer();
  private vehicleEffects: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super("GameScene");
  }

  preload(): void {
    this.load.atlas(SPRITE_ATLAS_KEY, spriteAtlasImageUrl, spriteAtlasJsonUrl);
  }

  create(): void {
    this.background = new ProceduralBackground(this);
    this.background.create();
    this.spectacle = new BattleSpectacle(this);
    this.vehicleEffects = this.add.graphics().setDepth(29);
    const repaintArena = () => { this.staticWorldKey = ""; this.rebuildStaticWorldIfNeeded(); };
    window.addEventListener("lobbers:arena", repaintArena);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("lobbers:arena", repaintArena));
    this.installCameraPostFx();
    this.staticGraphics = this.add.graphics().setDepth(9);
    this.graphics = this.add.graphics().setDepth(18);
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
    const cancelInterruptedInput = () => {
      this.freeCameraDrag = null;
      this.cancelCharge();
    };
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, cancelInterruptedInput);
    this.game.events.on(Phaser.Core.Events.BLUR, cancelInterruptedInput);
    this.game.events.on(Phaser.Core.Events.HIDDEN, cancelInterruptedInput);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      cancelInterruptedInput();
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, cancelInterruptedInput);
      this.game.events.off(Phaser.Core.Events.BLUR, cancelInterruptedInput);
      this.game.events.off(Phaser.Core.Events.HIDDEN, cancelInterruptedInput);
    });
    this.rebuildStaticWorld();
  }

  override update(time: number): void {
    this.background.update(time);
    this.updateCameraForLocalPlayer();
    this.updateCameraPostFx(time);
    this.updateArenaDecorSprites(time);
    this.draw();
    this.spectacle?.update();
    if (this.vehicleEffects) this.vehicleRenderer.drawEffects(this.vehicleEffects);
    this.publishDiagnostics();
  }

  setCallbacks(callbacks: GameSceneCallbacks): void {
    this.callbacks = callbacks;
  }

  setSnapshot(snapshot: GameSnapshot): void {
    this.updateEnvironment(snapshot);
    this.updateTerrain(snapshot);
    this.trackThrowAnimations(snapshot);
    this.trackImpactFx(snapshot);
    this.spectacle?.observe(snapshot, this.localSessionId);
    this.vehicleRenderer.observe(snapshot, this.localSessionId);
    this.snapshot = snapshot;
    this.cameras.main.setBounds(0, 0, this.resolveWorldWidth(), WORLD.height);
    this.rebuildStaticWorldIfNeeded();
  }

  setLocalSessionId(sessionId: string): void {
    this.localSessionId = sessionId;
  }

  setCameraViewMode(mode: CameraViewMode): void {
    if (mode === "free") {
      this.enterFreeCameraMode();
      return;
    }
    this.freeCameraDrag = null;
    this.cameraViewMode = mode;
  }

  toggleCameraOverview(): CameraViewState {
    this.freeCameraDrag = null;
    this.cameraViewMode = this.cameraViewMode === "overview" ? "follow" : "overview";
    return this.getCameraViewState();
  }

  toggleFreeCamera(): CameraViewState {
    if (this.cameraViewMode === "free") {
      this.freeCameraDrag = null;
      this.cameraViewMode = "follow";
    } else {
      this.enterFreeCameraMode();
    }
    return this.getCameraViewState();
  }

  adjustCameraZoom(delta: number, anchor?: CameraZoomAnchor): CameraViewState {
    if (this.cameraViewMode === "free") {
      return this.adjustFreeCameraZoom(delta, anchor);
    }
    return this.adjustFollowZoom(delta);
  }

  adjustFollowZoom(delta: number): CameraViewState {
    this.freeCameraDrag = null;
    this.cameraViewMode = "follow";
    this.followZoom = Phaser.Math.Clamp(Math.round((this.followZoom + delta) * 100) / 100, CAMERA_ZOOM.min, CAMERA_ZOOM.followMax);
    return this.getCameraViewState();
  }

  resetCameraZoom(): CameraViewState {
    this.freeCameraDrag = null;
    this.cameraViewMode = "follow";
    this.followZoom = 1;
    this.freeCameraZoom = 1;
    return this.getCameraViewState();
  }

  getCameraViewState(): CameraViewState {
    const zoom = this.cameraViewMode === "overview"
      ? this.resolveOverviewZoom(this.resolveWorldWidth())
      : this.cameraViewMode === "free"
        ? this.freeCameraZoom
        : this.followZoom;
    return {
      mode: this.cameraViewMode,
      zoom: Math.round(zoom * 100) / 100,
    };
  }

  private enterFreeCameraMode(): void {
    if (this.cameraViewMode !== "free") {
      const sourceZoom = this.cameraViewMode === "overview"
        ? this.resolveOverviewZoom(this.resolveWorldWidth())
        : this.followZoom;
      this.freeCameraZoom = Phaser.Math.Clamp(
        Math.round(sourceZoom * 100) / 100,
        CAMERA_ZOOM.min,
        CAMERA_ZOOM.freeMax,
      );
    }
    this.cameraViewMode = "free";
    this.localProjectileCameraFocus = null;
    this.clampCameraScroll();
  }

  private adjustFreeCameraZoom(delta: number, anchor?: CameraZoomAnchor): CameraViewState {
    this.enterFreeCameraMode();
    const camera = this.cameras.main;
    const anchorPoint = anchor ? this.resolveCanvasCameraPoint(anchor) : null;
    const anchoredWorld = anchorPoint
      ? {
          x: camera.scrollX + (anchorPoint.x / Math.max(0.01, camera.zoom)),
          y: camera.scrollY + (anchorPoint.y / Math.max(0.01, camera.zoom)),
        }
      : null;

    this.freeCameraZoom = Phaser.Math.Clamp(
      Math.round((this.freeCameraZoom + delta) * 100) / 100,
      CAMERA_ZOOM.min,
      CAMERA_ZOOM.freeMax,
    );
    camera.setZoom(this.freeCameraZoom);

    if (anchorPoint && anchoredWorld) {
      camera.scrollX = anchoredWorld.x - (anchorPoint.x / Math.max(0.01, camera.zoom));
      camera.scrollY = anchoredWorld.y - (anchorPoint.y / Math.max(0.01, camera.zoom));
    }

    this.clampCameraScroll();
    return this.getCameraViewState();
  }

  setSelectedAmmo(ammoType: AmmoType): void {
    this.selectedAmmo = ammoType;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isFreeCameraPointer(pointer)) {
      this.beginFreeCameraDrag(pointer);
      return;
    }
    if (!this.isPrimaryPointer(pointer)) return;
    if (!this.canCharge()) return;
    this.aimDragStartWorld = this.resolvePointerWorld(pointer);
    this.aimDragCurrentWorld = { ...this.aimDragStartWorld };
    this.updatePointerAim(pointer);
    this.chargingStartedAtMs = performance.now();
    this.callbacks?.chargeStart();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.updateFreeCameraDrag(pointer)) return;
    this.updatePointerAim(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasCanceled) {
      this.freeCameraDrag = null;
      this.cancelCharge();
      return;
    }
    if (this.endFreeCameraDrag(pointer)) return;
    if (!this.isPrimaryPointer(pointer)) return;
    if (this.chargingStartedAtMs === null) return;
    this.updatePointerAim(pointer);
    const aim = this.pointerAim;
    this.chargingStartedAtMs = null;
    this.aimDragStartWorld = null;
    this.aimDragCurrentWorld = null;
    this.callbacks?.throwRelease(aim);
  }

  private isPrimaryPointer(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 0;
  }

  private isFreeCameraPointer(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 1 || pointer.button === 2;
  }

  private beginFreeCameraDrag(pointer: Phaser.Input.Pointer): void {
    this.cancelCharge();
    this.enterFreeCameraMode();
    this.freeCameraDrag = {
      pointerId: pointer.id,
      startPointerX: pointer.x,
      startPointerY: pointer.y,
      startScrollX: this.cameras.main.scrollX,
      startScrollY: this.cameras.main.scrollY,
    };
  }

  private updateFreeCameraDrag(pointer: Phaser.Input.Pointer): boolean {
    if (!this.freeCameraDrag || this.freeCameraDrag.pointerId !== pointer.id) return false;
    const camera = this.cameras.main;
    const zoom = Math.max(0.01, camera.zoom);
    camera.scrollX = this.freeCameraDrag.startScrollX - ((pointer.x - this.freeCameraDrag.startPointerX) / zoom);
    camera.scrollY = this.freeCameraDrag.startScrollY - ((pointer.y - this.freeCameraDrag.startPointerY) / zoom);
    this.clampCameraScroll();
    return true;
  }

  private endFreeCameraDrag(pointer: Phaser.Input.Pointer): boolean {
    if (!this.freeCameraDrag || this.freeCameraDrag.pointerId !== pointer.id) return false;
    this.updateFreeCameraDrag(pointer);
    this.freeCameraDrag = null;
    return true;
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

  private resolveCanvasCameraPoint(anchor: CameraZoomAnchor): Vec2 | null {
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Phaser.Math.Clamp(((anchor.clientX - rect.left) / rect.width) * this.cameras.main.width, 0, this.cameras.main.width),
      y: Phaser.Math.Clamp(((anchor.clientY - rect.top) / rect.height) * this.cameras.main.height, 0, this.cameras.main.height),
    };
  }

  private clampCameraScroll(): void {
    const camera = this.cameras.main;
    const zoom = Math.max(0.01, camera.zoom);
    const viewWidth = camera.width / zoom;
    const viewHeight = camera.height / zoom;
    const maxScrollX = Math.max(0, this.resolveWorldWidth() - viewWidth);
    const maxScrollY = Math.max(0, WORLD.height - viewHeight);
    camera.scrollX = Phaser.Math.Clamp(camera.scrollX, 0, maxScrollX);
    camera.scrollY = Phaser.Math.Clamp(camera.scrollY, 0, maxScrollY);
  }

  private canCharge(): boolean {
    const player = this.getLocalPlayer();
    return Boolean(
      player
      && player.connected
      && player.hp > 0
      && this.snapshot.roundState === "active"
      && this.snapshot.currentTurnSessionId === this.localSessionId
      && this.snapshot.turnPhase === "fire",
    );
  }

  private getLocalPlayer(): PlayerView | null {
    return this.snapshot.players.find((player) => player.sessionId === this.localSessionId) ?? null;
  }

  private getLocalLaneIndex(): number | null {
    return this.getLocalPlayer()?.laneIndex ?? null;
  }

  private isLocalLane(laneIndex: number | null): boolean {
    const localLaneIndex = this.getLocalLaneIndex();
    return localLaneIndex === null || laneIndex === null || laneIndex === localLaneIndex;
  }

  private updateEnvironment(snapshot: GameSnapshot): void {
    const key = `${snapshot.biomeId}:${snapshot.terrainSeed || snapshot.code || snapshot.hostName}`;
    if (key === this.environmentKey) return;
    this.environmentKey = key;
    this.background.setSeed(key);
    this.applyArenaDecorLayout(key);
    this.cameras.main.fadeIn(420, 6, 10, 18);
  }

  private updateTerrain(snapshot: GameSnapshot): void {
    const key = `${snapshot.terrainMode}:${snapshot.terrainVersion}:${snapshot.terrainSeed || snapshot.code || "Lobbers"}`;
    if (key === this.terrainKey) return;
    this.terrainKey = key;
    this.terrainLane = snapshot.terrainMode === "classic"
      ? generateTerrainLane("classic-flat", WORLD.width, WORLD.groundY, WORLD.width)
      : generateTerrainLane(snapshot.terrainSeed || snapshot.code || "Lobbers");
    this.staticWorldKey = "";
  }

  private installCameraPostFx(): void {
    if (this.game.renderer.type !== Phaser.WEBGL) return;
    try {
      this.cameraVignette = this.cameras.main.postFX.addVignette(0.5, 0.54, 0.95, 0.04);
      this.cameraColorMatrix = this.cameras.main.postFX.addColorMatrix();
      this.cameraColorMatrix.brightness(1);
      this.cameraColorMatrix.saturate(0.04, true);
    } catch {
      this.cameraVignette = null;
      this.cameraColorMatrix = null;
    }
  }

  private updateCameraPostFx(time: number): void {
    if (!this.cameraVignette) return;
    this.cameraVignette.strength = 0.035 + (Math.sin(time * 0.00075) * 0.005);
  }

  private updateCameraForLocalPlayer(): void {
    const player = this.getLocalPlayer();
    const camera = this.cameras.main;
    const worldWidth = this.resolveWorldWidth();
    const targetZoom = this.cameraViewMode === "overview"
      ? this.resolveOverviewZoom(worldWidth)
      : this.cameraViewMode === "free"
        ? this.freeCameraZoom
        : this.followZoom;
    const deviceZoom = this.cameraViewMode === "follow" && this.scale.width <= 680 ? targetZoom * .55 : targetZoom;
    camera.zoom += (deviceZoom - camera.zoom) * 0.18;
    camera.setBounds(0, 0, worldWidth, WORLD.height);
    const halfWidth = camera.width / (2 * Math.max(0.01, camera.zoom));
    const halfHeight = camera.height / (2 * Math.max(0.01, camera.zoom));
    if (this.cameraViewMode === "free") {
      this.localProjectileCameraFocus = null;
      this.clampCameraScroll();
      return;
    }
    if (this.cameraViewMode === "overview") {
      this.localProjectileCameraFocus = null;
      const targetX = worldWidth / 2;
      const targetY = WORLD.height / 2;
      camera.scrollX += ((targetX - halfWidth) - camera.scrollX) * 0.16;
      camera.scrollY += ((targetY - halfHeight) - camera.scrollY) * 0.16;
      return;
    }
    if (!player) {
      this.localProjectileCameraFocus = null;
      camera.centerOn(WORLD.width / 2, WORLD.height / 2);
      return;
    }
    const cameraPlayer = this.resolveRenderedPlayer(player);
    const projectileFocus = this.resolveLocalProjectileCameraFocus(cameraPlayer);
    this.localProjectileCameraFocus = projectileFocus;
    const aimBiasX = player.aimX * 110;
    const aimBiasY = player.aimY * 96;
    const baseTargetX = projectileFocus?.x ?? cameraPlayer.x + aimBiasX;
    const baseTargetY = projectileFocus?.y ?? cameraPlayer.y - 170 + aimBiasY;
    const targetX = Phaser.Math.Clamp(baseTargetX, halfWidth, Math.max(halfWidth, worldWidth - halfWidth));
    const targetY = Phaser.Math.Clamp(baseTargetY, halfHeight, Math.max(halfHeight, WORLD.height - halfHeight));
    camera.scrollX += ((targetX - halfWidth) - camera.scrollX) * 0.08;
    camera.scrollY += ((targetY - halfHeight) - camera.scrollY) * 0.08;
  }

  private resolveLocalProjectileCameraFocus(player: Vec2): ProjectileCameraFocus | null {
    if (!this.localSessionId || this.snapshot.projectiles.length === 0) return null;
    const projectile = [...this.snapshot.projectiles]
      .reverse()
      .find((candidate) => candidate.alive && candidate.ownerSessionId === this.localSessionId);
    if (!projectile) return null;
    const blend = 0.45;
    return {
      projectileId: projectile.id,
      blend,
      x: Phaser.Math.Linear(player.x, projectile.x, blend),
      y: Phaser.Math.Linear(player.y - 120, projectile.y, blend),
    };
  }

  private resolveWorldWidth(): number {
    return Math.max(WORLD.width, this.snapshot.worldWidth || WORLD.width);
  }

  private resolveOverviewZoom(worldWidth: number): number {
    const fitZoom = Math.min(this.cameras.main.width / worldWidth, this.cameras.main.height / WORLD.height, 1);
    return Phaser.Math.Clamp(fitZoom, CAMERA_ZOOM.overviewMin, CAMERA_ZOOM.overviewMax);
  }

  private resolveLaneCount(): number {
    return Math.max(1, Math.ceil(this.resolveWorldWidth() / WORLD.width));
  }

  private trackThrowAnimations(snapshot: GameSnapshot): void {
    for (const player of snapshot.players) {
      const previousSeq = this.lastThrowSeqBySessionId.get(player.sessionId);
      if (previousSeq !== undefined && player.throwSeq > previousSeq) {
        this.throwAnimationStartedAtBySessionId.set(player.sessionId, performance.now());
        if (this.isLocalLane(player.laneIndex)) {
          this.pulseThrowCameraFx(player.selectedAmmo);
        }
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
      this.spawnImpactFx(projectile, damageDetected, this.isLocalLane(this.resolveProjectileLaneIndex(projectile, snapshot)));
    }

    this.lastProjectilesById.clear();
    for (const projectile of snapshot.projectiles) {
      this.lastProjectilesById.set(projectile.id, projectile);
    }

    const nextHpBySessionId = new Map<string, number>();
    const nextShieldBySessionId = new Map<string, number>();
    const nextPickupSeqBySessionId = new Map<string, number>();
    const nextDashSeqBySessionId = new Map<string, number>();
    for (const player of snapshot.players) {
      this.trackPlayerFeedback(player);
      nextHpBySessionId.set(player.sessionId, player.hp);
      nextShieldBySessionId.set(player.sessionId, player.shieldHp);
      nextPickupSeqBySessionId.set(player.sessionId, player.pickupSeq);
      nextDashSeqBySessionId.set(player.sessionId, player.dashSeq);
    }
    this.lastHpBySessionId.clear();
    this.lastShieldBySessionId.clear();
    this.lastPickupSeqBySessionId.clear();
    this.lastDashSeqBySessionId.clear();
    for (const [sessionId, hp] of nextHpBySessionId) this.lastHpBySessionId.set(sessionId, hp);
    for (const [sessionId, shield] of nextShieldBySessionId) this.lastShieldBySessionId.set(sessionId, shield);
    for (const [sessionId, pickupSeq] of nextPickupSeqBySessionId) this.lastPickupSeqBySessionId.set(sessionId, pickupSeq);
    for (const [sessionId, dashSeq] of nextDashSeqBySessionId) this.lastDashSeqBySessionId.set(sessionId, dashSeq);
  }

  private trackPlayerFeedback(player: PlayerView): void {
    const previousHp = this.lastHpBySessionId.get(player.sessionId);
    const previousShield = this.lastShieldBySessionId.get(player.sessionId);
    const previousPickupSeq = this.lastPickupSeqBySessionId.get(player.sessionId);
    const previousDashSeq = this.lastDashSeqBySessionId.get(player.sessionId);
    const rendered = this.resolveRenderedPlayer(player);

    if (previousShield !== undefined && player.shieldHp < previousShield) {
      this.spawnCombatText(
        rendered.x,
        rendered.y - WORLD.tankHeight - 52,
        "BLOCK",
        COLORS.blueLight,
        player.side === "blue" ? -1 : 1,
      );
    }

    if (previousHp !== undefined && player.hp < previousHp) {
      const damage = Math.max(1, Math.round(previousHp - player.hp));
      this.spawnCombatText(
        rendered.x,
        rendered.y - WORLD.tankHeight - 74,
        `-${damage}`,
        COLORS.flagRed,
        player.side === "blue" ? -1 : 1,
      );
    }

    if (previousPickupSeq !== undefined && player.pickupSeq > previousPickupSeq) {
      this.spawnCombatText(
        rendered.x,
        rendered.y - WORLD.tankHeight - 96,
        player.lastPickupLabel || "Pickup",
        this.pickupFeedbackColor(player.lastPickupLabel),
        player.side === "blue" ? -1 : 1,
      );
    }

    if (previousDashSeq !== undefined && player.dashSeq > previousDashSeq) {
      this.dashBursts.push({
        id: `${player.sessionId}:${player.dashSeq}:${performance.now()}`,
        side: player.side,
        direction: this.resolveDashBurstDirection(player, rendered),
        x: rendered.x,
        y: rendered.y - WORLD.tankHeight / 2,
        startedAtMs: performance.now(),
      });
    }
  }

  private resolveDashBurstDirection(player: PlayerView, rendered: PlayerView): -1 | 1 {
    if (Math.abs(player.vx) > 32) return player.vx < 0 ? -1 : 1;
    if (Math.abs(player.x - rendered.x) > 1.5) {
      return player.x < rendered.x ? -1 : 1;
    }
    return SIDE_SIGN[player.side] < 0 ? -1 : 1;
  }

  private pickupFeedbackColor(label: string): number {
    const normalized = label.toLowerCase();
    if (normalized.includes("armor")) return COLORS.blueLight;
    if (normalized.includes("repair")) return COLORS.splitter;
    if (normalized.includes("dash")) return COLORS.javelin;
    if (normalized.includes("full")) return COLORS.preview;
    return COLORS.shotput;
  }

  private spawnCombatText(x: number, y: number, text: string, color: number, direction: number): void {
    const label = this.add
      .text(x, y, text, {
        color: `#${color.toString(16).padStart(6, "0")}`,
        fontFamily: "Impact, Arial, sans-serif",
        fontSize: text === "BLOCK" ? "21px" : "26px",
        fontStyle: "900",
        stroke: "#fff8e7",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(31);
    this.combatTexts.push({
      id: `${text}:${x}:${y}:${performance.now()}`,
      x,
      y,
      text,
      color,
      startedAtMs: performance.now(),
      driftX: direction * (18 + (Math.random() * 16)),
      label,
    });
  }

  private resolveProjectileLaneIndex(projectile: ProjectileView, snapshot: GameSnapshot): number | null {
    const owner = snapshot.players.find((player) => player.sessionId === projectile.ownerSessionId);
    if (owner) return owner.laneIndex;
    if (projectile.x >= 0) return Math.floor(projectile.x / WORLD.width);
    return null;
  }

  private spawnImpactFx(projectile: ProjectileView, damageDetected: boolean, pulseCamera: boolean): void {
    const strength = this.resolveImpactStrength(projectile.ammoType, damageDetected);
    if (pulseCamera) {
      this.pulseImpactCameraFx(projectile.ammoType, strength);
      if (projectile.ammoType !== "needle") this.spawnCombatText(projectile.x, projectile.y - 55, damageDetected ? "KAPOW!" : "PLOP!", damageDetected ? 0xc64e39 : 0x263d38, 1);
    }
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
    } else if (projectile.ammoType === "cluster") {
      addSprite(SPRITES.fx.starburstGoldGenerated, 29);
      addSprite(SPRITES.fx.trailRed, 29);
    } else if (projectile.ammoType === "needle" || projectile.ammoType === "discus") {
      addSprite(SPRITES.fx.sparkBlue, 29);
    } else if (projectile.ammoType === "mortar" || projectile.ammoType === "anvil") {
      addSprite(SPRITES.fx.trailRed, 29);
      addSprite(SPRITES.fx.starburstGoldGenerated, 29);
    }

    this.impactFx.push({
      id: `${projectile.id}:${performance.now()}`,
      ammoType: projectile.ammoType,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      radius: projectile.radius,
      strength,
      startedAtMs: performance.now(),
      sprites,
    });
  }

  private pulseThrowCameraFx(ammoType: AmmoType): void {
    const profile = AMMO_FX[ammoType];
    const strength = ammoType === "anvil"
      ? 0.0042
      : ammoType === "mortar" || ammoType === "shotput"
        ? 0.0034
        : ammoType === "splitter" || ammoType === "cluster"
          ? 0.0025
          : 0.0018;
    this.cameras.main.shake(70, strength, false);
    if (ammoType !== "javelin") {
      const rgb = rgbFromHex(profile.glow);
      this.cameras.main.flash(54, rgb.r, rgb.g, rgb.b, false);
    }
  }

  private pulseImpactCameraFx(ammoType: AmmoType, strength: number): void {
    const profile = AMMO_FX[ammoType];
    const rgb = rgbFromHex(profile.hot);
    const duration = ammoType === "mortar" ? 170 : ammoType === "anvil" ? 150 : ammoType === "shotput" ? 130 : 90;
    const shakeScale = ammoType === "anvil" ? 0.0036 : ammoType === "mortar" || ammoType === "shotput" ? 0.0031 : 0.0022;
    this.cameras.main.shake(duration + (strength * 82), shakeScale * strength, true);
    this.cameras.main.flash(86 + (strength * 48), rgb.r, rgb.g, rgb.b, true);
  }

  private resolveImpactStrength(ammoType: AmmoType, damageDetected: boolean): number {
    const base = ammoType === "anvil"
      ? 1.6
      : ammoType === "mortar"
        ? 1.5
        : ammoType === "shotput"
          ? 1.35
          : ammoType === "discus" || ammoType === "splitter" || ammoType === "cluster"
            ? 1
            : ammoType === "needle"
              ? 0.68
              : 0.82;
    return base * (damageDetected ? 1.35 : 1);
  }

  private draw(): void {
    this.heldAmmoSprite?.setVisible(false);
    this.graphics.clear();
    this.fxGraphics.clear();
    this.drawWindRibbons();
    this.drawWorldProps();
    this.drawPickups();
    this.drawDashBursts();
    this.drawPlayers();
    this.drawProjectiles();
    this.drawImpactFx();
    this.drawAimPreview();
    this.drawCombatTexts();
  }

  private drawCourt(): void {
    for (let laneIndex = 0; laneIndex < this.resolveLaneCount(); laneIndex += 1) {
      this.drawCourtLane(laneIndex * WORLD.width, laneIndex);
    }
  }

  private drawWindRibbons(): void {
    const wind = this.snapshot.windAccelerationX;
    this.windRibbonCount = 0;
    if (Math.abs(wind) < WIND.calmThresholdPxPerSecondSq) return;
    const fx = this.fxGraphics;
    const laneCount = this.resolveLaneCount();
    const direction = Math.sign(wind);
    const strength = clamp01(Math.abs(wind) / WIND.maxAccelerationPxPerSecondSq);
    const time = performance.now() * 0.00042 * direction;
    const color = wind > 0 ? COLORS.blueLight : COLORS.redLight;
    const alpha = 0.06 + (strength * 0.11);
    const stepY = 210;
    const stepX = 520 - (strength * 70);
    const ribbonLength = 74 + (strength * 58);
    const topY = WORLD.groundY - 720;
    const bottomY = WORLD.groundY - 185;

    fx.lineStyle(2, color, alpha);
    for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
      const laneLeft = laneIndex * WORLD.width;
      for (let y = topY; y < bottomY; y += stepY) {
        const rowPhase = (y * 0.007) + time;
        const rowRatio = clamp01((y - topY) / Math.max(1, bottomY - topY));
        const rowAlpha = alpha * (1 - (rowRatio * 0.36));
        for (let x = laneLeft + 190; x < laneLeft + WORLD.width - 180; x += stepX) {
          const wave = Math.sin(rowPhase + (x * 0.004)) * (7 + (strength * 9));
          const scroll = ((performance.now() * 0.024 * direction) + (y * 0.31)) % stepX;
          const startX = x + scroll;
          const endX = startX + (direction * ribbonLength);
          this.windRibbonCount += 1;
          fx.lineStyle(2, color, rowAlpha);
          fx.beginPath();
          fx.moveTo(startX, y + wave);
          fx.lineTo(endX, y - wave * 0.35);
          fx.strokePath();
          const headSize = 10;
          fx.fillStyle(color, rowAlpha * 0.62);
          fx.fillTriangle(
            endX,
            y - wave * 0.35,
            endX - (direction * headSize),
            y - 4 - wave * 0.35,
            endX - (direction * headSize),
            y + 4 - wave * 0.35,
          );
        }
      }
    }
  }

  private rebuildStaticWorldIfNeeded(): void {
    if (!this.staticGraphics) return;
    const key = `${this.terrainKey}:${this.resolveLaneCount()}:${this.resolveWorldWidth()}`;
    if (key === this.staticWorldKey) return;
    this.staticWorldKey = key;
    this.rebuildStaticWorld();
  }

  private rebuildStaticWorld(): void {
    if (!this.staticGraphics) return;
    this.staticGraphics.clear();
    this.drawCourt();
    this.drawTerrain();
    this.drawFixtures();
  }

  private drawTerrain(): void {
    const g = this.staticGraphics;
    for (let laneIndex = 0; laneIndex < this.resolveLaneCount(); laneIndex += 1) {
      const offsetX = laneIndex * WORLD.width;
      g.fillStyle(readArenaTheme().soil, 1);
      g.beginPath();
      g.moveTo(offsetX, WORLD.height);
      for (const sample of this.terrainLane.samples) {
        g.lineTo(offsetX + sample.x, sample.y);
      }
      g.lineTo(offsetX + WORLD.width, WORLD.height);
      g.closePath();
      g.fillPath();

      // Garden turf and ink-like pebbles follow the actual collision surface.
      g.lineStyle(9, readArenaTheme().turf, 1);
      g.beginPath();
      for (let i = 0; i < this.terrainLane.samples.length; i++) {
        const sample = this.terrainLane.samples[i];
        if (!sample) continue;
        if (i === 0) g.moveTo(offsetX + sample.x, sample.y);
        else g.lineTo(offsetX + sample.x, sample.y);
      }
      g.strokePath();
      for (let i = 0; i < this.terrainLane.samples.length; i += 5) {
        const sample = this.terrainLane.samples[i];
        if (!sample) continue;
        const x = offsetX + sample.x;
        g.fillStyle(0xcbb58a, 0.6);
        g.fillEllipse(x + 14, sample.y + 35 + i % 23, 8, 4);
        g.fillStyle(0x6d5c41, 0.28);
        g.fillEllipse(x - 5, sample.y + 78 + i % 31, 12, 5);
        if (i % 3 === 0) {
          g.lineStyle(2, 0x5e8257, 0.85);
          g.beginPath(); g.moveTo(x - 5, sample.y - 3); g.lineTo(x - 10, sample.y - 13);
          g.moveTo(x - 5, sample.y - 3); g.lineTo(x - 1, sample.y - 16); g.strokePath();
        }
      }

      g.fillStyle(0x604f3d, 0.18);
      for (let y = WORLD.groundY + 34; y < WORLD.height; y += 34) {
        g.fillRect(offsetX, y, WORLD.width, 2);
      }

      this.drawTerrainSegments(offsetX);
    }
  }

  private drawTerrainSegments(offsetX: number): void {
    const g = this.staticGraphics;
    for (const segment of this.terrainLane.segments) {
      const x0 = offsetX + segment.x0;
      const x1 = offsetX + segment.x1;
      const y0 = segment.y0;
      const y1 = segment.y1;

      if (segment.kind === "platform") {
        this.drawTerrainPlatform(segment, offsetX);
        continue;
      }

      if (segment.kind === "cliff") {
        g.lineStyle(7, 0x5f6f45, 0.92);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.strokePath();
        g.lineStyle(2, 0x0b130d, 0.28);
        const startX = Math.min(x0, x1);
        const endX = Math.max(x0, x1);
        const spanX = Math.max(1, Math.abs(x1 - x0));
        for (let x = startX; x <= endX; x += 13) {
          const t = (x - startX) / spanX;
          const y = y0 + ((y1 - y0) * t);
          g.beginPath();
          g.moveTo(x, y + 4);
          g.lineTo(x + 18, y + 30);
          g.strokePath();
        }
        g.lineStyle(2, COLORS.flagRed, 0.24);
        for (let x = startX + 22; x < endX; x += 54) {
          const t = (x - startX) / spanX;
          const y = y0 + ((y1 - y0) * t);
          g.beginPath();
          g.moveTo(x - 12, y + 10);
          g.lineTo(x + 12, y + 34);
          g.moveTo(x + 12, y + 10);
          g.lineTo(x - 12, y + 34);
          g.strokePath();
        }
        continue;
      }

      const topColor = segment.kind === "spawnShelf" ? 0xf2e3a2 : segment.kind === "ramp" ? 0xb8cc80 : 0xd7e6b0;
      const thickness = segment.kind === "spawnShelf" ? 6 : 4;
      g.lineStyle(thickness, topColor, segment.kind === "spawnShelf" ? 0.96 : 0.88);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.strokePath();
    }
  }

  private drawTerrainPlatform(segment: TerrainSegment, offsetX: number): void {
    const g = this.staticGraphics;
    const x = offsetX + segment.x0;
    const width = segment.x1 - segment.x0;
    const y = segment.y0;
    g.fillStyle(0x0b130d, 0.2);
    g.fillEllipse(x + (width / 2), y + 58, width * 0.88, 34);
    g.fillStyle(0x314623, 0.96);
    g.fillRoundedRect(x, y, width, 18, 5);
    g.fillStyle(0x172418, 0.9);
    g.fillRect(x + 10, y + 18, width - 20, 34);
    g.fillStyle(0x9fb26b, 0.38);
    g.fillRect(x + 12, y + 18, width - 24, 4);
    g.lineStyle(5, 0xe9f5bb, 0.94);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + width, y);
    g.strokePath();
    g.lineStyle(2, 0xfacc15, 0.38);
    g.beginPath();
    g.moveTo(x + 14, y - 9);
    g.lineTo(x + width - 14, y - 9);
    g.strokePath();
    g.fillStyle(0xfacc15, 0.34);
    const center = x + (width / 2);
    for (const markerX of [center - 58, center, center + 58]) {
      if (markerX <= x + 20 || markerX >= x + width - 20) continue;
      g.fillTriangle(markerX - 10, y - 9, markerX + 10, y - 9, markerX, y - 20);
    }
    g.lineStyle(2, 0xfacc15, 0.24);
    for (let plankX = x + 24; plankX < x + width - 12; plankX += 42) {
      g.beginPath();
      g.moveTo(plankX, y + 4);
      g.lineTo(plankX - 14, y + 44);
      g.strokePath();
    }
    g.fillStyle(0x050807, 0.28);
    g.fillRect(x, y + 8, 8, 44);
    g.fillRect(x + width - 8, y + 8, 8, 44);
    g.fillStyle(0x0f172a, 0.18);
    g.fillTriangle(x + 14, y + 48, x + 54, y + 48, x + 34, y + 80);
    g.fillTriangle(x + width - 54, y + 48, x + width - 14, y + 48, x + width - 34, y + 80);
  }

  private drawCourtLane(offsetX: number, laneIndex: number): void {
    const g = this.staticGraphics;
    const laneLeft = offsetX + 80;
    const laneRight = offsetX + WORLD.width - 80;
    const laneWidth = laneRight - laneLeft;

    g.fillStyle(0x1a241d, 0.22);
    g.fillRect(offsetX, WORLD.groundY - 46, WORLD.width, 46);
    g.fillStyle(COLORS.court, 0.3);
    g.fillRect(offsetX, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY);
    g.fillStyle(0x263820, 0.52);
    g.fillRect(offsetX, WORLD.groundY + 92, WORLD.width, WORLD.height - WORLD.groundY - 92);

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
    g.moveTo(offsetX + (WORLD.width / 2), WORLD.groundY - 40);
    g.lineTo(offsetX + (WORLD.width / 2), WORLD.groundY + 12);
    g.strokePath();

    g.lineStyle(2, COLORS.line, 0.75);
    g.beginPath();
    g.moveTo(laneLeft, WORLD.groundY);
    g.lineTo(laneRight, WORLD.groundY);
    g.strokePath();

    for (let x = offsetX + 120; x <= offsetX + WORLD.width - 120; x += 100) {
      const tall = x % 200 === 0;
      g.lineStyle(tall ? 3 : 1, COLORS.line, tall ? 0.85 : 0.45);
      g.beginPath();
      g.moveTo(x, WORLD.groundY - (tall ? 38 : 24));
      g.lineTo(x, WORLD.groundY + 10);
      g.strokePath();
    }

    this.drawRangeReadabilityBands(offsetX, laneLeft, laneRight);
    this.drawMovementBoundaryMarkers(offsetX, laneLeft, laneRight);

    g.lineStyle(1, 0xffffff, 0.16);
    for (let y = WORLD.groundY + 30; y <= WORLD.height; y += 30) {
      g.beginPath();
      g.moveTo(offsetX, y);
      g.lineTo(offsetX + WORLD.width, y);
      g.strokePath();
    }

    g.lineStyle(1, 0x0f172a, 0.11);
    for (let x = offsetX - WORLD.height; x < offsetX + WORLD.width; x += 86) {
      g.beginPath();
      g.moveTo(x, WORLD.height);
      g.lineTo(x + (WORLD.height - WORLD.groundY), WORLD.groundY);
      g.strokePath();
    }

    if (this.resolveLaneCount() > 1) {
      g.fillStyle(0xf8fafc, 0.7);
      g.fillRoundedRect(offsetX + 32, WORLD.groundY - 92, 104, 34, 8);
      g.fillStyle(0x0f172a, 0.86);
      g.fillRect(offsetX + 48, WORLD.groundY - 76, 72, 3);
    }
  }

  private drawMovementBoundaryMarkers(offsetX: number, laneLeft: number, laneRight: number): void {
    const g = this.staticGraphics;
    const centerX = offsetX + (WORLD.width / 2);
    const blueMinX = offsetX + MOVEMENT.sideBoundaryPadding;
    const blueMaxX = centerX - MOVEMENT.centerNoCrossPadding;
    const redMinX = centerX + MOVEMENT.centerNoCrossPadding;
    const redMaxX = offsetX + WORLD.width - MOVEMENT.sideBoundaryPadding;
    const railTop = WORLD.groundY - 94;
    const railBottom = WORLD.groundY - 68;
    const railY = WORLD.groundY - 36;

    g.fillStyle(0xfacc15, 0.07);
    g.fillRect(blueMaxX, railTop, redMinX - blueMaxX, railBottom - railTop);
    g.lineStyle(2, 0xfacc15, 0.2);
    for (let x = blueMaxX + 10; x < redMinX; x += 30) {
      g.beginPath();
      g.moveTo(x, railBottom);
      g.lineTo(x + 22, railTop);
      g.strokePath();
    }

    g.lineStyle(4, COLORS.blueLight, 0.26);
    g.beginPath();
    g.moveTo(Math.max(laneLeft, blueMinX), railY);
    g.lineTo(Math.min(laneRight, blueMaxX), railY);
    g.strokePath();

    g.lineStyle(4, COLORS.redLight, 0.26);
    g.beginPath();
    g.moveTo(Math.max(laneLeft, redMinX), railY);
    g.lineTo(Math.min(laneRight, redMaxX), railY);
    g.strokePath();

    this.drawBoundaryPost(blueMinX, COLORS.blueLight, -1);
    this.drawBoundaryPost(blueMaxX, COLORS.blueLight, 1);
    this.drawBoundaryPost(redMinX, COLORS.redLight, -1);
    this.drawBoundaryPost(redMaxX, COLORS.redLight, 1);

    g.lineStyle(1, 0xffffff, 0.12);
    for (const markerX of [blueMinX, blueMaxX, redMinX, redMaxX]) {
      g.beginPath();
      g.moveTo(markerX, WORLD.groundY - 64);
      g.lineTo(markerX, WORLD.groundY + 12);
      g.strokePath();
    }
  }

  private drawBoundaryPost(x: number, color: number, direction: -1 | 1): void {
    const g = this.staticGraphics;
    const y = WORLD.groundY - 52;
    g.fillStyle(0x0b130d, 0.22);
    g.fillEllipse(x, WORLD.groundY + 5, 34, 10);
    g.lineStyle(3, color, 0.42);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, WORLD.groundY - 6);
    g.strokePath();
    g.fillStyle(color, 0.34);
    g.fillTriangle(x, y - 12, x, y + 12, x + (direction * 22), y);
  }

  private drawRangeReadabilityBands(offsetX: number, laneLeft: number, laneRight: number): void {
    const g = this.staticGraphics;
    const centerX = offsetX + (WORLD.width / 2);
    const bandTop = WORLD.groundY - 62;
    const bandBottom = WORLD.groundY - 28;
    const bandColor = 0xfacc15;

    g.lineStyle(1, bandColor, 0.18);
    for (let distance = 400; distance <= WORLD.width / 2 - 260; distance += 400) {
      const alpha = distance % 800 === 0 ? 0.32 : 0.2;
      for (const direction of [-1, 1]) {
        const x = centerX + (direction * distance);
        if (x <= laneLeft || x >= laneRight) continue;
        g.lineStyle(distance % 800 === 0 ? 3 : 2, bandColor, alpha);
        g.beginPath();
        g.moveTo(x, bandTop);
        g.lineTo(x, bandBottom);
        g.strokePath();

        g.fillStyle(bandColor, alpha * 0.5);
        g.fillTriangle(x - 14, bandTop - 2, x + 14, bandTop - 2, x, bandTop - 16);
      }
    }

    g.lineStyle(2, 0xffffff, 0.16);
    g.beginPath();
    g.moveTo(centerX - 44, bandTop - 6);
    g.lineTo(centerX + 44, bandTop - 6);
    g.strokePath();
  }

  private drawFixtures(): void {
    const g = this.staticGraphics;
    for (let laneIndex = 0; laneIndex < this.resolveLaneCount(); laneIndex += 1) {
      const offsetX = laneIndex * WORLD.width;
      for (const fixture of COURT_FIXTURES) {
        const laneFixture = { ...fixture, x: fixture.x + offsetX };
        const sprite = laneIndex === 0 ? this.fixtureSpritesById.get(fixture.id) : null;
        if (sprite) {
          this.syncFixtureSprite(sprite, laneFixture);
          continue;
        }

        if (fixture.kind === "flag") {
          const color = fixture.x < WORLD.width / 2 ? COLORS.flagBlue : COLORS.flagRed;
          g.fillStyle(color, 1);
          g.fillRect(laneFixture.x, laneFixture.y, laneFixture.width, laneFixture.height);
          g.fillTriangle(
            laneFixture.x + laneFixture.width,
            laneFixture.y + 8,
            laneFixture.x + laneFixture.width + 42,
            laneFixture.y + 22,
            laneFixture.x + laneFixture.width,
            laneFixture.y + 38,
          );
          continue;
        }

        if (fixture.kind === "marker") {
          g.fillStyle(COLORS.marker, 0.85);
          g.fillRect(laneFixture.x, laneFixture.y, laneFixture.width, laneFixture.height);
          continue;
        }

        g.fillStyle(fixture.kind === "cage" ? COLORS.cage : COLORS.marker, fixture.collidable ? 0.92 : 0.35);
        g.fillRect(laneFixture.x, laneFixture.y, laneFixture.width, laneFixture.height);
      }
    }
  }

  private drawPickups(): void {
    const activePickupIds = new Set<string>();
    const time = performance.now();
    for (const pickup of this.snapshot.pickups) {
      if (!pickup.active) continue;
      activePickupIds.add(pickup.id);
      const bob = Math.sin((time * 0.004) + hashText(pickup.id)) * 4;
      const signalColor = this.pickupSignalColor(pickup);
      this.drawPickupSignal(pickup, bob, time, signalColor);
      const frame = PICKUP_FRAMES[pickup.type];
      let renderedSprite = false;
      if (this.textures.exists(SPRITE_ATLAS_KEY) && this.textures.getFrame(SPRITE_ATLAS_KEY, frame)) {
        let sprite = this.pickupSpritesById.get(pickup.id);
        if (!sprite) {
          sprite = this.add
            .image(pickup.x, pickup.y, SPRITE_ATLAS_KEY, frame)
            .setOrigin(0.5)
            .setDepth(20);
          this.pickupSpritesById.set(pickup.id, sprite);
        }
        sprite
          .setTexture(SPRITE_ATLAS_KEY, frame)
          .setPosition(pickup.x, pickup.y + bob)
          .setScale(pickup.type === "clusterAmmo" ? 0.6 : 0.54)
          .setAlpha(1)
          .setVisible(true);
        renderedSprite = true;
      }
      if (!renderedSprite) {
        this.graphics.fillStyle(signalColor, 0.92);
        this.graphics.fillCircle(pickup.x, pickup.y + bob, pickup.radius);
        this.graphics.lineStyle(3, 0xffffff, 0.5);
        this.graphics.strokeCircle(pickup.x, pickup.y + bob, pickup.radius + 4);
      }
    }

    for (const [pickupId, sprite] of this.pickupSpritesById.entries()) {
      if (activePickupIds.has(pickupId)) continue;
      sprite.destroy();
      this.pickupSpritesById.delete(pickupId);
    }
  }

  private pickupSignalColor(pickup: PickupView): number {
    if (pickup.type === "armor") return COLORS.blueLight;
    if (pickup.type === "repair") return COLORS.splitter;
    if (pickup.type === "ammoCache" || pickup.type === "clusterAmmo") return COLORS.shotput;
    return COLORS.javelin;
  }

  private drawPickupSignal(pickup: PickupView, bob: number, time: number, color: number): void {
    const x = pickup.x;
    const y = pickup.y + bob;
    const phase = (time * 0.006) + hashText(pickup.id);
    const pulse = (Math.sin(phase) + 1) / 2;
    const outerRadius = pickup.radius + 16 + (pulse * 8);
    const beamHeight = 58 + (pulse * 8);

    this.fxGraphics.lineStyle(3, color, 0.5 + (pulse * 0.22));
    this.fxGraphics.strokeCircle(x, y, outerRadius);
    this.fxGraphics.lineStyle(1, 0xffffff, 0.35);
    this.fxGraphics.strokeCircle(x, y, pickup.radius + 7);

    this.fxGraphics.fillStyle(color, 0.12);
    this.fxGraphics.fillTriangle(x - 18, y - 4, x + 18, y - 4, x, y - beamHeight);
    this.fxGraphics.lineStyle(2, color, 0.34);
    this.fxGraphics.lineBetween(x, y - 8, x, y - beamHeight);

    for (let index = 0; index < 3; index += 1) {
      const chevronY = y - 54 - (index * 12) + (pulse * 4);
      const alpha = 0.72 - (index * 0.14);
      this.fxGraphics.fillStyle(index === 0 ? 0xffffff : color, alpha);
      this.fxGraphics.fillTriangle(x - 9, chevronY, x + 9, chevronY, x, chevronY + 10);
    }

    this.graphics.fillStyle(0x05080a, 0.26);
    this.graphics.fillEllipse(x, y + pickup.radius + 16, pickup.radius * 2.7, 10);
  }

  private drawWorldProps(): void {
    const activePropIds = new Set<string>();
    for (const prop of this.snapshot.worldProps) {
      if (!prop.active) continue;
      activePropIds.add(prop.id);
      this.drawWorldPropStatusFx(prop);
      if (this.syncWorldPropSprite(prop)) continue;
      const color = prop.type === "oilBarrel" ? 0x8f2f24 : 0x9a6735;
      this.graphics.fillStyle(0x05080a, 0.28);
      this.graphics.fillEllipse(prop.x + (prop.width / 2), prop.y + prop.height + 4, prop.width * 1.2, 12);
      this.graphics.fillStyle(color, 0.94);
      this.graphics.fillRoundedRect(prop.x, prop.y, prop.width, prop.height, 6);
      this.graphics.lineStyle(2, 0xfacc15, prop.type === "oilBarrel" ? 0.65 : 0.32);
      this.graphics.strokeRoundedRect(prop.x, prop.y, prop.width, prop.height, 6);
    }

    for (const [propId, sprite] of this.worldPropSpritesById.entries()) {
      if (activePropIds.has(propId)) continue;
      sprite.destroy();
      this.worldPropSpritesById.delete(propId);
    }
  }

  private syncWorldPropSprite(prop: WorldPropView): boolean {
    if (!this.textures.exists(SPRITE_ATLAS_KEY)) return false;
    const frame = WORLD_PROP_FRAMES[prop.type];
    let sprite = this.worldPropSpritesById.get(prop.id);
    if (!sprite) {
      sprite = this.add
        .image(prop.x + (prop.width / 2), prop.y + prop.height, SPRITE_ATLAS_KEY, frame)
        .setOrigin(0.5, 1)
        .setDepth(15);
      this.worldPropSpritesById.set(prop.id, sprite);
    }
    const targetWidth = prop.width * (prop.type === "oilBarrel" ? 1.2 : 1.18);
    const scale = targetWidth / Math.max(1, sprite.frame.width);
    const hpRatio = this.worldPropHpRatio(prop);
    const damageRatio = 1 - hpRatio;
    const warningPulse = prop.type === "oilBarrel"
      ? (Math.sin((performance.now() * 0.01) + hashText(prop.id)) + 1) / 2
      : 0;
    const wobble = prop.type === "oilBarrel"
      ? Math.sin((performance.now() * (0.002 + damageRatio * 0.006)) + hashText(prop.id)) * (0.015 + damageRatio * 0.055)
      : Math.sin((performance.now() * 0.003) + hashText(prop.id)) * damageRatio * 0.025;
    const tint = damageRatio > 0.62
      ? (prop.type === "oilBarrel" ? 0xff8a4c : 0xfacc15)
      : damageRatio > 0.28
        ? 0xffd18a
        : 0xffffff;
    sprite
      .setTexture(SPRITE_ATLAS_KEY, frame)
      .setPosition(prop.x + (prop.width / 2), prop.y + prop.height)
      .setScale(scale)
      .setRotation(wobble)
      .setTint(tint)
      .setAlpha(1 - (warningPulse * damageRatio * 0.1))
      .setVisible(true);
    return true;
  }

  private drawWorldPropStatusFx(prop: WorldPropView): void {
    const hpRatio = this.worldPropHpRatio(prop);
    const damageRatio = 1 - hpRatio;
    if (damageRatio <= 0.08) return;
    const fx = this.fxGraphics;
    const centerX = prop.x + (prop.width / 2);
    const topY = prop.y + 6;
    const pulse = (Math.sin((performance.now() * 0.008) + hashText(prop.id)) + 1) / 2;
    if (prop.type === "oilBarrel") {
      const alpha = 0.18 + (damageRatio * 0.34) + (pulse * 0.12);
      fx.lineStyle(2 + (damageRatio * 2), 0xff6b35, alpha);
      fx.strokeCircle(centerX, prop.y + prop.height * 0.48, prop.width * (0.62 + pulse * 0.12));
      fx.fillStyle(0xffb703, 0.18 + damageRatio * 0.18);
      fx.fillTriangle(centerX - 8, topY - 10, centerX + 8, topY - 10, centerX, topY - 28 - (pulse * 8));
    }

    const smokeCount = Math.min(4, 1 + Math.floor(damageRatio * 4));
    for (let i = 0; i < smokeCount; i += 1) {
      const drift = Math.sin((performance.now() * 0.002) + i + hashText(prop.id)) * 10;
      const y = topY - 10 - (i * 10) - (pulse * 8);
      fx.fillStyle(prop.type === "oilBarrel" ? 0x1f2937 : 0x475569, (0.08 + damageRatio * 0.14) * (1 - i * 0.12));
      fx.fillCircle(centerX + drift + ((i - 1.5) * 4), y, 5 + damageRatio * 8 - i);
    }
  }

  private worldPropHpRatio(prop: WorldPropView): number {
    const maxHp = prop.type === "oilBarrel" ? WORLD_PROPS.oilBarrelHp : WORLD_PROPS.supplyCrateHp;
    return clamp01(prop.hp / Math.max(1, maxHp));
  }

  private drawPlayers(): void {
    const activeSessionIds = new Set<string>();
    for (const player of this.snapshot.players) {
      activeSessionIds.add(player.sessionId);
      this.drawTank(this.resolveRenderedPlayer(player));
    }
    this.destroyInactiveTankSprites(activeSessionIds);
    this.destroyInactivePlayerRenderStates(activeSessionIds);
  }

  private resolveRenderedPlayer(player: PlayerView): PlayerView {
    let state = this.playerRenderStateBySessionId.get(player.sessionId);
    if (!state) {
      state = { x: player.x, y: player.y };
      this.playerRenderStateBySessionId.set(player.sessionId, state);
    }
    const distance = Math.hypot(player.x - state.x, player.y - state.y);
    const snap = distance > 260 || player.hp <= 0 || !player.connected;
    if (snap) {
      state.x = player.x;
      state.y = player.y;
    } else {
      const factor = player.grounded ? 0.24 : 0.32;
      state.x += (player.x - state.x) * factor;
      state.y += (player.y - state.y) * factor;
    }
    return {
      ...player,
      x: state.x,
      y: state.y,
    };
  }

  private drawTank(player: PlayerView): void {
    const g = this.graphics;
    const customAim = this.resolvePlayerAim(player);
    const customCharge = player.sessionId === this.localSessionId && this.chargingStartedAtMs !== null ? resolveChargeRatio(performance.now() - this.chargingStartedAtMs) : player.charging ? .65 : 0;
    if (this.vehicleRenderer.draw(g, player, this.localSessionId, customAim, customCharge)) {
      const sprites = this.tankSpritesBySessionId.get(player.sessionId);
      if (sprites) { sprites.shadow.setVisible(false); sprites.body.setVisible(false); sprites.pilot.setVisible(false); }
      this.drawPlayerMomentumStreaks(player);
      return;
    }
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
    this.drawPlayerMomentumStreaks(player);

    this.drawShieldShell(player);

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
    const movingOnGround = player.grounded && Math.abs(player.vx) > 18;
    const bodyFrame = player.hp <= 0
      ? sideSprites.bodyDamaged
      : (player.charging || isLocallyCharging || movingOnGround ? sideSprites.treads[treadIndex] ?? sideSprites.bodyIdle : sideSprites.bodyIdle);
    if (!this.hasAtlasFrame(bodyFrame) || !this.hasAtlasFrame(sideSprites.pilot)) return false;

    const sprites = this.getTankSprites(player.sessionId, bodyFrame, sideSprites.pilot);
    const alpha = player.connected ? 1 : 0.46;
    const bodyScale = this.resolveFrameScale(bodyFrame, 112);
    const shadowScale = this.resolveFrameScale(SPRITES.tank.shadow, 112);
    const pilotScale = this.resolveFrameScale(sideSprites.pilot, 46);
    const facingScaleX = player.side === "red" ? -bodyScale : bodyScale;
    const pilotFacingScaleX = player.side === "red" ? -pilotScale : pilotScale;
    const bob = Math.sin(performance.now() * 0.004 + player.x * 0.03) * (player.charging ? 1.4 : 0.45);
    const airborneRatio = player.grounded ? 0 : clamp01(Math.min(1, Math.hypot(player.vx, player.vy) / 680));
    const lean = clamp(player.vx / Math.max(1, MOVEMENT.airMaxSpeedPxPerSecond), -1, 1) * 0.14 * airborneRatio;
    const stretch = 1 + (airborneRatio * 0.045);
    const squash = 1 - (airborneRatio * 0.055);
    const bodyBottomY = player.y + 8 + bob;
    const pilotBottomY = player.y - WORLD.tankHeight + 8 + (bob * 0.55);

    sprites.shadow
      .setTexture(SPRITE_ATLAS_KEY, SPRITES.tank.shadow)
      .setPosition(player.x, player.y + 14)
      .setScale(shadowScale * (1 + (airborneRatio * 0.18)), shadowScale * (0.9 - (airborneRatio * 0.24)))
      .setAlpha(alpha * (0.52 - (airborneRatio * 0.18)))
      .setVisible(true);
    sprites.body
      .setTexture(SPRITE_ATLAS_KEY, bodyFrame)
      .setPosition(player.x, bodyBottomY)
      .setRotation(lean)
      .setScale(facingScaleX * stretch, bodyScale * squash)
      .setAlpha(alpha)
      .setVisible(true);
    sprites.pilot
      .setTexture(SPRITE_ATLAS_KEY, sideSprites.pilot)
      .setPosition(player.x, pilotBottomY)
      .setRotation(lean * 0.65)
      .setScale(pilotFacingScaleX, pilotScale * (1 + (airborneRatio * 0.04)))
      .setAlpha(alpha)
      .setVisible(true);

    return true;
  }

  private drawPlayerMomentumStreaks(player: PlayerView): void {
    if (player.grounded) return;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed < 120) return;
    const fx = this.fxGraphics;
    const direction = normalize(player.vx, player.vy, { x: SIDE_SIGN[player.side], y: 0 });
    const color = lightColorForSide(player.side);
    const alpha = clamp01((speed - 120) / 520) * 0.34;
    const baseY = player.y - WORLD.tankHeight * 0.45;
    for (let i = 0; i < 4; i += 1) {
      const offset = (i - 1.5) * 8;
      const startX = player.x - (direction.x * (42 + (i * 8))) + (direction.y * offset);
      const startY = baseY - (direction.y * (32 + (i * 7))) - (direction.x * offset);
      fx.lineStyle(2, color, alpha * (1 - (i * 0.14)));
      fx.beginPath();
      fx.moveTo(startX, startY);
      fx.lineTo(startX - (direction.x * 46), startY - (direction.y * 26));
      fx.strokePath();
    }
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
    this.vehicleRenderer.retain(activeSessionIds);
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

    if (ammoType === "needle") {
      const length = Math.max(34, radius * 12);
      const tailX = x - (cos * length * 0.52);
      const tailY = y - (sin * length * 0.52);
      const tipX = x + (cos * length * 0.58);
      const tipY = y + (sin * length * 0.58);
      fx.lineStyle(Math.max(5, radius * 1.4), profile.spark, alpha * 0.22);
      fx.beginPath();
      fx.moveTo(tailX, tailY);
      fx.lineTo(tipX, tipY);
      fx.strokePath();
      g.lineStyle(Math.max(2, radius * 0.64), profile.hot, alpha);
      g.beginPath();
      g.moveTo(tailX, tailY);
      g.lineTo(tipX, tipY);
      g.strokePath();
      g.fillStyle(profile.spark, alpha * 0.9);
      g.fillTriangle(
        tipX,
        tipY,
        x - (cos * radius * 0.8) + (sin * radius * 1.4),
        y - (sin * radius * 0.8) - (cos * radius * 1.4),
        x - (cos * radius * 0.8) - (sin * radius * 1.4),
        y - (sin * radius * 0.8) + (cos * radius * 1.4),
      );
      return;
    }

    if (ammoType === "discus") {
      fx.fillStyle(profile.glow, alpha * 0.16);
      fx.fillEllipse(x, y, radius * 4.2, radius * 2.1);
      fx.lineStyle(3, profile.spark, alpha * 0.38);
      fx.strokeEllipse(x, y, radius * 3.2, radius * 1.45);
      g.lineStyle(Math.max(3, radius * 0.42), profile.hot, alpha);
      g.strokeEllipse(x, y, radius * 2.7, radius * 1.18);
      g.lineStyle(2, profile.accent, alpha * 0.74);
      g.beginPath();
      g.moveTo(x - (cos * radius * 1.5), y - (sin * radius * 1.5));
      g.lineTo(x + (cos * radius * 1.8), y + (sin * radius * 1.8));
      g.strokePath();
      return;
    }

    if (ammoType === "mortar") {
      fx.fillStyle(profile.glow, alpha * 0.16);
      fx.fillCircle(x, y, radius * 2.3);
      g.fillStyle(0x1f2937, alpha);
      g.fillEllipse(x, y, radius * 1.35, radius * 1.95);
      g.lineStyle(3, profile.spark, alpha * 0.86);
      g.beginPath();
      g.moveTo(x + (cos * radius * 0.2), y + (sin * radius * 0.2));
      g.lineTo(x + (cos * radius * 1.15), y + (sin * radius * 1.15));
      g.strokePath();
      g.fillStyle(profile.core, alpha);
      g.fillCircle(x + (cos * radius * 0.8), y + (sin * radius * 0.8), Math.max(3, radius * 0.32));
      return;
    }

    if (ammoType === "cluster") {
      fx.fillStyle(profile.glow, alpha * 0.16);
      fx.fillCircle(x, y, radius * 2.2);
      g.fillStyle(profile.core, alpha);
      g.fillCircle(x, y, radius * 0.88);
      g.lineStyle(2, profile.shadow, alpha * 0.72);
      g.strokeCircle(x, y, radius * 0.95);
      for (let i = 0; i < 5; i += 1) {
        const bombletAngle = angle + ((Math.PI * 2 * i) / 5);
        const orbit = radius * 1.25;
        g.fillStyle(i % 2 === 0 ? profile.spark : profile.accent, alpha);
        g.fillCircle(x + (Math.cos(bombletAngle) * orbit), y + (Math.sin(bombletAngle) * orbit), Math.max(2.4, radius * 0.28));
      }
      return;
    }

    if (ammoType === "splitter") {
      fx.fillStyle(profile.glow, alpha * 0.16);
      fx.fillCircle(x, y, radius * 2.15);
      g.fillStyle(profile.core, alpha);
      g.fillCircle(x, y, radius * 0.9);
      for (let i = 0; i < 7; i += 1) {
        const shardAngle = angle + ((Math.PI * 2 * i) / 7);
        const distance = radius * (0.8 + ((i % 3) * 0.18));
        const shardX = x + (Math.cos(shardAngle) * distance);
        const shardY = y + (Math.sin(shardAngle) * distance);
        g.lineStyle(2, i % 2 === 0 ? profile.spark : profile.accent, alpha * 0.74);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(shardX + (Math.cos(shardAngle) * radius * 0.9), shardY + (Math.sin(shardAngle) * radius * 0.9));
        g.strokePath();
      }
      return;
    }

    if (ammoType === "anvil") {
      const width = Math.max(20, radius * 2.4);
      const height = Math.max(16, radius * 1.55);
      fx.fillStyle(profile.glow, alpha * 0.13);
      fx.fillEllipse(x, y + (height * 0.28), width * 1.6, height * 1.05);
      g.fillStyle(profile.shadow, alpha);
      g.fillRect(x - (width * 0.5), y - (height * 0.2), width, height * 0.62);
      g.fillStyle(profile.core, alpha);
      g.fillRect(x - (width * 0.36), y - (height * 0.54), width * 0.72, height * 0.36);
      g.lineStyle(2, profile.hot, alpha * 0.52);
      g.strokeRect(x - (width * 0.5), y - (height * 0.2), width, height * 0.62);
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

    if (ammoType === "needle") {
      const longTail = Math.max(72, radius * 18 + (speedRatio * 88));
      const needleTail = pointAlong({ x, y }, direction, -longTail);
      fx.lineStyle(Math.max(7, radius * 1.9), profile.spark, alpha * (0.1 + (speedRatio * 0.12)));
      fx.beginPath();
      fx.moveTo(x, y);
      fx.lineTo(needleTail.x, needleTail.y);
      fx.strokePath();
      fx.lineStyle(Math.max(2, radius * 0.55), profile.hot, alpha * (0.5 + (speedRatio * 0.24)));
      fx.beginPath();
      fx.moveTo(x + (direction.x * radius * 1.4), y + (direction.y * radius * 1.4));
      fx.lineTo(needleTail.x, needleTail.y);
      fx.strokePath();
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.55 + speedRatio, alpha);
      return;
    }

    if (ammoType === "discus") {
      for (let i = -1; i <= 1; i += 2) {
        const offset = i * (radius * (1.05 + pulse * 0.35));
        const start = {
          x: x + (normal.x * offset),
          y: y + (normal.y * offset),
        };
        const end = {
          x: tail.x + (normal.x * offset * 1.7),
          y: tail.y + (normal.y * offset * 1.7),
        };
        fx.lineStyle(3, i < 0 ? profile.hot : profile.spark, alpha * (0.22 + (speedRatio * 0.18)));
        fx.beginPath();
        fx.moveTo(start.x, start.y);
        fx.lineTo(end.x, end.y);
        fx.strokePath();
      }
      fx.lineStyle(2, profile.accent, alpha * 0.35);
      fx.strokeEllipse(x, y, radius * (3.4 + pulse), radius * (1.2 + pulse * 0.35));
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.62 + speedRatio, alpha);
      return;
    }

    if (ammoType === "mortar") {
      const smokeTail = Math.max(radius * 5, 62 + (speedRatio * 48));
      const smoke = pointAlong({ x, y }, direction, -smokeTail);
      fx.lineStyle(Math.max(12, radius * 2.3), 0x475569, alpha * 0.16);
      fx.beginPath();
      fx.moveTo(x, y);
      fx.lineTo(smoke.x + (normal.x * Math.sin(time * 0.009) * 9), smoke.y + (normal.y * Math.sin(time * 0.009) * 9));
      fx.strokePath();
      fx.lineStyle(Math.max(5, radius * 0.92), profile.spark, alpha * 0.26);
      fx.beginPath();
      fx.moveTo(x - (direction.x * radius * 0.5), y - (direction.y * radius * 0.5));
      fx.lineTo(tail.x, tail.y);
      fx.strokePath();
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.82 + speedRatio, alpha);
      return;
    }

    if (ammoType === "cluster") {
      fx.fillStyle(profile.glow, alpha * (0.1 + (pulse * 0.08)));
      fx.fillCircle(x, y, radius * (2.1 + speedRatio * 0.6));
      for (let i = 0; i < 5; i += 1) {
        const wobble = (time * 0.007) + ((Math.PI * 2 * i) / 5);
        const orbit = radius * (1.9 + speedRatio * 0.55);
        const bombletX = x - (direction.x * radius * (0.5 + i * 0.18)) + (Math.cos(wobble) * orbit);
        const bombletY = y - (direction.y * radius * (0.5 + i * 0.18)) + (Math.sin(wobble) * orbit * 0.74);
        fx.fillStyle(i % 2 === 0 ? profile.spark : profile.accent, alpha * 0.48);
        fx.fillCircle(bombletX, bombletY, Math.max(2.2, radius * 0.24));
      }
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.92 + speedRatio, alpha);
      return;
    }

    if (ammoType === "splitter") {
      fx.fillStyle(profile.glow, alpha * (0.1 + (pulse * 0.1)));
      fx.fillCircle(x, y, radius * (2.35 + speedRatio * 0.6));
      for (let i = 0; i < 7; i += 1) {
        const shardAngle = Math.atan2(direction.y, direction.x) + Math.PI + ((i - 3) * 0.18);
        const distance = radius * (1.5 + ((i % 3) * 0.34)) + (pulse * 9);
        const shardX = x + (Math.cos(shardAngle) * distance);
        const shardY = y + (Math.sin(shardAngle) * distance);
        fx.lineStyle(i % 2 === 0 ? 3 : 2, i % 2 === 0 ? profile.spark : profile.accent, alpha * 0.42);
        fx.beginPath();
        fx.moveTo(shardX, shardY);
        fx.lineTo(shardX + (Math.cos(shardAngle) * radius * 1.8), shardY + (Math.sin(shardAngle) * radius * 1.8));
        fx.strokePath();
      }
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.95 + speedRatio, alpha);
      return;
    }

    if (ammoType === "anvil") {
      fx.fillStyle(profile.shadow, alpha * 0.16);
      fx.fillEllipse(x - (direction.x * radius), y - (direction.y * radius), radius * 5.4, radius * 2.4);
      fx.lineStyle(4, profile.spark, alpha * 0.16);
      fx.beginPath();
      fx.moveTo(x - (normal.x * radius * 1.1), y - (normal.y * radius * 1.1));
      fx.lineTo(tail.x - (normal.x * radius * 1.8), tail.y - (normal.y * radius * 1.8));
      fx.moveTo(x + (normal.x * radius * 1.1), y + (normal.y * radius * 1.1));
      fx.lineTo(tail.x + (normal.x * radius * 1.8), tail.y + (normal.y * radius * 1.8));
      fx.strokePath();
      this.drawEnergyParticles(ammoType, x, y, vx, vy, radius, 0.72 + speedRatio, alpha);
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
    const spreadScaleByAmmo: Record<AmmoType, number> = {
      javelin: 0.48,
      shotput: 0.92,
      splitter: 1.18,
      discus: 0.58,
      mortar: 1.45,
      needle: 0.18,
      cluster: 1.6,
      anvil: 1.08,
    };
    const tailLengthByAmmo: Record<AmmoType, number> = {
      javelin: 70,
      shotput: 42,
      splitter: 58,
      discus: 62,
      mortar: 76,
      needle: 94,
      cluster: 64,
      anvil: 38,
    };
    const spreadScale = spreadScaleByAmmo[ammoType];
    const tailLength = Math.max(radius * 3, tailLengthByAmmo[ammoType]);
    const lineWidth = ammoType === "needle" ? 1 : ammoType === "shotput" || ammoType === "mortar" || ammoType === "anvil" ? 3 : 2;
    const particleRadius = ammoType === "needle"
      ? 1.4
      : ammoType === "splitter" || ammoType === "cluster"
        ? 2.8
        : ammoType === "anvil"
          ? 3.1
          : 2.2;

    for (let i = 0; i < count; i += 1) {
      const seed = (i + 1) * (ammoType === "javelin" ? 13.7 : ammoType === "shotput" ? 19.3 : ammoType === "needle" ? 31.1 : 23.9);
      const phase = fract((time * (ammoType === "shotput" || ammoType === "anvil" ? 0.7 : ammoType === "needle" ? 1.45 : 1.1)) + pseudoRandom(seed));
      const spread = (pseudoRandom(seed + 5.1) - 0.5) * spreadScale;
      const angle = baseAngle + Math.PI + spread;
      const distance = radius + (phase * tailLength * (0.65 + clamp01(intensity)));
      const particleX = x + (Math.cos(angle) * distance);
      const particleY = y + (Math.sin(angle) * distance);
      const lineLength = 5 + (pseudoRandom(seed + 11.2) * 18 * clamp01(intensity));
      const particleAlpha = alpha * (1 - phase) * (0.3 + (0.55 * clamp01(intensity)));
      const color = i % 4 === 0 ? profile.hot : i % 3 === 0 ? profile.spark : profile.glow;

      fx.lineStyle(lineWidth, color, particleAlpha);
      fx.beginPath();
      fx.moveTo(particleX, particleY);
      fx.lineTo(particleX + (Math.cos(angle) * lineLength), particleY + (Math.sin(angle) * lineLength));
      fx.strokePath();
      fx.fillStyle(color, particleAlpha * 0.86);
      fx.fillCircle(particleX, particleY, particleRadius);
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
      const durationByAmmo: Record<AmmoType, number> = {
        javelin: 620,
        shotput: 760,
        splitter: 620,
        discus: 680,
        mortar: 940,
        needle: 420,
        cluster: 780,
        anvil: 820,
      };
      const progress = clamp01(age / durationByAmmo[impact.ammoType]);
      const inverse = 1 - progress;
      const profile = AMMO_FX[impact.ammoType];
      const ease = easeOutCubic(progress);
      const baseScaleByAmmo: Record<AmmoType, number> = {
        javelin: 0.28,
        shotput: 0.5,
        splitter: 0.34,
        discus: 0.32,
        mortar: 0.56,
        needle: 0.2,
        cluster: 0.42,
        anvil: 0.52,
      };
      const baseScale = baseScaleByAmmo[impact.ammoType];
      const strength = impact.strength;
      const direction = normalize(impact.vx, impact.vy, { x: 1, y: -0.15 });
      const normal = { x: -direction.y, y: direction.x };

      if (progress >= 1) {
        for (const sprite of impact.sprites) sprite.destroy();
        this.impactFx.splice(index, 1);
        continue;
      }

      impact.sprites.forEach((sprite, spriteIndex) => {
        const spriteScale = baseScale + (ease * strength * (impact.ammoType === "mortar" ? 0.86 : impact.ammoType === "shotput" || impact.ammoType === "anvil" ? 0.72 : 0.46)) + (spriteIndex * 0.08);
        sprite
          .setPosition(
            impact.x + (spriteIndex > 1 ? Math.cos((now * 0.012) + spriteIndex) * 24 * ease : 0),
            impact.y + (spriteIndex > 1 ? Math.sin((now * 0.01) + spriteIndex) * (impact.ammoType === "mortar" ? 30 : 16) * ease : 0),
          )
          .setScale(spriteScale)
          .setRotation((now * 0.002 * (spriteIndex + 1)) + (spriteIndex * 0.7))
          .setAlpha(Math.max(0, inverse * (spriteIndex === 1 ? 0.5 : 0.84)));
      });

      if (impact.ammoType === "javelin") {
        fx.lineStyle(3, profile.glow, inverse * 0.34);
        fx.strokeEllipse(impact.x, impact.y, 34 + (ease * strength * 88), 12 + (ease * strength * 26));
        fx.lineStyle(4, profile.spark, inverse * 0.46);
        fx.beginPath();
        fx.moveTo(impact.x - (direction.x * (44 + ease * strength * 38)), impact.y - (direction.y * (44 + ease * strength * 38)));
        fx.lineTo(impact.x + (direction.x * (44 + ease * strength * 38)), impact.y + (direction.y * (44 + ease * strength * 38)));
        fx.strokePath();
      } else if (impact.ammoType === "shotput") {
        g.lineStyle(4, 0xffffff, inverse * 0.3);
        g.strokeEllipse(impact.x, impact.y + 6, 70 + (ease * strength * 180), 24 + (ease * strength * 44));
        fx.lineStyle(6, profile.spark, inverse * 0.18);
        fx.strokeEllipse(impact.x, impact.y + 10, 96 + (ease * strength * 240), 28 + (ease * strength * 62));
        fx.fillStyle(profile.glow, inverse * 0.11);
        fx.fillEllipse(impact.x, impact.y + 8, 82 + (ease * strength * 170), 30 + (ease * strength * 58));
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
      } else if (impact.ammoType === "splitter") {
        fx.fillStyle(profile.hot, inverse * 0.18);
        fx.fillCircle(impact.x, impact.y, 12 + (ease * 20));
        for (let i = 0; i < 7; i += 1) {
          const angle = Math.atan2(direction.y, direction.x) + Math.PI + ((i - 3) * 0.28);
          const distance = 24 + (ease * strength * (70 + (i % 2) * 18));
          const start = pointAlong({ x: impact.x, y: impact.y }, { x: Math.cos(angle), y: Math.sin(angle) }, 10);
          const end = pointAlong({ x: impact.x, y: impact.y }, { x: Math.cos(angle), y: Math.sin(angle) }, distance);
          fx.lineStyle(i % 2 === 0 ? 4 : 2, i % 2 === 0 ? profile.spark : profile.accent, inverse * 0.55);
          fx.beginPath();
          fx.moveTo(start.x, start.y);
          fx.lineTo(end.x, end.y);
          fx.strokePath();
        }
      } else if (impact.ammoType === "discus") {
        for (let ring = 0; ring < 3; ring += 1) {
          fx.lineStyle(3 - ring * 0.5, ring === 0 ? profile.hot : profile.spark, inverse * (0.45 - ring * 0.08));
          fx.strokeEllipse(
            impact.x,
            impact.y,
            44 + (ring * 22) + (ease * strength * 130),
            14 + (ring * 9) + (ease * strength * 44),
          );
        }
        for (let i = 0; i < 7; i += 1) {
          const angle = (Math.PI * 2 * i) / 7;
          const sliceLength = 22 + (ease * strength * 54);
          const centerX = impact.x + (Math.cos(angle) * (18 + ease * 64));
          const centerY = impact.y + (Math.sin(angle) * (10 + ease * 34));
          fx.lineStyle(2, i % 2 === 0 ? profile.hot : profile.accent, inverse * 0.42);
          fx.beginPath();
          fx.moveTo(centerX - (normal.x * sliceLength * 0.45), centerY - (normal.y * sliceLength * 0.45));
          fx.lineTo(centerX + (normal.x * sliceLength * 0.45), centerY + (normal.y * sliceLength * 0.45));
          fx.strokePath();
        }
      } else if (impact.ammoType === "mortar") {
        fx.fillStyle(profile.glow, inverse * 0.18);
        fx.fillEllipse(impact.x, impact.y - (ease * 46), 68 + (ease * strength * 130), 86 + (ease * strength * 190));
        fx.fillStyle(profile.spark, inverse * 0.18);
        fx.fillCircle(impact.x, impact.y - (ease * 38), 22 + (ease * strength * 52));
        fx.lineStyle(6, profile.hot, inverse * 0.34);
        fx.strokeEllipse(impact.x, impact.y + 8, 86 + (ease * strength * 260), 24 + (ease * strength * 62));
        for (let i = 0; i < 12; i += 1) {
          const angle = (-Math.PI * 0.95) + ((Math.PI * 1.9 * i) / 11);
          const distance = 28 + (ease * strength * (92 + (i % 4) * 14));
          const emberX = impact.x + (Math.cos(angle) * distance);
          const emberY = impact.y + (Math.sin(angle) * distance) - (inverse * 18);
          fx.fillStyle(i % 3 === 0 ? profile.hot : profile.spark, inverse * 0.55);
          fx.fillCircle(emberX, emberY, 2.6 + (inverse * 2.8));
        }
      } else if (impact.ammoType === "needle") {
        fx.fillStyle(profile.hot, inverse * 0.62);
        fx.fillCircle(impact.x, impact.y, 5 + (ease * 8));
        for (let i = 0; i < 4; i += 1) {
          const sign = i % 2 === 0 ? 1 : -1;
          const axis = i < 2 ? direction : normal;
          fx.lineStyle(i < 2 ? 2 : 1, i < 2 ? profile.spark : profile.hot, inverse * 0.48);
          fx.beginPath();
          fx.moveTo(impact.x - (axis.x * sign * (12 + ease * 22)), impact.y - (axis.y * sign * (12 + ease * 22)));
          fx.lineTo(impact.x + (axis.x * sign * (22 + ease * 42)), impact.y + (axis.y * sign * (22 + ease * 42)));
          fx.strokePath();
        }
      } else if (impact.ammoType === "cluster") {
        fx.lineStyle(3, profile.glow, inverse * 0.32);
        fx.strokeCircle(impact.x, impact.y, 20 + (ease * strength * 86));
        for (let i = 0; i < 5; i += 1) {
          const angle = (Math.PI * 2 * i) / 5;
          const delay = clamp01((progress - (i * 0.055)) / 0.82);
          const popEase = easeOutCubic(delay);
          const centerX = impact.x + (Math.cos(angle) * (24 + ease * 48));
          const centerY = impact.y + (Math.sin(angle) * (16 + ease * 28));
          fx.lineStyle(3, i % 2 === 0 ? profile.spark : profile.accent, (1 - delay) * inverse * 0.72);
          fx.strokeCircle(centerX, centerY, 8 + (popEase * 34));
          fx.fillStyle(profile.glow, (1 - delay) * inverse * 0.18);
          fx.fillCircle(centerX, centerY, 12 + (popEase * 26));
        }
      } else if (impact.ammoType === "anvil") {
        fx.fillStyle(profile.shadow, inverse * 0.2);
        fx.fillEllipse(impact.x, impact.y + 12, 96 + (ease * strength * 210), 28 + (ease * strength * 48));
        fx.lineStyle(7, profile.hot, inverse * 0.28);
        fx.strokeEllipse(impact.x, impact.y + 12, 76 + (ease * strength * 250), 16 + (ease * strength * 38));
        for (let i = 0; i < 9; i += 1) {
          const offset = (i - 4) * 18;
          const crackX = impact.x + offset;
          const crackY = impact.y + 12 + (Math.abs(i - 4) * 1.8);
          fx.lineStyle(2, i % 2 === 0 ? profile.spark : profile.shadow, inverse * 0.42);
          fx.beginPath();
          fx.moveTo(crackX, crackY);
          fx.lineTo(crackX + (Math.sign(offset || 1) * (18 + ease * 28)), crackY + (8 + ease * 16));
          fx.strokePath();
        }
      } else {
        fx.lineStyle(4 + (impact.radius * 0.1), profile.hot, inverse * 0.58);
        fx.strokeCircle(impact.x, impact.y, 20 + (ease * strength * (impact.radius * 5 + 82)));
        fx.lineStyle(2, profile.glow, inverse * 0.38);
        fx.strokeCircle(impact.x, impact.y, 9 + (ease * strength * (impact.radius * 3.5 + 42)));
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
    this.windAimCueVisible = false;
    this.aimPreviewDiagnostic = this.emptyAimPreviewDiagnostic();
    if (!player || this.snapshot.roundState !== "active") return;

    const startedAtMs = this.chargingStartedAtMs;
    const isCharging = startedAtMs !== null;
    const chargeMs = isCharging ? performance.now() - startedAtMs : 700;
    const ammo = getAmmoDefinition(this.selectedAmmo);
    const hand = resolveThrowHandPosition(player.x, player.y, player.side, this.pointerAim);
    const velocity = buildLaunchVelocity(ammo, chargeMs, this.pointerAim);
    const previewColliders = this.buildAimPreviewColliders(player);
    const points = predictTrajectory(
      {
        x: hand.x,
        y: hand.y,
        vx: velocity.x,
        vy: velocity.y,
        radius: ammo.radius,
      },
      buildProjectilePhysicsProfile(ammo.gravityScale, ammo.dragPerSecond, this.snapshot.windAccelerationX),
      isCharging ? 132 : 84,
      1 / 38,
      this.resolveWorldWidth(),
      this.terrainLane,
      player.laneIndex * WORLD.width,
      WORLD.height,
      previewColliders,
    );

    const g = this.graphics;
    const ratio = resolveChargeRatio(chargeMs);
    const previewColor = colorForAmmo(this.selectedAmmo);
    const landing = points.at(-1) ?? hand;
    const target = this.resolveAimPreviewTarget(player, ammo, landing, points);
    const propTarget = this.resolveAimPreviewPropTarget(player, ammo, landing, points);
    this.aimPreviewDiagnostic = {
      previewActive: points.length > 1,
      landingX: Math.round(landing.x * 10) / 10,
      landingY: Math.round(landing.y * 10) / 10,
      targetDistance: Math.round(target.distance * 10) / 10,
      targetDangerRadius: Math.round(target.dangerRadius * 10) / 10,
      targetWillHit: target.willHit,
      propDistance: Math.round(propTarget.distance * 10) / 10,
      propWillHit: propTarget.willHit,
      propType: propTarget.prop?.type ?? "",
    };
    const lineAlpha = isCharging ? 0.62 + (ratio * 0.28) : 0.34;
    g.lineStyle(2, previewColor, lineAlpha);
    g.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) continue;
      if (i === 0) g.moveTo(point.x, point.y);
      else g.lineTo(point.x, point.y);
    }
    g.strokePath();

    for (let i = 0; i < points.length; i += 4) {
      const point = points[i];
      if (!point) continue;
      const progress = points.length <= 1 ? 1 : i / (points.length - 1);
      g.fillStyle(COLORS.preview, (isCharging ? 0.26 + (ratio * 0.42) : 0.2) * (1 - (progress * 0.35)));
      g.fillCircle(point.x, point.y, 2.8 + (progress * 1.8));
    }
    this.drawTrajectoryTimingMarkers(points, previewColor, ratio, isCharging);
    this.drawAimLandingIndicator(landing, ammo, target, ratio, isCharging);
    this.drawAimPropTargetCue(propTarget, ammo, ratio, isCharging);
    this.drawAimWindCue(landing, ratio, isCharging);

    if (isCharging) {
      this.drawAimPullGuide(hand, this.pointerAim, ratio);
      this.drawAimChargePreview(this.selectedAmmo, hand, this.pointerAim, ratio);
      g.lineStyle(5, previewColor, 0.85);
      g.beginPath();
      g.moveTo(hand.x, hand.y);
      g.lineTo(hand.x + (this.pointerAim.x * (50 + (ratio * 50))), hand.y + (this.pointerAim.y * (50 + (ratio * 50))));
      g.strokePath();
    }
  }

  private drawAimWindCue(landing: Vec2, chargeRatio: number, isCharging: boolean): void {
    const wind = this.snapshot.windAccelerationX;
    if (!isCharging || Math.abs(wind) < WIND.calmThresholdPxPerSecondSq) return;
    this.windAimCueVisible = true;
    const fx = this.fxGraphics;
    const direction = Math.sign(wind);
    const strength = clamp01(Math.abs(wind) / WIND.maxAccelerationPxPerSecondSq);
    const pulse = (Math.sin(performance.now() * 0.012) + 1) / 2;
    const alpha = 0.34 + (chargeRatio * 0.26) + (pulse * 0.12);
    const length = 44 + (strength * 58);
    const y = landing.y - 34 - (pulse * 4);
    const startX = landing.x - (direction * (length * 0.56));
    const endX = landing.x + (direction * (length * 0.56));
    const color = wind > 0 ? COLORS.blueLight : COLORS.redLight;

    fx.lineStyle(4, color, alpha);
    fx.beginPath();
    fx.moveTo(startX, y);
    fx.lineTo(endX, y);
    fx.strokePath();
    fx.lineStyle(2, 0xffffff, alpha * 0.45);
    fx.beginPath();
    fx.moveTo(startX, y - 7);
    fx.lineTo(endX - (direction * 12), y - 7);
    fx.strokePath();
    fx.fillStyle(color, alpha + 0.08);
    fx.fillTriangle(
      endX,
      y,
      endX - (direction * 18),
      y - 11,
      endX - (direction * 18),
      y + 11,
    );
    fx.fillStyle(0x020617, 0.42);
    fx.fillRoundedRect(landing.x - 27, y - 31, 54, 18, 5);
    fx.lineStyle(1, color, alpha * 0.64);
    fx.strokeRoundedRect(landing.x - 27, y - 31, 54, 18, 5);
  }

  private drawShieldShell(player: PlayerView): void {
    if (player.shieldHp <= 0) return;
    const fx = this.fxGraphics;
    const ratio = clamp01(player.shieldHp / Math.max(1, player.shieldMaxHp));
    const pulse = (Math.sin(performance.now() * 0.008 + player.x * 0.01) + 1) / 2;
    const alpha = 0.12 + (ratio * 0.22) + (pulse * 0.06);
    const radiusX = WORLD.tankWidth * (0.72 + (ratio * 0.1));
    const radiusY = WORLD.tankHeight * (1.18 + (ratio * 0.2));

    fx.lineStyle(2 + (ratio * 3), COLORS.blueLight, alpha + 0.12);
    fx.strokeEllipse(player.x, player.y - WORLD.tankHeight / 2, radiusX, radiusY);
    fx.lineStyle(1, 0xffffff, alpha);
    fx.strokeEllipse(player.x, player.y - WORLD.tankHeight / 2, radiusX + 14 + (pulse * 6), radiusY + 8 + (pulse * 4));
  }

  private drawDashBursts(): void {
    const fx = this.fxGraphics;
    const now = performance.now();
    for (let index = this.dashBursts.length - 1; index >= 0; index -= 1) {
      const burst = this.dashBursts[index];
      if (!burst) continue;
      const age = now - burst.startedAtMs;
      const progress = clamp01(age / 420);
      if (progress >= 1) {
        this.dashBursts.splice(index, 1);
        continue;
      }
      const inverse = 1 - progress;
      const dashDirection = burst.direction;
      const color = burst.side === "blue" ? COLORS.blueLight : COLORS.flagRed;
      for (let streak = 0; streak < 5; streak += 1) {
        const offsetY = (streak - 2) * 9;
        const length = 64 + (streak * 10) + (progress * 44);
        const startX = burst.x - (dashDirection * (18 + (progress * 28)));
        fx.lineStyle(4 - (streak * 0.35), streak % 2 === 0 ? color : COLORS.preview, inverse * (0.3 - (streak * 0.025)));
        fx.beginPath();
        fx.moveTo(startX, burst.y + offsetY);
        fx.lineTo(startX - (dashDirection * length), burst.y + offsetY + (Math.sin(progress * Math.PI + streak) * 10));
        fx.strokePath();
      }
      fx.fillStyle(color, inverse * 0.13);
      fx.fillEllipse(burst.x - (dashDirection * 36), burst.y + 18, 118 + (progress * 44), 28);
    }
  }

  private drawCombatTexts(): void {
    const now = performance.now();
    const g = this.graphics;
    for (let index = this.combatTexts.length - 1; index >= 0; index -= 1) {
      const item = this.combatTexts[index];
      if (!item) continue;
      const age = now - item.startedAtMs;
      const progress = clamp01(age / 900);
      if (progress >= 1) {
        item.label.destroy();
        this.combatTexts.splice(index, 1);
        continue;
      }
      const eased = easeOutCubic(progress);
      const x = item.x + (item.driftX * eased);
      const y = item.y - (48 * eased);
      const alpha = 1 - progress;
      const isBlock = item.text === "BLOCK";
      const labelWidth = Math.max(isBlock ? 68 : 44, Math.min(118, item.text.length * 9 + 24));
      const dotInset = Math.max(12, Math.min(22, labelWidth * 0.32));

      g.fillStyle(0x020617, alpha * 0.62);
      g.fillRoundedRect(x - (labelWidth / 2), y - 18, labelWidth, 28, 7);
      g.lineStyle(2, item.color, alpha * 0.85);
      g.strokeRoundedRect(x - (labelWidth / 2), y - 18, labelWidth, 28, 7);
      g.fillStyle(item.color, alpha);
      g.fillCircle(x - dotInset, y - 4, isBlock ? 4 : 3);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(x + dotInset, y - 4, isBlock ? 3 : 2.5);
      item.label
        .setPosition(x, y - 4)
        .setAlpha(alpha)
        .setScale(1 + ((1 - alpha) * 0.14));
    }
  }

  private publishDiagnostics(): void {
    const canvas = this.game.canvas;
    const renderer = this.game.renderer;
    const camera = this.cameras.main;
    const cameraView = this.getCameraViewState();
    const diagnostics = {
      renderer: renderer.type === Phaser.WEBGL ? "webgl" : "canvas",
      fps: Math.round(this.game.loop.actualFps),
      canvas: {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        width: canvas.width,
        height: canvas.height,
      },
      state: {
        roundState: this.snapshot.roundState,
        players: this.snapshot.players.length,
        projectiles: this.snapshot.projectiles.length,
        pickups: this.snapshot.pickups.filter((pickup) => pickup.active).length,
        worldProps: this.snapshot.worldProps.filter((prop) => prop.active).length,
        combatTexts: this.combatTexts.length,
        dashBursts: this.dashBursts.length,
        windAccelerationX: Math.round(this.snapshot.windAccelerationX * 10) / 10,
        windRibbonCount: this.windRibbonCount,
        windAimCueVisible: this.windAimCueVisible,
        aim: this.resolveAimDiagnostics(),
        cameraMode: this.cameraViewMode,
        cameraZoom: cameraView.zoom,
        currentTurnSessionId: this.snapshot.currentTurnSessionId,
        turnPhase: this.snapshot.turnPhase,
        turnRemainingMs: Math.max(0, Math.round(this.snapshot.turnEndsAtMs - Date.now())),
        camera: {
          mode: cameraView.mode,
          zoom: cameraView.zoom,
          scrollX: Math.round(camera.scrollX * 10) / 10,
          scrollY: Math.round(camera.scrollY * 10) / 10,
          worldWidth: this.resolveWorldWidth(),
          projectileFocusActive: this.localProjectileCameraFocus !== null,
          projectileFocusId: this.localProjectileCameraFocus?.projectileId ?? "",
          projectileFocusX: Math.round((this.localProjectileCameraFocus?.x ?? 0) * 10) / 10,
          projectileFocusY: Math.round((this.localProjectileCameraFocus?.y ?? 0) * 10) / 10,
          projectileFocusBlend: this.localProjectileCameraFocus?.blend ?? 0,
        },
      },
    };
    (window as unknown as { __LOBBERS_DIAGNOSTICS__?: typeof diagnostics }).__LOBBERS_DIAGNOSTICS__ = diagnostics;
    (window as unknown as { __LOBBERS_SCENE_DIAGNOSTICS__?: typeof diagnostics }).__LOBBERS_SCENE_DIAGNOSTICS__ = diagnostics;
  }

  private resolveAimDiagnostics(): AimDiagnosticState {
    const player = this.getLocalPlayer();
    const charging = this.chargingStartedAtMs !== null;
    if (!player || !charging || !this.aimDragStartWorld || !this.aimDragCurrentWorld) {
      return {
        charging,
        aimX: Math.round(this.pointerAim.x * 1000) / 1000,
        aimY: Math.round(this.pointerAim.y * 1000) / 1000,
        pullAnchorDx: 0,
        pullAnchorDy: 0,
        ...this.aimPreviewDiagnostic,
      };
    }

    const hand = resolveThrowHandPosition(player.x, player.y, player.side, this.pointerAim);
    const dragDistance = Math.hypot(
      this.aimDragCurrentWorld.x - this.aimDragStartWorld.x,
      this.aimDragCurrentWorld.y - this.aimDragStartWorld.y,
    );
    const anchor = resolveSlingshotPullAnchor(hand, this.pointerAim, Math.max(24, dragDistance * 0.45));
    return {
      charging,
      aimX: Math.round(this.pointerAim.x * 1000) / 1000,
      aimY: Math.round(this.pointerAim.y * 1000) / 1000,
      pullAnchorDx: Math.round((anchor.x - hand.x) * 10) / 10,
      pullAnchorDy: Math.round((anchor.y - hand.y) * 10) / 10,
      ...this.aimPreviewDiagnostic,
    };
  }

  private emptyAimPreviewDiagnostic(): AimPreviewDiagnosticState {
    return {
      previewActive: false,
      landingX: 0,
      landingY: 0,
      targetDistance: 0,
      targetDangerRadius: 0,
      targetWillHit: false,
      propDistance: 0,
      propWillHit: false,
      propType: "",
    };
  }

  private drawTrajectoryTimingMarkers(points: Vec2[], color: number, chargeRatio: number, isCharging: boolean): void {
    if (points.length < 16) return;
    const g = this.graphics;
    const fx = this.fxGraphics;
    const markerStep = 19;
    const markerAlpha = isCharging ? 0.24 + (chargeRatio * 0.32) : 0.16;
    const maxMarkers = Math.min(5, Math.floor((points.length - 1) / markerStep));
    for (let marker = 1; marker <= maxMarkers; marker += 1) {
      const index = marker * markerStep;
      const point = points[index];
      const previous = points[Math.max(0, index - 2)];
      const next = points[Math.min(points.length - 1, index + 2)];
      if (!point || !previous || !next) continue;
      const tangent = normalize(next.x - previous.x, next.y - previous.y, { x: 1, y: 0 });
      const normal = { x: -tangent.y, y: tangent.x };
      const halfLength = 9 + (marker * 1.4);
      const pulse = (Math.sin((performance.now() * 0.008) + marker) + 1) / 2;

      g.lineStyle(marker === 2 || marker === 4 ? 3 : 2, color, markerAlpha);
      g.beginPath();
      g.moveTo(point.x - (normal.x * halfLength), point.y - (normal.y * halfLength));
      g.lineTo(point.x + (normal.x * halfLength), point.y + (normal.y * halfLength));
      g.strokePath();

      fx.fillStyle(marker % 2 === 0 ? COLORS.preview : color, (markerAlpha * 0.42) + (pulse * 0.08));
      fx.fillCircle(point.x, point.y, 3 + (marker * 0.45));
    }
  }

  private buildAimPreviewColliders(localPlayer: PlayerView): ProjectileCollider[] {
    const colliders: ProjectileCollider[] = [];
    const laneLeft = localPlayer.laneIndex * WORLD.width;
    for (const fixture of COURT_FIXTURES) {
      if (!fixture.collidable) continue;
      colliders.push({
        id: `fixture:${fixture.id}`,
        rect: {
          x: fixture.x + laneLeft,
          y: fixture.y,
          width: fixture.width,
          height: fixture.height,
        },
        directHitSessionId: null,
      });
    }
    for (const prop of this.snapshot.worldProps) {
      if (!prop.active || prop.laneIndex !== localPlayer.laneIndex) continue;
      colliders.push({
        id: `prop:${prop.id}`,
        rect: {
          x: prop.x,
          y: prop.y,
          width: prop.width,
          height: prop.height,
        },
        directHitSessionId: null,
      });
    }
    for (const player of this.snapshot.players) {
      if (
        player.sessionId === localPlayer.sessionId
        || player.laneIndex !== localPlayer.laneIndex
        || !player.connected
        || player.hp <= 0
      ) continue;
      colliders.push({
        id: `player:${player.sessionId}`,
        rect: buildTankHitbox(player.x, player.y),
        directHitSessionId: player.sessionId,
      });
    }
    return colliders;
  }

  private resolveAimPreviewTarget(
    localPlayer: PlayerView,
    ammo: AmmoDefinition,
    landing: Vec2,
    points: Vec2[],
  ): { player: PlayerView | null; dangerRadius: number; distance: number; willHit: boolean } {
    const dangerRadius = Math.max(ammo.radius + 16, ammo.blastRadius, ammo.fragmentBlastRadius);
    let closest: PlayerView | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    let pathIntersectsClosest = false;
    for (const player of this.snapshot.players) {
      if (
        player.sessionId === localPlayer.sessionId
        || player.laneIndex !== localPlayer.laneIndex
        || !player.connected
        || player.hp <= 0
      ) continue;
      const hitbox = buildTankHitbox(player.x, player.y);
      const centerX = hitbox.x + (hitbox.width / 2);
      const centerY = hitbox.y + (hitbox.height / 2);
      const landingDistance = Math.hypot(landing.x - centerX, landing.y - centerY);
      const pathDistance = this.resolveClosestTrajectoryDistance(points, centerX, centerY);
      const distance = Math.min(landingDistance, pathDistance);
      if (distance < closestDistance) {
        closest = player;
        closestDistance = distance;
        pathIntersectsClosest = points.some((point) => (
          circleIntersectsRect({ x: point.x, y: point.y, radius: ammo.radius + 4 }, hitbox)
        ));
      }
    }
    if (!closest) return { player: null, dangerRadius, distance: 0, willHit: false };
    const directCircle = { x: landing.x, y: landing.y, radius: Math.max(ammo.radius, dangerRadius) };
    return {
      player: closest,
      dangerRadius,
      distance: closestDistance,
      willHit: pathIntersectsClosest || circleIntersectsRect(directCircle, buildTankHitbox(closest.x, closest.y)),
    };
  }

  private resolveAimPreviewPropTarget(
    localPlayer: PlayerView,
    ammo: AmmoDefinition,
    landing: Vec2,
    points: Vec2[],
  ): AimPreviewPropTarget {
    let closest: WorldPropView | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    let pathIntersectsClosest = false;
    for (const prop of this.snapshot.worldProps) {
      if (!prop.active || prop.laneIndex !== localPlayer.laneIndex) continue;
      const centerX = prop.x + (prop.width / 2);
      const centerY = prop.y + (prop.height / 2);
      const rect = {
        x: prop.x,
        y: prop.y,
        width: prop.width,
        height: prop.height,
      };
      const landingDistance = Math.hypot(landing.x - centerX, landing.y - centerY);
      const pathDistance = this.resolveClosestTrajectoryDistance(points, centerX, centerY);
      const distance = Math.min(landingDistance, pathDistance);
      if (distance < closestDistance) {
        closest = prop;
        closestDistance = distance;
        pathIntersectsClosest = points.some((point) => (
          circleIntersectsRect({ x: point.x, y: point.y, radius: ammo.radius + 4 }, rect)
        ));
      }
    }
    if (!closest) return { prop: null, distance: 0, willHit: false };
    const directCircle = { x: landing.x, y: landing.y, radius: ammo.radius + 4 };
    return {
      prop: closest,
      distance: closestDistance,
      willHit: pathIntersectsClosest || circleIntersectsRect(directCircle, {
        x: closest.x,
        y: closest.y,
        width: closest.width,
        height: closest.height,
      }),
    };
  }

  private resolveClosestTrajectoryDistance(points: Vec2[], x: number, y: number): number {
    let closest = Number.POSITIVE_INFINITY;
    for (const point of points) {
      closest = Math.min(closest, Math.hypot(point.x - x, point.y - y));
    }
    return Number.isFinite(closest) ? closest : 0;
  }

  private drawAimLandingIndicator(
    landing: Vec2,
    ammo: AmmoDefinition,
    target: { player: PlayerView | null; dangerRadius: number; distance: number; willHit: boolean },
    chargeRatio: number,
    isCharging: boolean,
  ): void {
    const g = this.graphics;
    const fx = this.fxGraphics;
    const time = performance.now();
    const pulse = (Math.sin(time * 0.012) + 1) / 2;
    const ammoColor = colorForAmmo(ammo.type);
    const dangerColor = target.willHit ? COLORS.flagRed : ammoColor;
    const alpha = isCharging ? 0.34 + (chargeRatio * 0.36) : 0.24;
    const ringRadius = Math.max(18, target.dangerRadius);

    g.lineStyle(target.willHit ? 5 : 3, dangerColor, alpha + (pulse * 0.18));
    g.strokeCircle(landing.x, landing.y, ringRadius);
    g.lineStyle(2, 0xffffff, isCharging ? 0.4 : 0.22);
    g.strokeCircle(landing.x, landing.y, Math.max(8, ammo.radius + 6));
    g.fillStyle(dangerColor, 0.24 + (pulse * 0.18));
    g.fillCircle(landing.x, landing.y, 5 + (pulse * 3));

    fx.lineStyle(2, dangerColor, 0.2 + (pulse * 0.24));
    fx.lineBetween(landing.x - 18, landing.y, landing.x + 18, landing.y);
    fx.lineBetween(landing.x, landing.y - 18, landing.x, landing.y + 18);
    fx.strokeCircle(landing.x, landing.y, ringRadius + 8 + (pulse * 9));

    if (!target.player) return;
    const hitbox = buildTankHitbox(target.player.x, target.player.y);
    const bracketAlpha = target.willHit ? 0.74 : 0.28;
    g.lineStyle(target.willHit ? 4 : 2, target.willHit ? COLORS.flagRed : COLORS.preview, bracketAlpha);
    const corner = 14;
    g.lineBetween(hitbox.x, hitbox.y, hitbox.x + corner, hitbox.y);
    g.lineBetween(hitbox.x, hitbox.y, hitbox.x, hitbox.y + corner);
    g.lineBetween(hitbox.x + hitbox.width, hitbox.y, hitbox.x + hitbox.width - corner, hitbox.y);
    g.lineBetween(hitbox.x + hitbox.width, hitbox.y, hitbox.x + hitbox.width, hitbox.y + corner);
    g.lineBetween(hitbox.x, hitbox.y + hitbox.height, hitbox.x + corner, hitbox.y + hitbox.height);
    g.lineBetween(hitbox.x, hitbox.y + hitbox.height, hitbox.x, hitbox.y + hitbox.height - corner);
    g.lineBetween(hitbox.x + hitbox.width, hitbox.y + hitbox.height, hitbox.x + hitbox.width - corner, hitbox.y + hitbox.height);
    g.lineBetween(hitbox.x + hitbox.width, hitbox.y + hitbox.height, hitbox.x + hitbox.width, hitbox.y + hitbox.height - corner);
    if (!target.willHit) return;

    const centerX = hitbox.x + (hitbox.width / 2);
    const centerY = hitbox.y + (hitbox.height / 2);
    const confirmPulse = (Math.sin(performance.now() * 0.018) + 1) / 2;
    fx.lineStyle(3, COLORS.flagRed, 0.28 + (confirmPulse * 0.24));
    fx.beginPath();
    fx.moveTo(landing.x, landing.y);
    fx.lineTo(centerX, centerY);
    fx.strokePath();
    fx.fillStyle(COLORS.flagRed, 0.16 + (confirmPulse * 0.12));
    fx.fillEllipse(centerX, centerY, hitbox.width + 34, hitbox.height + 28);
    g.fillStyle(0x020617, 0.58);
    g.fillRoundedRect(centerX - 28, hitbox.y - 34, 56, 22, 5);
    g.lineStyle(2, COLORS.flagRed, 0.82);
    g.strokeRoundedRect(centerX - 28, hitbox.y - 34, 56, 22, 5);
    g.fillStyle(COLORS.flagRed, 0.9);
    g.fillTriangle(centerX - 16, hitbox.y - 25, centerX - 8, hitbox.y - 30, centerX - 8, hitbox.y - 20);
    g.fillTriangle(centerX + 16, hitbox.y - 25, centerX + 8, hitbox.y - 30, centerX + 8, hitbox.y - 20);
  }

  private drawAimPropTargetCue(
    target: AimPreviewPropTarget,
    ammo: AmmoDefinition,
    chargeRatio: number,
    isCharging: boolean,
  ): void {
    if (!target.prop || !target.willHit) return;
    const prop = target.prop;
    const g = this.graphics;
    const fx = this.fxGraphics;
    const time = performance.now();
    const pulse = (Math.sin(time * 0.016) + 1) / 2;
    const color = prop.type === "oilBarrel" ? 0xff6b35 : colorForAmmo(ammo.type);
    const alpha = isCharging ? 0.38 + (chargeRatio * 0.34) : 0.3;
    const centerX = prop.x + (prop.width / 2);
    const centerY = prop.y + (prop.height / 2);
    const padding = 10 + (pulse * 4);

    fx.fillStyle(color, 0.08 + (pulse * 0.08));
    fx.fillEllipse(centerX, centerY, prop.width + 42, prop.height + 36);
    fx.lineStyle(3, color, alpha + (pulse * 0.16));
    fx.strokeRoundedRect(prop.x - padding, prop.y - padding, prop.width + (padding * 2), prop.height + (padding * 2), 9);
    if (prop.type === "oilBarrel") {
      fx.strokeCircle(centerX, centerY, WORLD_PROPS.oilBarrelExplosionRadius * (0.94 + (pulse * 0.04)));
    }

    const corner = 12;
    g.lineStyle(3, color, alpha + 0.12);
    g.lineBetween(prop.x - padding, prop.y - padding, prop.x - padding + corner, prop.y - padding);
    g.lineBetween(prop.x - padding, prop.y - padding, prop.x - padding, prop.y - padding + corner);
    g.lineBetween(prop.x + prop.width + padding, prop.y - padding, prop.x + prop.width + padding - corner, prop.y - padding);
    g.lineBetween(prop.x + prop.width + padding, prop.y - padding, prop.x + prop.width + padding, prop.y - padding + corner);
    g.lineBetween(prop.x - padding, prop.y + prop.height + padding, prop.x - padding + corner, prop.y + prop.height + padding);
    g.lineBetween(prop.x - padding, prop.y + prop.height + padding, prop.x - padding, prop.y + prop.height + padding - corner);
    g.lineBetween(prop.x + prop.width + padding, prop.y + prop.height + padding, prop.x + prop.width + padding - corner, prop.y + prop.height + padding);
    g.lineBetween(prop.x + prop.width + padding, prop.y + prop.height + padding, prop.x + prop.width + padding, prop.y + prop.height + padding - corner);
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

  private drawAimPullGuide(hand: Vec2, aim: Vec2, chargeRatio: number): void {
    if (!this.aimDragStartWorld || !this.aimDragCurrentWorld) return;
    const guideAlpha = 0.18 + (chargeRatio * 0.26);
    const dragDistance = Math.hypot(
      this.aimDragCurrentWorld.x - this.aimDragStartWorld.x,
      this.aimDragCurrentWorld.y - this.aimDragStartWorld.y,
    );
    const anchor = resolveSlingshotPullAnchor(hand, aim, Math.max(24, dragDistance * 0.45));
    const pullDistance = Math.hypot(anchor.x - hand.x, anchor.y - hand.y);
    const handleRadius = 5 + (chargeRatio * 3) + (Math.min(1, pullDistance / 120) * 2);

    const fx = this.fxGraphics;
    fx.lineStyle(3, COLORS.preview, guideAlpha);
    fx.beginPath();
    fx.moveTo(anchor.x, anchor.y);
    fx.lineTo(hand.x, hand.y);
    fx.strokePath();
    fx.fillStyle(COLORS.preview, guideAlpha + 0.08);
    fx.fillCircle(anchor.x, anchor.y, handleRadius);
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
    const distance = Math.max(24, projectile.radius * (projectile.ammoType === "needle" ? 5 : projectile.ammoType === "anvil" ? 2.4 : 3.2));
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
      .setScale(this.resolveProjectileTrailScale(projectile.ammoType))
      .setAlpha(alpha * this.resolveProjectileTrailAlpha(projectile.ammoType))
      .setVisible(true);
  }

  private resolveProjectileTrailScale(ammoType: AmmoType): number {
    switch (ammoType) {
      case "javelin":
        return 0.72;
      case "shotput":
        return 0.48;
      case "splitter":
        return 0.52;
      case "discus":
        return 0.56;
      case "mortar":
        return 0.9;
      case "needle":
        return 0.42;
      case "cluster":
        return 0.74;
      case "anvil":
        return 0.58;
      default:
        return 0.68;
    }
  }

  private resolveProjectileTrailAlpha(ammoType: AmmoType): number {
    switch (ammoType) {
      case "shotput":
      case "anvil":
        return 0.46;
      case "needle":
        return 0.54;
      case "mortar":
      case "cluster":
        return 0.76;
      default:
        return 0.68;
    }
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
    const time = performance.now();
    const rotation = this.resolveAmmoSpriteRotation(ammoType, velocityAngle, time);

    sprite
      .setPosition(x, y)
      .setScale(targetSize / largestFrameSide)
      .setRotation(rotation)
      .setAlpha(alpha)
      .setVisible(true);
  }

  private resolveAmmoSpriteSize(ammoType: AmmoType, radius: number): number {
    if (ammoType === "javelin") return Math.max(52, radius * 13);
    if (ammoType === "needle") return Math.max(44, radius * 14);
    if (ammoType === "shotput") return Math.max(30, radius * 2.45);
    if (ammoType === "discus") return Math.max(42, radius * 5);
    if (ammoType === "mortar") return Math.max(42, radius * 3.8);
    if (ammoType === "cluster") return Math.max(44, radius * 3.7);
    if (ammoType === "anvil") return Math.max(54, radius * 3.6);
    return Math.max(32, radius * 4.1);
  }

  private resolveAmmoSpriteRotation(ammoType: AmmoType, velocityAngle: number, time: number): number {
    switch (ammoType) {
      case "javelin":
      case "needle":
        return velocityAngle + (Math.PI / 4);
      case "discus":
        return velocityAngle + (Math.sin(time * 0.012) * 0.32) + (time * 0.012);
      case "mortar":
        return velocityAngle + (Math.PI / 2);
      case "shotput":
        return (time * 0.0014) + (Math.sin(time * 0.006) * 0.08);
      case "cluster":
        return (time * 0.0048) + (Math.sin(time * 0.011) * 0.22);
      case "anvil":
        return velocityAngle * 0.22 + (Math.sin(time * 0.005) * 0.16);
      default:
        return time * 0.0025;
    }
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

  private destroyInactivePlayerRenderStates(activeSessionIds: Set<string>): void {
    for (const sessionId of this.playerRenderStateBySessionId.keys()) {
      if (activeSessionIds.has(sessionId)) continue;
      this.playerRenderStateBySessionId.delete(sessionId);
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
