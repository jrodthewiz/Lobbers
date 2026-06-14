import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import { AMMO_DEFINITIONS, isAmmoType } from "../../shared/game/ammo";
import { CHARGE, ROOM_NAME } from "../../shared/game/constants";
import { CLIENT_MESSAGES } from "../../shared/game/messages";
import { resolveChargeRatio } from "../../shared/game/math";
import type { AmmoType, LobbyInfo, Side, Vec2 } from "../../shared/game/types";
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
  private readonly serverHttpUrl = resolveHttpBaseUrl();
  private room: Room | null = null;
  private snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private selectedAmmo: AmmoType = "javelin";
  private lobbies: LobbyInfo[] = [];
  private status = "Offline";
  private connecting = false;
  private chargeStartedAtMs: number | null = null;

  constructor() {
    const hudRoot = document.querySelector<HTMLElement>("#hud-root");
    if (!hudRoot) throw new Error("Missing HUD root.");
    this.hud = new Hud(hudRoot);
    this.client = new Client(toWsUrl(this.serverHttpUrl));
  }

  start(): void {
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
      hostLobby: (playerName) => void this.hostLobby(playerName),
      joinLobby: (code, playerName) => void this.joinLobby(code, playerName),
      refreshLobbies: () => void this.refreshLobbies(),
      selectAmmo: (ammoType) => this.selectAmmo(ammoType),
      setReady: (ready) => this.setReady(ready),
      rematch: () => this.rematch(),
    });

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

  private async joinLobby(code: string, playerName: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
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
      this.setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      this.connecting = false;
      this.render();
    }
  }

  private attachRoom(room: Room): void {
    this.room = room;
    this.scene.setLocalSessionId(room.sessionId);
    this.setStatus(`Connected as ${room.sessionId.slice(0, 4)}`);
    room.onStateChange((state: unknown) => {
      this.snapshot = this.snapshotFromState(state);
      this.scene.setSnapshot(this.snapshot);
      this.render();
    });
    room.onLeave(() => {
      this.setStatus("Disconnected");
      this.room = null;
      this.snapshot = EMPTY_SNAPSHOT;
      this.scene.setSnapshot(this.snapshot);
      this.render();
    });
    room.onError((_code: number, message?: string) => {
      this.setStatus(message ?? "Room error");
    });
    this.snapshot = this.snapshotFromState(room.state);
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
    this.room.send(CLIENT_MESSAGES.CHARGE_START, {
      ammoType: this.selectedAmmo,
    });
  }

  private chargeCancel(): void {
    if (!this.room) return;
    this.chargeStartedAtMs = null;
    this.room.send(CLIENT_MESSAGES.CHARGE_CANCEL);
  }

  private throwRelease(aim: Vec2): void {
    if (!this.room) return;
    this.chargeStartedAtMs = null;
    this.room.send(CLIENT_MESSAGES.THROW_RELEASE, {
      aimX: aim.x,
      aimY: aim.y,
    });
  }

  private selectAmmo(ammoType: AmmoType): void {
    this.selectedAmmo = ammoType;
    this.scene.setSelectedAmmo(ammoType);
    if (this.room) {
      this.room.send(CLIENT_MESSAGES.SELECT_AMMO, { ammoType });
    }
    this.render();
  }

  private setReady(ready: boolean): void {
    this.room?.send(CLIENT_MESSAGES.SET_READY, { ready });
  }

  private rematch(): void {
    this.room?.send(CLIENT_MESSAGES.REMATCH);
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
        hp: readNumber(entry, "hp", 0),
        aimX: readNumber(entry, "aimX", 1),
        aimY: readNumber(entry, "aimY", -0.35),
        selectedAmmo: isAmmoType(selectedAmmoValue) ? selectedAmmoValue : "javelin",
        lastThrowDistance: readNumber(entry, "lastThrowDistance", 0),
        bestThrowDistance: readNumber(entry, "bestThrowDistance", 0),
        charging: readBoolean(entry, "charging", false),
        connected: readBoolean(entry, "connected", false),
        ready: readBoolean(entry, "ready", false),
        rematchRequested: readBoolean(entry, "rematchRequested", false),
        isHost: readBoolean(entry, "isHost", false),
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
