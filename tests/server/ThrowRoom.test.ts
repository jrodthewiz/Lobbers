import { describe, expect, it } from "vitest";
import type { Client } from "colyseus";
import { ThrowRoom } from "../../server/rooms/ThrowRoom";
import type { ChargeStartPayload, MoveInputPayload, SetReadyPayload, ThrowReleasePayload } from "../../shared/game/types";

type RoomTestHooks = {
  setPatchRate: (milliseconds: number) => void;
  setSimulationInterval: (callback: () => void, milliseconds?: number) => void;
  onMessage: () => void;
  setMetadata: () => void;
};

type RoomPrivateHandlers = {
  handleSetReady: (client: Client, payload: SetReadyPayload) => void;
  handleChargeStart: (client: Client, payload: ChargeStartPayload) => void;
  handleThrowRelease: (client: Client, payload: ThrowReleasePayload) => void;
  handleMoveInput: (client: Client, payload: MoveInputPayload) => void;
  update: (dtSeconds: number) => void;
};

const mockClient = (sessionId: string): Client => ({ sessionId }) as Client;

const privateHandlers = (room: ThrowRoom): RoomPrivateHandlers => room as unknown as RoomPrivateHandlers;

const createRoom = (options: { bot?: boolean } = {}): ThrowRoom => {
  const room = new ThrowRoom();
  const hooks = room as unknown as RoomTestHooks;
  Object.defineProperty(room, "roomId", { value: "room-test", configurable: true });
  hooks.setPatchRate = () => undefined;
  hooks.setSimulationInterval = () => undefined;
  hooks.onMessage = () => undefined;
  hooks.setMetadata = () => undefined;
  room.onCreate({ hostName: "Host", bot: options.bot });
  return room;
};

describe("ThrowRoom", () => {
  it("creates a lobby code", () => {
    const room = createRoom();
    expect(room.state.code).toHaveLength(6);
  });

  it("assigns host and guest to opposing sides", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");

    room.onJoin(host, { playerName: "Host" });
    room.onJoin(guest, { playerName: "Guest" });

    expect(room.state.players.get(host.sessionId)?.side).toBe("blue");
    expect(room.state.players.get(guest.sessionId)?.side).toBe("red");
  });

  it("rejects a third player", () => {
    const room = createRoom();
    room.onJoin(mockClient("host"), { playerName: "Host" });
    room.onJoin(mockClient("guest"), { playerName: "Guest" });

    expect(() => room.onJoin(mockClient("third"), { playerName: "Third" })).toThrow("Lobby full");
  });

  it("enters countdown when both players are ready", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    room.onJoin(guest, { playerName: "Guest" });

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });

    expect(room.state.roundState).toBe("countdown");
  });

  it("spawns a projectile from a charged release", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    room.onJoin(mockClient("guest"), { playerName: "Guest" });
    room.state.roundState = "active";

    handlers.handleChargeStart(host, { ammoType: "javelin" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.42 });

    expect(room.state.players.get(host.sessionId)?.throwSeq).toBe(1);
    expect(room.state.projectiles.size).toBeGreaterThan(0);
  });

  it("moves a human tank from move input", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    room.onJoin(mockClient("guest"), { playerName: "Guest" });
    room.state.roundState = "active";
    const startX = room.state.players.get(host.sessionId)?.x ?? 0;

    handlers.handleMoveInput(host, { moveX: 1, jump: false });
    for (let i = 0; i < 10; i += 1) {
      handlers.update(1 / 60);
    }

    expect(room.state.players.get(host.sessionId)?.x).toBeGreaterThan(startX);
  });

  it("jumps a grounded human tank", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    room.onJoin(mockClient("guest"), { playerName: "Guest" });
    room.state.roundState = "active";
    const startY = room.state.players.get(host.sessionId)?.y ?? 0;

    handlers.handleMoveInput(host, { moveX: 0, jump: true });
    handlers.update(1 / 60);

    const player = room.state.players.get(host.sessionId);
    expect(player?.y).toBeLessThan(startY);
    expect(player?.grounded).toBe(false);
  });

  it("adds a ready red practice bot when requested", () => {
    const room = createRoom({ bot: true });
    const host = mockClient("host");
    const handlers = privateHandlers(room);

    room.onJoin(host, { playerName: "Host" });
    handlers.handleSetReady(host, { ready: true });

    const bot = room.state.players.get("bot:red");
    expect(bot?.side).toBe("red");
    expect(bot?.isBot).toBe(true);
    expect(bot?.ready).toBe(true);
    expect(room.state.roundState).toBe("countdown");
  });

  it("practice bot fires during an active round", () => {
    const room = createRoom({ bot: true });
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    room.state.roundState = "active";

    handlers.update(1 / 60);

    const botProjectiles = Array.from(room.state.projectiles.values())
      .filter((projectile) => projectile.ownerSessionId === "bot:red");
    expect(botProjectiles.length).toBeGreaterThan(0);
  });
});
