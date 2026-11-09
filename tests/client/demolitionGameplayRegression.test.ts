import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemolitionGame } from "../../client/src/game/DemolitionGame";

vi.mock("phaser", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return { default: { Physics: { Matter: { Matter: require("phaser/src/physics/matter-js/CustomMain.js") } } } };
});
vi.mock("../../client/src/audio/GameAudio", () => ({ GameAudio: class { play = vi.fn(); } }));
vi.mock("../../client/src/ui/Garage", () => ({ Garage: class {} }));
vi.mock("../../client/src/game/vehicleArt", async () => {
  const { createVehiclePreset } = await import("../../shared/game/vehicleDesign");
  return { currentVehicle: () => null, garageDefault: () => createVehiclePreset(), drawVehicleCanvas: vi.fn(), drawEffectCanvas: vi.fn() };
});
const require = createRequire(import.meta.url);
const Matter = require("phaser/src/physics/matter-js/CustomMain.js");
type GameProbe = {
  root: { dataset: Record<string, string> };
  chassis: { position: { x: number; y: number } };
  pieces: { target: boolean; hit: boolean; body: unknown }[];
  charge: number; swing: number; water: unknown[]; score: number; time: number; completed: boolean;
  reset(): void; step(dt: number): void; input(key: string, down: boolean): void; spray(): void;
};
let saved: Map<string, string>;
beforeEach(() => {
  saved = new Map();
  vi.stubGlobal("location", { search: "", origin: "http://review.invalid" });
  vi.stubGlobal("document", { hidden: false });
  vi.stubGlobal("innerWidth", 1440); vi.stubGlobal("innerHeight", 900);
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
const setup = () => {
  const elements = new Map<string, { textContent: string; innerHTML: string; value: string; hidden: boolean; disabled: boolean }>();
  const game = new DemolitionGame() as unknown as GameProbe;
  game.root = { dataset: {}, querySelectorAll: () => [], querySelector: (id: string) => {
    if (!elements.has(id)) elements.set(id, { textContent: "", innerHTML: "", value: "", hidden: false, disabled: false });
    return elements.get(id);
  } } as GameProbe["root"];
  game.reset();
  return game;
};
const ticks = (game: GameProbe, count: number) => { for (let i = 0; i < count; i++) game.step(1 / 60); };

describe("demolition gameplay with real installed Matter physics (no browser)", () => {
  it("retains driving, charged hammer release, water and retry behavior", () => {
    const game = setup(); ticks(game, 45);
    const startX = game.chassis.position.x;
    game.input("right", true); ticks(game, 60); game.input("right", false);
    expect(game.chassis.position.x).toBeGreaterThan(startX + 20);
    game.input("hammer", true); ticks(game, 20);
    expect(game.charge).toBeGreaterThan(.2);
    game.input("hammer", false);
    expect(game.charge).toBe(0); expect(game.swing).toBe(1);
    game.spray(); expect(game.water.length).toBeGreaterThan(0);
    game.reset();
    expect(game.water).toHaveLength(0); expect(game.score).toBe(0);
    expect(game.charge).toBe(0); expect(game.completed).toBe(false);
  });

  it("awards each toppled target once and preserves legitimate completion/progress", () => {
    const game = setup();
    const target = game.pieces.find(piece => piece.target)!;
    Matter.Body.setAngle(target.body, .65); game.step(1 / 60);
    expect(target.hit).toBe(true); expect(game.score).toBe(1);
    ticks(game, 3); expect(game.score).toBe(1);
    for (const piece of game.pieces.filter(piece => piece.target && !piece.hit)) Matter.Body.setAngle(piece.body, .65);
    game.step(1 / 60);
    expect(game.completed).toBe(true); expect(game.score).toBe(3);
    const progress = JSON.parse(saved.get("lobbers-demolition-progress")!);
    expect(progress.unlocked).toBe(1); expect(progress.best[0]).toBeGreaterThan(0);
  });

  it("preserves the garage pause without consuming the challenge timer", () => {
    const game = setup(); game.root.dataset.garageOpen = "true";
    const remaining = game.time; ticks(game, 60);
    expect(game.time).toBe(remaining);
    delete game.root.dataset.garageOpen; game.step(1 / 60);
    expect(game.time).toBeLessThan(remaining);
    expect(saved.size).toBe(0);
  });
});
