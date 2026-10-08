import { AMMO_TYPES, getAmmoDefinition, isAmmoType, type AmmoDefinition } from "./ammo";
import {
  buildProjectilePhysicsProfile,
  findEarliestProjectileImpact,
  integrateBallisticProjectile,
  type ProjectileCollider,
} from "./ballistics";
import { CLIENT_MESSAGES } from "./messages";
import { COURT_FIXTURES, getCollidableFixtures } from "./fixtures";
import { ARMOR, CHARGE, DASH, MOVEMENT, PICKUPS, REPAIR, ROUND, SIDE_SIGN, SIMULATION, SPAWN_BY_SIDE, TERRAIN, WIND, WORLD, WORLD_PROPS } from "./constants";
import {
  buildLaunchVelocity,
  buildTankHitbox,
  circleIntersectsRect,
  clamp,
  normalizeAimForSide,
  resolveBlastDamage,
  resolveShoulderPosition,
  resolveThrowHandPosition,
  resolveThrowDistanceMeters,
} from "./math";
import {
  canMoveBetweenSurfaces,
  findLandingSurface,
  generateTerrainLane,
  getTerrainY,
  resolveStandingSurface,
  type TerrainLane,
} from "./terrain";
import type {
  ChargeStartPayload,
  LobbyInfo,
  MoveInputPayload,
  PickupType,
  RoundState,
  SelectAmmoPayload,
  SetReadyPayload,
  Side,
  ThrowReleasePayload,
  TurnPhase,
  AmmoType,
  UseAbilityPayload,
  WorldPropType,
} from "./types";
import { LobbersState, PickupState, PlayerState, ProjectileState, WorldPropState } from "./LobbersState";

export type CreateOptions = {
  hostName?: unknown;
  playerName?: unknown;
  bot?: unknown;
  terrainSeed?: unknown;
  terrainMode?: unknown;
};

export type JoinOptions = {
  code?: unknown;
  playerName?: unknown;
};

export type AuthorityListingFields = Omit<LobbyInfo, 'roomId'> & {
  fixtures: number;
};

type ChargeRuntime = {
  startedAtMs: number;
  ammoType: AmmoType;
};

type MovementRuntime = {
  moveX: number;
  jumpQueued: boolean;
  dashQueued: boolean;
};

type DashCarryRuntime = {
  direction: -1 | 1;
  remainingSeconds: number;
};

type PracticeBotMovementRuntime = {
  targetX: number;
  nextRetargetAtTick: number;
};

type ProjectileRuntime = {
  ownerSessionId: string;
  spawnX: number;
  laneIndex: number;
  ageSeconds: number;
  canSplit: boolean;
  fragment: boolean;
};

type Impact = {
  x: number;
  y: number;
  colliderId: string;
  directHitSessionId: string | null;
  outOfBounds: boolean;
};

type PracticeBotShotPlan = {
  aim: { x: number; y: number };
  chargeMs: number;
  score: number;
};

const toPlayerName = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  return normalized || fallback;
};

const isSide = (value: unknown): value is Side => value === "blue" || value === "red";

const sideForPlayer = (player: PlayerState): Side => (
  isSide(player.side) ? player.side : "blue"
);

export const normalizeLobbyCode = (value: unknown): string => (
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8)
);

const BOT_SESSION_ID = "bot:red";
const BOT_FIRE_INTERVAL_MS = 2600;
const BOT_FIRE_INTERVAL_JITTER_MS = 900;
const BOT_MOVE_SPEED_RATIO = 0.42;
const BOT_MOVE_TARGET_REACHED_PX = 10;
const BOT_MOVE_RETARGET_TICKS = Math.round(SIMULATION.tickHz * 2.4);
const PLAYERS_PER_LANE = 2;
const PRACTICE_BOT_AMMO_CYCLE = [
  "javelin",
  "shotput",
  "javelin",
  "splitter",
  "shotput",
  "javelin",
  "discus",
  "javelin",
  "shotput",
  "splitter",
  "javelin",
  "mortar",
  "shotput",
  "javelin",
  "needle",
  "splitter",
  "javelin",
  "cluster",
  "shotput",
  "javelin",
  "anvil",
] as const satisfies readonly AmmoType[];

const seededUnit = (seed: string, salt: number): number => {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 0xffffffff;
};

type LaneSlot = {
  laneIndex: number;
  side: Side;
  spawnIndex: number;
};

const laneOffset = (laneIndex: number): number => Math.max(0, laneIndex) * WORLD.width;

const resolveSideBounds = (laneIndex: number, side: Side): { minX: number; maxX: number } => {
  const offset = laneOffset(laneIndex);
  const minX = offset + MOVEMENT.sideBoundaryPadding;
  const maxX = offset + WORLD.width - MOVEMENT.sideBoundaryPadding;
  if (side === "blue") {
    return {
      minX,
      maxX: offset + (WORLD.width / 2) - MOVEMENT.centerNoCrossPadding,
    };
  }
  return {
    minX: offset + (WORLD.width / 2) + MOVEMENT.centerNoCrossPadding,
    maxX,
  };
};

const offsetFixture = (fixture: (typeof COURT_FIXTURES)[number], laneIndex: number): (typeof COURT_FIXTURES)[number] => ({
  ...fixture,
  id: `lane-${laneIndex}:${fixture.id}`,
  x: fixture.x + laneOffset(laneIndex),
});

export type AuthorityPorts = {
  state: LobbersState;
  nowMs(): number;
  listingChanged(fields: AuthorityListingFields): void;
};

export type AuthorityMessage = (typeof CLIENT_MESSAGES)[keyof typeof CLIENT_MESSAGES];

export class ThrowAuthority {
  readonly state: LobbersState;

  constructor(private readonly ports: AuthorityPorts) {
    this.state = ports.state;
  }

  private readonly chargesBySessionId = new Map<string, ChargeRuntime>();
  private readonly movementBySessionId = new Map<string, MovementRuntime>();
  private readonly dashCarryBySessionId = new Map<string, DashCarryRuntime>();
  private readonly projectileRuntimeById = new Map<string, ProjectileRuntime>();
  private terrainLane: TerrainLane = generateTerrainLane("Lobbers");
  private projectileSerial = 0;
  private pickupSerial = 0;
  private worldPropSerial = 0;
  private hostSessionId = "";
  private practiceBotEnabled = false;
  private nextBotFireAtMs = 0;
  private botFireCount = 0;
  private practiceBotMovement: PracticeBotMovementRuntime | null = null;

  requestJoin(options: JoinOptions, isNewRoom: boolean): boolean {
    if (isNewRoom) return true;
    return this.canAcceptGuestJoin(options);
  }

  configure(options: CreateOptions, code: string): void {
    this.practiceBotEnabled = options.bot === true;
    this.state.code = code;
    this.state.terrainSeed = typeof options.terrainSeed === "string" && options.terrainSeed.trim()
      ? options.terrainSeed.trim()
      : this.state.code;
    this.state.terrainMode = options.terrainMode === "classic" ? "classic" : "procedural";
    this.state.terrainVersion = TERRAIN.version;
    this.state.windAccelerationX = 0;
    this.terrainLane = this.state.terrainMode === "classic"
      ? generateTerrainLane("classic-flat", WORLD.width, WORLD.groundY, WORLD.width)
      : generateTerrainLane(this.state.terrainSeed);
    this.state.hostName = toPlayerName(options.hostName ?? options.playerName, "Host");
    this.state.worldWidth = WORLD.width;
  }

  join(sessionId: string, options: JoinOptions): void {
    const joiningHost = this.hostSessionId.length === 0;
    const slot = this.getAvailableLaneSlot();
    if (!slot) {
      throw new Error("Lobby full");
    }
    if (!joiningHost && !this.hasValidGuestJoinRequest(options)) {
      throw new Error("Lobby is not accepting players");
    }

    const spawn = this.resolveSpawn(slot.laneIndex, slot.side, slot.spawnIndex);
    const player = new PlayerState();
    player.side = slot.side;
    player.laneIndex = slot.laneIndex;
    player.spawnIndex = slot.spawnIndex;
    player.name = toPlayerName(options.playerName, slot.side === "blue" ? "Blue" : "Red");
    player.x = spawn.x;
    player.y = spawn.y;
    player.aimX = SIDE_SIGN[slot.side];
    player.aimY = -0.35;
    player.isHost = this.hostSessionId.length === 0;
    this.resetAmmo(player);

    if (player.isHost) {
      this.hostSessionId = sessionId;
      this.state.hostName = player.name;
    }

    this.state.players.set(sessionId, player);
    if (this.practiceBotEnabled && player.isHost) {
      this.addPracticeBot();
    }
    this.syncLobbyMetadata();
  }

  leave(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    player.connected = false;
    player.charging = false;
    player.ready = false;
    this.chargesBySessionId.delete(sessionId);
    this.movementBySessionId.delete(sessionId);
    this.dashCarryBySessionId.delete(sessionId);

    if (this.state.roundState === "waiting") {
      this.state.players.delete(sessionId);
      this.promoteHostIfNeeded();
      this.syncLobbyMetadata();
      return;
    }

    if (this.state.roundState === "active" || this.state.roundState === "countdown") {
      if (this.resolveWinningSide()) {
        this.endRound(this.resolveWinningSide() ?? "blue");
      } else if (!this.playersCanStartMatch()) {
        this.state.roundState = "waiting";
        this.state.countdownEndsAtMs = 0;
        this.clearTurnState();
      } else if (this.state.currentTurnSessionId === sessionId) {
        this.advanceTurn();
      }
    }

    this.syncLobbyMetadata();
  }

