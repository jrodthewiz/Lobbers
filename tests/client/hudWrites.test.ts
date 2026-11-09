import { describe, expect, it, vi } from "vitest";
import { Hud } from "../../client/src/ui/Hud";

vi.mock("../../client/src/game/vehicleArt", () => ({}));

type HudSetters = {
  setText(id: string, value: string): void;
  setBar(id: string, percent: number): void;
};

// Count property assignments without claiming browser layout or frame-time measurements.
const node = (initialText = "", initialWidth = "") => {
  let text = initialText;
  let width = initialWidth;
  const writes = { text: 0, width: 0 };
  return {
    writes,
    get textContent() { return text; },
    set textContent(value: string) { writes.text++; text = value; },
    style: {
      get width() { return width; },
      set width(value: string) {
        writes.width++;
        // Invalid CSS percentages leave the prior value intact in a browser.
        if (Number.isFinite(Number(value.slice(0, -1)))) width = value;
      },
    },
  };
};

const setup = () => {
  const nodes = new Map<string, ReturnType<typeof node>>();
  const hud = Object.assign(Object.create(Hud.prototype), {
    root: { querySelector: (selector: string) => nodes.get(selector.slice(1)) ?? null },
  }) as HudSetters;
  return { hud, nodes };
};

describe("HUD value updates", () => {
  it("keeps repeated live-status text intact and writes changed text once", () => {
    const { hud, nodes } = setup();
    const status = node("Ready"); nodes.set("statusText", status);
    for (let i = 0; i < 20; i++) hud.setText("statusText", "Ready");
    expect(status.writes.text).toBe(0);
    hud.setText("statusText", "Connecting...");
    hud.setText("statusText", "Connecting...");
    expect(status.writes.text).toBe(1);
    expect(status.textContent).toBe("Connecting...");
    hud.setText("statusText", "");
    expect(status.textContent).toBe("");
  });

  it("retains bar clamping while skipping unchanged percentages", () => {
    const { hud, nodes } = setup();
    const bar = node("", "20%"); nodes.set("chargeFill", bar);
    hud.setBar("chargeFill", 20);
    expect(bar.writes.width).toBe(0);
    hud.setBar("chargeFill", -40);
    hud.setBar("chargeFill", -1);
    expect(bar.style.width).toBe("0%");
    expect(bar.writes.width).toBe(1);
    hud.setBar("chargeFill", 140);
    hud.setBar("chargeFill", Infinity);
    expect(bar.style.width).toBe("100%");
    expect(bar.writes.width).toBe(2);
    hud.setBar("chargeFill", 37.5);
    hud.setBar("chargeFill", 37.5);
    expect(bar.style.width).toBe("37.5%");
    expect(bar.writes.width).toBe(3);
  });

  it("reads replacement nodes and external changes instead of caching values", () => {
    const { hud, nodes } = setup();
    const first = node("Ready", "50%"); nodes.set("value", first);
    hud.setText("value", "Ready"); hud.setBar("value", 50);
    const replacement = node(); nodes.set("value", replacement);
    hud.setText("value", "Ready"); hud.setBar("value", 50);
    expect(replacement.textContent).toBe("Ready");
    expect(replacement.style.width).toBe("50%");
    replacement.textContent = "Other"; replacement.style.width = "10%";
    hud.setText("value", "Ready"); hud.setBar("value", 50);
    expect(replacement.textContent).toBe("Ready");
    expect(replacement.style.width).toBe("50%");
    expect(first.writes).toEqual({ text: 0, width: 0 });
  });

  it("tolerates missing nodes and preserves invalid-CSS handling", () => {
    const { hud, nodes } = setup();
    expect(() => { hud.setText("missing", "Ready"); hud.setBar("missing", 25); }).not.toThrow();
    const bar = node("", "40%"); nodes.set("bar", bar);
    hud.setBar("bar", NaN);
    expect(bar.style.width).toBe("40%");
    expect(bar.writes.width).toBe(1);
  });
});
