import { afterEach, describe, expect, it, vi } from "vitest";
import { DemolitionGame } from "../../client/src/game/DemolitionGame";
import { DemolitionDuel } from "../../client/src/game/DemolitionDuel";
import { HAMMER_ACCESSIBLE_LABEL, updateHammerCue } from "../../client/src/ui/hammerCue";

vi.mock("phaser", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return { default: { Physics: { Matter: { Matter: require("phaser/src/physics/matter-js/CustomMain.js") } } } };
});
vi.mock("../../client/src/audio/GameAudio", () => ({ GameAudio: class { play = vi.fn(); preload = vi.fn(); } }));
vi.mock("../../client/src/ui/Garage", () => ({ Garage: class {
  constructor(private root: { dataset: Record<string, string> }) {}
  show() { this.root.dataset.garageOpen = "true"; }
} }));
vi.mock("../../client/src/game/vehicleArt", async () => {
  const { createVehiclePreset } = await import("../../shared/game/vehicleDesign");
  return { currentVehicle: () => null, garageDefault: () => createVehiclePreset(), drawVehicleCanvas: vi.fn(), drawEffectCanvas: vi.fn() };
});

type Listener = (event: Record<string, unknown>) => void;
class Events {
  private listeners = new Map<string, Listener[]>();
  addEventListener(type: string, handler: Listener) {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], handler]);
  }
  emit(type: string, values: Record<string, unknown> = {}) {
    const event = { preventDefault: vi.fn(), target: { tagName: "BODY" }, ...values };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
class ElementAdapter extends Events {
  constructor(readonly tagName = "BUTTON") { super(); }
  textContent = ""; innerHTML = ""; className = ""; id = ""; value = "";
  hidden = false; disabled = false; width = 0; height = 0;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  classList = { add: vi.fn() };
  private styles = new Map<string, string>();
  style = { display: "", getPropertyValue: (name: string) => this.styles.get(name) ?? "",
    setProperty: vi.fn((name: string, value: string) => { this.styles.set(name, value); }) };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setPointerCapture = vi.fn();
  append = vi.fn(); replaceChildren = vi.fn(); getContext = () => ({});
  querySelector(_selector: string): ElementAdapter { return this; }
  querySelectorAll(_selector: string): ElementAdapter[] { return []; }
}
type GameProbe = { start(): void; step(dt: number): void; charge: number; charging: boolean; swing: number; time: number; completed: boolean };
const setup = (lane = false) => {
  const windowEvents = new Events(), documentEvents = new Events();
  const root = new ElementAdapter("DIV"), gameRoot = new ElementAdapter("DIV"), hammer = new ElementAdapter();
  const nodes = new Map<string, ElementAdapter>([['[data-hold="hammer"]', hammer]]);
  const holds = ["left", "right", "boost"].map(hold => { const button = new ElementAdapter(); button.dataset.hold = hold; return button; });
  hammer.dataset.hold = "hammer"; holds.push(hammer);
  root.querySelector = (selector: string) => {
    if (!nodes.has(selector)) nodes.set(selector, new ElementAdapter());
    return nodes.get(selector)!;
  };
  root.querySelectorAll = (selector: string) => selector === "[data-hold]" ? holds : holds.filter(button => "held" in button.dataset);
  const parentAdapter = { postMessage: vi.fn() };
  const documentAdapter = { hidden: false, addEventListener: documentEvents.addEventListener.bind(documentEvents),
    querySelector: (selector: string) => selector === "#hud-root" ? root : gameRoot,
    createElement: (tag: string) => new ElementAdapter(tag.toUpperCase()) };
  const saved = new Map<string, string>([["unrelated-save", "keep"]]);
  vi.stubGlobal("location", { search: lane ? "?lane=2" : "", origin: "http://review.invalid" });
  vi.stubGlobal("window", { addEventListener: windowEvents.addEventListener.bind(windowEvents) });
  vi.stubGlobal("document", documentAdapter); vi.stubGlobal("parent", parentAdapter);
  vi.stubGlobal("innerWidth", 1440); vi.stubGlobal("innerHeight", 900); vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("requestAnimationFrame", vi.fn()); // No rendering/browser input is claimed.
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  const game = new DemolitionGame() as unknown as GameProbe; game.start();
  const message = (data: unknown) => windowEvents.emit("message", { origin: "http://review.invalid", source: parentAdapter, data });
  if (lane) message({ type: "demo-start", round: 1 });
  return { game, hammer, root, nodes, windowEvents, documentEvents, documentAdapter, message, saved };
};
const ticks = (game: GameProbe, count = 36) => { for (let i = 0; i < count; i++) game.step(1 / 60); };
const idle = (button: ElementAdapter) => {
  expect(button.textContent).toBe("Hold → HAMMER");
  expect(button.dataset.charging).toBe("false");
  expect(button.style.getPropertyValue("--hammer-charge")).toBe("0%");
  expect(button.getAttribute("aria-label")).toBe(HAMMER_ACCESSIBLE_LABEL);
  expect(button.getAttribute("aria-live")).toBeNull();
};
const charged = (game: GameProbe, button: ElementAdapter) => {
  const percent = Math.round(game.charge * 100);
  expect(game.charging).toBe(true); expect(percent).toBeGreaterThan(0);
  expect(button.textContent).toBe(`Release ${percent}%`);
  expect(button.style.getPropertyValue("--hammer-charge")).toBe(`${percent}%`);
  expect(button.getAttribute("aria-label")).toBe(HAMMER_ACCESSIBLE_LABEL);
};
afterEach(() => vi.unstubAllGlobals());

describe("existing Hammer button charge cue", () => {
  it("bounds/rounds the actual charge and avoids repeated writes or accessible-name changes", () => {
    const button = new ElementAdapter() as unknown as HTMLButtonElement;
    for (const [charge, percent] of [[-.1, 0], [0, 0], [.64, 64], [.645, 65], [1, 100], [2, 100], [NaN, 0]]) {
      updateHammerCue(button, true, charge!);
      expect(button.textContent).toBe(`Release ${percent}%`);
      expect(button.textContent!.length).toBeLessThanOrEqual("Hold → HAMMER".length);
      expect(button.style.getPropertyValue("--hammer-charge")).toBe(`${percent}%`);
    }
    const writes = vi.mocked(button.style.setProperty).mock.calls.length;
    updateHammerCue(button, true, NaN); expect(button.style.setProperty).toHaveBeenCalledTimes(writes);
    updateHammerCue(button, false, .9); idle(button as unknown as ElementAdapter);
    expect(() => updateHammerCue(null, true, .5)).not.toThrow();
  });

  it("updates immediately for J down, real Matter charging, and J release without waiting for a frame", () => {
    const { game, hammer, windowEvents, saved } = setup(); idle(hammer);
    windowEvents.emit("keydown", { key: "j", code: "KeyJ", repeat: false });
    expect(hammer.textContent).toBe("Release 0%"); ticks(game); charged(game, hammer);
    windowEvents.emit("keyup", { key: "j" });
    expect(game.charge).toBe(0); expect(game.swing).toBe(1); idle(hammer);
    expect(saved.get("unrelated-save")).toBe("keep");
  });

  it("shares touch-held state and preserves existing pointercancel/lost-capture release semantics", () => {
    const { game, hammer } = setup();
    hammer.emit("pointerdown", { pointerId: 7 });
    expect(hammer.setPointerCapture).toHaveBeenCalledWith(7);
    expect(hammer.textContent).toBe("Release 0%"); ticks(game); charged(game, hammer);
    hammer.emit("pointercancel");
    expect(game.charge).toBe(0); expect(game.swing).toBe(1); idle(hammer);
    hammer.emit("lostpointercapture"); idle(hammer);
    expect(hammer.dataset.held).toBe("false");
  });

  it.each(["blur", "hidden", "garage", "retry", "completion"])("clears immediately on %s", reason => {
    const { game, hammer, windowEvents, documentEvents, documentAdapter, nodes } = setup();
    windowEvents.emit("keydown", { key: "j", repeat: false }); ticks(game); charged(game, hammer);
    if (reason === "blur") windowEvents.emit("blur");
    else if (reason === "hidden") { documentAdapter.hidden = true; documentEvents.emit("visibilitychange"); }
    else if (reason === "garage") nodes.get("#openGarageButton")!.emit("click");
    else if (reason === "retry") nodes.get("#demoRetry")!.emit("click");
    else { game.time = 0; game.step(1 / 60); expect(game.completed).toBe(true); }
    expect(game.charging).toBe(false); expect(game.charge).toBe(0); idle(hammer);
  });

  it("shares Coral Enter forwarding through the production duel route and clears on duel stop", () => {
    const { game, hammer, message } = setup(true);
    const duel = Object.assign(Object.create(DemolitionDuel.prototype), {
      running: true, frames: [{ contentWindow: { postMessage: vi.fn() } }, { contentWindow: { postMessage: message } }],
    }) as { routeKey(key: string, down: boolean): boolean };
    expect(duel.routeKey("Enter", true)).toBe(true);
    expect(hammer.textContent).toBe("Release 0%"); ticks(game); charged(game, hammer);
    duel.routeKey("Enter", false); expect(game.swing).toBe(1); idle(hammer);
    duel.routeKey("Enter", true); ticks(game, 10); charged(game, hammer);
    message({ type: "demo-stop" });
    expect(game.charging).toBe(false); expect(game.charge).toBe(0); idle(hammer);
  });
});