  publishListing(): void {
    this.syncLobbyMetadata();
  }

  input(sessionId: string, type: AuthorityMessage, payload?: unknown): void {
    switch (type) {
      case CLIENT_MESSAGES.CHARGE_START: this.handleChargeStart(sessionId, payload as ChargeStartPayload); break;
      case CLIENT_MESSAGES.CHARGE_CANCEL: this.handleChargeCancel(sessionId); break;
      case CLIENT_MESSAGES.THROW_RELEASE: this.handleThrowRelease(sessionId, payload as ThrowReleasePayload); break;
      case CLIENT_MESSAGES.SELECT_AMMO: this.handleSelectAmmo(sessionId, payload as SelectAmmoPayload); break;
      case CLIENT_MESSAGES.MOVE_INPUT: this.handleMoveInput(sessionId, payload as MoveInputPayload); break;
      case CLIENT_MESSAGES.USE_ABILITY: this.handleUseAbility(sessionId, payload as UseAbilityPayload); break;
      case CLIENT_MESSAGES.SET_READY: this.handleSetReady(sessionId, payload as SetReadyPayload); break;
      case CLIENT_MESSAGES.REMATCH: this.handleRematch(sessionId); break;
    }
  }

  step(dtSeconds: number): void {
    this.state.serverTick += 1;

    if (this.state.roundState === "countdown" && this.ports.nowMs() >= this.state.countdownEndsAtMs) {
      this.state.roundState = "active";
      this.state.winnerSide = "";
      this.beginNextTurn();
      this.syncLobbyMetadata();
    }

    if (this.state.roundState === "active") {
      this.updateTurnState();
      this.updatePlayerMovement(dtSeconds);
      this.updatePracticeBotMovement(dtSeconds);
      this.updatePickups();
      this.updateProjectiles(dtSeconds);
      this.updateTurnState();
      this.updatePracticeBot();
    }

    if (this.state.serverTick % SIMULATION.tickHz === 0) {
      this.syncLobbyMetadata();
    }
  }

  private handleChargeStart(sessionId: string, payload: ChargeStartPayload): void {
    const player = this.getActivePlayer(sessionId);
    if (!player || !this.canPlayerFire(sessionId)) return;

    const requestedAmmo = getAmmoDefinition(payload?.ammoType);
    const ammo = this.hasUsableAmmo(player, requestedAmmo.type)
      ? requestedAmmo
      : getAmmoDefinition(this.resolveFirstUsableAmmo(player) ?? player.selectedAmmo);
    if (!this.hasUsableAmmo(player, ammo.type)) return;
    player.selectedAmmo = ammo.type;
    player.charging = true;
    this.chargesBySessionId.set(sessionId, {
      startedAtMs: this.ports.nowMs(),
      ammoType: ammo.type,
    });
  }

  private handleChargeCancel(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (player) player.charging = false;
    this.chargesBySessionId.delete(sessionId);
  }

  private handleThrowRelease(sessionId: string, payload: ThrowReleasePayload): void {
    const player = this.getActivePlayer(sessionId);
    const charge = this.chargesBySessionId.get(sessionId);
    if (!player || !charge || !this.canPlayerFire(sessionId)) return;

    const side = sideForPlayer(player);
    const ammo = getAmmoDefinition(charge.ammoType);
    if (!this.consumeAmmo(player, ammo.type)) {
      player.charging = false;
      this.chargesBySessionId.delete(sessionId);
      return;
    }
    const chargeMs = clamp(this.ports.nowMs() - charge.startedAtMs, CHARGE.minMs, CHARGE.maxMs);
    const aim = normalizeAimForSide(payload, side);
    const velocity = buildLaunchVelocity(ammo, chargeMs, aim);
    const hand = resolveThrowHandPosition(player.x, player.y, side, aim);

    player.aimX = aim.x;
    player.aimY = aim.y;
    player.charging = false;
    player.throwSeq += 1;
    this.chargesBySessionId.delete(sessionId);

    this.spawnProjectile({
      ammo,
      ownerSessionId: sessionId,
      x: hand.x,
      y: hand.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: ammo.radius,
      canSplit: ammo.fragmentCount > 0,
      fragment: false,
    });
    this.enterResolvingPhase();
  }

  private handleSelectAmmo(sessionId: string, payload: SelectAmmoPayload): void {
    const player = this.state.players.get(sessionId);
    if (!player || !isAmmoType(payload?.ammoType)) return;
    if (!this.hasUsableAmmo(player, payload.ammoType)) return;
    player.selectedAmmo = payload.ammoType;
  }

  private handleMoveInput(sessionId: string, payload: MoveInputPayload): void {
    const player = this.state.players.get(sessionId);
    if (!player || player.isBot || !player.connected) return;
    if (!this.canPlayerMove(sessionId)) return;
    const current = this.movementBySessionId.get(sessionId) ?? {
      moveX: 0,
      jumpQueued: false,
      dashQueued: false,
    };
    const moveX = clamp(Number(payload?.moveX ?? 0), -1, 1);
    this.movementBySessionId.set(sessionId, {
      moveX: Math.abs(moveX) < 0.15 ? 0 : moveX,
      jumpQueued: current.jumpQueued || payload?.jump === true,
      dashQueued: current.dashQueued || (payload as MoveInputPayload & { dash?: boolean })?.dash === true,
    });
  }

  private handleUseAbility(sessionId: string, payload: UseAbilityPayload): void {
    if (payload?.ability !== "dash") return;
    const player = this.state.players.get(sessionId);
    if (!player || player.isBot || !player.connected || !this.canPlayerMove(sessionId)) return;
    const current = this.movementBySessionId.get(sessionId) ?? {
      moveX: 0,
      jumpQueued: false,
      dashQueued: false,
    };
    this.movementBySessionId.set(sessionId, {
      ...current,
      dashQueued: true,
    });
  }

