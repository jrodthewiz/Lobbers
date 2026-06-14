import Phaser from "phaser";
import { AMMO_DEFINITIONS, getAmmoDefinition } from "../../../shared/game/ammo";
import { buildProjectilePhysicsProfile } from "../../../shared/game/ballistics";
import { COURT_FIXTURES } from "../../../shared/game/fixtures";
import { CHARGE, SIDE_SIGN, WORLD } from "../../../shared/game/constants";
import {
  buildLaunchVelocity,
  buildTankHitbox,
  normalize,
  normalizeAimForSide,
  predictTrajectory,
  resolveChargeRatio,
  resolveShoulderPosition,
  resolveThrowHandPosition,
} from "../../../shared/game/math";
import type { AmmoType, Side, Vec2 } from "../../../shared/game/types";
import { ProceduralBackground } from "./ProceduralBackground";
import type { GameSnapshot, PlayerView } from "./viewModel";
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

const colorForSide = (side: Side): number => (side === "blue" ? COLORS.blue : COLORS.red);
const lightColorForSide = (side: Side): number => (side === "blue" ? COLORS.blueLight : COLORS.redLight);

const colorForAmmo = (ammoType: AmmoType): number => {
  if (ammoType === "shotput") return COLORS.shotput;
  if (ammoType === "splitter") return COLORS.splitter;
  return COLORS.javelin;
};

