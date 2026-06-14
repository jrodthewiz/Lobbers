import { describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { ThrowRoom } from "../../server/rooms/ThrowRoom";
import type {
  ChargeStartPayload,
  MoveInputPayload,
  SelectAmmoPayload,
  SetReadyPayload,
  ThrowReleasePayload,
} from "../../shared/game/types";
import { AMMO_DEFINITIONS, AMMO_TYPES, getAmmoDefinition } from "../../shared/game/ammo";
import {
  buildLaunchVelocity,
  normalizeAimForSide,
  resolveThrowHandPosition,
} from "../../shared/game/math";

type RoomTestHooks = {
  setPatchRate: (milliseconds: number) => void;
  setSimulationInterval: (callback: () => void, milliseconds?: number) => void;
  onMessage: () => void;
  setMetadata: (metadata: Record<string, unknown>) => void;
  listing: {
    code?: string;
    metadata?: Record<string, unknown>;
  };
};

type RoomPrivateHandlers = {
  handleSetReady: (client: Client, payload: SetReadyPayload) => void;
  handleChargeStart: (client: Client, payload: ChargeStartPayload) => void;
  handleThrowRelease: (client: Client, payload: ThrowReleasePayload) => void;
  handleSelectAmmo: (client: Client, payload: SelectAmmoPayload) => void;
  handleMoveInput: (client: Client, payload: MoveInputPayload) => void;
  update: (dtSeconds: number) => void;
};

const mockClient = (sessionId: string): Client => ({ sessionId }) as Client;

const privateHandlers = (room: ThrowRoom): RoomPrivateHandlers => room as unknown as RoomPrivateHandlers;

const joinGuest = (room: ThrowRoom, client: Client, playerName = "Guest"): void => {
  room.onJoin(client, { code: room.state.code, playerName });
};

const createRoom = (options: { bot?: boolean } = {}): ThrowRoom => {
  const room = new ThrowRoom();
  const hooks = room as unknown as RoomTestHooks;
  Object.defineProperty(room, "roomId", { value: "room-test", configurable: true });
  hooks.listing = {};
  hooks.setPatchRate = () => undefined;
  hooks.setSimulationInterval = () => undefined;
  hooks.onMessage = () => undefined;
  hooks.setMetadata = (metadata) => {
    hooks.listing.metadata = {
      ...hooks.listing.metadata,
      ...metadata,
    };
  };
  room.onCreate({ hostName: "Host", bot: options.bot });
  return room;
};

describe("ThrowRoom", () => {
  it("creates a lobby code", () => {
    const room = createRoom();
    expect(room.state.code).toHaveLength(6);
  });

  it("exposes the lobby code for matchmaking filters", () => {
    const room = createRoom();
    const listing = (room as unknown as RoomTestHooks).listing;
    expect(listing.code).toBe(room.state.code);
    expect(listing.metadata?.code).toBe(room.state.code);
  });

  it("assigns host and guest to opposing sides", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");

    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    expect(room.state.players.get(host.sessionId)?.side).toBe("blue");
    expect(room.state.players.get(guest.sessionId)?.side).toBe("red");
  });

  it("rejects a third player", () => {
    const room = createRoom();
    room.onJoin(mockClient("host"), { playerName: "Host" });
    joinGuest(room, mockClient("guest"));

    expect(() => joinGuest(room, mockClient("third"), "Third")).toThrow("Lobby full");
  });

  it("requires the lobby code for guest joins", () => {
    const room = createRoom();
    room.onJoin(mockClient("host"), { playerName: "Host" });

    expect(() => room.onJoin(mockClient("guest"), { playerName: "Guest" })).toThrow("Lobby is not accepting players");
  });

  it("frees a waiting lobby slot after a guest leaves", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const replacement = mockClient("replacement");

    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);
    room.onLeave(guest);
    joinGuest(room, replacement, "Replacement");

    expect(room.state.players.has(guest.sessionId)).toBe(false);
    expect(room.state.players.get(replacement.sessionId)?.side).toBe("red");
  });

  it("enters countdown when both players are ready", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });

    expect(room.state.roundState).toBe("countdown");
  });

  it("spawns a projectile from a charged release", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    room.state.roundState = "active";

    handlers.handleChargeStart(host, { ammoType: "javelin" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.42 });

    expect(room.state.players.get(host.sessionId)?.throwSeq).toBe(1);
    expect(room.state.projectiles.size).toBeGreaterThan(0);
  });

  it.each([...AMMO_TYPES])("spawns requested %s ammo from a charged release", (ammoType) => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    room.state.roundState = "active";

    handlers.handleSelectAmmo(host, { ammoType });
    handlers.handleChargeStart(host, { ammoType });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.42 });

    const projectile = Array.from(room.state.projectiles.values())[0];
    expect(room.state.players.get(host.sessionId)?.selectedAmmo).toBe(ammoType);
    expect(projectile?.ammoType).toBe(ammoType);
    expect(projectile?.radius).toBe(AMMO_DEFINITIONS[ammoType].radius);
    expect(Math.hypot(projectile?.vx ?? 0, projectile?.vy ?? 0)).toBeGreaterThan(0);
  });

  it("splits splitter ammo into fragment projectiles", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    room.state.roundState = "active";

    handlers.handleChargeStart(host, { ammoType: "splitter" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.8 });

    let fragmentCount = 0;
    for (let i = 0; i < 140; i += 1) {
      handlers.update(1 / 60);
      fragmentCount = Array.from(room.state.projectiles.values())
        .filter((projectile) => (
          projectile.ammoType === "splitter"
          && projectile.radius === AMMO_DEFINITIONS.splitter.fragmentRadius
        ))
        .length;
      if (fragmentCount > 0) break;
    }

    expect(fragmentCount).toBe(AMMO_DEFINITIONS.splitter.fragmentCount);
  });

  it("aligns released projectile spawn and velocity with normalized mouse aim", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    room.state.roundState = "active";

    const player = room.state.players.get(host.sessionId);
    if (!player) throw new Error("Expected host player to exist");

    const chargeMs = 900;
    const rawAim = { aimX: 0.46, aimY: -0.72 };
    const aim = normalizeAimForSide(rawAim, "blue");
    const ammo = getAmmoDefinition("shotput");
    const expectedHand = resolveThrowHandPosition(player.x, player.y, "blue", aim);
    const expectedVelocity = buildLaunchVelocity(ammo, chargeMs, aim);
    const nowSpy = vi.spyOn(Date, "now");

    try {
      nowSpy.mockReturnValue(1_700_000_000_000);
      handlers.handleChargeStart(host, { ammoType: ammo.type });
      nowSpy.mockReturnValue(1_700_000_000_000 + chargeMs);
      handlers.handleThrowRelease(host, rawAim);
    } finally {
      nowSpy.mockRestore();
    }

    const projectile = Array.from(room.state.projectiles.values())[0];
    expect(projectile).toBeDefined();
    if (!projectile) throw new Error("Expected release to spawn a projectile");

    expect(projectile.x).toBeCloseTo(expectedHand.x, 5);
    expect(projectile.y).toBeCloseTo(expectedHand.y, 5);
    expect(projectile.vx).toBeCloseTo(expectedVelocity.x, 5);
    expect(projectile.vy).toBeCloseTo(expectedVelocity.y, 5);
    expect(player.aimX).toBeCloseTo(aim.x, 5);
    expect(player.aimY).toBeCloseTo(aim.y, 5);
  });

  it("moves a human tank from move input", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
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
    joinGuest(room, mockClient("guest"));
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