  private handleSetReady(sessionId: string, payload: SetReadyPayload): void {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.roundState !== "waiting") return;
    player.ready = payload?.ready === true;
    this.maybeStartCountdown();
    this.syncLobbyMetadata();
  }

  private handleRematch(sessionId: string): void {
    if (this.state.roundState !== "ended") return;
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.rematchRequested = true;
    this.markPracticeBotRematchReady();
    const connected = this.getConnectedPlayers();
    if (this.playersCanStartMatch(connected) && connected.every(([, entry]) => entry.rematchRequested)) {
      this.resetRound("countdown");
    }
  }

  private addPracticeBot(): void {
    if (this.state.players.has(BOT_SESSION_ID)) return;
    const laneIndex = 0;
    const spawn = this.resolveSpawn(laneIndex, "red");
    const bot = new PlayerState();
    bot.side = "red";
    bot.laneIndex = laneIndex;
    bot.name = "Practice Bot";
    bot.x = spawn.x;
    bot.y = spawn.y;
    bot.vx = 0;
    bot.vy = 0;
    bot.aimX = SIDE_SIGN.red;
    bot.aimY = -0.35;
    bot.selectedAmmo = "javelin";
    this.resetAmmo(bot);
    bot.ready = true;
    bot.connected = true;
    bot.isBot = true;
    bot.grounded = true;
    this.state.players.set(BOT_SESSION_ID, bot);
  }

  private updatePracticeBot(): void {
    if (!this.practiceBotEnabled) return;
    if (!this.canPlayerFire(BOT_SESSION_ID)) return;
    const currentTime = this.ports.nowMs();
    if (currentTime < this.nextBotFireAtMs) return;

    const bot = this.getActivePlayer(BOT_SESSION_ID);
    const targetEntry = this.getConnectedPlayers()
      .find(([, player]) => !player.isBot && player.connected && player.hp > 0);
    const targetSessionId = targetEntry?.[0] ?? null;
    const target = targetEntry?.[1] ?? null;
    if (!bot || !target) return;

    const ownedProjectileActive = Array.from(this.projectileRuntimeById.values())
      .some((runtime) => runtime.ownerSessionId === BOT_SESSION_ID);
    if (ownedProjectileActive) {
      this.nextBotFireAtMs = currentTime + 500;
      return;
    }

    const ammoType = this.resolvePracticeBotAmmoType();
    const ammo = getAmmoDefinition(ammoType);
    const plan = this.resolvePracticeBotShotPlan(bot, target, targetSessionId ?? "", ammo);
    const velocity = buildLaunchVelocity(ammo, plan.chargeMs, plan.aim);
    const hand = resolveThrowHandPosition(bot.x, bot.y, "red", plan.aim);

    bot.selectedAmmo = ammo.type;
    bot.aimX = plan.aim.x;
    bot.aimY = plan.aim.y;
    bot.charging = false;
    bot.throwSeq += 1;
    this.botFireCount += 1;
    this.nextBotFireAtMs = currentTime + BOT_FIRE_INTERVAL_MS + ((this.botFireCount % 3) * BOT_FIRE_INTERVAL_JITTER_MS);

    this.spawnProjectile({
      ammo,
      ownerSessionId: BOT_SESSION_ID,
      x: hand.x,
      y: hand.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: ammo.radius,
      canSplit: ammo.fragmentCount > 0,
      fragment: false,
    });
    this.enterResolvingPhase();
  }

  private updatePracticeBotMovement(dtSeconds: number): void {
    if (!this.practiceBotEnabled) return;
    if (!this.canPlayerMove(BOT_SESSION_ID)) return;
    const bot = this.getActivePlayer(BOT_SESSION_ID);
    if (!bot) return;

    const side = sideForPlayer(bot);
    const bounds = resolveSideBounds(bot.laneIndex, side);
    const dt = clamp(dtSeconds, 0, 0.1);
    const feetY = bot.y + WORLD.tankHeight;
    const previousSurface = resolveStandingSurface(this.terrainLane, this.localLaneX(bot.x), feetY);

    let runtime = this.practiceBotMovement;
    if (
      !runtime
      || this.state.serverTick >= runtime.nextRetargetAtTick
      || Math.abs(runtime.targetX - bot.x) <= BOT_MOVE_TARGET_REACHED_PX
    ) {
      runtime = this.createPracticeBotMovementTarget(bot, bounds, this.state.serverTick + this.botFireCount);
    }

    const deltaX = runtime.targetX - bot.x;
    const direction = Math.abs(deltaX) <= BOT_MOVE_TARGET_REACHED_PX ? 0 : Math.sign(deltaX);
    if (direction === 0) {
      bot.vx = 0;
      bot.vy = 0;
      bot.grounded = true;
      bot.y = previousSurface.y - WORLD.tankHeight;
      this.practiceBotMovement = runtime;
      return;
    }

    const speed = MOVEMENT.moveSpeedPxPerSecond * BOT_MOVE_SPEED_RATIO;
    const stepX = Math.min(Math.abs(deltaX), speed * dt) * direction;
    const nextX = clamp(bot.x + stepX, bounds.minX, bounds.maxX);
    const nextSurface = resolveStandingSurface(this.terrainLane, this.localLaneX(nextX), feetY);

    if (!canMoveBetweenSurfaces(previousSurface, nextSurface)) {
      bot.vx = 0;
      bot.vy = 0;
      bot.grounded = true;
      bot.y = previousSurface.y - WORLD.tankHeight;
      this.practiceBotMovement = this.createPracticeBotMovementTarget(
        bot,
        bounds,
        this.state.serverTick + this.botFireCount + 97,
      );
      return;
    }

    bot.x = nextX;
    bot.y = nextSurface.y - WORLD.tankHeight;
    bot.vx = direction * speed;
    bot.vy = 0;
    bot.grounded = true;
    this.practiceBotMovement = runtime;
  }

  private createPracticeBotMovementTarget(
    bot: PlayerState,
    bounds: { minX: number; maxX: number },
    salt: number,
  ): PracticeBotMovementRuntime {
    const edgeBuffer = WORLD.tankWidth * 0.35;
    const minX = Math.min(bounds.maxX, bounds.minX + edgeBuffer);
    const maxX = Math.max(minX, bounds.maxX - edgeBuffer);
    const span = Math.max(1, maxX - minX);
    const seed = `${this.state.terrainSeed}:${this.state.code}:bot-move`;
    const currentSurface = resolveStandingSurface(this.terrainLane, this.localLaneX(bot.x), bot.y + WORLD.tankHeight);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const roll = seededUnit(seed, salt + (attempt * 31));
      const candidateX = minX + (span * (0.1 + (roll * 0.8)));
      if (Math.abs(candidateX - bot.x) < WORLD.tankWidth * 0.55 && attempt < 5) continue;
      const candidateSurface = resolveStandingSurface(this.terrainLane, this.localLaneX(candidateX), bot.y + WORLD.tankHeight);
      if (canMoveBetweenSurfaces(currentSurface, candidateSurface)) {
        return {
          targetX: candidateX,
          nextRetargetAtTick: this.state.serverTick + BOT_MOVE_RETARGET_TICKS + Math.round(roll * SIMULATION.tickHz),
        };
      }
    }

    const fallbackDirection = bot.x > (bounds.minX + bounds.maxX) / 2 ? -1 : 1;
    return {
      targetX: clamp(bot.x + (fallbackDirection * WORLD.tankWidth), minX, maxX),
      nextRetargetAtTick: this.state.serverTick + Math.round(SIMULATION.tickHz * 0.75),
    };
  }

  private resolvePracticeBotAmmoType(): AmmoType {
    return PRACTICE_BOT_AMMO_CYCLE[this.botFireCount % PRACTICE_BOT_AMMO_CYCLE.length] ?? "javelin";
  }

  private resolvePracticeBotShotPlan(
    bot: PlayerState,
    target: PlayerState,
    targetSessionId: string,
    ammo: AmmoDefinition,
  ): PracticeBotShotPlan {
    const side = sideForPlayer(bot);
    const shoulder = resolveShoulderPosition(bot.x, bot.y, side);
    const targetHitbox = buildTankHitbox(target.x, target.y);
    const targetX = targetHitbox.x + (targetHitbox.width / 2);
    const distanceRatio = clamp(Math.abs(targetX - shoulder.x) / WORLD.width, 0.25, 0.9);
    const baselineAngle = 34 + (distanceRatio * 18);
    let best: PracticeBotShotPlan | null = null;
    const angleOffsets = [-14, -7, 0, 7, 14, 21];
    const chargeRatios = [0.7, 0.82, 0.94, 1];

    for (const offset of angleOffsets) {
      const angleRadians = clamp(baselineAngle + offset, 24, 72) * (Math.PI / 180);
      const aim = normalizeAimForSide({
        aimX: SIDE_SIGN[side] * Math.cos(angleRadians),
        aimY: -Math.sin(angleRadians),
      }, side);
      for (const chargeRatio of chargeRatios) {
        const chargeMs = CHARGE.minMs + ((CHARGE.maxMs - CHARGE.minMs) * chargeRatio);
        const score = this.scorePracticeBotShot(bot, target, targetSessionId, ammo, aim, chargeMs);
        if (!best || score < best.score) {
          best = { aim, chargeMs, score };
        }
      }
    }

    const fallback = {
      aim: normalizeAimForSide({
        aimX: SIDE_SIGN[side] * Math.cos(baselineAngle * (Math.PI / 180)),
        aimY: -Math.sin(baselineAngle * (Math.PI / 180)),
      }, side),
      chargeMs: CHARGE.maxMs,
      score: Number.POSITIVE_INFINITY,
    };
    return this.applyPracticeBotSkillVariance(best ?? fallback, side, ammo.type);
  }

  private applyPracticeBotSkillVariance(plan: PracticeBotShotPlan, side: Side, ammoType: AmmoType): PracticeBotShotPlan {
    const seed = `${this.state.terrainSeed}:${this.state.code}:${this.botFireCount}:${ammoType}`;
    const angleDrift = ((seededUnit(seed, 41) - 0.5) * 4.5) * (Math.PI / 180);
    const chargeDrift = (seededUnit(seed, 73) - 0.5) * 92;
    const currentAngle = Math.atan2(-plan.aim.y, Math.abs(plan.aim.x));
    const driftedAngle = clamp(currentAngle + angleDrift, 24 * (Math.PI / 180), 72 * (Math.PI / 180));
    const aim = normalizeAimForSide({
      aimX: SIDE_SIGN[side] * Math.cos(driftedAngle),
      aimY: -Math.sin(driftedAngle),
    }, side);
    return {
      aim,
      chargeMs: clamp(plan.chargeMs + chargeDrift, CHARGE.minMs, CHARGE.maxMs),
      score: plan.score,
    };
  }

  private scorePracticeBotShot(
    bot: PlayerState,
    target: PlayerState,
    targetSessionId: string,
    ammo: AmmoDefinition,
    aim: { x: number; y: number },
    chargeMs: number,
  ): number {
    const side = sideForPlayer(bot);
    const laneIndex = bot.laneIndex;
    const offsetX = laneOffset(laneIndex);
    const hand = resolveThrowHandPosition(bot.x, bot.y, side, aim);
    const velocity = buildLaunchVelocity(ammo, chargeMs, aim);
    const targetHitbox = buildTankHitbox(target.x, target.y);
    const targetCenterX = targetHitbox.x + (targetHitbox.width / 2);
    const targetCenterY = targetHitbox.y + (targetHitbox.height / 2);
    const colliders = this.buildPracticeBotShotColliders(target, targetSessionId, offsetX, laneIndex);
    const profile = buildProjectilePhysicsProfile(ammo.gravityScale, ammo.dragPerSecond, this.state.windAccelerationX);
    let previous = {
      x: hand.x - offsetX,
      y: hand.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: ammo.radius,
    };
    const maxSteps = 150;
    const dt = 1 / 45;

    for (let step = 0; step < maxSteps; step += 1) {
      const next = integrateBallisticProjectile(previous, dt, profile);
      const impact = findEarliestProjectileImpact({
        start: previous,
        end: next,
        colliders,
        worldWidth: WORLD.width,
        terrain: this.terrainLane,
      });
      if (impact) {
        const impactX = impact.x + offsetX;
        const impactDistance = Math.hypot(impactX - targetCenterX, impact.y - targetCenterY);
        const blastReach = Math.max(ammo.radius + 10, ammo.blastRadius, ammo.fragmentBlastRadius);
        const blastBonus = Math.max(0, blastReach - impactDistance) * 1.4;
        const directBonus = impact.directHitSessionId === targetSessionId ? 600 : 0;
        const blockerPenalty = impact.directHitSessionId === targetSessionId || impact.colliderId === "terrain" ? 0 : 140;
        const airtimePenalty = step * 0.35;
        return impactDistance - blastBonus - directBonus + blockerPenalty + airtimePenalty;
      }
      previous = next;
    }

    return 2200;
  }

  private buildPracticeBotShotColliders(
    target: PlayerState,
    targetSessionId: string,
    offsetX: number,
    laneIndex: number,
  ): ProjectileCollider[] {
    const colliders: ProjectileCollider[] = [];
    for (const fixture of getCollidableFixtures()) {
      const laneFixture = offsetFixture(fixture, laneIndex);
      colliders.push({
        id: laneFixture.id,
        rect: {
          ...laneFixture,
          x: laneFixture.x - offsetX,
        },
        directHitSessionId: null,
      });
    }
    colliders.push({
      id: `player:${targetSessionId}`,
      rect: {
        ...buildTankHitbox(target.x, target.y),
        x: buildTankHitbox(target.x, target.y).x - offsetX,
      },
      directHitSessionId: targetSessionId,
    });
    for (const [, prop] of this.state.worldProps.entries()) {
      if (!prop.active || prop.laneIndex !== laneIndex) continue;
      const targetOverlapsProp = (
        target.x >= prop.x
        && target.x <= prop.x + prop.width
        && target.y >= prop.y - WORLD.tankHitboxHeight
        && target.y <= prop.y + prop.height
      );
      if (targetOverlapsProp) continue;
      colliders.push({
        id: `prop:${prop.id}`,
        rect: {
          x: prop.x - offsetX,
          y: prop.y,
          width: prop.width,
          height: prop.height,
        },
        directHitSessionId: null,
      });
    }
    return colliders;
  }

  private updatePlayerMovement(dtSeconds: number): void {
    for (const [sessionId, player] of this.state.players.entries()) {
      if (!player.connected || player.hp <= 0 || player.isBot) continue;
      const side = sideForPlayer(player);
      const canControl = this.canPlayerMove(sessionId);
      const storedInput = this.movementBySessionId.get(sessionId) ?? {
        moveX: 0,
        jumpQueued: false,
        dashQueued: false,
      };
      const input = canControl
        ? storedInput
        : {
            moveX: 0,
            jumpQueued: false,
            dashQueued: false,
          };
      const bounds = resolveSideBounds(player.laneIndex, side);
      const dt = clamp(dtSeconds, 0, 0.1);
      const previousX = player.x;
      const previousY = player.y;
      const previousFeetY = previousY + WORLD.tankHeight;
      const previousSurface = resolveStandingSurface(this.terrainLane, this.localLaneX(previousX), previousFeetY);
      const currentTime = this.ports.nowMs();
      let dashCarry = this.dashCarryBySessionId.get(sessionId) ?? null;

      if (input.dashQueued && currentTime >= player.dashCooldownEndsAtMs) {
        const dashDirection = (input.moveX !== 0 ? Math.sign(input.moveX) : SIDE_SIGN[side]) as -1 | 1;
        dashCarry = {
          direction: dashDirection,
          remainingSeconds: DASH.carrySeconds,
        };
        this.dashCarryBySessionId.set(sessionId, dashCarry);
        player.dashCooldownEndsAtMs = currentTime + DASH.cooldownMs;
        player.dashSeq += 1;
      }

      const desiredVx = input.moveX * MOVEMENT.moveSpeedPxPerSecond;
      const dashCarryRatio = dashCarry
        ? clamp(dashCarry.remainingSeconds / Math.max(0.001, DASH.carrySeconds), 0, 1)
        : 0;
      const dashCarryVx = dashCarry
        ? dashCarry.direction * DASH.impulsePxPerSecond * (0.45 + (dashCarryRatio * 0.55))
        : 0;
      if (player.grounded) {
        player.vx = clamp(
          desiredVx + dashCarryVx,
          -MOVEMENT.airMaxSpeedPxPerSecond,
          MOVEMENT.airMaxSpeedPxPerSecond,
        );
      } else {
        const airTargetVx = (desiredVx * 0.82) + dashCarryVx;
        const airDelta = MOVEMENT.airControlAccelerationPxPerSecondSq * dt;
        const airDrag = Math.max(0, 1 - (MOVEMENT.airDragPerSecond * dt));
        player.vx = clamp(
          (player.vx + clamp(airTargetVx - player.vx, -airDelta, airDelta)) * airDrag,
          -MOVEMENT.airMaxSpeedPxPerSecond,
          MOVEMENT.airMaxSpeedPxPerSecond,
        );
      }
      let nextX = clamp(player.x + (player.vx * dt), bounds.minX, bounds.maxX);
      let walkedOffSurface = false;
      if (player.grounded) {
        const nextSurface = resolveStandingSurface(this.terrainLane, this.localLaneX(nextX), previousFeetY);
        if (canMoveBetweenSurfaces(previousSurface, nextSurface)) {
          player.y = nextSurface.y - WORLD.tankHeight;
        } else if (nextSurface.y > previousSurface.y + MOVEMENT.maxTerrainStepPx) {
          walkedOffSurface = true;
        } else {
          nextX = previousX;
          player.vx = 0;
          player.y = previousSurface.y - WORLD.tankHeight;
          this.dashCarryBySessionId.delete(sessionId);
          dashCarry = null;
        }
      }
      player.x = nextX;
      if (
        dashCarry
        && ((dashCarry.direction < 0 && player.x <= bounds.minX + 0.001)
          || (dashCarry.direction > 0 && player.x >= bounds.maxX - 0.001))
      ) {
        this.dashCarryBySessionId.delete(sessionId);
        dashCarry = null;
      }

      if (walkedOffSurface) {
        player.grounded = false;
      }

      if (input.jumpQueued && (player.grounded || walkedOffSurface)) {
        player.vy = MOVEMENT.jumpVelocityPxPerSecond;
        player.grounded = false;
      }

      if (!player.grounded || player.vy !== 0) {
        player.vy = clamp(
          player.vy + (WORLD.gravityPxPerSecondSq * dt),
          MOVEMENT.jumpVelocityPxPerSecond,
          MOVEMENT.maxFallSpeedPxPerSecond,
        );
        player.y += player.vy * dt;
      }

      if (player.grounded && player.vy === 0) {
        player.y = this.resolveTankY(player);
      }

      const landing = player.vy >= 0
        ? findLandingSurface(this.terrainLane, this.localLaneX(player.x), previousY + WORLD.tankHeight, player.y + WORLD.tankHeight)
        : null;
      if (landing) {
        player.y = landing.y - WORLD.tankHeight;
        player.vy = 0;
        if (Math.abs(input.moveX) < 0.15 && !dashCarry) player.vx = 0;
        if (input.jumpQueued) {
          player.vy = MOVEMENT.jumpVelocityPxPerSecond;
          player.grounded = false;
        } else {
          player.grounded = true;
        }
      }

      const localX = this.localLaneX(player.x);
      const groundY = getTerrainY(this.terrainLane, localX);
      if (player.y > WORLD.height || player.y + WORLD.tankHeight > groundY + 72) {
        const recoverySurface = resolveStandingSurface(this.terrainLane, localX, Number.POSITIVE_INFINITY);
        player.y = recoverySurface.y - WORLD.tankHeight;
        player.vx = 0;
        player.vy = 0;
        player.grounded = true;
      }

      if (canControl) {
        this.collectPickups(player);
      }

      if (dashCarry) {
        dashCarry.remainingSeconds -= dt;
        if (dashCarry.remainingSeconds <= 0) {
          this.dashCarryBySessionId.delete(sessionId);
        } else {
          this.dashCarryBySessionId.set(sessionId, dashCarry);
        }
      }

      this.movementBySessionId.set(sessionId, {
        moveX: canControl ? input.moveX : 0,
        jumpQueued: false,
        dashQueued: false,
      });
    }
  }

  private markPracticeBotRematchReady(): void {
    const bot = this.state.players.get(BOT_SESSION_ID);
    if (bot?.isBot === true) {
      bot.rematchRequested = true;
    }
  }

  private spawnProjectile(params: {
    ammo: AmmoDefinition;
    ownerSessionId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    canSplit: boolean;
    fragment: boolean;
  }): void {
    this.projectileSerial += 1;
    const projectile = new ProjectileState();
    projectile.id = `${this.state.serverTick}-${this.projectileSerial}`;
    projectile.ammoType = params.ammo.type;
    projectile.ownerSessionId = params.ownerSessionId;
    projectile.x = params.x;
    projectile.y = params.y;
    projectile.vx = params.vx;
    projectile.vy = params.vy;
    projectile.radius = params.radius;
    projectile.alive = true;

    this.state.projectiles.set(projectile.id, projectile);
    const owner = this.state.players.get(params.ownerSessionId);
    this.projectileRuntimeById.set(projectile.id, {
      ownerSessionId: params.ownerSessionId,
      spawnX: params.x,
      laneIndex: owner?.laneIndex ?? 0,
      ageSeconds: 0,
      canSplit: params.canSplit,
      fragment: params.fragment,
    });
  }

  private updateProjectiles(dtSeconds: number): void {
    const entries = Array.from(this.state.projectiles.entries());
    for (const [id, projectile] of entries) {
      const runtime = this.projectileRuntimeById.get(id);
      if (!runtime || !projectile.alive) continue;

      const ammo = getAmmoDefinition(projectile.ammoType);
      runtime.ageSeconds += dtSeconds;
      const previous = {
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
        radius: projectile.radius,
      };
      const next = integrateBallisticProjectile(
        previous,
        dtSeconds,
        buildProjectilePhysicsProfile(ammo.gravityScale, ammo.dragPerSecond, this.state.windAccelerationX),
      );
      projectile.x = next.x;
      projectile.y = next.y;
      projectile.vx = next.vx;
      projectile.vy = next.vy;

      const fuseSeconds = runtime.canSplit ? ammo.fuseSeconds : null;
      const fuseExpired = typeof fuseSeconds === "number" && runtime.ageSeconds >= fuseSeconds;
      const impact = fuseExpired
        ? { x: projectile.x, y: projectile.y, colliderId: "fuse", directHitSessionId: null, outOfBounds: false }
        : this.resolveProjectileImpact(previous, next, runtime);

      if (impact) {
        this.applyImpact(id, impact);
      }
    }
  }

  private resolveProjectileImpact(
    previous: { x: number; y: number; vx: number; vy: number; radius: number },
    next: { x: number; y: number; vx: number; vy: number; radius: number },
    runtime: ProjectileRuntime,
  ): Impact | null {
    const colliders: ProjectileCollider[] = [];
    const offsetX = laneOffset(runtime.laneIndex);
    for (const fixture of getCollidableFixtures()) {
      const laneFixture = offsetFixture(fixture, runtime.laneIndex);
      colliders.push({
        id: laneFixture.id,
        rect: {
          ...laneFixture,
          x: laneFixture.x - offsetX,
        },
        directHitSessionId: null,
      });
    }
    for (const [sessionId, player] of this.state.players.entries()) {
      if (sessionId === runtime.ownerSessionId || !player.connected || player.hp <= 0) continue;
      if (player.laneIndex !== runtime.laneIndex) continue;
      colliders.push({
        id: `player:${sessionId}`,
        rect: {
          ...buildTankHitbox(player.x, player.y),
          x: buildTankHitbox(player.x, player.y).x - offsetX,
        },
        directHitSessionId: sessionId,
      });
    }
    for (const [, prop] of this.state.worldProps.entries()) {
      if (!prop.active || prop.laneIndex !== runtime.laneIndex) continue;
      colliders.push({
        id: `prop:${prop.id}`,
        rect: {
          x: prop.x - offsetX,
          y: prop.y,
          width: prop.width,
          height: prop.height,
        },
        directHitSessionId: null,
      });
    }

    const impact = findEarliestProjectileImpact({
      start: {
        ...previous,
        x: previous.x - offsetX,
      },
      end: {
        ...next,
        x: next.x - offsetX,
      },
      colliders,
      worldWidth: WORLD.width,
      terrain: this.terrainLane,
    });
    if (!impact) return null;
    return {
      x: impact.x + offsetX,
      y: impact.y,
      colliderId: impact.colliderId,
      directHitSessionId: impact.directHitSessionId,
      outOfBounds: impact.outOfBounds,
    };
  }

  private applyImpact(id: string, impact: Impact): void {
    const projectile = this.state.projectiles.get(id);
    const runtime = this.projectileRuntimeById.get(id);
    if (!projectile || !runtime) return;

    const owner = this.state.players.get(runtime.ownerSessionId);
    if (owner) {
      const distance = resolveThrowDistanceMeters(runtime.spawnX, impact.x);
      owner.lastThrowDistance = distance;
      owner.bestThrowDistance = Math.max(owner.bestThrowDistance, distance);
    }

    if (!impact.outOfBounds) {
      this.applyBlastDamage(projectile, runtime, impact);
      this.applyWorldPropDamage(projectile, runtime, impact);
      this.spawnFragments(projectile, runtime, impact);
    }

    projectile.alive = false;
    this.state.projectiles.delete(id);
    this.projectileRuntimeById.delete(id);
  }

  private applyBlastDamage(projectile: ProjectileState, runtime: ProjectileRuntime, impact: Impact): void {
    const baseAmmo = getAmmoDefinition(projectile.ammoType);
    const damageProfile = runtime.fragment
      ? {
          directDamage: baseAmmo.fragmentDamage,
          blastDamage: baseAmmo.fragmentDamage,
          blastRadius: baseAmmo.fragmentBlastRadius,
        }
      : baseAmmo;

    let winner: Side | null = null;
    for (const [sessionId, player] of this.state.players.entries()) {
      if (!player.connected || player.hp <= 0) continue;
      if (player.laneIndex !== runtime.laneIndex) continue;
      const hitbox = buildTankHitbox(player.x, player.y);
      const centerX = hitbox.x + (hitbox.width / 2);
      const centerY = hitbox.y + (hitbox.height / 2);
      const distance = Math.hypot(centerX - impact.x, centerY - impact.y);
      const damage = resolveBlastDamage(damageProfile, distance, impact.directHitSessionId === sessionId);
      if (damage <= 0) continue;
      const shieldBlocked = Math.min(player.shieldHp, damage);
      player.shieldHp = Math.max(0, player.shieldHp - shieldBlocked);
      player.hp = Math.max(0, player.hp - (damage - shieldBlocked));
      this.applyBlastKnockback(player, impact.x, impact.y, distance, damageProfile.blastRadius, impact.directHitSessionId === sessionId, runtime.fragment ? 0.48 : 1);
    }

    winner = this.resolveWinningSide();
    if (winner) {
      this.endRound(winner);
    }
  }

  private applyBlastKnockback(
    player: PlayerState,
    impactX: number,
    impactY: number,
    distance: number,
    blastRadius: number,
    directHit: boolean,
    scale = 1,
  ): void {
    if (blastRadius <= 0 && !directHit) return;
    const hitbox = buildTankHitbox(player.x, player.y);
    const centerX = hitbox.x + (hitbox.width / 2);
    const centerY = hitbox.y + (hitbox.height / 2);
    const radius = Math.max(1, blastRadius);
    const blastRatio = directHit ? 1 : clamp(1 - (distance / radius), 0, 1);
    if (blastRatio <= 0) return;

    const awayX = Math.abs(centerX - impactX) < 1
      ? SIDE_SIGN[sideForPlayer(player)]
      : Math.sign(centerX - impactX);
    const verticalBias = centerY >= impactY ? 1 : 0.7;
    const impulseRatio = (0.28 + (blastRatio * 0.72)) * scale;
    player.vx = clamp(
      player.vx + (awayX * MOVEMENT.blastKnockbackMaxPxPerSecond * impulseRatio),
      -MOVEMENT.airMaxSpeedPxPerSecond,
      MOVEMENT.airMaxSpeedPxPerSecond,
    );
    player.vy = Math.min(
      player.vy,
      -MOVEMENT.blastLiftPxPerSecond * impulseRatio * verticalBias,
    );
    player.grounded = false;

    const bounds = resolveSideBounds(player.laneIndex, sideForPlayer(player));
    player.x = clamp(player.x + (awayX * Math.min(18, 5 + (blastRatio * 14))), bounds.minX, bounds.maxX);
  }

  private applyWorldPropDamage(projectile: ProjectileState, runtime: ProjectileRuntime, impact: Impact): void {
    const ammo = getAmmoDefinition(projectile.ammoType);
    const directPropId = impact.colliderId.startsWith("prop:") ? impact.colliderId.slice("prop:".length) : "";
    const laneOffsetX = laneOffset(runtime.laneIndex);
    for (const [, prop] of this.state.worldProps.entries()) {
      if (!prop.active || prop.laneIndex !== runtime.laneIndex) continue;
      const centerX = prop.x + (prop.width / 2);
      const centerY = prop.y + (prop.height / 2);
      const distance = Math.hypot(centerX - impact.x, centerY - impact.y);
      const direct = prop.id === directPropId;
      const damage = resolveBlastDamage(ammo, distance, direct);
      if (damage <= 0) continue;
      this.damageWorldProp(prop, damage, {
        x: centerX,
        y: centerY,
        laneIndex: runtime.laneIndex,
        laneOffsetX,
      });
    }
  }

  private damageWorldProp(
    prop: WorldPropState,
    damage: number,
    context: { x: number; y: number; laneIndex: number; laneOffsetX: number },
  ): void {
    if (!prop.active) return;
    prop.hp = Math.max(0, prop.hp - damage);
    if (prop.hp > 0) return;
    prop.active = false;
    prop.triggeredSeq += 1;
    if (prop.type === "oilBarrel") {
      this.detonateOilBarrel(prop, context);
    } else if (prop.type === "supplyCrate") {
      this.spawnPickupAt(context.laneIndex, prop.x - context.laneOffsetX + (prop.width / 2), prop.y - 18, "ammoCache");
    }
  }

  private detonateOilBarrel(
    source: WorldPropState,
    context: { x: number; y: number; laneIndex: number; laneOffsetX: number },
  ): void {
    for (const [, player] of this.state.players.entries()) {
      if (!player.connected || player.hp <= 0 || player.laneIndex !== context.laneIndex) continue;
      const hitbox = buildTankHitbox(player.x, player.y);
      const centerX = hitbox.x + (hitbox.width / 2);
      const centerY = hitbox.y + (hitbox.height / 2);
      const distance = Math.hypot(centerX - context.x, centerY - context.y);
      if (distance > WORLD_PROPS.oilBarrelExplosionRadius) continue;
      const ratio = 1 - (distance / WORLD_PROPS.oilBarrelExplosionRadius);
      const damage = Math.max(0, Math.round(WORLD_PROPS.oilBarrelExplosionDamage * ratio));
      const shieldBlocked = Math.min(player.shieldHp, damage);
      player.shieldHp = Math.max(0, player.shieldHp - shieldBlocked);
      player.hp = Math.max(0, player.hp - (damage - shieldBlocked));
      this.applyBlastKnockback(player, context.x, context.y, distance, WORLD_PROPS.oilBarrelExplosionRadius, false, 1.12);
    }

    for (const [, prop] of this.state.worldProps.entries()) {
      if (!prop.active || prop.id === source.id || prop.laneIndex !== context.laneIndex) continue;
      const centerX = prop.x + (prop.width / 2);
      const centerY = prop.y + (prop.height / 2);
      const distance = Math.hypot(centerX - context.x, centerY - context.y);
      if (distance > WORLD_PROPS.oilBarrelExplosionRadius) continue;
      const ratio = 1 - (distance / WORLD_PROPS.oilBarrelExplosionRadius);
      this.damageWorldProp(prop, Math.ceil(WORLD_PROPS.oilBarrelExplosionDamage * ratio), {
        x: centerX,
        y: centerY,
        laneIndex: context.laneIndex,
        laneOffsetX: context.laneOffsetX,
      });
    }

    const winner = this.resolveWinningSide();
    if (winner) {
      this.endRound(winner);
    }
  }

  private spawnFragments(projectile: ProjectileState, runtime: ProjectileRuntime, impact: Impact): void {
    const ammo = getAmmoDefinition(projectile.ammoType);
    if (!runtime.canSplit || ammo.fragmentCount <= 0) return;

    const pattern = this.resolveFragmentPattern(ammo.type, runtime, projectile);
    const count = pattern.count;
    const denominator = Math.max(1, count - 1);

    for (let i = 0; i < count; i += 1) {
      const t = i / denominator;
      const angle = pattern.startRadians + ((pattern.endRadians - pattern.startRadians) * t);
      const speed = ammo.fragmentSpeed * pattern.speedScale(i, t);
      this.spawnProjectile({
        ammo,
        ownerSessionId: runtime.ownerSessionId,
        x: impact.x + pattern.offsetX(i, t),
        y: impact.y + pattern.offsetY(i, t),
        vx: (Math.cos(angle) * speed) + pattern.baseVx,
        vy: (Math.sin(angle) * speed) + pattern.baseVy,
        radius: ammo.fragmentRadius,
        canSplit: false,
        fragment: true,
      });
    }
  }

  private resolveFragmentPattern(
    ammoType: AmmoType,
    runtime: ProjectileRuntime,
    projectile: ProjectileState,
  ): {
    count: number;
    startRadians: number;
    endRadians: number;
    baseVx: number;
    baseVy: number;
    offsetX: (index: number, t: number) => number;
    offsetY: (index: number, t: number) => number;
    speedScale: (index: number, t: number) => number;
  } {
    const ammo = getAmmoDefinition(ammoType);
    if (ammoType === "cluster") {
      const owner = this.state.players.get(runtime.ownerSessionId);
      const fallbackSign = owner ? SIDE_SIGN[sideForPlayer(owner)] : 1;
      const horizontalSign = projectile.vx === 0 ? fallbackSign : Math.sign(projectile.vx);
      // Canvas Y increases downward; cluster fragments are intentional falling bomblets.
      return {
        count: ammo.fragmentCount,
        startRadians: Math.PI * 0.58,
        endRadians: Math.PI * 0.42,
        baseVx: horizontalSign * 92,
        baseVy: 170,
        offsetX: (index, t) => ((t - 0.5) * 92) + (horizontalSign * (index % 2 === 0 ? 10 : -6)),
        offsetY: (index) => 8 + (index * 7),
        speedScale: (_index, t) => 0.86 + (Math.abs(t - 0.5) * 0.38),
      };
    }
    return {
      count: ammo.fragmentCount,
      startRadians: -Math.PI * 0.84,
      endRadians: -Math.PI * 0.16,
      baseVx: projectile.vx * 0.08,
      baseVy: -28,
      offsetX: () => 0,
      offsetY: () => 0,
      speedScale: (_index, t) => 0.94 + ((1 - Math.abs(t - 0.5) * 2) * 0.14),
    };
  }

  private updateTurnState(): void {
    if (this.state.roundState !== "active") return;
    if (!this.state.currentTurnSessionId || !this.getActivePlayer(this.state.currentTurnSessionId)) {
      this.beginNextTurn();
      return;
    }

    const currentTime = this.ports.nowMs();
    if (this.state.turnPhase === "move" && currentTime >= this.state.turnEndsAtMs) {
      this.beginFirePhase();
      return;
    }

    if (this.state.turnPhase === "fire" && currentTime >= this.state.turnEndsAtMs) {
      this.advanceTurn();
      return;
    }

    if (
      this.state.turnPhase === "resolving"
      && (this.state.projectiles.size === 0 || currentTime >= this.state.turnEndsAtMs)
    ) {
      this.advanceTurn();
    }
  }

  private beginNextTurn(afterSessionId = this.state.currentTurnSessionId): void {
    if (this.state.roundState !== "active") return;
    const activePlayers = this.getTurnEligiblePlayers();
    if (activePlayers.length === 0) {
      this.clearTurnState();
      return;
    }

    const previousIndex = activePlayers.findIndex(([sessionId]) => sessionId === afterSessionId);
    const nextIndex = previousIndex >= 0 ? (previousIndex + 1) % activePlayers.length : 0;
    const nextEntry = activePlayers[nextIndex] ?? activePlayers[0];
    if (!nextEntry) {
      this.clearTurnState();
      return;
    }
    const [nextSessionId] = nextEntry;
    this.beginTurn(nextSessionId);
  }

  private beginTurn(sessionId: string): void {
    const player = this.getActivePlayer(sessionId);
    if (!player) {
      this.beginNextTurn(sessionId);
      return;
    }

    const currentTime = this.ports.nowMs();
    this.chargesBySessionId.clear();
    this.movementBySessionId.clear();
    this.dashCarryBySessionId.clear();
    for (const [, entry] of this.state.players.entries()) {
      entry.charging = false;
    }
    this.state.currentTurnSessionId = sessionId;
    this.state.turnPhase = "move";
    this.state.turnStartedAtMs = currentTime;
    this.state.turnEndsAtMs = currentTime + ROUND.turnMoveMs;
    this.state.turnNumber += 1;
    this.nextBotFireAtMs = sessionId === BOT_SESSION_ID ? currentTime : this.nextBotFireAtMs;
  }

  private beginFirePhase(): void {
    if (!this.state.currentTurnSessionId) return;
    const currentTime = this.ports.nowMs();
    this.movementBySessionId.delete(this.state.currentTurnSessionId);
    this.dashCarryBySessionId.delete(this.state.currentTurnSessionId);
    this.state.turnPhase = "fire";
    this.state.turnStartedAtMs = currentTime;
    this.state.turnEndsAtMs = currentTime + ROUND.turnFireMs;
  }

  private enterResolvingPhase(): void {
    if (this.state.roundState !== "active") return;
    const currentTime = this.ports.nowMs();
    this.chargesBySessionId.clear();
    this.movementBySessionId.delete(this.state.currentTurnSessionId);
    this.dashCarryBySessionId.delete(this.state.currentTurnSessionId);
    for (const [, player] of this.state.players.entries()) {
      player.charging = false;
    }
    this.state.turnPhase = "resolving";
    this.state.turnStartedAtMs = currentTime;
    this.state.turnEndsAtMs = currentTime + ROUND.turnResolveMaxMs;
  }

  private advanceTurn(): void {
    if (this.state.roundState !== "active") return;
    const winner = this.resolveWinningSide();
    if (winner) {
      this.endRound(winner);
      return;
    }
    const previousSessionId = this.state.currentTurnSessionId;
    this.beginNextTurn(previousSessionId);
  }

  private clearTurnState(): void {
    this.state.currentTurnSessionId = "";
    this.state.turnPhase = "move";
    this.state.turnStartedAtMs = 0;
    this.state.turnEndsAtMs = 0;
  }

  private canPlayerMove(sessionId: string): boolean {
    return (
      this.state.roundState === "active"
      && this.state.currentTurnSessionId === sessionId
      && this.state.turnPhase === "move"
      && this.getActivePlayer(sessionId) !== null
    );
  }

  private canPlayerFire(sessionId: string): boolean {
    return (
      this.state.roundState === "active"
      && this.state.currentTurnSessionId === sessionId
      && this.state.turnPhase === "fire"
      && this.getActivePlayer(sessionId) !== null
    );
  }

  private maybeStartCountdown(): void {
    if (this.state.roundState !== "waiting") return;
    const connected = this.getConnectedPlayers();
    if (this.playersCanStartMatch(connected) && connected.every(([, player]) => player.ready)) {
      this.state.roundState = "countdown";
      this.state.winnerSide = "";
      this.state.countdownEndsAtMs = this.ports.nowMs() + ROUND.countdownMs;
      this.clearTurnState();
      this.rollRoundWind();
      this.resetTransientRoundState(false);
      this.spawnPickups();
      this.spawnWorldProps();
    }
  }

  private resetRound(nextState: RoundState): void {
    this.resetTransientRoundState(true);
    for (const [, player] of this.state.players.entries()) {
      const side = sideForPlayer(player);
      const spawn = this.resolveSpawn(player.laneIndex, side, player.spawnIndex);
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.hp = ROUND.startingHp;
      player.aimX = SIDE_SIGN[side];
      player.aimY = -0.35;
      player.charging = false;
      player.grounded = true;
      player.shieldHp = 0;
      player.dashCooldownEndsAtMs = 0;
      player.ready = player.isBot === true;
      player.rematchRequested = false;
      player.lastThrowDistance = 0;
      this.resetAmmo(player);
    }
    this.spawnPickups();
    this.spawnWorldProps();
    this.rollRoundWind();
    this.state.roundState = nextState;
    this.state.winnerSide = "";
    this.state.countdownEndsAtMs = nextState === "countdown" ? this.ports.nowMs() + ROUND.countdownMs : 0;
    this.clearTurnState();
    this.nextBotFireAtMs = this.state.countdownEndsAtMs + 800;
    this.syncLobbyMetadata();
  }

  private resetTransientRoundState(clearProjectiles: boolean): void {
    this.chargesBySessionId.clear();
    this.movementBySessionId.clear();
    this.dashCarryBySessionId.clear();
    this.practiceBotMovement = null;
    if (clearProjectiles) {
      this.state.projectiles.clear();
      this.projectileRuntimeById.clear();
      this.state.pickups.clear();
      this.state.worldProps.clear();
    }
    for (const [, player] of this.state.players.entries()) {
      player.charging = false;
    }
  }

  private rollRoundWind(): void {
    const salt = this.state.serverTick + this.projectileSerial + this.pickupSerial + this.worldPropSerial;
    const raw = (seededUnit(`${this.state.terrainSeed}:${this.state.code}`, salt) * 2) - 1;
    const curved = Math.sign(raw) * Math.pow(Math.abs(raw), 0.82);
    const wind = Math.round(curved * WIND.maxAccelerationPxPerSecondSq);
    this.state.windAccelerationX = Math.abs(wind) < WIND.calmThresholdPxPerSecondSq ? 0 : wind;
  }

  private endRound(winner: Side): void {
    if (this.state.roundState === "ended") return;
    this.state.roundState = "ended";
    this.state.winnerSide = winner;
    this.state.countdownEndsAtMs = 0;
    this.resetTransientRoundState(true);
    this.clearTurnState();
    for (const [, player] of this.state.players.entries()) {
      player.ready = player.isBot === true;
      player.rematchRequested = false;
    }
    this.syncLobbyMetadata();
  }

  private getActivePlayer(sessionId: string): PlayerState | null {
    const player = this.state.players.get(sessionId);
    if (!player || !player.connected || player.hp <= 0) return null;
    return player;
  }

  private canAcceptGuestJoin(options: JoinOptions): boolean {
    return this.hasValidGuestJoinRequest(options) && this.getAvailableLaneSlot() !== null;
  }

  private hasValidGuestJoinRequest(options: JoinOptions): boolean {
    const requestedCode = normalizeLobbyCode(options?.code);
    return (
      requestedCode.length > 0
      && requestedCode === this.state.code
      && !this.practiceBotEnabled
      && this.state.roundState === "waiting"
    );
  }

  private getAvailableLaneSlot(): LaneSlot | null {
    if (this.getConnectedPlayers().length >= ROUND.maxPlayers) return null;
    const occupiedBySide: Record<Side, Set<number>> = {
      blue: new Set<number>(),
      red: new Set<number>(),
    };
    const counts: Record<Side, number> = {
      blue: 0,
      red: 0,
    };
    for (const [, player] of this.state.players.entries()) {
      if (player.connected && isSide(player.side)) {
        counts[player.side] += 1;
        occupiedBySide[player.side].add(Math.max(0, Math.floor(player.spawnIndex)));
      }
    }

    const maxPerSide = Math.ceil(ROUND.maxPlayers / PLAYERS_PER_LANE);
    const preferredSides: Side[] = counts.blue <= counts.red ? ["blue", "red"] : ["red", "blue"];
    for (const side of preferredSides) {
      if (counts[side] >= maxPerSide) continue;
      for (let spawnIndex = 0; spawnIndex < maxPerSide; spawnIndex += 1) {
        if (!occupiedBySide[side].has(spawnIndex)) {
          return { laneIndex: 0, side, spawnIndex };
        }
      }
    }
    return null;
  }

  private playersCanStartMatch(players = this.getConnectedPlayers()): boolean {
    if (players.length < PLAYERS_PER_LANE) return false;
    const sides = new Set<Side>();
    for (const [, player] of players) {
      if (!isSide(player.side)) return false;
      sides.add(player.side);
    }
    return sides.has("blue") && sides.has("red");
  }

  private resolveWinningSide(): Side | null {
    const aliveSides = new Set<Side>();
    for (const [, player] of this.getConnectedPlayers()) {
      if (player.hp <= 0 || !isSide(player.side)) continue;
      aliveSides.add(player.side);
    }
    if (aliveSides.size !== 1) return null;
    return aliveSides.values().next().value ?? null;
  }

  private promoteHostIfNeeded(): void {
    if (this.hostSessionId && this.state.players.has(this.hostSessionId)) return;

    const nextHost = Array.from(this.state.players.entries())
      .find(([, player]) => player.connected && !player.isBot);
    this.hostSessionId = nextHost?.[0] ?? "";
    this.state.hostName = nextHost?.[1].name ?? "Host";

    for (const [sessionId, player] of this.state.players.entries()) {
      player.isHost = sessionId === this.hostSessionId;
    }
  }

  private getConnectedPlayers(): Array<[string, PlayerState]> {
    return Array.from(this.state.players.entries()).filter(([, player]) => player.connected);
  }

  private getTurnEligiblePlayers(): Array<[string, PlayerState]> {
    return this.getConnectedPlayers().filter(([, player]) => player.hp > 0);
  }

  private localLaneX(worldX: number): number {
    const x = worldX % WORLD.width;
    return x < 0 ? x + WORLD.width : x;
  }

  private resolveSpawn(laneIndex: number, side: Side, spawnIndex = 0): { x: number; y: number } {
    const bounds = resolveSideBounds(laneIndex, side);
    const baseX = side === "blue" ? SPAWN_BY_SIDE.blue.x : WORLD.width - SPAWN_BY_SIDE.blue.x;
    const localX = side === "blue"
      ? clamp(baseX + (spawnIndex * ROUND.spawnSpacingPx), bounds.minX, bounds.maxX)
      : clamp(baseX - (spawnIndex * ROUND.spawnSpacingPx), bounds.minX, bounds.maxX);
    const surface = resolveStandingSurface(this.terrainLane, localX);
    return {
      x: laneOffset(laneIndex) + localX,
      y: surface.y - WORLD.tankHeight,
    };
  }

  private resolveTankY(player: PlayerState): number {
    return resolveStandingSurface(this.terrainLane, this.localLaneX(player.x), player.y + WORLD.tankHeight).y - WORLD.tankHeight;
  }

  private resetAmmo(player: PlayerState): void {
    player.javelinAmmo = -1;
    player.shotputAmmo = -1;
    player.splitterAmmo = -1;
    player.discusAmmo = 0;
    player.mortarAmmo = 0;
    player.needleAmmo = 0;
    player.clusterAmmo = 0;
    player.anvilAmmo = 0;
    if (!this.hasUsableAmmo(player, player.selectedAmmo)) {
      player.selectedAmmo = this.resolveFirstUsableAmmo(player) ?? "javelin";
    }
  }

  private ammoCountField(ammoType: AmmoType): keyof Pick<PlayerState,
    "javelinAmmo" | "shotputAmmo" | "splitterAmmo" | "discusAmmo" | "mortarAmmo" | "needleAmmo" | "clusterAmmo" | "anvilAmmo"
  > {
    return `${ammoType}Ammo` as keyof Pick<PlayerState,
      "javelinAmmo" | "shotputAmmo" | "splitterAmmo" | "discusAmmo" | "mortarAmmo" | "needleAmmo" | "clusterAmmo" | "anvilAmmo"
    >;
  }

  private consumeAmmo(player: PlayerState, ammoType: AmmoType): boolean {
    const field = this.ammoCountField(ammoType);
    const current = player[field];
    if (current < 0) return true;
    if (current <= 0) return false;
    player[field] = current - 1;
    if (player[field] <= 0 && player.selectedAmmo === ammoType) {
      player.selectedAmmo = this.resolveFirstUsableAmmo(player) ?? "javelin";
    }
    return true;
  }

  private grantAmmo(player: PlayerState, ammoType: AmmoType, amount: number): void {
    const field = this.ammoCountField(ammoType);
    if (player[field] < 0) return;
    player[field] = Math.min(9, player[field] + amount);
  }

  private hasUsableAmmo(player: PlayerState, ammoType: AmmoType): boolean {
    const count = player[this.ammoCountField(ammoType)];
    return count < 0 || count > 0;
  }

  private resolveFirstUsableAmmo(player: PlayerState): AmmoType | null {
    return AMMO_TYPES.find((ammoType) => this.hasUsableAmmo(player, ammoType)) ?? null;
  }

  private spawnPickups(): void {
    this.state.pickups.clear();
    const laneCount = Math.max(1, Math.ceil(this.resolveCurrentWorldWidth() / WORLD.width));
    const pickupPlan: Array<{ type: PickupType; x: number }> = [
      { type: "armor", x: 360 },
      { type: "repair", x: 560 },
      { type: "ammoCache", x: WORLD.width / 2 },
      { type: "dashCharge", x: WORLD.width - 360 },
    ];
    for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
      for (const item of pickupPlan) {
        this.spawnPickupAt(laneIndex, item.x, getTerrainY(this.terrainLane, item.x) - 34, item.type);
      }
      for (const item of this.resolvePlatformPickupPlan()) {
        this.spawnPickupAt(laneIndex, item.x, item.y, item.type);
      }
    }
  }

  private resolvePlatformPickupPlan(): Array<{ type: PickupType; x: number; y: number }> {
    const platforms = this.terrainLane.segments
      .filter((segment) => segment.kind === "platform" && segment.walkable)
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const highPlatform = platforms[0] ?? null;
    const sidePlatforms = platforms
      .filter((segment) => segment !== highPlatform)
      .sort((a, b) => Math.abs((a.x0 + a.x1) - WORLD.width) - Math.abs((b.x0 + b.x1) - WORLD.width));
    const plan: Array<{ type: PickupType; x: number; y: number }> = [];
    if (highPlatform) {
      plan.push({
        type: "dashCharge",
        x: (highPlatform.x0 + highPlatform.x1) / 2,
        y: highPlatform.y0 - 38,
      });
    }
    for (const platform of sidePlatforms.slice(0, 2)) {
      plan.push({
        type: "ammoCache",
        x: (platform.x0 + platform.x1) / 2,
        y: platform.y0 - 38,
      });
    }
    return plan;
  }

  private spawnPickupAt(laneIndex: number, localX: number, y: number, type: PickupType): void {
    this.pickupSerial += 1;
    const pickup = new PickupState();
    pickup.id = `${laneIndex}:${type}:${this.pickupSerial}`;
    pickup.type = type;
    pickup.laneIndex = laneIndex;
    pickup.x = laneOffset(laneIndex) + localX;
    pickup.y = y;
    pickup.radius = PICKUPS.radius;
    pickup.active = true;
    pickup.respawnAtMs = 0;
    this.state.pickups.set(pickup.id, pickup);
  }

  private spawnWorldProps(): void {
    this.state.worldProps.clear();
    const laneCount = Math.max(1, Math.ceil(this.resolveCurrentWorldWidth() / WORLD.width));
    const groundPlan: Array<{ type: WorldPropType; x: number }> = [
      { type: "oilBarrel", x: 620 },
      { type: "supplyCrate", x: 900 },
      { type: "oilBarrel", x: WORLD.width / 2 - 310 },
      { type: "supplyCrate", x: WORLD.width / 2 + 310 },
      { type: "oilBarrel", x: WORLD.width - 900 },
      { type: "supplyCrate", x: WORLD.width - 620 },
    ];
    const platformPlan = this.terrainLane.segments
      .filter((segment) => segment.kind === "platform")
      .slice(0, 4)
      .map((segment, index) => ({
        type: (index % 2 === 0 ? "oilBarrel" : "supplyCrate") as WorldPropType,
        x: (segment.x0 + segment.x1) / 2,
        y: segment.y0,
      }));

    for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
      for (const item of groundPlan) {
        const surface = resolveStandingSurface(this.terrainLane, item.x);
        this.createWorldProp(laneIndex, item.type, item.x, surface.y);
      }
      for (const item of platformPlan) {
        this.createWorldProp(laneIndex, item.type, item.x, item.y);
      }
    }
  }

  private createWorldProp(laneIndex: number, type: WorldPropType, localCenterX: number, surfaceY: number): void {
    this.worldPropSerial += 1;
    const prop = new WorldPropState();
    prop.id = `${laneIndex}:${type}:${this.worldPropSerial}`;
    prop.type = type;
    prop.laneIndex = laneIndex;
    prop.width = type === "oilBarrel" ? WORLD_PROPS.oilBarrelWidth : WORLD_PROPS.supplyCrateWidth;
    prop.height = type === "oilBarrel" ? WORLD_PROPS.oilBarrelHeight : WORLD_PROPS.supplyCrateHeight;
    prop.hp = type === "oilBarrel" ? WORLD_PROPS.oilBarrelHp : WORLD_PROPS.supplyCrateHp;
    prop.x = laneOffset(laneIndex) + localCenterX - (prop.width / 2);
    prop.y = surfaceY - prop.height;
    prop.active = true;
    prop.triggeredSeq = 0;
    this.state.worldProps.set(prop.id, prop);
  }

  private updatePickups(): void {
    const currentTime = this.ports.nowMs();
    for (const [, pickup] of this.state.pickups.entries()) {
      if (!pickup.active && pickup.respawnAtMs > 0 && currentTime >= pickup.respawnAtMs) {
        pickup.active = true;
        pickup.respawnAtMs = 0;
      }
    }
  }

  private collectPickups(player: PlayerState): void {
    if (!player.connected || player.hp <= 0) return;
    const currentTime = this.ports.nowMs();
    for (const [, pickup] of this.state.pickups.entries()) {
      if (!pickup.active || pickup.laneIndex !== player.laneIndex) continue;
      if (!circleIntersectsRect(
        { x: pickup.x, y: pickup.y, radius: PICKUPS.collectionRadius + pickup.radius },
        buildTankHitbox(player.x, player.y),
      )) continue;
      pickup.active = false;
      pickup.respawnAtMs = currentTime + PICKUPS.respawnMs;
      player.pickupSeq += 1;
      if (pickup.type === "armor") {
        player.shieldHp = Math.min(player.shieldMaxHp, player.shieldHp + ARMOR.pickupAmount);
        player.lastPickupLabel = `Armor +${ARMOR.pickupAmount}`;
      } else if (pickup.type === "repair") {
        player.hp = Math.min(ROUND.startingHp, player.hp + REPAIR.pickupAmount);
        player.lastPickupLabel = `Repair +${REPAIR.pickupAmount}`;
      } else if (pickup.type === "ammoCache") {
        const granted = this.grantLowestLimitedAmmo(player);
        player.lastPickupLabel = granted ? `${getAmmoDefinition(granted).label} +1` : "Ammo full";
      } else if (pickup.type === "clusterAmmo") {
        this.grantAmmo(player, "cluster", 1);
        player.lastPickupLabel = "Cluster +1";
      } else {
        player.dashCooldownEndsAtMs = 0;
        player.lastPickupLabel = "Dash ready";
      }
      return;
    }
  }

  private grantLowestLimitedAmmo(player: PlayerState): AmmoType | null {
    const limitedAmmo: AmmoType[] = ["discus", "mortar", "needle", "cluster", "anvil"];
    let selected: AmmoType | null = null;
    let selectedCount = Number.POSITIVE_INFINITY;
    for (const ammoType of limitedAmmo) {
      const count = player[this.ammoCountField(ammoType)];
      if (count < 0 || count >= 9 || count >= selectedCount) continue;
      selected = ammoType;
      selectedCount = count;
    }
    if (!selected) return null;
    this.grantAmmo(player, selected, 1);
    return selected;
  }

  private buildLobbyInfo(): Omit<LobbyInfo, 'roomId'> {
    this.state.worldWidth = this.resolveCurrentWorldWidth();
    return {
      code: this.state.code,
      hostName: this.state.hostName,
      playerCount: this.getConnectedPlayers().length,
      maxPlayers: ROUND.maxPlayers,
      roundState: this.state.roundState,
    };
  }

  private syncLobbyMetadata(): void {
    const info = this.buildLobbyInfo();
    this.ports.listingChanged({
      ...info,
      fixtures: COURT_FIXTURES.length,
    });
  }

  private resolveCurrentWorldWidth(): number {
    return WORLD.width;
  }
}
