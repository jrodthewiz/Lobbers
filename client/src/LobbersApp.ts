import Phaser from "phaser";
import { Client } from "colyseus.js";
import { AMMO_DEFINITIONS, AMMO_TYPES, isAmmoType } from "../../shared/game/ammo";
import { CHARGE, ROOM_NAME, TERRAIN, WORLD } from "../../shared/game/constants";
import { CLIENT_MESSAGES } from "../../shared/game/messages";
import { resolveChargeRatio } from "../../shared/game/math";
import type { AmmoType, LobbyInfo, Side, Vec2, WorldPropType } from "../../shared/game/types";
import { GameAudio, type GameSoundKey } from "./audio/GameAudio";
import { GameScene, type CameraViewState, type CameraZoomAnchor } from "./game/GameScene";
import type { GameSnapshot, PickupView, PlayerView, ProjectileView, WorldPropView } from "./game/viewModel";
import { EMPTY_SNAPSHOT } from "./game/viewModel";
import { Hud } from "./ui/Hud";
import { ColyseusConnection, type RoomConnection } from "./network/RoomConnection";
import { PeerHostRoom } from "./network/PeerHostRoom";
import { currentVehicle } from "./game/vehicleArt";

type SchemaMapLike = {
  forEach?: (callback: (value: unknown, key: string) => void) => void;
};

type LobbiesResponse = {
  lobbies?: LobbyInfo[];
};

