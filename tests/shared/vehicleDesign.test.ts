import { describe, expect, it } from "vitest";
import { createVehiclePreset, parseVehicleDesign, transformVector } from "../../shared/game/vehicleDesign";
import { CLIENT_MESSAGES } from "../../shared/game/messages";
import { validInput, validState } from "../../shared/game/peerProtocol";
import { ThrowAuthority } from "../../shared/game/ThrowAuthority";
import { LobbersState } from "../../shared/game/LobbersState";
import { createBurstFrames, morphStrokes, resamplePath } from "../../shared/game/vectorMorph";

describe("vector contraptions", () => {
  it("accepts authored charged poses and bounded beginning/end bursts", () => {
    const design = createVehiclePreset(); design.chargedPose = createVehiclePreset("crawler").strokes;
    design.effect = createBurstFrames();
    expect(parseVehicleDesign(JSON.stringify(design))).toEqual(design);
    design.effect.end[0]!.points[0]!.y = 999;
    expect(parseVehicleDesign(JSON.stringify(design))).toBeNull();
  });
  it("resamples an open path by arc length and retains both endpoints", () => {
    const samples = resamplePath([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 10, y: 0 }], 3, false);
    expect(samples).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
    expect(resamplePath([{ x: 2, y: 3 }, { x: 2, y: 3 }], 2, false)).toEqual([{ x: 2, y: 3 }, { x: 2, y: 3 }]);
  });
  it("aligns closed shapes drawn from another corner in the opposite direction", () => {
    const stroke = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], color: "#237f87", width: 3, filled: true };
    const other = { ...stroke, points: [{ x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }] };
    const mid = morphStrokes([stroke], [other], .5)[0]!;
    expect(mid.points).toEqual(resamplePath(stroke.points, 16, true));
  });
  it("fades unmatched strokes rather than inventing disconnected geometry", () => {
    const frame = createBurstFrames();
    expect(morphStrokes(frame.start, [], .25)[0]!.alpha).toBe(.75);
    expect(morphStrokes([], frame.end, .25)[0]!.alpha).toBe(.25);
  });
  it("round trips all authored vehicle presets through the wire validator", () => {
    for (const id of ["buggy", "crawler", "saucer"] as const) {
      const design = createVehiclePreset(id);
      expect(parseVehicleDesign(JSON.stringify(design))).toEqual(design);
    }
  });
  it("rotates a local mechanical vector around its mount with scale", () => {
    const point = transformVector({ x: 10, y: 0 }, { x: 20, y: 30 }, Math.PI / 2, 2);
    expect(point.x).toBeCloseTo(20); expect(point.y).toBeCloseTo(50);
  });
  it("rejects malformed, oversized and nonfinite geometry", () => {
    expect(parseVehicleDesign("{" )).toBeNull();
    expect(parseVehicleDesign(" ".repeat(24_001))).toBeNull();
    for (const invalid of [999, null, "NaN", -999]) {
      const design = createVehiclePreset();
      (design.parts[0] as unknown as { x: unknown }).x = invalid;
      expect(parseVehicleDesign(JSON.stringify(design))).toBeNull();
    }
    const design = createVehiclePreset(); design.parts[0]!.size = -3;
    expect(parseVehicleDesign(JSON.stringify(design))).toBeNull();
    design.parts[0]!.size = 19; design.strokes[0]!.color = "url(javascript:bad)";
    expect(parseVehicleDesign(JSON.stringify(design))).toBeNull();
  });
  it("admits bounded vehicle controls and rejects extra input fields", () => {
    const design = JSON.stringify(createVehiclePreset());
    expect(validInput(CLIENT_MESSAGES.VEHICLE_DESIGN, { design })).toBe(true);
    expect(validInput(CLIENT_MESSAGES.VEHICLE_DESIGN, { design: "" })).toBe(true);
    expect(validInput(CLIENT_MESSAGES.VEHICLE_DESIGN, { design, hp: 999 })).toBe(false);
    expect(validInput(CLIENT_MESSAGES.VEHICLE_DESIGN, { design: "bad" })).toBe(false);
  });
  it("replicates a valid design without allowing mid-battle replacement", () => {
    const state = new LobbersState();
    const authority = new ThrowAuthority({ state, nowMs: () => 1000, listingChanged: () => {} });
    authority.configure({}, "ABCDEF");
    authority.join("host", { playerName: "Artist" });
    authority.join("guest", { playerName: "Rival", code: "ABCDEF" });
    const design = JSON.stringify(createVehiclePreset("saucer"));
    authority.input("host", CLIENT_MESSAGES.VEHICLE_DESIGN, { design });
    expect(state.players.get("host")!.vehicleDesign).toBe(design);
    expect(validState(state.toJSON())).toBe(true);
    state.roundState = "active";
    authority.input("host", CLIENT_MESSAGES.VEHICLE_DESIGN, { design: "" });
    expect(state.players.get("host")!.vehicleDesign).toBe(design);
    state.roundState = "waiting";
    authority.input("host", CLIENT_MESSAGES.VEHICLE_DESIGN, { design: "bad" });
    expect(state.players.get("host")!.vehicleDesign).toBe(design);
    authority.input("host", CLIENT_MESSAGES.VEHICLE_DESIGN, { design: "" });
    expect(state.players.get("host")!.vehicleDesign).toBe("");
  });
});
