import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import { AMMO_DEFINITIONS, AMMO_TYPES, isAmmoType } from "../../shared/game/ammo";
import { CHARGE, ROOM_NAME } from "../../shared/game/constants";
import { CLIENT_MESSAGES } from "../../shared/game/messages";
import { resolveChargeRatio } from "../../shared/game/math";
import type { AmmoType, LobbyInfo, Side, Vec2 } from "../../shared/game/types";
import { GameAudio, type GameSoundKey } from "./audio/GameAudio";
import { GameScene } from "./game/GameScene";
import type { GameSnapshot, PlayerView, ProjectileView } from "./game/viewModel";
import { EMPTY_SNAPSHOT } from "./game/viewModel";
import { Hud } from "./ui/Hud";

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
  private readonly serverHttpUrl = resolveHttpBaseUrl();
  private room: Room | null = null;
  private snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private selectedAmmo: AmmoType = "javelin";
  private lobbies: LobbyInfo[] = [];
  private status = "Offline";
  private connecting = false;
  private chargeStartedAtMs: number | null = null;
  private moveLeftDown = false;
  private moveRightDown = false;
  private lastSentMoveX = 0;

  constructor() {
    const hudRoot = document.querySelector<HTMLElement>("#hud-root");
    if (!hudRoot) throw new Error("Missing HUD root.");
    this.hud = new Hud(hudRoot);
    this.client = new Client(toWsUrl(this.serverHttpUrl));
  }

  start(): void {
    this.audio.preload();

    new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-root",
      width: 1600,
      height: 900,
      backgroundColor: "#111827",
      scene: [this.scene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    this.scene.setCallbacks({
      chargeStart: () => this.chargeStart(),
      chargeCancel: () => this.chargeCancel(),
      throwRelease: (aim) => this.throwRelease(aim),
    });

    this.hud.setCallbacks({
      hostLobby: (playerName) => {
        this.audio.play("ui-click");
        void this.hostLobby(playerName);
      },
      practiceBot: (playerName) => {
        this.audio.play("ui-click");
        void this.practiceBot(playerName);
      },
      joinLobby: (code, playerName) => {
        this.audio.play("ui-click");
        void this.joinLobby(code, playerName);
      },
      refreshLobbies: () => {
        this.audio.play("ui-click");
        void this.refreshLobbies();
      },
      selectAmmo: (ammoType) => this.selectAmmo(ammoType),
      setReady: (ready) => this.setReady(ready),
      rematch: () => this.rematch(),
    });

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.addEventListener("keyup", (event) => this.handleKeyUp(event));
    window.addEventListener("blur", () => this.releaseMovementInput());

    this.setStatus("Ready");
    void this.refreshLobbies();
    window.setInterval(() => this.render(), 100);
  }

  private async hostLobby(playerName: string): Promise<void> {
    await this.connect(async () => {
      const room = await this.client.create(ROOM_NAME, {
        hostName: playerName,
        playerName,
      });
      this.attachRoom(room);
    }, "Hosting lobby...");
  }

  private async practiceBot(playerName: string): Promise<void> {
    await this.connect(async () => {
      const room = await this.client.create(ROOM_NAME, {
        hostName: playerName,
        playerName,
        bot: true,
      });
      this.attachRoom(room);
    }, "Starting practice bot...");
  }

  private async joinLobby(code: string, playerName: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      this.audio.play("ui-error");
      this.setStatus("Enter a lobby code.");
      return;
    }
    await this.connect(async () => {
      const room = await this.client.join(ROOM_NAME, {
        code: normalized,
        playerName,
      });
      this.attachRoom(room);
    }, `Joining ${normalized}...`);
  }

  private async connect(action: () => Promise<void>, status: string): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    this.setStatus(status);
    try {
      await action();
    } catch (error) {
      this.audio.play("ui-error");
      this.setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      this.connecting = false;
      this.render();
    }
  }

  private attachRoom(room: Room): void {
    this.room = room;
    this.lastSentMoveX = 0;
    this.resetAudioTracking();
    this.audio.play("ui-confirm");
    this.scene.setLocalSessionId(room.sessionId);
    this.setStatus(`Connected as ${room.sessionId.slice(0, 4)}`);
    room.onStateChange((state: unknown) => {
      const nextSnapshot = this.snapshotFromState(state);
      this.playSnapshotAudio(nextSnapshot);
      this.snapshot = nextSnapshot;
      this.scene.setSnapshot(this.snapshot);
      this.render();
    });
    room.onLeave(() => {
      this.setStatus("Disconnected");
      this.room = null;
      this.resetAudioTracking();
      this.snapshot = EMPTY_SNAPSHOT;
      this.scene.setSnapshot(this.snapshot);
      this.render();
    });
    room.onError((_code: number, message?: string) => {
      this.audio.play("ui-error");
      this.setStatus(message ?? "Room error");
    });
    this.snapshot = this.snapshotFromState(room.state);
    this.playSnapshotAudio(this.snapshot);
    this.scene.setSnapshot(this.snapshot);
    this.render();
  }

  private async refreshLobbies(): Promise<void> {
    try {
      const response = await fetch(`${this.serverHttpUrl}/api/lobbies`, { cache: "no-store" });
      const payload = await response.json() as LobbiesResponse;
      this.lobbies = Array.isArray(payload.lobbies) ? payload.lobbies : [];
      this.setStatus(this.room ? this.status : "Ready");
    } catch {
      this.lobbies = [];
      this.setStatus("Lobby server unavailable.");
    }
    this.render();
  }

  private chargeStart(): void {
    if (!this.room) return;
    this.chargeStartedAtMs = performance.now();
    this.audio.play("charge-start");
    this.room.send(CLIENT_MESSAGES.CHARGE_START, {
      ammoType: this.selectedAmmo,
    });
  }

  private chargeCancel(): void {
    if (!this.room) return;
    this.chargeStartedAtMs = null;
    this.audio.play("ui-back");
    this.room.send(CLIENT_MESSAGES.CHARGE_CANCEL);
  }

  private throwRelease(aim: Vec2): void {
    if (!this.room) return;
    this.chargeStartedAtMs = null;
    this.audio.play("throw-release");
    this.room.send(CLIENT_MESSAGES.THROW_RELEASE, {
      aimX: aim.x,
      aimY: aim.y,
    });
  }

  private selectAmmo(ammoType: AmmoType): void {
    this.audio.play("ui-select");
    this.selectedAmmo = ammoType;
    this.scene.setSelectedAmmo(ammoType);
    if (this.room) {
      this.room.send(CLIENT_MESSAGES.SELECT_AMMO, { ammoType });
    }
    this.render();
  }

  private setReady(ready: boolean): void {
    this.audio.play("ui-confirm");
    this.room?.send(CLIENT_MESSAGES.SET_READY, { ready });
  }

  private rematch(): void {
    this.audio.play("ui-confirm");
    this.room?.send(CLIENT_MESSAGES.REMATCH);
  }

  private playSnapshotAudio(nextSnapshot: GameSnapshot): void {
    const nextProjectilesById = new Map(nextSnapshot.projectiles.map((projectile) => [projectile.id, projectile]));
    let impactsPlayed = 0;
    for (const [id, projectile] of this.lastProjectilesById) {
      if (nextProjectilesById.has(id) || impactsPlayed >= 3) continue;
      this.audio.play(this.resolveProjectileImpactSound(projectile));
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
        this.audio.play("throw-release", 0.78);
      }

      const previousHp = this.lastHpBySessionId.get(player.sessionId);
      if (previousHp !== undefined && player.hp < previousHp) {
        playerDamageDetected = true;
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
    for (const player of nextSnapshot.players) {
      this.lastThrowSeqBySessionId.set(player.sessionId, player.throwSeq);
      this.lastHpBySessionId.set(player.sessionId, player.hp);
    }
  }

  private resolveProjectileImpactSound(projectile: ProjectileView): GameSoundKey {
    if (projectile.ammoType === "shotput") return "shotput-impact";
    if (projectile.ammoType === "splitter") {
      return projectile.radius < AMMO_DEFINITIONS.splitter.radius ? "fragment-impact" : "splitter-pop";
    }
    return "javelin-impact";
  }

  private resetAudioTracking(): void {
    this.lastProjectilesById.clear();
    this.lastThrowSeqBySessionId.clear();
    this.lastHpBySessionId.clear();
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
    return null;
  }

  private cycleAmmo(direction: -1 | 1): void {
    const currentIndex = AMMO_TYPES.indexOf(this.selectedAmmo);
    const nextIndex = (currentIndex + direction + AMMO_TYPES.length) % AMMO_TYPES.length;
    const nextAmmo = AMMO_TYPES[nextIndex];
    if (nextAmmo) this.selectAmmo(nextAmmo);
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

  private releaseMovementInput(): void {
    this.moveLeftDown = false;
    this.moveRightDown = false;
    this.sendMoveInput(false, true);
  }

  private sendMoveInput(jump: boolean, force = false): void {
    if (!this.room) return;
    const moveX = (this.moveRightDown ? 1 : 0) - (this.moveLeftDown ? 1 : 0);
    if (!force && !jump && moveX === this.lastSentMoveX) return;
    this.lastSentMoveX = moveX;
    this.room.send(CLIENT_MESSAGES.MOVE_INPUT, {
      moveX,
      jump,
    });
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
  }

  private snapshotFromState(state: unknown): GameSnapshot {
    return {
      players: this.readPlayers((state as Record<string, unknown> | null)?.players),
      projectiles: this.readProjectiles((state as Record<string, unknown> | null)?.projectiles),
      roundState: this.readRoundState(readString(state, "roundState", "waiting")),
      winnerSide: this.readWinnerSide(readString(state, "winnerSide", "")),
      serverTick: readNumber(state, "serverTick", 0),
      code: readString(state, "code", ""),
      hostName: readString(state, "hostName", "Host"),
      countdownEndsAtMs: readNumber(state, "countdownEndsAtMs", 0),
    };
  }

  private readPlayers(source: unknown): PlayerView[] {
    const players: PlayerView[] = [];
    this.forEachSchemaEntry(source, (sessionId, entry) => {
      const sideValue = readString(entry, "side", "blue");
      const selectedAmmoValue = readString(entry, "selectedAmmo", "javelin");
      players.push({
        sessionId,
        side: isSide(sideValue) ? sideValue : "blue",
        name: readString(entry, "name", "Lobber"),
        x: readNumber(entry, "x", 0),
        y: readNumber(entry, "y", 0),
        vx: readNumber(entry, "vx", 0),
        vy: readNumber(entry, "vy", 0),
        hp: readNumber(entry, "hp", 0),
        aimX: readNumber(entry, "aimX", 1),
        aimY: readNumber(entry, "aimY", -0.35),
        selectedAmmo: isAmmoType(selectedAmmoValue) ? selectedAmmoValue : "javelin",
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

  private readWinnerSide(value: string): Side | "" {
    if (value === "blue" || value === "red") return value;
    return "";
  }

  private setStatus(value: string): void {
    this.status = value;
    this.render();
  }

  private render(): void {
    const chargeRatio = this.chargeStartedAtMs === null
      ? 0
      : resolveChargeRatio(Math.min(CHARGE.maxMs, performance.now() - this.chargeStartedAtMs));
    this.hud.render(this.snapshot, {
      connected: this.room !== null,
      connecting: this.connecting,
      status: this.status,
      localSessionId: this.room?.sessionId ?? "",
      selectedAmmo: this.selectedAmmo,
      chargeRatio,
      lobbies: this.lobbies,
    });
  }
}
