import { Client, Room } from "colyseus";
import { AMMO_TYPES, getAmmoDefinition, isAmmoType, type AmmoDefinition } from "../../shared/game/ammo";
import { CLIENT_MESSAGES } from "../../shared/game/messages";
import { COURT_FIXTURES, getCollidableFixtures } from "../../shared/game/fixtures";
import { CHARGE, ROOM_NAME, ROUND, SIDE_SIGN, SIMULATION, SPAWN_BY_SIDE, WORLD } from "../../shared/game/constants";
import {
  buildLaunchVelocity,
  buildTankHitbox,
  circleIntersectsRect,
  clamp,
  integrateProjectile,
  normalizeAimForSide,
  resolveBlastDamage,
  resolveMuzzlePosition,
  resolveThrowDistanceMeters,
} from "../../shared/game/math";
import type {
  ChargeStartPayload,
  LobbyInfo,
  RoundState,
  SelectAmmoPayload,
  SetReadyPayload,
  Side,
  ThrowReleasePayload,
  AmmoType,
} from "../../shared/game/types";
import { LobbersState, PlayerState, ProjectileState } from "../schema/LobbersState";
import { createLobbyCode, normalizeLobbyCode, removeLobby, upsertLobby } from "../lobbies";

type CreateOptions = {
  hostName?: unknown;
  playerName?: unknown;
  bot?: unknown;
};

type JoinOptions = {
  code?: unknown;
  playerName?: unknown;
};

type ChargeRuntime = {
  startedAtMs: number;
  ammoType: AmmoType;
};

type ProjectileRuntime = {
  ownerSessionId: string;
  spawnX: number;
  ageSeconds: number;
  canSplit: boolean;
  fragment: boolean;
};