const readString = (source: unknown, key: string, fallback: string): string => {
  const value = (source as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : fallback;
};

const readNumber = (source: unknown, key: string, fallback: number): number => {
  const value = Number((source as Record<string, unknown> | null)?.[key]);
  return Number.isFinite(value) ? value : fallback;
};

const readBoolean = (source: unknown, key: string, fallback: boolean): boolean => {
  const value = (source as Record<string, unknown> | null)?.[key];
  return typeof value === "boolean" ? value : fallback;
};

const isSide = (value: string): value is Side => value === "blue" || value === "red";

const resolveHttpBaseUrl = (): string => {
  const explicit = import.meta.env.VITE_SERVER_URL;
  if (typeof explicit === "string" && explicit.trim()) return explicit.replace(/\/$/, "");
  if (window.location.port === "5173") return "http://localhost:2567";
  return window.location.origin;
};

const toWsUrl = (httpUrl: string): string => httpUrl.replace(/^http/i, "ws");

export class LobbersApp {
  private readonly scene = new GameScene();
  private readonly hud: Hud;
  private readonly client: Client;
  private readonly audio = new GameAudio();
  private readonly lastProjectilesById = new Map<string, ProjectileView>();
  private readonly lastThrowSeqBySessionId = new Map<string, number>();
  private readonly lastHpBySessionId = new Map<string, number>();
  private readonly lastPickupSeqBySessionId = new Map<string, number>();
  private readonly lastDashSeqBySessionId = new Map<string, number>();
  private readonly serverHttpUrl = resolveHttpBaseUrl();
  private room: RoomConnection | null = null;
  private connectionGeneration = 0;
  private connectionController: AbortController | null = null;
  private roomSubscriptions: (() => void)[] = [];
  private snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private selectedAmmo: AmmoType = "javelin";
  private lobbies: LobbyInfo[] = [];
  private status = "Offline";
  private connecting = false;
  private chargeStartedAtMs: number | null = null;
  private moveLeftDown = false;
  private moveRightDown = false;
  private lastSentMoveX = 0;
  private cameraViewState: CameraViewState = { mode: "follow", zoom: 1 };

  constructor() {
    const hudRoot = document.querySelector<HTMLElement>("#hud-root");
    if (!hudRoot) throw new Error("Missing HUD root.");
    this.hud = new Hud(hudRoot);
    this.client = new Client(toWsUrl(this.serverHttpUrl));
  }

  start(): void {
    this.audio.preload();

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-root",
      width: 1600,
      height: 900,
      backgroundColor: "#dceacb",
      scene: [this.scene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    const fitDevice = () => {
      if (!game.scale.canvas) return;
      const phone = window.innerWidth <= 680;
      game.scale.setGameSize(phone ? window.innerWidth : 1600, phone ? window.innerHeight : 900);
    };
    fitDevice();
    game.events.once(Phaser.Core.Events.READY, () => window.requestAnimationFrame(fitDevice));
    window.addEventListener("resize", fitDevice);

    this.scene.setCallbacks({
      chargeStart: () => this.chargeStart(),
      chargeCancel: () => this.chargeCancel(),
      throwRelease: (aim) => this.throwRelease(aim),
    });

    this.hud.setCallbacks({
      hostLobby: (playerName) => {
        this.audio.playLayered([
          { key: "ui-host-lobby" },
          { key: "ui-click", delayMs: 35, volumeScale: 0.55 },
        ]);
        void this.hostLobby(playerName);
      },
      practiceBot: (playerName) => {
        this.audio.playLayered([
          { key: "ui-practice-bot" },
          { key: "ui-click", delayMs: 35, volumeScale: 0.55 },
        ]);
        void this.practiceBot(playerName);
      },
      joinLobby: (code, playerName, source) => {
        if (source === "list") {
          this.audio.playLayered([
            { key: "ui-lobby-row" },
            { key: "ui-join-lobby", delayMs: 45, volumeScale: 0.7 },
          ]);
        } else if (code.trim()) {
          this.audio.playLayered([
            { key: "ui-join-lobby" },
            { key: "ui-click", delayMs: 35, volumeScale: 0.5 },
          ]);
        }
        void this.joinLobby(code, playerName);
      },
      refreshLobbies: () => {
        this.audio.playLayered([
          { key: "ui-browse-lobbies" },
          { key: "ui-click", delayMs: 40, volumeScale: 0.45 },
        ]);
        void this.refreshLobbies();
      },
      hostPeer: (origin, playerName) => { void this.hostPeer(origin, playerName); },
      joinPeer: (origin, code, playerName) => { void this.joinPeer(origin, code, playerName); },
      leaveMatch: () => this.leaveMatch(),
      moveHold: (direction, pressed) => {
        if (pressed && !this.canLocalMove()) return;
        if (direction < 0) this.moveLeftDown = pressed; else this.moveRightDown = pressed;
        this.sendMoveInput(false);
      },
      jump: () => this.sendMoveInput(true),
      selectAmmo: (ammoType) => this.selectAmmo(ammoType),
      useAbility: () => this.useAbility(),
      setReady: (ready) => this.setReady(ready),
      rematch: () => this.rematch(),
      zoomOut: () => this.updateCameraView(this.scene.adjustFollowZoom(-0.12)),
      resetZoom: () => this.updateCameraView(this.scene.resetCameraZoom()),
      zoomIn: () => this.updateCameraView(this.scene.adjustFollowZoom(0.12)),
      toggleOverview: () => this.updateCameraView(this.scene.toggleCameraOverview()),
      uiFocus: () => this.audio.play("ui-focus"),
      uiHover: () => this.audio.play("ui-hover"),
    });

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.addEventListener("keyup", (event) => this.handleKeyUp(event));
    window.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
    window.addEventListener("contextmenu", (event) => this.handleCameraContextMenu(event));
    window.addEventListener("auxclick", (event) => this.handleCameraContextMenu(event));
    window.addEventListener("blur", () => this.releaseLocalControls());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.releaseLocalControls(); });
    window.addEventListener("pagehide", () => this.leaveMatch());
    window.addEventListener("lobbers:vehicle", () => {
      if (this.room) this.sendInput(CLIENT_MESSAGES.VEHICLE_DESIGN, { design: currentVehicle() ? JSON.stringify(currentVehicle()) : "" });
    });

    this.setStatus("Ready");
    (window as unknown as { render_game_to_text: () => string }).render_game_to_text = () => JSON.stringify({
      coordinates: "World pixels; origin top left; x right, y down.",
      mode: this.room ? this.snapshot.roundState : "menu",
      localSessionId: this.room?.sessionId ?? "",
      selectedAmmo: this.selectedAmmo,
      chargeRatio: this.chargeStartedAtMs === null ? 0 : resolveChargeRatio(performance.now() - this.chargeStartedAtMs),
      turn: { phase: this.snapshot.turnPhase, player: this.snapshot.currentTurnSessionId, remainingMs: Math.max(0, this.snapshot.turnEndsAtMs - Date.now()) },
      wind: this.snapshot.windAccelerationX,
      players: this.snapshot.players.map(({ sessionId, name, side, x, y, hp, shieldHp, grounded, ammoCounts, throwSeq, dashCooldownRemainingMs }) => ({ sessionId, name, side, x: Math.round(x), y: Math.round(y), hp, shieldHp, grounded, ammoCounts, throwSeq, dashCooldownRemainingMs })),
      projectiles: this.snapshot.projectiles.map(({ ammoType, x, y, vx, vy }) => ({ ammoType, x: Math.round(x), y: Math.round(y), vx, vy })),
      pickups: this.snapshot.pickups.filter(p => p.active).map(({ type, x, y }) => ({ type, x, y })),
      props: this.snapshot.worldProps.filter(p => p.active).map(({ type, x, y, width, height, hp }) => ({ type, x, y, width, height, hp })),
      winner: this.snapshot.winnerSide,
    });
    void this.refreshLobbies();
    window.setInterval(() => this.render(), 100);
  }

  private async hostLobby(playerName: string): Promise<void> {
    await this.connect(async () => new ColyseusConnection(await this.client.create(ROOM_NAME, {
      hostName: playerName, playerName,
    })), "Hosting lobby...");
  }

  private async practiceBot(playerName: string): Promise<void> {
    await this.connect(async () => new ColyseusConnection(await this.client.create(ROOM_NAME, {
      hostName: playerName, playerName, bot: true,
    })), "Starting practice bot...");
  }

  private async joinLobby(code: string, playerName: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      this.audio.play("ui-error"); this.setStatus("Enter a lobby code."); return;
    }
    await this.connect(async () => new ColyseusConnection(await this.client.join(ROOM_NAME, {
      code: normalized, playerName,
    })), `Joining ${normalized}...`);
  }

  private async hostPeer(origin: string, playerName: string): Promise<void> {
    if (!origin.trim()) { this.setStatus("Enter the invitation server."); return; }
    await this.connect((signal, generation) => PeerHostRoom.host(origin.trim(), playerName, {
      signal, status: message => { if (generation === this.connectionGeneration) this.setStatus(message); },
    }), "Creating peer invitation...");
  }

  private async joinPeer(origin: string, code: string, playerName: string): Promise<void> {
    if (!origin.trim()) { this.setStatus("Enter the invitation server."); return; }
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(normalized)) { this.setStatus("Enter a six-character peer invitation."); return; }
    await this.connect((signal, generation) => PeerHostRoom.join(origin.trim(), normalized, playerName, {
      signal, status: message => { if (generation === this.connectionGeneration) this.setStatus(message); },
    }), `Joining peer ${normalized}...`);
  }

  private async connect(action: (signal: AbortSignal, generation: number) => Promise<RoomConnection>, status: string): Promise<void> {
    if (this.connecting) return;
    this.leaveMatch();
    const generation = ++this.connectionGeneration;
    const controller = new AbortController(); this.connectionController = controller;
    this.connecting = true; this.setStatus(status);
    try {
      const room = await action(controller.signal, generation);
      if (generation !== this.connectionGeneration || controller.signal.aborted) { await room.leave(); return; }
      this.attachRoom(room, generation);
    } catch (error) {
      if (generation === this.connectionGeneration) {
        this.audio.play("ui-error"); this.leaveMatch(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (generation === this.connectionGeneration) { this.connecting = false; this.render(); }
    }
  }

  private attachRoom(room: RoomConnection, generation: number): void {
    this.room = room; this.lastSentMoveX = 0; this.resetAudioTracking();
    this.audio.play("ui-confirm"); this.scene.setLocalSessionId(room.sessionId);
    this.setStatus(room.detail || `Connected as ${room.sessionId.slice(0, 4)}`);
    const current = (): boolean => this.room === room && generation === this.connectionGeneration;
    const update = (state: unknown): void => {
      if (!current()) return;
      const nextSnapshot = this.snapshotFromState(state); this.playSnapshotAudio(nextSnapshot);
      this.snapshot = nextSnapshot; this.scene.setSnapshot(this.snapshot); this.render();
    };
    this.roomSubscriptions = [
      room.onStateChange(update),
      room.onLeave(() => { if (current()) this.leaveMatch(room.detail || "Disconnected"); }),
      room.onError((_code, message) => { if (current()) { this.audio.play("ui-error"); this.setStatus(message ?? "Room error"); } }),
    ];
    update(room.state);
    room.send(CLIENT_MESSAGES.VEHICLE_DESIGN, { design: currentVehicle() ? JSON.stringify(currentVehicle()) : "" });
  }

  private leaveMatch(status = "Ready"): void {
    ++this.connectionGeneration;
    const room = this.room; this.room = null;
    for (const remove of this.roomSubscriptions.splice(0)) remove();
    // Explicit leave removes the authoritative actor; best-effort neutral/cancel precede close.
    if (room) {
      try { room.send(CLIENT_MESSAGES.MOVE_INPUT, { moveX: 0, jump: false }); room.send(CLIENT_MESSAGES.CHARGE_CANCEL); } catch { /* terminal room */ }
    }
    this.connectionController?.abort(); this.connectionController = null;
    this.connecting = false; this.chargeStartedAtMs = null;
    this.moveLeftDown = false; this.moveRightDown = false; this.lastSentMoveX = 0;
    this.resetAudioTracking(); this.snapshot = EMPTY_SNAPSHOT;
    this.scene.setLocalSessionId(""); this.scene.setSnapshot(this.snapshot);
    this.setStatus(status);
    if (room) void room.leave().catch(() => { /* generation invalidated; invitation TTL is bounded fallback */ });
  }

  private sendInput(type: string, payload?: unknown): void {
    const room = this.room;
    if (!room) return;
    try { room.send(type, payload); }
    catch (error) { if (this.room === room) this.leaveMatch(error instanceof Error ? error.message : "Connection closed."); }
  }

  private releaseLocalControls(): void {
    this.releaseMovementInput();
    if (this.chargeStartedAtMs !== null) this.chargeCancel();
  }

  private async refreshLobbies(): Promise<void> {
    const generation = this.connectionGeneration;
    try {
      const response = await fetch(`${this.serverHttpUrl}/api/lobbies`, { cache: "no-store" });
      const payload = await response.json() as LobbiesResponse;
      if (generation !== this.connectionGeneration) return;
      this.lobbies = Array.isArray(payload.lobbies) ? payload.lobbies : [];
      if (!this.room && !this.connecting) this.setStatus("Ready");
    } catch {
      if (generation !== this.connectionGeneration) return;
      this.lobbies = [];
      if (!this.room && !this.connecting) this.setStatus("Lobby server unavailable.");
    }
    this.render();
  }

  private chargeStart(): void {
    if (!this.room) return;
    const ammoType = this.resolveSelectedUsableAmmo();
    if (!ammoType) return;
    if (ammoType !== this.selectedAmmo) {
      this.selectedAmmo = ammoType;
      this.scene.setSelectedAmmo(ammoType);
      this.render();
    }
    this.chargeStartedAtMs = performance.now();
    this.audio.playLayered([
      { key: "charge-start" },
      { key: this.resolveAmmoSelectSound(ammoType), delayMs: 45, volumeScale: 0.45 },
    ]);
    this.sendInput(CLIENT_MESSAGES.CHARGE_START, {
      ammoType,
    });
  }

  private chargeCancel(): void {
    if (!this.room) return;
    this.chargeStartedAtMs = null;
    this.audio.play("ui-back");
    this.sendInput(CLIENT_MESSAGES.CHARGE_CANCEL);
  }

  private throwRelease(aim: Vec2): void {
    if (!this.room) return;
    this.chargeStartedAtMs = null;
    this.audio.playLayered(this.resolveThrowReleaseSounds(this.selectedAmmo));
    this.sendInput(CLIENT_MESSAGES.THROW_RELEASE, {
      aimX: aim.x,
      aimY: aim.y,
    });
  }

  private selectAmmo(ammoType: AmmoType): void {
    if (!this.canUseAmmo(ammoType)) {
      this.audio.play("ui-error");
      return;
    }
    this.audio.playLayered([
      { key: "ui-select" },
      { key: this.resolveAmmoSelectSound(ammoType), delayMs: 25 },
    ]);
    this.selectedAmmo = ammoType;
    this.scene.setSelectedAmmo(ammoType);
    if (this.room) {
      this.sendInput(CLIENT_MESSAGES.SELECT_AMMO, { ammoType });
    }
    this.render();
  }

  private setReady(ready: boolean): void {
    this.audio.playLayered([
      { key: "ui-ready" },
      { key: "ui-confirm", delayMs: 40, volumeScale: 0.75 },
    ]);
    this.sendInput(CLIENT_MESSAGES.SET_READY, { ready });
  }

  private rematch(): void {
    this.audio.playLayered([
      { key: "ui-rematch" },
      { key: "ui-confirm", delayMs: 55, volumeScale: 0.75 },
    ]);
    this.sendInput(CLIENT_MESSAGES.REMATCH);
  }

  private useAbility(): void {
    if (!this.room || !this.canLocalMove()) return;
    const local = this.snapshot.players.find((player) => player.sessionId === this.room?.sessionId);
    if (!local || local.dashCooldownRemainingMs > 0) return;
    this.audio.play("ui-confirm", 0.72);
    this.sendInput(CLIENT_MESSAGES.USE_ABILITY, { ability: "dash" });
  }

  private playSnapshotAudio(nextSnapshot: GameSnapshot): void {
    this.playRoundTransitionAudio(nextSnapshot);

    const nextProjectilesById = new Map(nextSnapshot.projectiles.map((projectile) => [projectile.id, projectile]));
    let impactsPlayed = 0;
    for (const [id, projectile] of this.lastProjectilesById) {
      if (nextProjectilesById.has(id) || impactsPlayed >= 3) continue;
      this.audio.playLayered(this.resolveProjectileImpactSounds(projectile));
      impactsPlayed += 1;
    }

    let playerDamageDetected = false;
    for (const player of nextSnapshot.players) {
      const previousThrowSeq = this.lastThrowSeqBySessionId.get(player.sessionId);
      if (
        previousThrowSeq !== undefined
        && player.throwSeq > previousThrowSeq
        && player.sessionId !== this.room?.sessionId
      ) {
        this.audio.playLayered([
          { key: "throw-release", volumeScale: 0.78 },
          { key: this.resolveAmmoSelectSound(player.selectedAmmo), delayMs: 28, volumeScale: 0.28 },
        ]);
      }

      const previousHp = this.lastHpBySessionId.get(player.sessionId);
      if (previousHp !== undefined && player.hp < previousHp) {
        playerDamageDetected = true;
      }

      const previousPickupSeq = this.lastPickupSeqBySessionId.get(player.sessionId);
      if (previousPickupSeq !== undefined && player.pickupSeq > previousPickupSeq) {
        this.audio.play("item-pickup", player.sessionId === this.room?.sessionId ? 0.82 : 0.44);
      }

      const previousDashSeq = this.lastDashSeqBySessionId.get(player.sessionId);
      if (previousDashSeq !== undefined && player.dashSeq > previousDashSeq) {
        this.audio.playLayered([
          { key: "player-step", volumeScale: player.sessionId === this.room?.sessionId ? 0.72 : 0.36, rateScale: 1.22 },
          { key: "ui-focus", delayMs: 20, volumeScale: 0.52, rateScale: 1.16 },
        ]);
      }
    }

    if (playerDamageDetected) {
      this.audio.play("player-hit", 0.72);
    }

    this.lastProjectilesById.clear();
    for (const projectile of nextSnapshot.projectiles) {
      this.lastProjectilesById.set(projectile.id, projectile);
    }

    this.lastThrowSeqBySessionId.clear();
    this.lastHpBySessionId.clear();
    this.lastPickupSeqBySessionId.clear();
    this.lastDashSeqBySessionId.clear();
    for (const player of nextSnapshot.players) {
      this.lastThrowSeqBySessionId.set(player.sessionId, player.throwSeq);
      this.lastHpBySessionId.set(player.sessionId, player.hp);
      this.lastPickupSeqBySessionId.set(player.sessionId, player.pickupSeq);
      this.lastDashSeqBySessionId.set(player.sessionId, player.dashSeq);
    }
  }

  private resolveProjectileImpactSounds(projectile: ProjectileView): Array<{
    key: GameSoundKey;
    delayMs?: number;
    volumeScale?: number;
    rateScale?: number;
  }> {
    if (projectile.ammoType === "shotput") {
      return [
        { key: "shotput-impact", volumeScale: 1.08, rateScale: 0.86 },
        { key: "fragment-impact", delayMs: 18, volumeScale: 0.58, rateScale: 0.78 },
        { key: "shotput-impact", delayMs: 72, volumeScale: 0.52, rateScale: 0.64 },
      ];
    }
    if (projectile.ammoType === "mortar" || projectile.ammoType === "anvil") {
      return [
        { key: "shotput-impact", volumeScale: 1.16, rateScale: projectile.ammoType === "anvil" ? 0.68 : 0.78 },
        { key: "fragment-impact", delayMs: 24, volumeScale: 0.72, rateScale: 0.74 },
        { key: "player-hit", delayMs: 74, volumeScale: 0.34, rateScale: 0.76 },
      ];
    }
    if (projectile.ammoType === "splitter") {
      return [
        {
          key: projectile.radius < AMMO_DEFINITIONS.splitter.radius ? "fragment-impact" : "splitter-pop",
          volumeScale: projectile.radius < AMMO_DEFINITIONS.splitter.radius ? 0.76 : 1,
        },
      ];
    }
    if (projectile.ammoType === "cluster") {
      return [
        { key: "splitter-pop", volumeScale: 0.88, rateScale: 0.9 },
        { key: "fragment-impact", delayMs: 24, volumeScale: 0.52, rateScale: 1.08 },
      ];
    }
    if (projectile.ammoType === "needle" || projectile.ammoType === "discus") {
      return [
        { key: "javelin-impact", volumeScale: projectile.ammoType === "needle" ? 0.72 : 0.58, rateScale: projectile.ammoType === "needle" ? 1.24 : 1.08 },
        { key: "fragment-impact", delayMs: 18, volumeScale: 0.28, rateScale: 1.18 },
      ];
    }
    return [
      { key: "javelin-impact", volumeScale: 0.92 },
      { key: "fragment-impact", delayMs: 24, volumeScale: 0.34, rateScale: 1.08 },
    ];
  }

  private resolveThrowReleaseSounds(ammoType: AmmoType): Array<{
    key: GameSoundKey;
    delayMs?: number;
    volumeScale?: number;
    rateScale?: number;
  }> {
    if (ammoType === "shotput") {
      return [
        { key: "throw-release", volumeScale: 0.92, rateScale: 0.88 },
        { key: "shotput-impact", delayMs: 24, volumeScale: 0.3, rateScale: 0.62 },
        { key: this.resolveAmmoSelectSound(ammoType), delayMs: 42, volumeScale: 0.22, rateScale: 0.84 },
      ];
    }
    return [
      { key: "throw-release" },
      { key: this.resolveAmmoSelectSound(ammoType), delayMs: 28, volumeScale: 0.38 },
    ];
  }

  private resolveAmmoSelectSound(ammoType: AmmoType): GameSoundKey {
    if (ammoType === "shotput") return "ammo-shotput-select";
    if (ammoType === "splitter" || ammoType === "cluster") return "ammo-splitter-select";
    return "ammo-javelin-select";
  }

  private playRoundTransitionAudio(nextSnapshot: GameSnapshot): void {
    if (this.snapshot.roundState === nextSnapshot.roundState) return;

    if (nextSnapshot.roundState === "countdown") {
      this.audio.play("round-countdown");
      return;
    }

    if (nextSnapshot.roundState === "active") {
      this.audio.play("round-start");
      return;
    }

    if (nextSnapshot.roundState === "ended") {
      const local = nextSnapshot.players.find((player) => player.sessionId === this.room?.sessionId);
      this.audio.play(local && local.side === nextSnapshot.winnerSide ? "round-win" : "round-lose");
    }
  }

  private resetAudioTracking(): void {
    this.lastProjectilesById.clear();
    this.lastThrowSeqBySessionId.clear();
    this.lastHpBySessionId.clear();
    this.lastPickupSeqBySessionId.clear();
    this.lastDashSeqBySessionId.clear();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const ammoType = this.ammoFromShortcut(key);

    if (ammoType) {
      event.preventDefault();
      this.selectAmmo(ammoType);
      return;
    }

    if ((key === "q" || key === "e") && !event.repeat) {
      event.preventDefault();
      this.cycleAmmo(key === "e" ? 1 : -1);
      return;
    }

    if ((key === "z" || key === "m") && !event.repeat) {
      event.preventDefault();
      this.updateCameraView(this.scene.toggleCameraOverview());
      this.audio.play("ui-select");
      return;
    }

    if (key === "f" && !event.repeat) {
      event.preventDefault();
      this.updateCameraView(this.scene.toggleFreeCamera());
      this.audio.play("ui-focus");
      return;
    }

    if ((key === "-" || key === "_") && !event.repeat) {
      event.preventDefault();
      this.updateCameraView(this.scene.adjustFollowZoom(-0.12));
      this.audio.play("ui-focus");
      return;
    }

    if ((key === "=" || key === "+") && !event.repeat) {
      event.preventDefault();
      this.updateCameraView(this.scene.adjustFollowZoom(0.12));
      this.audio.play("ui-focus");
      return;
    }

    if (key === "0" && !event.repeat) {
      event.preventDefault();
      this.updateCameraView(this.scene.resetCameraZoom());
      this.audio.play("ui-back");
      return;
    }

    if ((key === "shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) {
      event.preventDefault();
      this.useAbility();
      return;
    }

    let changed = false;

    if (key === "a" || key === "arrowleft") {
      this.moveLeftDown = true;
      changed = true;
    } else if (key === "d" || key === "arrowright") {
      this.moveRightDown = true;
      changed = true;
    } else if ((key === "w" || key === "arrowup" || key === " ") && !event.repeat) {
      event.preventDefault();
      this.sendMoveInput(true);
      return;
    }

    if (changed) {
      event.preventDefault();
      this.sendMoveInput(false);
    }
  }

  private ammoFromShortcut(key: string): AmmoType | null {
    if (key === "1") return "javelin";
    if (key === "2") return "shotput";
    if (key === "3") return "splitter";
    if (key === "4") return "discus";
    if (key === "5") return "mortar";
    if (key === "6") return "needle";
    if (key === "7") return "cluster";
    if (key === "8") return "anvil";
    return null;
  }

  private cycleAmmo(direction: -1 | 1): void {
    const currentIndex = AMMO_TYPES.indexOf(this.selectedAmmo);
    for (let offset = 1; offset <= AMMO_TYPES.length; offset += 1) {
      const nextIndex = (currentIndex + (direction * offset) + AMMO_TYPES.length) % AMMO_TYPES.length;
      const nextAmmo = AMMO_TYPES[nextIndex];
      if (nextAmmo && this.canUseAmmo(nextAmmo)) {
        this.selectAmmo(nextAmmo);
        return;
      }
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    let changed = false;

    if (key === "a" || key === "arrowleft") {
      this.moveLeftDown = false;
      changed = true;
    } else if (key === "d" || key === "arrowright") {
      this.moveRightDown = false;
      changed = true;
    }

    if (changed) {
      event.preventDefault();
      this.sendMoveInput(false);
    }
  }

  private handleWheel(event: WheelEvent): void {
    if (this.isTypingTarget(event.target)) return;
    if (!this.room) return;
    if (!this.isGameCanvasEventTarget(event.target)) return;
    event.preventDefault();
    const deltaY = this.normalizedWheelDeltaY(event);
    if (deltaY === 0) return;
    const direction = deltaY > 0 ? -1 : 1;
    const magnitude = Math.min(0.16, Math.max(0.08, Math.abs(deltaY) / 900));
    const anchor: CameraZoomAnchor = { clientX: event.clientX, clientY: event.clientY };
    this.updateCameraView(this.scene.adjustCameraZoom(direction * magnitude, anchor));
  }

  private handleCameraContextMenu(event: MouseEvent): void {
    if (this.isGameCanvasEventTarget(event.target)) {
      event.preventDefault();
    }
  }

  private normalizedWheelDeltaY(event: WheelEvent): number {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
    return event.deltaY;
  }

  private isGameCanvasEventTarget(target: EventTarget | null): boolean {
    const canvas = document.querySelector<HTMLCanvasElement>("#game-root canvas");
    return Boolean(canvas && target === canvas);
  }

  private releaseMovementInput(): void {
    this.moveLeftDown = false;
    this.moveRightDown = false;
    this.sendMoveInput(false, true);
  }

  private sendMoveInput(jump: boolean, force = false): void {
    if (!this.room) return;
    if (!this.canLocalMove()) {
      this.lastSentMoveX = 0;
      return;
    }
    const moveX = (this.moveRightDown ? 1 : 0) - (this.moveLeftDown ? 1 : 0);
    if (!force && !jump && moveX === this.lastSentMoveX) return;
    if (jump) {
      this.audio.play("player-jump");
    } else if (moveX !== 0 && moveX !== this.lastSentMoveX) {
      this.audio.play("player-step");
    }
    this.lastSentMoveX = moveX;
    this.sendInput(CLIENT_MESSAGES.MOVE_INPUT, {
      moveX,
      jump,
    });
  }

  private canLocalMove(): boolean {
    return (
      this.room !== null
      && this.snapshot.roundState === "active"
      && this.snapshot.turnPhase === "move"
      && this.snapshot.currentTurnSessionId === this.room.sessionId
    );
  }

  private updateCameraView(state: CameraViewState): void {
    this.cameraViewState = state;
    this.render();
  }

  private getLocalPlayer(): PlayerView | null {
    return this.snapshot.players.find((player) => player.sessionId === this.room?.sessionId) ?? null;
  }

  private canUseAmmo(ammoType: AmmoType): boolean {
    const local = this.getLocalPlayer();
    if (!local) return ammoType === this.selectedAmmo || ammoType === "javelin" || ammoType === "shotput" || ammoType === "splitter";
    const count = local.ammoCounts[ammoType] ?? 0;
    return count < 0 || count > 0;
  }

  private resolveSelectedUsableAmmo(): AmmoType | null {
    if (this.canUseAmmo(this.selectedAmmo)) return this.selectedAmmo;
    return AMMO_TYPES.find((ammoType) => this.canUseAmmo(ammoType)) ?? null;
  }

  private syncSelectedAmmoFromSnapshot(): void {
    const local = this.getLocalPlayer();
    if (local && this.canUseAmmo(this.selectedAmmo)) return;
    const authoritative = local?.selectedAmmo;
    const nextAmmo = authoritative && this.canUseAmmo(authoritative)
      ? authoritative
      : this.resolveSelectedUsableAmmo();
    if (!nextAmmo || nextAmmo === this.selectedAmmo) return;
    this.selectedAmmo = nextAmmo;
    this.scene.setSelectedAmmo(nextAmmo);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
  }

  private snapshotFromState(state: unknown): GameSnapshot {
    return {
      players: this.readPlayers((state as Record<string, unknown> | null)?.players),
      projectiles: this.readProjectiles((state as Record<string, unknown> | null)?.projectiles),
      pickups: this.readPickups((state as Record<string, unknown> | null)?.pickups),
      worldProps: this.readWorldProps((state as Record<string, unknown> | null)?.worldProps),
      roundState: this.readRoundState(readString(state, "roundState", "waiting")),
      winnerSide: this.readWinnerSide(readString(state, "winnerSide", "")),
      serverTick: readNumber(state, "serverTick", 0),
      worldWidth: Math.max(WORLD.width, readNumber(state, "worldWidth", WORLD.width)),
      code: readString(state, "code", ""),
      hostName: readString(state, "hostName", "Host"),
      countdownEndsAtMs: readNumber(state, "countdownEndsAtMs", 0),
      currentTurnSessionId: readString(state, "currentTurnSessionId", ""),
      turnPhase: this.readTurnPhase(readString(state, "turnPhase", "move")),
      turnStartedAtMs: readNumber(state, "turnStartedAtMs", 0),
      turnEndsAtMs: readNumber(state, "turnEndsAtMs", 0),
      turnNumber: readNumber(state, "turnNumber", 0),
      terrainSeed: readString(state, "terrainSeed", readString(state, "code", "Lobbers")),
      terrainMode: readString(state, "terrainMode", "procedural") === "classic" ? "classic" : "procedural",
      terrainVersion: readNumber(state, "terrainVersion", TERRAIN.version),
      biomeId: readString(state, "biomeId", "stadium"),
      windAccelerationX: readNumber(state, "windAccelerationX", 0),
    };
  }

  private readPlayers(source: unknown): PlayerView[] {
    const players: PlayerView[] = [];
    this.forEachSchemaEntry(source, (sessionId, entry) => {
      const sideValue = readString(entry, "side", "blue");
      const selectedAmmoValue = readString(entry, "selectedAmmo", "javelin");
      const dashCooldownEndsAtMs = readNumber(entry, "dashCooldownEndsAtMs", 0);
      players.push({
        sessionId,
        side: isSide(sideValue) ? sideValue : "blue",
        laneIndex: Math.max(0, Math.floor(readNumber(entry, "laneIndex", 0))),
        spawnIndex: Math.max(0, Math.floor(readNumber(entry, "spawnIndex", 0))),
        name: readString(entry, "name", "Lobber"),
        vehicleDesign: readString(entry, "vehicleDesign", ""),
        x: readNumber(entry, "x", 0),
        y: readNumber(entry, "y", 0),
        vx: readNumber(entry, "vx", 0),
        vy: readNumber(entry, "vy", 0),
        hp: readNumber(entry, "hp", 0),
        aimX: readNumber(entry, "aimX", 1),
        aimY: readNumber(entry, "aimY", -0.35),
        selectedAmmo: isAmmoType(selectedAmmoValue) ? selectedAmmoValue : "javelin",
        ammoCounts: this.readAmmoCounts(entry),
        shieldHp: readNumber(entry, "shieldHp", 0),
        shieldMaxHp: readNumber(entry, "shieldMaxHp", 50),
        dashCooldownMs: readNumber(entry, "dashCooldownMs", 1050),
        dashCooldownRemainingMs: Math.max(0, dashCooldownEndsAtMs - Date.now()),
        dashSeq: readNumber(entry, "dashSeq", 0),
        pickupSeq: readNumber(entry, "pickupSeq", 0),
        lastPickupLabel: readString(entry, "lastPickupLabel", ""),
        lastThrowDistance: readNumber(entry, "lastThrowDistance", 0),
        bestThrowDistance: readNumber(entry, "bestThrowDistance", 0),
        throwSeq: readNumber(entry, "throwSeq", 0),
        charging: readBoolean(entry, "charging", false),
        connected: readBoolean(entry, "connected", false),
        ready: readBoolean(entry, "ready", false),
        rematchRequested: readBoolean(entry, "rematchRequested", false),
        isHost: readBoolean(entry, "isHost", false),
        isBot: readBoolean(entry, "isBot", false),
        grounded: readBoolean(entry, "grounded", true),
      });
    });
    return players;
  }

  private readAmmoCounts(source: unknown): Record<AmmoType, number> {
    return AMMO_TYPES.reduce((counts, ammoType) => ({
      ...counts,
      [ammoType]: readNumber(source, `${ammoType}Ammo`, ammoType === "javelin" || ammoType === "shotput" || ammoType === "splitter" ? -1 : 0),
    }), {} as Record<AmmoType, number>);
  }

  private readProjectiles(source: unknown): ProjectileView[] {
    const projectiles: ProjectileView[] = [];
    this.forEachSchemaEntry(source, (id, entry) => {
      const ammoValue = readString(entry, "ammoType", "javelin");
      projectiles.push({
        id,
        ammoType: isAmmoType(ammoValue) ? ammoValue : "javelin",
        ownerSessionId: readString(entry, "ownerSessionId", ""),
        x: readNumber(entry, "x", 0),
        y: readNumber(entry, "y", 0),
        vx: readNumber(entry, "vx", 0),
        vy: readNumber(entry, "vy", 0),
        radius: readNumber(entry, "radius", AMMO_DEFINITIONS.javelin.radius),
        alive: readBoolean(entry, "alive", true),
      });
    });
    return projectiles;
  }

  private readPickups(source: unknown): PickupView[] {
    const pickups: PickupView[] = [];
    this.forEachSchemaEntry(source, (id, entry) => {
      const type = readString(entry, "type", "armor");
      pickups.push({
        id,
        type: (
          type === "clusterAmmo"
          || type === "dashCharge"
          || type === "repair"
          || type === "ammoCache"
        ) ? type : "armor",
        laneIndex: Math.max(0, Math.floor(readNumber(entry, "laneIndex", 0))),
        x: readNumber(entry, "x", 0),
        y: readNumber(entry, "y", 0),
        radius: readNumber(entry, "radius", 20),
        active: readBoolean(entry, "active", true),
      });
    });
    return pickups;
  }

  private readWorldProps(source: unknown): WorldPropView[] {
    const props: WorldPropView[] = [];
    this.forEachSchemaEntry(source, (id, entry) => {
      const type = readString(entry, "type", "oilBarrel");
      props.push({
        id,
        type: this.readWorldPropType(type),
        laneIndex: Math.max(0, Math.floor(readNumber(entry, "laneIndex", 0))),
        x: readNumber(entry, "x", 0),
        y: readNumber(entry, "y", 0),
        width: readNumber(entry, "width", 0),
        height: readNumber(entry, "height", 0),
        hp: readNumber(entry, "hp", 0),
        active: readBoolean(entry, "active", true),
        triggeredSeq: readNumber(entry, "triggeredSeq", 0),
      });
    });
    return props;
  }

  private readWorldPropType(value: string): WorldPropType {
    if (value === "supplyCrate") return "supplyCrate";
    return "oilBarrel";
  }

  private forEachSchemaEntry(source: unknown, callback: (key: string, value: unknown) => void): void {
    const mapLike = source as SchemaMapLike | null;
    if (typeof mapLike?.forEach === "function") {
      mapLike.forEach((value, key) => callback(key, value));
      return;
    }
    if (!source || typeof source !== "object") return;
    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith("$")) continue;
      callback(key, value);
    }
  }

  private readRoundState(value: string): GameSnapshot["roundState"] {
    if (value === "countdown" || value === "active" || value === "ended") return value;
    return "waiting";
  }

  private readTurnPhase(value: string): GameSnapshot["turnPhase"] {
    if (value === "fire" || value === "resolving") return value;
    return "move";
  }

  private readWinnerSide(value: string): Side | "" {
    if (value === "blue" || value === "red") return value;
    return "";
  }

  private setStatus(value: string): void {
    this.status = value;
    this.render();
  }

  private render(): void {
    this.syncSelectedAmmoFromSnapshot();
    this.cameraViewState = this.scene.getCameraViewState();
    const chargeRatio = this.chargeStartedAtMs === null
      ? 0
      : resolveChargeRatio(Math.min(CHARGE.maxMs, performance.now() - this.chargeStartedAtMs));
    this.publishDiagnostics(chargeRatio);
    this.hud.render(this.snapshot, {
      connected: this.room !== null,
      connecting: this.connecting,
      status: this.room?.detail || this.status,
      localSessionId: this.room?.sessionId ?? "",
      selectedAmmo: this.selectedAmmo,
      chargeRatio,
      cameraMode: this.cameraViewState.mode,
      cameraZoom: this.cameraViewState.zoom,
      currentTurnSessionId: this.snapshot.currentTurnSessionId,
      turnPhase: this.snapshot.turnPhase,
      turnRemainingMs: Math.max(0, this.snapshot.turnEndsAtMs - Date.now()),
      lobbies: this.lobbies,
    });
  }

  private publishDiagnostics(chargeRatio: number): void {
    const canvas = document.querySelector<HTMLCanvasElement>("#game-root canvas");
    const diagnostics = {
      renderer: "phaser",
      connected: this.room !== null,
      status: this.status,
      selectedAmmo: this.selectedAmmo,
      chargeRatio,
      camera: this.cameraViewState,
      canvas: canvas
        ? {
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
            width: canvas.width,
            height: canvas.height,
          }
        : null,
      state: {
        roundState: this.snapshot.roundState,
        players: this.snapshot.players.length,
        projectiles: this.snapshot.projectiles.length,
        pickups: this.snapshot.pickups.filter((pickup) => pickup.active).length,
        worldProps: this.snapshot.worldProps.filter((prop) => prop.active).length,
        terrainMode: this.snapshot.terrainMode,
        biomeId: this.snapshot.biomeId,
        windAccelerationX: Math.round(this.snapshot.windAccelerationX * 10) / 10,
        currentTurnSessionId: this.snapshot.currentTurnSessionId,
        turnPhase: this.snapshot.turnPhase,
        turnRemainingMs: Math.max(0, Math.round(this.snapshot.turnEndsAtMs - Date.now())),
      },
    };
    (window as unknown as { __LOBBERS_DIAGNOSTICS__?: typeof diagnostics }).__LOBBERS_DIAGNOSTICS__ = diagnostics;
  }
}
