import { describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { CLIENT_MESSAGES } from "../../shared/game/messages";
import type { ThrowAuthority } from "../../shared/game/ThrowAuthority";
import { ThrowRoom } from "../../server/rooms/ThrowRoom";
import type { PlayerState, ProjectileState, WorldPropState } from "../../server/schema/LobbersState";
import type {
  AmmoType,
  ChargeStartPayload,
  MoveInputPayload,
  SelectAmmoPayload,
  SetReadyPayload,
  ThrowReleasePayload,
  UseAbilityPayload,
  TurnPhase,
} from "../../shared/game/types";
import { AMMO_DEFINITIONS, AMMO_TYPES, getAmmoDefinition } from "../../shared/game/ammo";
import {
  buildLaunchVelocity,
  normalizeAimForSide,
  resolveShoulderPosition,
  resolveThrowHandPosition,
} from "../../shared/game/math";
import { ARMOR, CHARGE, MOVEMENT, PICKUPS, WIND, WORLD } from "../../shared/game/constants";
import type { TerrainLane } from "../../shared/game/terrain";

type RoomTestHooks = {
  setPatchRate: (milliseconds: number) => void;
  setSimulationInterval: (callback: () => void, milliseconds?: number) => void;
  onMessage: (type: string, callback: (client: Client, payload: unknown) => void) => void;
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
  handleUseAbility: (client: Client, payload: UseAbilityPayload) => void;
  collectPickups: (player: PlayerState) => void;
  damageWorldProp: (
    prop: WorldPropState,
    damage: number,
    context: { x: number; y: number; laneIndex: number; laneOffsetX: number },
  ) => void;
  applyBlastDamage: (
    projectile: ProjectileState,
    runtime: { fragment: boolean; laneIndex: number },
    impact: { x: number; y: number; colliderId: string; directHitSessionId: string | null; outOfBounds: boolean },
  ) => void;
  resolvePracticeBotShotPlan: (
    bot: PlayerState,
    target: PlayerState,
    targetSessionId: string,
    ammo: ReturnType<typeof getAmmoDefinition>,
  ) => { aim: { x: number; y: number }; chargeMs: number; score: number };
  scorePracticeBotShot: (
    bot: PlayerState,
    target: PlayerState,
    targetSessionId: string,
    ammo: ReturnType<typeof getAmmoDefinition>,
    aim: { x: number; y: number },
    chargeMs: number,
  ) => number;
  resolvePracticeBotAmmoType: () => AmmoType;
  update: (dtSeconds: number) => void;
};

const mockClient = (sessionId: string): Client => ({ sessionId }) as Client;

const authorityFor = (room: ThrowRoom): ThrowAuthority => (
  room as unknown as { authority: ThrowAuthority }
).authority;

const registeredHandlers = new WeakMap<ThrowRoom, Map<string, (client: Client, payload: unknown) => void>>();

const privateHandlers = (room: ThrowRoom): RoomPrivateHandlers => {
  const authority = authorityFor(room);
  const internals = authority as unknown as RoomPrivateHandlers;
  const send = (type: string, client: Client, payload: unknown): void => {
    const handler = registeredHandlers.get(room)?.get(type);
    if (!handler) throw new Error(`Missing registered handler: ${type}`);
    handler(client, payload);
  };
  return {
    handleSetReady: (client, payload) => send(CLIENT_MESSAGES.SET_READY, client, payload),
    handleChargeStart: (client, payload) => send(CLIENT_MESSAGES.CHARGE_START, client, payload),
    handleThrowRelease: (client, payload) => send(CLIENT_MESSAGES.THROW_RELEASE, client, payload),
    handleSelectAmmo: (client, payload) => send(CLIENT_MESSAGES.SELECT_AMMO, client, payload),
    handleMoveInput: (client, payload) => send(CLIENT_MESSAGES.MOVE_INPUT, client, payload),
    handleUseAbility: (client, payload) => send(CLIENT_MESSAGES.USE_ABILITY, client, payload),
    collectPickups: internals.collectPickups.bind(authority),
    damageWorldProp: internals.damageWorldProp.bind(authority),
    applyBlastDamage: internals.applyBlastDamage.bind(authority),
    resolvePracticeBotShotPlan: internals.resolvePracticeBotShotPlan.bind(authority),
    scorePracticeBotShot: internals.scorePracticeBotShot.bind(authority),
    resolvePracticeBotAmmoType: internals.resolvePracticeBotAmmoType.bind(authority),
    update: (dtSeconds) => authority.step(dtSeconds),
  };
};

const grantTestAmmo = (room: ThrowRoom, sessionId: string, ammoType: AmmoType, count = 1): void => {
  const player = room.state.players.get(sessionId) as unknown as Record<string, number> | undefined;
  const field = `${ammoType}Ammo`;
  if (player && typeof player[field] === "number" && player[field] >= 0) {
    player[field] = count;
  }
};

const setTestTerrainLane = (room: ThrowRoom, terrainLane: TerrainLane): void => {
  (authorityFor(room) as unknown as { terrainLane: TerrainLane }).terrainLane = terrainLane;
};

const joinGuest = (room: ThrowRoom, client: Client, playerName = "Guest"): void => {
  room.onJoin(client, { code: room.state.code, playerName });
};

const setActiveTurn = (room: ThrowRoom, sessionId: string, phase: TurnPhase): void => {
  room.state.roundState = "active";
  room.state.currentTurnSessionId = sessionId;
  room.state.turnPhase = phase;
  room.state.turnStartedAtMs = Date.now();
  room.state.turnEndsAtMs = Date.now() + 30_000;
};

const setActiveMoveTurn = (room: ThrowRoom, sessionId: string): void => {
  setActiveTurn(room, sessionId, "move");
};

const setActiveFireTurn = (room: ThrowRoom, sessionId: string): void => {
  setActiveTurn(room, sessionId, "fire");
};

const createRoom = (options: { bot?: boolean } = {}): ThrowRoom => {
  const room = new ThrowRoom();
  const hooks = room as unknown as RoomTestHooks;
  Object.defineProperty(room, "roomId", { value: "room-test", configurable: true });
  hooks.listing = {};
  hooks.setPatchRate = () => undefined;
  hooks.setSimulationInterval = () => undefined;
  const handlers = new Map<string, (client: Client, payload: unknown) => void>();
  registeredHandlers.set(room, handlers);
  hooks.onMessage = (type, callback) => { handlers.set(type, callback); };
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

  it("assigns extra players to balanced spawn slots in one shared arena", () => {
    const room = createRoom();
    room.onJoin(mockClient("host"), { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    joinGuest(room, mockClient("third"), "Third");
    joinGuest(room, mockClient("fourth"), "Fourth");

    expect(room.state.players.get("host")?.laneIndex).toBe(0);
    expect(room.state.players.get("guest")?.laneIndex).toBe(0);
    expect(room.state.players.get("third")?.laneIndex).toBe(0);
    expect(room.state.players.get("third")?.side).toBe("blue");
    expect(room.state.players.get("third")?.spawnIndex).toBe(1);
    expect(room.state.players.get("fourth")?.laneIndex).toBe(0);
    expect(room.state.players.get("fourth")?.side).toBe("red");
    expect(room.state.players.get("fourth")?.spawnIndex).toBe(1);
    expect(room.state.worldWidth).toBe(WORLD.width);
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

  it("opens an active round with the first player's move phase", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });
    room.state.countdownEndsAtMs = Date.now() - 1;
    handlers.update(1 / 60);

    expect(room.state.roundState).toBe("active");
    expect(room.state.currentTurnSessionId).toBe(host.sessionId);
    expect(room.state.turnPhase).toBe("move");
    expect(room.state.turnEndsAtMs).toBeGreaterThan(Date.now());
  });

  it("advances from move phase to fire phase on the authoritative timer", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveMoveTurn(room, host.sessionId);
    room.state.turnEndsAtMs = Date.now() - 1;

    handlers.update(1 / 60);

    expect(room.state.currentTurnSessionId).toBe(host.sessionId);
    expect(room.state.turnPhase).toBe("fire");
  });

  it("ignores movement and fire input from players who do not own the current turn phase", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);
    setActiveMoveTurn(room, host.sessionId);
    const guestStartX = room.state.players.get(guest.sessionId)?.x ?? 0;

    handlers.handleMoveInput(guest, { moveX: -1, jump: false });
    handlers.handleChargeStart(host, { ammoType: "javelin" });
    for (let i = 0; i < 8; i += 1) {
      handlers.update(1 / 60);
    }

    expect(room.state.players.get(guest.sessionId)?.x).toBe(guestStartX);
    expect(room.state.players.get(host.sessionId)?.charging).toBe(false);
    expect(room.state.projectiles.size).toBe(0);
  });

  it("starts a larger lobby when both teams are represented and all players are ready", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const third = mockClient("third");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);
    joinGuest(room, third, "Third");

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });
    handlers.handleSetReady(third, { ready: true });

    expect(room.state.roundState).toBe("countdown");
  });

  it("spawns a projectile from a charged release", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveFireTurn(room, host.sessionId);

    handlers.handleChargeStart(host, { ammoType: "javelin" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.42 });

    expect(room.state.players.get(host.sessionId)?.throwSeq).toBe(1);
    expect(room.state.projectiles.size).toBeGreaterThan(0);
    expect(room.state.turnPhase).toBe("resolving");
  });

  it("advances to the next player after a fired shot has resolved", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);
    setActiveFireTurn(room, host.sessionId);

    handlers.handleChargeStart(host, { ammoType: "javelin" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.42 });
    room.state.projectiles.clear();
    (authorityFor(room) as unknown as { projectileRuntimeById: Map<string, unknown> }).projectileRuntimeById.clear();
    handlers.update(1 / 60);

    expect(room.state.currentTurnSessionId).toBe(guest.sessionId);
    expect(room.state.turnPhase).toBe("move");
  });

  it.each([...AMMO_TYPES])("spawns requested %s ammo from a charged release", (ammoType) => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveFireTurn(room, host.sessionId);
    grantTestAmmo(room, host.sessionId, ammoType, 2);

    handlers.handleSelectAmmo(host, { ammoType });
    handlers.handleChargeStart(host, { ammoType });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.42 });

    const projectile = Array.from(room.state.projectiles.values())[0];
    expect(room.state.players.get(host.sessionId)?.selectedAmmo).toBe(ammoType);
    expect(projectile?.ammoType).toBe(ammoType);
    expect(projectile?.radius).toBe(AMMO_DEFINITIONS[ammoType].radius);
    expect(Math.hypot(projectile?.vx ?? 0, projectile?.vy ?? 0)).toBeGreaterThan(0);
  });

  it("keeps special weapons locked until ammo is picked up", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveFireTurn(room, host.sessionId);
    const player = room.state.players.get(host.sessionId);
    if (!player) throw new Error("Expected host player");

    expect(player.discusAmmo).toBe(0);
    handlers.handleSelectAmmo(host, { ammoType: "discus" });
    expect(player.selectedAmmo).toBe("javelin");

    handlers.handleChargeStart(host, { ammoType: "discus" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.42 });
    const projectile = Array.from(room.state.projectiles.values())[0];
    expect(projectile?.ammoType).toBe("javelin");

    grantTestAmmo(room, host.sessionId, "discus");
    handlers.handleSelectAmmo(host, { ammoType: "discus" });
    expect(player.selectedAmmo).toBe("discus");
  });

  it("splits splitter ammo into fragment projectiles", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveFireTurn(room, host.sessionId);

    handlers.handleChargeStart(host, { ammoType: "splitter" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.8 });

    let fragments = Array.from(room.state.projectiles.values())
      .filter((projectile) => (
        projectile.ammoType === "splitter"
        && projectile.radius === AMMO_DEFINITIONS.splitter.fragmentRadius
      ));
    for (let i = 0; i < 140; i += 1) {
      handlers.update(1 / 60);
      fragments = Array.from(room.state.projectiles.values())
        .filter((projectile) => (
          projectile.ammoType === "splitter"
          && projectile.radius === AMMO_DEFINITIONS.splitter.fragmentRadius
        ));
      if (fragments.length > 0) break;
    }

    expect(fragments.length).toBe(AMMO_DEFINITIONS.splitter.fragmentCount);
    expect(fragments.every((projectile) => projectile.vy < 0)).toBe(true);
    expect(fragments.some((projectile) => projectile.vx < 0)).toBe(true);
    expect(fragments.some((projectile) => projectile.vx > 0)).toBe(true);

    for (let i = 0; i < 120; i += 1) {
      handlers.update(1 / 60);
    }
    const laterFragmentCount = Array.from(room.state.projectiles.values())
      .filter((projectile) => projectile.ammoType === "splitter" && projectile.radius === AMMO_DEFINITIONS.splitter.fragmentRadius)
      .length;
    expect(laterFragmentCount).toBeLessThanOrEqual(AMMO_DEFINITIONS.splitter.fragmentCount);
  });

  it("splits cluster ammo into downward bomblets", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveFireTurn(room, host.sessionId);
    grantTestAmmo(room, host.sessionId, "cluster", 1);

    handlers.handleSelectAmmo(host, { ammoType: "cluster" });
    handlers.handleChargeStart(host, { ammoType: "cluster" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.95 });

    let fragments = Array.from(room.state.projectiles.values())
      .filter((projectile) => projectile.ammoType === "cluster" && projectile.radius === AMMO_DEFINITIONS.cluster.fragmentRadius);
    for (let i = 0; i < 120 && fragments.length === 0; i += 1) {
      handlers.update(1 / 60);
      fragments = Array.from(room.state.projectiles.values())
        .filter((projectile) => projectile.ammoType === "cluster" && projectile.radius === AMMO_DEFINITIONS.cluster.fragmentRadius);
    }

    expect(fragments.length).toBe(AMMO_DEFINITIONS.cluster.fragmentCount);
    expect(fragments.every((projectile) => projectile.vy > 0)).toBe(true);
    expect(fragments.some((projectile) => projectile.vx < 0)).toBe(true);
    expect(fragments.some((projectile) => projectile.vx > 0)).toBe(true);

    for (let i = 0; i < 120; i += 1) {
      handlers.update(1 / 60);
    }
    const laterFragmentCount = Array.from(room.state.projectiles.values())
      .filter((projectile) => projectile.ammoType === "cluster" && projectile.radius === AMMO_DEFINITIONS.cluster.fragmentRadius)
      .length;
    expect(laterFragmentCount).toBeLessThanOrEqual(AMMO_DEFINITIONS.cluster.fragmentCount);
  });

  it("aligns released projectile spawn and velocity with normalized mouse aim", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveFireTurn(room, host.sessionId);

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

  it("applies round wind to authoritative projectile motion", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveFireTurn(room, host.sessionId);
    room.state.windAccelerationX = WIND.maxAccelerationPxPerSecondSq;

    handlers.handleChargeStart(host, { ammoType: "javelin" });
    handlers.handleThrowRelease(host, { aimX: 1, aimY: -0.82 });

    const projectile = Array.from(room.state.projectiles.values())[0];
    if (!projectile) throw new Error("Expected projectile");
    const startVx = projectile.vx;

    handlers.update(1 / 60);

    expect(projectile.vx).toBeGreaterThan(startVx);
  });

  it("blast damage knocks nearby players into recoverable airborne motion", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);
    room.state.roundState = "active";
    const player = room.state.players.get(guest.sessionId);
    if (!player) throw new Error("Expected guest player");

    const startX = player.x;
    const startHp = player.hp;
    handlers.applyBlastDamage(
      { ammoType: "shotput" } as ProjectileState,
      { fragment: false, laneIndex: player.laneIndex },
      {
        x: player.x - 36,
        y: player.y - WORLD.tankHeight,
        colliderId: `player:${guest.sessionId}`,
        directHitSessionId: guest.sessionId,
        outOfBounds: false,
      },
    );

    expect(player.hp).toBeLessThan(startHp);
    expect(player.grounded).toBe(false);
    expect(player.vx).toBeGreaterThan(0);
    expect(player.vy).toBeLessThan(0);

    handlers.update(1 / 60);
    expect(player.x).toBeGreaterThan(startX);
  });

  it("moves a human tank from move input", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveMoveTurn(room, host.sessionId);
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
    setActiveMoveTurn(room, host.sessionId);
    const startY = room.state.players.get(host.sessionId)?.y ?? 0;

    handlers.handleMoveInput(host, { moveX: 0, jump: true });
    handlers.update(1 / 60);

    const player = room.state.players.get(host.sessionId);
    expect(player?.y).toBeLessThan(startY);
    expect(player?.grounded).toBe(false);
  });

  it("buffers jump input on the landing frame", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveMoveTurn(room, host.sessionId);
    const player = room.state.players.get(host.sessionId);
    if (!player) throw new Error("Expected host player");

    const groundedY = player.y;
    player.y = groundedY - 4;
    player.vy = 600;
    player.grounded = false;

    handlers.handleMoveInput(host, { moveX: 0, jump: true });
    handlers.update(1 / 60);

    expect(player.y).toBeCloseTo(groundedY, 1);
    expect(player.vy).toBe(MOVEMENT.jumpVelocityPxPerSecond);
    expect(player.grounded).toBe(false);
  });

  it("allows a one-tick jump after walking off a sharp ledge", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveMoveTurn(room, host.sessionId);
    setTestTerrainLane(room, {
      seed: 7,
      version: 999,
      width: WORLD.width,
      baseGroundY: WORLD.groundY,
      stepPx: 16,
      samples: [
        { x: 0, y: WORLD.groundY },
        { x: 180, y: WORLD.groundY },
        { x: 181, y: WORLD.groundY + 120 },
        { x: WORLD.width, y: WORLD.groundY + 120 },
      ],
      segments: [
        { id: "ledge-top", kind: "ground", x0: 0, x1: 180, y0: WORLD.groundY, y1: WORLD.groundY, walkable: true, projectileCollidable: true },
        { id: "ledge-drop", kind: "cliff", x0: 180, x1: 181, y0: WORLD.groundY, y1: WORLD.groundY + 120, walkable: false, projectileCollidable: true },
        { id: "ledge-bottom", kind: "ground", x0: 181, x1: WORLD.width, y0: WORLD.groundY + 120, y1: WORLD.groundY + 120, walkable: true, projectileCollidable: true },
      ],
      spawnShelves: {
        blue: { id: "spawn-blue", kind: "spawnShelf", x0: 0, x1: 180, y0: WORLD.groundY, y1: WORLD.groundY, walkable: true, projectileCollidable: true },
        red: { id: "spawn-red", kind: "spawnShelf", x0: WORLD.width - 180, x1: WORLD.width, y0: WORLD.groundY + 120, y1: WORLD.groundY + 120, walkable: true, projectileCollidable: true },
      },
    });
    const player = room.state.players.get(host.sessionId);
    if (!player) throw new Error("Expected host player");
    player.x = 178;
    player.y = WORLD.groundY - WORLD.tankHeight;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;

    handlers.handleMoveInput(host, { moveX: 1, jump: true });
    handlers.update(1 / 60);

    expect(player.x).toBeGreaterThan(180);
    expect(player.vy).toBeLessThan(MOVEMENT.jumpVelocityPxPerSecond + 20);
    expect(player.grounded).toBe(false);
  });

  it("recovers a human tank that falls below generated terrain", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    setActiveMoveTurn(room, host.sessionId);
    const player = room.state.players.get(host.sessionId);
    if (!player) throw new Error("Expected host player");

    player.y = WORLD.height + 160;
    player.vy = 900;
    player.grounded = false;

    handlers.update(1 / 60);

    expect(player.y).toBeLessThan(WORLD.height);
    expect(player.vy).toBe(0);
    expect(player.grounded).toBe(true);
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
    setActiveFireTurn(room, "bot:red");

    handlers.update(1 / 60);

    const botProjectiles = Array.from(room.state.projectiles.values())
      .filter((projectile) => projectile.ownerSessionId === "bot:red");
    expect(botProjectiles.length).toBeGreaterThan(0);
  });

  it("practice bot repositions while staying on the red side", () => {
    const room = createRoom({ bot: true });
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    setActiveMoveTurn(room, "bot:red");

    const bot = room.state.players.get("bot:red");
    if (!bot) throw new Error("Expected bot");
    const startX = bot.x;
    const redMinX = (WORLD.width / 2) + MOVEMENT.centerNoCrossPadding;
    const redMaxX = WORLD.width - MOVEMENT.sideBoundaryPadding;

    for (let tick = 0; tick < 45; tick += 1) {
      handlers.update(1 / 60);
    }

    expect(Math.abs(bot.x - startX)).toBeGreaterThan(20);
    expect(bot.x).toBeGreaterThanOrEqual(redMinX);
    expect(bot.x).toBeLessThanOrEqual(redMaxX);
    expect(bot.y).toBeLessThan(WORLD.height);
    expect(bot.vy).toBe(0);
    expect(bot.grounded).toBe(true);
  });

  it("paces practice bot weapons before introducing rare ammo", () => {
    const room = createRoom({ bot: true });
    const handlers = privateHandlers(room);
    const sequence: AmmoType[] = [];

    for (let index = 0; index < 12; index += 1) {
      sequence.push(handlers.resolvePracticeBotAmmoType());
      (authorityFor(room) as unknown as { botFireCount: number }).botFireCount += 1;
    }

    expect(sequence.slice(0, 6)).toEqual(["javelin", "shotput", "javelin", "splitter", "shotput", "javelin"]);
    expect(sequence.slice(0, 6)).not.toContain("anvil");
    expect(sequence.slice(0, 6)).not.toContain("cluster");
    expect(sequence.slice(6, 12)).toEqual(["discus", "javelin", "shotput", "splitter", "javelin", "mortar"]);
    expect(sequence.slice(0, 12)).not.toContain("anvil");
    expect(sequence.slice(0, 12)).not.toContain("cluster");
  });

  it("practice bot prefers simulated arcs over its baseline full-power lob", () => {
    const room = createRoom({ bot: true });
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    setActiveMoveTurn(room, host.sessionId);
    room.state.windAccelerationX = WIND.maxAccelerationPxPerSecondSq;

    const bot = room.state.players.get("bot:red");
    const target = room.state.players.get(host.sessionId);
    if (!bot || !target) throw new Error("Expected bot and target");

    const ammo = getAmmoDefinition("javelin");
    const shoulder = resolveShoulderPosition(bot.x, bot.y, "red");
    const targetHitboxCenterX = target.x;
    const distanceRatio = Math.max(0.25, Math.min(0.9, Math.abs(targetHitboxCenterX - shoulder.x) / WORLD.width));
    const baselineAngle = (34 + (distanceRatio * 18)) * (Math.PI / 180);
    const baselineAim = normalizeAimForSide({
      aimX: -Math.cos(baselineAngle),
      aimY: -Math.sin(baselineAngle),
    }, "red");
    const baselineScore = handlers.scorePracticeBotShot(bot, target, host.sessionId, ammo, baselineAim, CHARGE.maxMs);
    const plan = handlers.resolvePracticeBotShotPlan(bot, target, host.sessionId, ammo);

    expect(plan.score).toBeLessThanOrEqual(baselineScore);
    expect(plan.aim.x).toBeLessThan(0);
    expect(plan.aim.y).toBeLessThan(0);
    expect(plan.chargeMs).toBeGreaterThanOrEqual(CHARGE.minMs);
    expect(plan.chargeMs).toBeLessThanOrEqual(CHARGE.maxMs);
  });

  it("uses dash only during the player's move turn and applies cooldown", () => {
    const room = createRoom();
    const host = mockClient("host");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, mockClient("guest"));
    const player = room.state.players.get(host.sessionId);
    if (!player) throw new Error("Expected host player");
    const startX = player.x;

    handlers.handleUseAbility(host, { ability: "dash" });
    handlers.update(1 / 60);
    expect(player.x).toBe(startX);

    setActiveMoveTurn(room, host.sessionId);
    handlers.handleUseAbility(host, { ability: "dash" });
    handlers.update(1 / 60);
    const afterFirstDashTickX = player.x;

    expect(player.x).toBeGreaterThan(startX);
    expect(player.vx).toBeGreaterThan(MOVEMENT.moveSpeedPxPerSecond);
    expect(player.dashCooldownEndsAtMs).toBeGreaterThan(Date.now());
    expect(player.dashSeq).toBe(1);

    handlers.update(1 / 60);
    expect(player.x).toBeGreaterThan(afterFirstDashTickX);
    expect(player.vx).toBeGreaterThan(MOVEMENT.moveSpeedPxPerSecond);

    player.x = (WORLD.width / 2) - MOVEMENT.centerNoCrossPadding - 3;
    player.dashCooldownEndsAtMs = 0;
    handlers.handleMoveInput(host, { moveX: 1, jump: false });
    handlers.handleUseAbility(host, { ability: "dash" });
    for (let i = 0; i < 20; i += 1) {
      handlers.update(1 / 60);
    }
    expect(player.x).toBeLessThanOrEqual((WORLD.width / 2) - MOVEMENT.centerNoCrossPadding);
  });

  it("collects lane-local pickups and applies their effects once", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });
    setActiveMoveTurn(room, host.sessionId);
    const player = room.state.players.get(host.sessionId);
    const pickup = Array.from(room.state.pickups.values()).find((entry) => entry.type === "armor" && entry.laneIndex === 0);
    if (!player || !pickup) throw new Error("Expected player and pickup");

    player.x = pickup.x;
    player.y = pickup.y + (WORLD.tankHeight / 2);
    handlers.update(1 / 60);

    expect(player.shieldHp).toBeGreaterThan(0);
    expect(player.pickupSeq).toBe(1);
    expect(pickup.active).toBe(false);
    handlers.update(1 / 60);
    expect(player.pickupSeq).toBe(1);
  });

  it("collects pickups when the pickup ring touches the tank edge", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });
    room.state.roundState = "active";
    const player = room.state.players.get(host.sessionId);
    const pickup = Array.from(room.state.pickups.values()).find((entry) => entry.type === "armor" && entry.laneIndex === 0);
    if (!player || !pickup) throw new Error("Expected player and pickup");

    player.x = pickup.x - (WORLD.tankWidth / 2) - PICKUPS.collectionRadius - pickup.radius + 4;
    player.y = pickup.y + WORLD.tankHitboxHeight - 2;
    handlers.collectPickups(player);

    expect(player.pickupSeq).toBe(1);
    expect(pickup.active).toBe(false);
    expect(player.lastPickupLabel).toBe(`Armor +${ARMOR.pickupAmount}`);
  });

  it("unlocks limited ammo from ammo cache pickups", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });
    room.state.roundState = "active";
    const player = room.state.players.get(host.sessionId);
    const pickup = Array.from(room.state.pickups.values()).find((entry) => entry.type === "ammoCache" && entry.laneIndex === 0);
    if (!player || !pickup) throw new Error("Expected player and ammo cache");

    expect(player.discusAmmo).toBe(0);
    player.x = pickup.x;
    player.y = pickup.y + (WORLD.tankHeight / 2);
    handlers.collectPickups(player);

    expect(player.discusAmmo).toBe(1);
    expect(player.lastPickupLabel).toBe("Discus +1");
    handlers.handleSelectAmmo(host, { ammoType: "discus" });
    expect(player.selectedAmmo).toBe("discus");
  });

  it("places tactical pickups on reachable platforms", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });

    const platformPickups = Array.from(room.state.pickups.values())
      .filter((pickup) => pickup.laneIndex === 0 && pickup.y < WORLD.groundY - 80);
    expect(platformPickups.length).toBeGreaterThanOrEqual(3);
    expect(platformPickups.some((pickup) => pickup.type === "dashCharge")).toBe(true);
    expect(platformPickups.filter((pickup) => pickup.type === "ammoCache").length).toBeGreaterThanOrEqual(2);
  });

  it("spawns lane-local interactive world props when a round starts", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);

    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });

    const props = Array.from(room.state.worldProps.values());
    expect(props.length).toBeGreaterThanOrEqual(8);
    expect(props.some((prop) => prop.type === "oilBarrel")).toBe(true);
    expect(props.some((prop) => prop.type === "supplyCrate")).toBe(true);
    expect(props.every((prop) => prop.laneIndex === 0 && prop.active)).toBe(true);
  });

  it("lets oil barrels explode and damage nearby players", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);
    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });
    room.state.roundState = "active";

    const barrel = Array.from(room.state.worldProps.values()).find((prop) => prop.type === "oilBarrel");
    const player = room.state.players.get(host.sessionId);
    if (!barrel || !player) throw new Error("Expected barrel and player");
    player.x = barrel.x + (barrel.width / 2);
    player.y = barrel.y + barrel.height;
    const startHp = player.hp;

    handlers.damageWorldProp(barrel, 999, {
      x: barrel.x + (barrel.width / 2),
      y: barrel.y + (barrel.height / 2),
      laneIndex: barrel.laneIndex,
      laneOffsetX: 0,
    });

    expect(barrel.active).toBe(false);
    expect(barrel.triggeredSeq).toBe(1);
    expect(player.hp).toBeLessThan(startHp);
    expect(player.grounded).toBe(false);
    expect(Math.hypot(player.vx, player.vy)).toBeGreaterThan(0);
  });

  it("breaks supply crates into ammo pickups", () => {
    const room = createRoom();
    const host = mockClient("host");
    const guest = mockClient("guest");
    const handlers = privateHandlers(room);
    room.onJoin(host, { playerName: "Host" });
    joinGuest(room, guest);
    handlers.handleSetReady(host, { ready: true });
    handlers.handleSetReady(guest, { ready: true });

    const crate = Array.from(room.state.worldProps.values()).find((prop) => prop.type === "supplyCrate");
    if (!crate) throw new Error("Expected supply crate");
    const pickupCount = room.state.pickups.size;

    handlers.damageWorldProp(crate, 999, {
      x: crate.x + (crate.width / 2),
      y: crate.y + (crate.height / 2),
      laneIndex: crate.laneIndex,
      laneOffsetX: 0,
    });

    expect(crate.active).toBe(false);
    expect(room.state.pickups.size).toBe(pickupCount + 1);
    expect(Array.from(room.state.pickups.values()).some((pickup) => pickup.type === "ammoCache" && pickup.x >= crate.x && pickup.x <= crate.x + crate.width)).toBe(true);
  });
});
