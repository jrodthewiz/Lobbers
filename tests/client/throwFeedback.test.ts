import { describe, expect, it, vi } from "vitest";
import { LobbersApp } from "../../client/src/LobbersApp";
import type { GameSnapshot } from "../../client/src/game/viewModel";
import { CLIENT_MESSAGES } from "../../shared/game/messages";

// Exercise the app's input/snapshot boundary without loading a renderer or audio device.
vi.mock("phaser", () => ({ default: {} }));
vi.mock("../../client/src/game/GameScene", () => ({ GameScene: class {} }));
vi.mock("../../client/src/ui/Hud", () => ({ Hud: class {} }));
vi.mock("../../client/src/audio/GameAudio", () => ({ GameAudio: class {} }));
vi.mock("../../client/src/game/vehicleArt", () => ({ currentVehicle: () => null }));

type FeedbackApp = {
  snapshot: GameSnapshot;
  snapshotFromState(state: unknown): GameSnapshot;
  throwRelease(aim: { x: number; y: number }): void;
  playSnapshotAudio(snapshot: GameSnapshot): void;
  resetAudioTracking(): void;
};

const setup = () => {
  const audio = { play: vi.fn(), playLayered: vi.fn() };
  const send = vi.fn();
  const app = Object.assign(Object.create(LobbersApp.prototype), {
    audio, room: { sessionId: "local", send }, selectedAmmo: "javelin",
    lastProjectilesById: new Map(), lastThrowSeqBySessionId: new Map(),
    lastHpBySessionId: new Map(), lastPickupSeqBySessionId: new Map(),
    lastDashSeqBySessionId: new Map(),
  }) as FeedbackApp;
  const snapshot = (localSeq = 0, rivalSeq = 0, ammo = "javelin") => app.snapshotFromState({
    roundState: "active",
    players: {
      local: { side: "blue", hp: 100, throwSeq: localSeq, selectedAmmo: "javelin" },
      rival: { side: "red", hp: 100, throwSeq: rivalSeq, selectedAmmo: "javelin" },
    },
    projectiles: localSeq ? { shot: { ownerSessionId: "local", ammoType: ammo, alive: true } } : {},
  });
  app.snapshot = snapshot();
  app.playSnapshotAudio(app.snapshot);
  return { app, audio, send, snapshot };
};

describe("authoritative artillery throw feedback", () => {
  it("sends release input without claiming a shot before authority confirms it", () => {
    const { app, audio, send } = setup();
    app.throwRelease({ x: 1, y: -0.5 });
    expect(send).toHaveBeenCalledWith(CLIENT_MESSAGES.THROW_RELEASE, { aimX: 1, aimY: -0.5 });
    expect(audio.playLayered).not.toHaveBeenCalled();
    // A rejected/expired release leaves the authoritative sequence unchanged.
    app.playSnapshotAudio(app.snapshot);
    expect(audio.playLayered).not.toHaveBeenCalled();
  });

  it("confirms a local throw once, using the projectile ammo even after auto-selection", () => {
    const { app, audio, snapshot } = setup();
    const accepted = snapshot(1, 0, "shotput");
    app.playSnapshotAudio(accepted);
    expect(audio.playLayered).toHaveBeenCalledTimes(1);
    expect(audio.playLayered.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "throw-release", rateScale: 0.88 }),
      expect.objectContaining({ key: "ammo-shotput-select" }),
    ]));
    app.playSnapshotAudio(accepted);
    expect(audio.playLayered).toHaveBeenCalledTimes(1);
  });

  it("uses a neutral confirmation when a fast impact removes the projectile before the snapshot", () => {
    const { app, audio, snapshot } = setup();
    const accepted = snapshot(1, 0, "shotput");
    accepted.projectiles = [];
    app.playSnapshotAudio(accepted);
    expect(audio.playLayered).toHaveBeenCalledTimes(1);
    expect(audio.playLayered).toHaveBeenCalledWith([{ key: "throw-release" }]);
  });

  it("retains the quieter rival throw cue", () => {
    const { app, audio, snapshot } = setup();
    app.playSnapshotAudio(snapshot(0, 1));
    expect(audio.playLayered).toHaveBeenCalledTimes(1);
    expect(audio.playLayered.mock.calls[0]?.[0]).toContainEqual({ key: "throw-release", volumeScale: 0.78 });
  });

  it("does not replay old throws on initial attach or a fresh connection", () => {
    const { app, audio, snapshot } = setup();
    app.resetAudioTracking();
    app.playSnapshotAudio(snapshot(5, 7));
    expect(audio.playLayered).not.toHaveBeenCalled();
    app.resetAudioTracking();
    app.playSnapshotAudio(snapshot(1, 1));
    expect(audio.playLayered).not.toHaveBeenCalled();
  });
});