export class GameScene extends Phaser.Scene {
  private background!: ProceduralBackground;
  private graphics!: Phaser.GameObjects.Graphics;
  private snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private localSessionId = "";
  private selectedAmmo: AmmoType = "javelin";
  private callbacks: GameSceneCallbacks | null = null;
  private pointerAim: Vec2 = { x: 1, y: -0.35 };
  private chargingStartedAtMs: number | null = null;
  private readonly lastThrowSeqBySessionId = new Map<string, number>();
  private readonly throwAnimationStartedAtBySessionId = new Map<string, number>();

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.background = new ProceduralBackground(this);
    this.background.create();
    this.graphics = this.add.graphics();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.input.keyboard?.on("keydown-ESC", () => this.cancelCharge());
  }

  override update(time: number): void {
    this.background.update(time);
    this.draw();
  }

  setCallbacks(callbacks: GameSceneCallbacks): void {
    this.callbacks = callbacks;
  }

  setSnapshot(snapshot: GameSnapshot): void {
    this.trackThrowAnimations(snapshot);
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
    this.callbacks?.throwRelease(aim);
  }

  private cancelCharge(): void {
    if (this.chargingStartedAtMs === null) return;
    this.chargingStartedAtMs = null;
    this.callbacks?.chargeCancel();
  }

  private updatePointerAim(pointer: Phaser.Input.Pointer): void {
    const player = this.getLocalPlayer();
    if (!player) return;
    const shoulder = resolveShoulderPosition(player.x, player.y, player.side);
    const raw = normalize(
      pointer.worldX - shoulder.x,
      pointer.worldY - shoulder.y,
      { x: SIDE_SIGN[player.side], y: -0.35 },
    );
    this.pointerAim = normalizeAimForSide({ aimX: raw.x, aimY: raw.y }, player.side);
  }

  private canCharge(): boolean {
    const player = this.getLocalPlayer();
    return Boolean(player && player.connected && player.hp > 0 && this.snapshot.roundState === "active");
  }

  private getLocalPlayer(): PlayerView | null {
    return this.snapshot.players.find((player) => player.sessionId === this.localSessionId) ?? null;
  }

  private trackThrowAnimations(snapshot: GameSnapshot): void {
    for (const player of snapshot.players) {
      const previousSeq = this.lastThrowSeqBySessionId.get(player.sessionId);
      if (previousSeq !== undefined && player.throwSeq > previousSeq) {
        this.throwAnimationStartedAtBySessionId.set(player.sessionId, performance.now());
      }
      this.lastThrowSeqBySessionId.set(player.sessionId, player.throwSeq);
    }
  }

  private draw(): void {
    this.graphics.clear();
    this.drawCourt();
    this.drawFixtures();
    this.drawPlayers();
    this.drawProjectiles();
    this.drawAimPreview();
  }

  private drawCourt(): void {
    const g = this.graphics;
    g.fillStyle(COLORS.court, 0.22);
    g.fillRect(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY);
    g.fillStyle(COLORS.lane, 0.84);
    g.fillRect(80, WORLD.groundY - 18, WORLD.width - 160, 18);

    g.lineStyle(2, COLORS.line, 0.75);
    g.beginPath();
    g.moveTo(80, WORLD.groundY);
    g.lineTo(WORLD.width - 80, WORLD.groundY);
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
  }

  private drawFixtures(): void {
    const g = this.graphics;
    for (const fixture of COURT_FIXTURES) {
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
    for (const player of this.snapshot.players) {
      this.drawTank(player);
    }
  }

  private drawTank(player: PlayerView): void {
    const g = this.graphics;
    const sideColor = colorForSide(player.side);
    const lightColor = lightColorForSide(player.side);
    const hitbox = buildTankHitbox(player.x, player.y);
    const bodyY = player.y - WORLD.tankHeight;
    const bodyX = player.x - (WORLD.tankWidth / 2);

    g.fillStyle(sideColor, player.connected ? 1 : 0.42);
    g.fillRoundedRect(bodyX, bodyY, WORLD.tankWidth, WORLD.tankHeight, 8);
    g.fillStyle(0x0f172a, 0.9);
    g.fillCircle(bodyX + 20, player.y + 2, 9);
    g.fillCircle(bodyX + WORLD.tankWidth - 20, player.y + 2, 9);

    g.fillStyle(COLORS.worm, player.connected ? 1 : 0.45);
    g.fillCircle(player.x, bodyY - 9, WORLD.pilotRadius);
    g.fillStyle(lightColor, 1);
    g.fillCircle(player.x + (SIDE_SIGN[player.side] * 4), bodyY - 12, 3);

    const aim = this.resolvePlayerAim(player);
    const armPose = this.resolveArmPose(player, aim);
    this.drawThrowingArm(player, armPose, lightColor, aim);

    if (player.hp <= 0) {
      g.lineStyle(3, 0xffffff, 0.7);
      g.strokeRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
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

    if (player.charging || (player.sessionId === this.localSessionId && this.chargingStartedAtMs !== null)) {
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

    if (pose.releaseProgress > 0) {
      g.lineStyle(3, COLORS.preview, 0.45 * (1 - pose.releaseProgress));
      g.strokeCircle(pose.elbow.x, pose.elbow.y, WORLD.elbowGearRadius + (pose.releaseProgress * 22));
    }
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
    for (const projectile of this.snapshot.projectiles) {
      const alpha = projectile.alive ? 1 : 0.4;
      const color = colorForAmmo(projectile.ammoType);
      g.lineStyle(projectile.ammoType === "javelin" ? 2 : 3, color, 0.28);
      g.beginPath();
      g.moveTo(projectile.x, projectile.y);
      g.lineTo(projectile.x - (projectile.vx * 0.045), projectile.y - (projectile.vy * 0.045));
      g.strokePath();
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
    const color = colorForAmmo(ammoType);
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
      g.fillStyle(color, alpha);
      g.fillCircle(x, y, radius);
      g.lineStyle(3, 0x475569, alpha * 0.7);
      g.strokeCircle(x, y, radius);
      g.fillStyle(0xffffff, alpha * 0.5);
      g.fillCircle(x - (radius * 0.32), y - (radius * 0.36), Math.max(2, radius * 0.24));
      return;
    }

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
      g.lineStyle(5, colorForAmmo(this.selectedAmmo), 0.85);
      g.beginPath();
      g.moveTo(hand.x, hand.y);
      g.lineTo(hand.x + (this.pointerAim.x * (50 + (ratio * 50))), hand.y + (this.pointerAim.y * (50 + (ratio * 50))));
      g.strokePath();
    }
  }
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);
const easeOutCubic = (value: number): number => 1 - Math.pow(1 - clamp01(value), 3);
