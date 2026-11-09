import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LobbersApp } from "../../client/src/LobbersApp";
import { EMPTY_SNAPSHOT } from "../../client/src/game/viewModel";
import type { RoomConnection } from "../../client/src/network/RoomConnection";
import { ROOM_NAME } from "../../shared/game/constants";

const peer = vi.hoisted(() => ({ host: vi.fn(), join: vi.fn() }));
vi.mock("phaser", () => ({ default: {} }));
vi.mock("../../client/src/game/GameScene", () => ({ GameScene: class {} }));
vi.mock("../../client/src/ui/Hud", () => ({ Hud: class {} }));
vi.mock("../../client/src/audio/GameAudio", () => ({ GameAudio: class {} }));
vi.mock("../../client/src/game/vehicleArt", () => ({ currentVehicle: () => null }));
vi.mock("../../client/src/network/PeerHostRoom", () => ({ PeerHostRoom: peer }));

const DEADLINE_MS = 15_000;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const signal = () => Object.assign(vi.fn(), { remove: vi.fn() });
const sdkRoom = (sessionId: string) => ({
  sessionId, state: EMPTY_SNAPSHOT, send: vi.fn(),
  onStateChange: signal(), onLeave: signal(), onError: signal(),
  leave: vi.fn(async () => {}),
});
type SdkRoom = ReturnType<typeof sdkRoom>;
type LaunchApp = {
  room: RoomConnection | null;
  connecting: boolean;
  status: string;
  connectionController: AbortController | null;
  hostLobby(name: string): Promise<void>;
  practiceBot(name: string): Promise<void>;
  joinLobby(code: string, name: string): Promise<void>;
  hostPeer(origin: string, name: string): Promise<void>;
  joinPeer(origin: string, code: string, name: string): Promise<void>;
  refreshLobbies(): Promise<void>;
  leaveMatch(status?: string): void;
};
const setup = () => {
  const client = { create: vi.fn(), join: vi.fn() };
  const hud = { render: vi.fn() };
  const app = Object.assign(Object.create(LobbersApp.prototype), {
    client, hud, audio: { play: vi.fn(), playLayered: vi.fn() },
    scene: { setLocalSessionId: vi.fn(), setSnapshot: vi.fn(), getCameraViewState: () => ({ mode: "follow", zoom: 1 }) },
    room: null, connectionGeneration: 0, connectionController: null, roomSubscriptions: [],
    connecting: false, status: "Ready", snapshot: EMPTY_SNAPSHOT,
    selectedAmmo: "javelin", chargeStartedAtMs: null, lobbies: [], serverHttpUrl: "http://test.invalid",
    lastProjectilesById: new Map(), lastThrowSeqBySessionId: new Map(),
    lastHpBySessionId: new Map(), lastPickupSeqBySessionId: new Map(), lastDashSeqBySessionId: new Map(),
  }) as LaunchApp;
  return { app, client, hud };
};
const launch = (app: LaunchApp, kind: string) => kind === "host" ? app.hostLobby("Pilot")
  : kind === "practice" ? app.practiceBot("Pilot") : app.joinLobby(" ab23cd ", "Pilot");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", { querySelector: () => null });
  vi.stubGlobal("window", {});
  peer.host.mockReset(); peer.join.mockReset();
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("Colyseus launch recovery through production app paths", () => {
  it.each(["host", "practice", "join"])("applies the finite deadline to %s, then protects retry from late success", async kind => {
    const { app, client, hud } = setup();
    const first = deferred<SdkRoom>();
    const sdk = kind === "join" ? client.join : client.create;
    sdk.mockReturnValueOnce(first.promise);
    const pending = launch(app, kind);
    expect(app.connecting).toBe(true);
    expect(sdk).toHaveBeenCalledWith(ROOM_NAME, kind === "join"
      ? { code: "AB23CD", playerName: "Pilot" }
      : { hostName: "Pilot", playerName: "Pilot", ...(kind === "practice" ? { bot: true } : {}) });
    const expiredSignal = app.connectionController!.signal;
    const removeAbortListener = vi.spyOn(expiredSignal, "removeEventListener");
    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1);
    expect(app.connecting).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(app.connecting).toBe(false);
    expect(app.status).toMatch(/timed out.*try again/i);
    expect(hud.render.mock.lastCall?.[1]).toMatchObject({ connected: false, connecting: false, status: app.status });
    expect(expiredSignal.aborted).toBe(true);
    expect(removeAbortListener).toHaveBeenCalledWith("abort", expect.any(Function));
    await pending; // The app attempt settles even while the SDK promise is still pending.
    expect(vi.getTimerCount()).toBe(0);

    const fresh = sdkRoom("fresh"); sdk.mockResolvedValueOnce(fresh);
    await launch(app, kind);
    const retryStatus = app.status;
    expect(app.room?.sessionId).toBe("fresh");
    const late = sdkRoom("expired"); first.resolve(late);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(late.leave).toHaveBeenCalledTimes(1);
    expect(late.onStateChange).not.toHaveBeenCalled();
    expect(app.room?.sessionId).toBe("fresh");
    expect(app.status).toBe(retryStatus);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS * 2);
    expect(app.room?.sessionId).toBe("fresh");
    expect(fresh.leave).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    app.leaveMatch();
  });

  it.each(["success", "rejection"])("Cancel recovers immediately and ignores later SDK %s after retry", async outcome => {
    const { app, client, hud } = setup();
    const first = deferred<SdkRoom>(); client.create.mockReturnValueOnce(first.promise);
    const pending = app.hostLobby("Pilot");
    app.leaveMatch();
    expect(app.connecting).toBe(false);
    expect(app.status).toBe("Ready");
    expect(hud.render.mock.lastCall?.[1]).toMatchObject({ connected: false, connecting: false });
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    const fresh = sdkRoom("fresh"); client.create.mockResolvedValueOnce(fresh);
    await app.practiceBot("Pilot");
    const status = app.status;
    const late = sdkRoom("canceled");
    if (outcome === "success") first.resolve(late); else first.reject(new Error("Old request failed"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(late.leave).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
    expect(app.room?.sessionId).toBe("fresh");
    expect(app.status).toBe(status);
    expect(vi.getTimerCount()).toBe(0);
    app.leaveMatch();
  });

  it("clears the deadline/listener on regular success so it cannot close the attached room", async () => {
    const { app, client } = setup();
    const request = deferred<SdkRoom>(); client.create.mockReturnValueOnce(request.promise);
    const pending = app.hostLobby("Pilot");
    const removeAbortListener = vi.spyOn(app.connectionController!.signal, "removeEventListener");
    expect(vi.getTimerCount()).toBe(1);
    const room = sdkRoom("connected"); request.resolve(room); await pending;
    expect(removeAbortListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS * 2);
    expect(app.room?.sessionId).toBe("connected");
    expect(room.leave).not.toHaveBeenCalled();
    app.leaveMatch();
    expect(room.onStateChange.remove).toHaveBeenCalledTimes(1);
    expect(room.onLeave.remove).toHaveBeenCalledTimes(1);
    expect(room.onError.remove).toHaveBeenCalledTimes(1);
  });

  it.each(["rejection", "synchronous throw"])("handles SDK %s without a lingering deadline", async outcome => {
    const { app, client } = setup();
    client.create.mockImplementationOnce(() => {
      if (outcome === "synchronous throw") throw new Error("Lobby unavailable");
      return Promise.reject(new Error("Lobby unavailable"));
    });
    await app.hostLobby("Pilot");
    expect(app.connecting).toBe(false);
    expect(app.status).toBe("Lobby unavailable");
    expect(app.room).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the timeout message when an older lobby refresh and SDK rejection arrive", async () => {
    const { app, client } = setup();
    const request = deferred<SdkRoom>(); client.create.mockReturnValueOnce(request.promise);
    const pending = app.hostLobby("Pilot");
    const response = deferred<{ json: () => Promise<{ lobbies: [] }> }>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const browsing = app.refreshLobbies();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS); await pending;
    const status = app.status;
    response.resolve({ json: async () => ({ lobbies: [] }) }); await browsing;
    request.reject(new Error("Late SDK error"));
    await Promise.resolve(); await Promise.resolve();
    expect(app.status).toMatch(/timed out.*try again/i);
    expect(app.status).toBe(status);
    expect(app.room).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["host", "join"])("does not impose the Colyseus deadline on peer %s", async kind => {
    const { app } = setup();
    const request = deferred<RoomConnection>();
    const sdk = kind === "host" ? peer.host : peer.join;
    sdk.mockReturnValueOnce(request.promise);
    const pending = kind === "host" ? app.hostPeer("https://invite.invalid", "Pilot")
      : app.joinPeer("https://invite.invalid", "AB23CD", "Pilot");
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(app.connecting).toBe(true);
    expect(vi.getTimerCount()).toBe(0); // Peer owns its transport timers; this mock owns none.
    app.leaveMatch();
    const late: RoomConnection = {
      sessionId: "peer", detail: "Peer", state: EMPTY_SNAPSHOT, send: vi.fn(),
      onStateChange: () => () => {}, onLeave: () => () => {}, onError: () => () => {},
      leave: vi.fn(async () => {}),
    };
    request.resolve(late); await pending;
    expect(late.leave).toHaveBeenCalledTimes(1);
    expect(app.room).toBeNull();
    expect(app.status).toBe("Ready");
  });
});