type Impact = {
  x: number;
  y: number;
  directHitSessionId: string | null;
  outOfBounds: boolean;
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

const getOpponentSide = (side: Side): Side => (side === "blue" ? "red" : "blue");

const nowMs = (): number => Date.now();
const BOT_SESSION_ID = "bot:red";
const BOT_FIRE_INTERVAL_MS = 2600;
const BOT_FIRE_INTERVAL_JITTER_MS = 900;

export class ThrowRoom extends Room<LobbersState> {
  override maxClients = ROUND.maxPlayers;
  override state = new LobbersState();

  private readonly chargesBySessionId = new Map<string, ChargeRuntime>();
  private readonly projectileRuntimeById = new Map<string, ProjectileRuntime>();
  private projectileSerial = 0;
  private hostSessionId = "";
  private practiceBotEnabled = false;
  private nextBotFireAtMs = 0;
  private botFireCount = 0;

  requestJoin(options: JoinOptions, isNewRoom: boolean): boolean {
    if (isNewRoom) return true;
    const requestedCode = normalizeLobbyCode(options?.code);
    return (
      requestedCode.length > 0
      && requestedCode === this.state.code
      && !this.practiceBotEnabled
      && this.state.players.size < ROUND.maxPlayers
      && this.clients.length < ROUND.maxPlayers
      && this.state.roundState === "waiting"
    );
  }

  override onCreate(options: CreateOptions): void {
    this.practiceBotEnabled = options.bot === true;
    this.state.code = createLobbyCode();
    this.state.hostName = toPlayerName(options.hostName ?? options.playerName, "Host");
    this.setPatchRate(1000 / SIMULATION.patchHz);
    this.setSimulationInterval(() => this.update(SIMULATION.stepSeconds), 1000 / SIMULATION.tickHz);
    this.registerMessageHandlers();
    this.syncLobbyMetadata();
  }

  override onJoin(client: Client, options: JoinOptions): void {
    if (this.state.players.size >= ROUND.maxPlayers) {
      throw new Error("Lobby full");
    }

    const side: Side = this.hasSide("blue") ? "red" : "blue";
    const spawn = SPAWN_BY_SIDE[side];
    const player = new PlayerState();
    player.side = side;
    player.name = toPlayerName(options.playerName, side === "blue" ? "Blue" : "Red");
    player.x = spawn.x;
    player.y = spawn.y;
    player.aimX = SIDE_SIGN[side];
    player.aimY = -0.35;
    player.isHost = this.hostSessionId.length === 0;

    if (player.isHost) {
      this.hostSessionId = client.sessionId;
      this.state.hostName = player.name;
    }

    this.state.players.set(client.sessionId, player);
    if (this.practiceBotEnabled && player.isHost) {
      this.addPracticeBot();
    }
    this.syncLobbyMetadata();
  }

  override onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    player.connected = false;
    player.charging = false;
    player.ready = false;
    this.chargesBySessionId.delete(client.sessionId);

    if (this.state.roundState === "active" || this.state.roundState === "countdown") {
      const opponent = this.getConnectedPlayers().find(([sessionId]) => sessionId !== client.sessionId);
      if (opponent) {
        this.endRound(sideForPlayer(opponent[1]));
      } else {
        this.state.roundState = "waiting";
        this.state.countdownEndsAtMs = 0;
      }
    }

    this.syncLobbyMetadata();
  }

  override onDispose(): void {
    removeLobby(this.state.code);
  }

  private registerMessageHandlers(): void {
    this.onMessage(CLIENT_MESSAGES.CHARGE_START, (client, payload: ChargeStartPayload) => {
      this.handleChargeStart(client, payload);
    });
    this.onMessage(CLIENT_MESSAGES.CHARGE_CANCEL, (client) => {
      this.handleChargeCancel(client);
    });
    this.onMessage(CLIENT_MESSAGES.THROW_RELEASE, (client, payload: ThrowReleasePayload) => {
      this.handleThrowRelease(client, payload);
    });
    this.onMessage(CLIENT_MESSAGES.SELECT_AMMO, (client, payload: SelectAmmoPayload) => {
      this.handleSelectAmmo(client, payload);
    });
    this.onMessage(CLIENT_MESSAGES.SET_READY, (client, payload: SetReadyPayload) => {
      this.handleSetReady(client, payload);
    });
    this.onMessage(CLIENT_MESSAGES.REMATCH, (client) => {
      this.handleRematch(client);
    });
  }

  private update(dtSeconds: number): void {
    this.state.serverTick += 1;

    if (this.state.roundState === "countdown" && nowMs() >= this.state.countdownEndsAtMs) {
      this.state.roundState = "active";
      this.state.winnerSide = "";
      this.syncLobbyMetadata();
    }

    if (this.state.roundState === "active") {
      this.updateProjectiles(dtSeconds);
      this.updatePracticeBot();
    }

    if (this.state.serverTick % SIMULATION.tickHz === 0) {
      this.syncLobbyMetadata();
    }
  }

  private handleChargeStart(client: Client, payload: ChargeStartPayload): void {
    const player = this.getActivePlayer(client.sessionId);
    if (!player || this.state.roundState !== "active") return;

    const ammo = getAmmoDefinition(payload?.ammoType);
    player.selectedAmmo = ammo.type;
    player.charging = true;
    this.chargesBySessionId.set(client.sessionId, {
      startedAtMs: nowMs(),
      ammoType: ammo.type,
    });
  }

  private handleChargeCancel(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.charging = false;
    this.chargesBySessionId.delete(client.sessionId);
  }

  private handleThrowRelease(client: Client, payload: ThrowReleasePayload): void {
    const player = this.getActivePlayer(client.sessionId);
    const charge = this.chargesBySessionId.get(client.sessionId);
    if (!player || !charge || this.state.roundState !== "active") return;

    const side = sideForPlayer(player);
    const ammo = getAmmoDefinition(charge.ammoType);
    const chargeMs = clamp(nowMs() - charge.startedAtMs, CHARGE.minMs, CHARGE.maxMs);
    const aim = normalizeAimForSide(payload, side);
    const velocity = buildLaunchVelocity(ammo, chargeMs, aim);
    const muzzle = resolveMuzzlePosition(player.x, player.y, side);

    player.aimX = aim.x;
    player.aimY = aim.y;
    player.charging = false;
    this.chargesBySessionId.delete(client.sessionId);

    this.spawnProjectile({
      ammo,
      ownerSessionId: client.sessionId,
      x: muzzle.x,
      y: muzzle.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: ammo.radius,
      canSplit: ammo.fragmentCount > 0,
      fragment: false,
    });
  }

  private handleSelectAmmo(client: Client, payload: SelectAmmoPayload): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !isAmmoType(payload?.ammoType)) return;
    player.selectedAmmo = payload.ammoType;
  }

  private handleSetReady(client: Client, payload: SetReadyPayload): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.roundState !== "waiting") return;
    player.ready = payload?.ready === true;
    this.maybeStartCountdown();
    this.syncLobbyMetadata();
  }

  private handleRematch(client: Client): void {
    if (this.state.roundState !== "ended") return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.rematchRequested = true;
    this.markPracticeBotRematchReady();
    const connected = this.getConnectedPlayers();
    if (connected.length === ROUND.maxPlayers && connected.every(([, entry]) => entry.rematchRequested)) {
      this.resetRound("countdown");
    }
  }

  private addPracticeBot(): void {
    if (this.state.players.has(BOT_SESSION_ID)) return;
    const spawn = SPAWN_BY_SIDE.red;
    const bot = new PlayerState();
    bot.side = "red";
    bot.name = "Practice Bot";
    bot.x = spawn.x;
    bot.y = spawn.y;
    bot.aimX = SIDE_SIGN.red;
    bot.aimY = -0.35;
    bot.selectedAmmo = "javelin";
    bot.ready = true;
    bot.connected = true;
    bot.isBot = true;
    this.state.players.set(BOT_SESSION_ID, bot);
  }

  private updatePracticeBot(): void {
    if (!this.practiceBotEnabled) return;
    const currentTime = nowMs();
    if (currentTime < this.nextBotFireAtMs) return;

    const bot = this.getActivePlayer(BOT_SESSION_ID);
    const target = this.getConnectedPlayers()
      .map(([, player]) => player)
      .find((player) => !player.isBot && player.connected && player.hp > 0);
    if (!bot || !target) return;

    const ownedProjectileActive = Array.from(this.projectileRuntimeById.values())
      .some((runtime) => runtime.ownerSessionId === BOT_SESSION_ID);
    if (ownedProjectileActive) {
      this.nextBotFireAtMs = currentTime + 500;
      return;
    }

    const ammoType = AMMO_TYPES[this.botFireCount % AMMO_TYPES.length] ?? "javelin";
    const ammo = getAmmoDefinition(ammoType);
    const aim = this.resolvePracticeBotAim(bot, target);
    const velocity = buildLaunchVelocity(ammo, CHARGE.maxMs, aim);
    const muzzle = resolveMuzzlePosition(bot.x, bot.y, "red");

    bot.selectedAmmo = ammo.type;
    bot.aimX = aim.x;
    bot.aimY = aim.y;
    bot.charging = false;
    this.botFireCount += 1;
    this.nextBotFireAtMs = currentTime + BOT_FIRE_INTERVAL_MS + ((this.botFireCount % 3) * BOT_FIRE_INTERVAL_JITTER_MS);

    this.spawnProjectile({
      ammo,
      ownerSessionId: BOT_SESSION_ID,
      x: muzzle.x,
      y: muzzle.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: ammo.radius,
      canSplit: ammo.fragmentCount > 0,
      fragment: false,
    });
  }

  private resolvePracticeBotAim(bot: PlayerState, target: PlayerState): { x: number; y: number } {
    const side = sideForPlayer(bot);
    const muzzle = resolveMuzzlePosition(bot.x, bot.y, side);
    const targetHitbox = buildTankHitbox(target.x, target.y);
    const targetX = targetHitbox.x + (targetHitbox.width / 2);
    const distanceRatio = clamp(Math.abs(targetX - muzzle.x) / WORLD.width, 0.25, 0.9);
    const angleRadians = (34 + (distanceRatio * 18)) * (Math.PI / 180);
    const aimX = SIDE_SIGN[side] * Math.cos(angleRadians);
    const aimY = -Math.sin(angleRadians);
    return normalizeAimForSide({ aimX, aimY }, side);
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
    this.projectileRuntimeById.set(projectile.id, {
      ownerSessionId: params.ownerSessionId,
      spawnX: params.x,
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
      const next = integrateProjectile(projectile, dtSeconds, ammo.gravityScale);
      projectile.x = next.x;
      projectile.y = next.y;
      projectile.vx = next.vx;
      projectile.vy = next.vy;

      const fuseSeconds = runtime.canSplit ? ammo.fuseSeconds : null;
      const fuseExpired = typeof fuseSeconds === "number" && runtime.ageSeconds >= fuseSeconds;
      const impact = fuseExpired
        ? { x: projectile.x, y: projectile.y, directHitSessionId: null, outOfBounds: false }
        : this.resolveProjectileImpact(projectile, runtime);

      if (impact) {
        this.applyImpact(id, impact);
      }
    }
  }

  private resolveProjectileImpact(projectile: ProjectileState, runtime: ProjectileRuntime): Impact | null {
    if (
      projectile.x < -projectile.radius
      || projectile.x > WORLD.width + projectile.radius
      || projectile.y > WORLD.height + projectile.radius
    ) {
      return {
        x: clamp(projectile.x, 0, WORLD.width),
        y: clamp(projectile.y, 0, WORLD.height),
        directHitSessionId: null,
        outOfBounds: true,
      };
    }

    if (projectile.y + projectile.radius >= WORLD.groundY) {
      return {
        x: projectile.x,
        y: WORLD.groundY - projectile.radius,
        directHitSessionId: null,
        outOfBounds: false,
      };
    }

    for (const fixture of getCollidableFixtures()) {
      if (circleIntersectsRect(projectile, fixture)) {
        return {
          x: projectile.x,
          y: projectile.y,
          directHitSessionId: null,
          outOfBounds: false,
        };
      }
    }

    for (const [sessionId, player] of this.state.players.entries()) {
      if (sessionId === runtime.ownerSessionId || !player.connected || player.hp <= 0) continue;
      if (circleIntersectsRect(projectile, buildTankHitbox(player.x, player.y))) {
        return {
          x: projectile.x,
          y: projectile.y,
          directHitSessionId: sessionId,
          outOfBounds: false,
        };
      }
    }

    return null;
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
      this.spawnSplitterFragments(projectile, runtime, impact);
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
      const hitbox = buildTankHitbox(player.x, player.y);
      const centerX = hitbox.x + (hitbox.width / 2);
      const centerY = hitbox.y + (hitbox.height / 2);
      const distance = Math.hypot(centerX - impact.x, centerY - impact.y);
      const damage = resolveBlastDamage(damageProfile, distance, impact.directHitSessionId === sessionId);
      if (damage <= 0) continue;
      player.hp = Math.max(0, player.hp - damage);
      if (player.hp <= 0) {
        winner = getOpponentSide(sideForPlayer(player));
      }
    }

    if (winner) {
      this.endRound(winner);
    }
  }

  private spawnSplitterFragments(projectile: ProjectileState, runtime: ProjectileRuntime, impact: Impact): void {
    const ammo = getAmmoDefinition(projectile.ammoType);
    if (!runtime.canSplit || ammo.fragmentCount <= 0) return;

    const count = ammo.fragmentCount;
    const spreadStartRadians = -Math.PI * 0.84;
    const spreadEndRadians = -Math.PI * 0.16;
    const denominator = Math.max(1, count - 1);

    for (let i = 0; i < count; i += 1) {
      const t = i / denominator;
      const angle = spreadStartRadians + ((spreadEndRadians - spreadStartRadians) * t);
      this.spawnProjectile({
        ammo,
        ownerSessionId: runtime.ownerSessionId,
        x: impact.x,
        y: impact.y,
        vx: Math.cos(angle) * ammo.fragmentSpeed,
        vy: Math.sin(angle) * ammo.fragmentSpeed,
        radius: ammo.fragmentRadius,
        canSplit: false,
        fragment: true,
      });
    }
  }

  private maybeStartCountdown(): void {
    if (this.state.roundState !== "waiting") return;
    const connected = this.getConnectedPlayers();
    if (connected.length === ROUND.maxPlayers && connected.every(([, player]) => player.ready)) {
      this.state.roundState = "countdown";
      this.state.winnerSide = "";
      this.state.countdownEndsAtMs = nowMs() + ROUND.countdownMs;
      this.resetTransientRoundState(false);
    }
  }

  private resetRound(nextState: RoundState): void {
    this.resetTransientRoundState(true);
    for (const [, player] of this.state.players.entries()) {
      const side = sideForPlayer(player);
      const spawn = SPAWN_BY_SIDE[side];
      player.x = spawn.x;
      player.y = spawn.y;
      player.hp = ROUND.startingHp;
      player.aimX = SIDE_SIGN[side];
      player.aimY = -0.35;
      player.charging = false;
      player.ready = player.isBot === true;
      player.rematchRequested = false;
      player.lastThrowDistance = 0;
    }
    this.state.roundState = nextState;
    this.state.winnerSide = "";
    this.state.countdownEndsAtMs = nextState === "countdown" ? nowMs() + ROUND.countdownMs : 0;
    this.nextBotFireAtMs = this.state.countdownEndsAtMs + 800;
    this.syncLobbyMetadata();
  }

  private resetTransientRoundState(clearProjectiles: boolean): void {
    this.chargesBySessionId.clear();
    if (clearProjectiles) {
      this.state.projectiles.clear();
      this.projectileRuntimeById.clear();
    }
    for (const [, player] of this.state.players.entries()) {
      player.charging = false;
    }
  }

  private endRound(winner: Side): void {
    if (this.state.roundState === "ended") return;
    this.state.roundState = "ended";
    this.state.winnerSide = winner;
    this.state.countdownEndsAtMs = 0;
    this.resetTransientRoundState(true);
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

  private hasSide(side: Side): boolean {
    for (const [, player] of this.state.players.entries()) {
      if (player.side === side) return true;
    }
    return false;
  }

  private getConnectedPlayers(): Array<[string, PlayerState]> {
    return Array.from(this.state.players.entries()).filter(([, player]) => player.connected);
  }

  private buildLobbyInfo(): LobbyInfo {
    return {
      roomId: this.roomId,
      code: this.state.code,
      hostName: this.state.hostName,
      playerCount: this.getConnectedPlayers().length,
      maxPlayers: ROUND.maxPlayers,
      roundState: this.state.roundState,
    };
  }

  private syncLobbyMetadata(): void {
    const info = this.buildLobbyInfo();
    upsertLobby(info);
    this.setMetadata({
      ...info,
      fixtures: COURT_FIXTURES.length,
    });
  }
}
