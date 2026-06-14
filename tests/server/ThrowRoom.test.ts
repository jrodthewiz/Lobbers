import { describe, expect, it } from "vitest";
import type { Client } from "colyseus";
import { ThrowRoom } from "../../server/rooms/ThrowRoom";
import type { ChargeStartPayload, SetReadyPayload, ThrowReleasePayload } from "../../shared/game/types";

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
};

const mockClient = (sessionId: string): Client => ({ sessionId }) as Client;

const privateHandlers = (room: ThrowRoom): RoomPrivateHandlers => room as unknown as RoomPrivateHandlers;

const createRoom = (): ThrowRoom => {
  const room = new ThrowRoom();
  const hooks = room as unknown as RoomTestHooks;
  Object.defineProperty(room, "roomId", { value: "room-test", configurable: true });
  hooks.setPatchRate = () => undefined;
  hooks.setSimulationInterval = () => undefined;
  hooks.onMessage = () => undefined;
  hooks.setMetadata = () => undefined;
  room.onCreate({ hostName: "Host" });
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

    expect(room.state.projectiles.size).toBeGreaterThan(0);
  });
});
