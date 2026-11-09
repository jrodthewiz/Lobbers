import { describe, expect, it, vi } from "vitest";
import {
  drawDemolitionPiece, drawDemolitionTargetBadge, resolveDemolitionTargetBadge,
  TARGET_BADGE_GAP, TARGET_BADGE_RADIUS, TARGET_BADGE_STROKE_WIDTH, type DemolitionPieceAppearance,
} from "../../client/src/game/demolitionRender";

const piece = (overrides: Partial<DemolitionPieceAppearance> = {}): DemolitionPieceAppearance => ({
  body: { position: { x: 720, y: 400 }, angle: 0 }, w: 140, h: 62,
  color: "#e9b59a", kind: "brick", target: true, hit: false, label: "BAKERY", ...overrides,
});

// Canvas-call/geometry verification only; this does not rasterize or validate appearance.
const canvas = (dpr = 1) => {
  const ctx = {} as CanvasRenderingContext2D;
  let transform = [dpr, 0, 0, dpr, 0, 0];
  const snapshot = () => ({
    fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth,
    font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline,
    globalAlpha: ctx.globalAlpha, transform: [...transform],
  });
  const stack: ReturnType<typeof snapshot>[] = [];
  const arcs: { x: number; y: number; radius: number; physicalRadius: number }[] = [];
  const texts: { text: string; font: string; fill: typeof ctx.fillStyle; baseline: string }[] = [];
  const rectangles: { x: number; y: number; w: number; h: number; fill: typeof ctx.fillStyle }[] = [];
  Object.assign(ctx, {
    fillStyle: "#initial", strokeStyle: "#original", lineWidth: 7, font: "11px initial",
    textAlign: "left", textBaseline: "alphabetic", globalAlpha: .6,
    save: vi.fn(() => stack.push(snapshot())),
    restore: vi.fn(() => {
      const old = stack.pop(); if (!old) throw new Error("Canvas restore imbalance");
      const { transform: saved, ...styles } = old; Object.assign(ctx, styles); transform = saved;
    }),
    translate: vi.fn((x: number, y: number) => {
      transform[4]! += transform[0]! * x + transform[2]! * y;
      transform[5]! += transform[1]! * x + transform[3]! * y;
    }),
    rotate: vi.fn((angle: number) => {
      const [a, b, c, d, e, f] = transform as [number, number, number, number, number, number];
      const co = Math.cos(angle), si = Math.sin(angle);
      transform = [a * co + c * si, b * co + d * si, c * co - a * si, d * co - b * si, e, f];
    }),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fill: vi.fn(), stroke: vi.fn(), strokeRect: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => rectangles.push({ x, y, w, h, fill: ctx.fillStyle })),
    arc: vi.fn((x: number, y: number, radius: number) => arcs.push({ x, y, radius, physicalRadius: radius * Math.hypot(transform[0]!, transform[1]!) })),
    fillText: vi.fn((text: string) => texts.push({ text, font: ctx.font, fill: ctx.fillStyle, baseline: ctx.textBaseline })),
  });
  return { ctx, arcs, texts, rectangles, snapshot, stack };
};

describe("Doodle Demolition rendering geometry", () => {
  it("anchors badges above independently rotated rectangle corners including the ink outline", () => {
    for (const scale of [.4, .65, 1]) for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 3]) {
      for (const [w, h] of [[140, 62], [24, 200]]) {
        const p = piece({ w: w!, h: h!, body: { position: { x: 720, y: 400 }, angle } });
        const view = { scale, cameraX: 300, worldOriginY: -150 };
        const badge = resolveDemolitionTargetBadge(p, view)!;
        const top = Math.min(...[-1, 1].flatMap(x => [-1, 1].map(y => (
          (p.body.position.y + x * (p.w / 2 + 1.25) * Math.sin(angle) + y * (p.h / 2 + 1.25) * Math.cos(angle)) * scale + view.worldOriginY
        ))));
        expect(badge.x).toBeCloseTo((720 - 300) * scale);
        expect(badge.y + badge.radius + TARGET_BADGE_STROKE_WIDTH / 2 + TARGET_BADGE_GAP).toBeCloseTo(top);
      }
    }
  });

  it("keeps badge radius/font upright in CSS coordinates at solo/duel scales and DPR 1/2", () => {
    for (const scale of [.4, .65, 1]) for (const dpr of [1, 2]) {
      const c = canvas(dpr), before = c.snapshot();
      drawDemolitionTargetBadge(c.ctx, piece({ body: { position: { x: 720, y: 400 }, angle: 1.2 } }), { scale, cameraX: 300, worldOriginY: -150 });
      expect(c.arcs).toHaveLength(1);
      expect(c.arcs[0]).toMatchObject({ radius: TARGET_BADGE_RADIUS, physicalRadius: TARGET_BADGE_RADIUS * dpr });
      expect(c.texts[0]).toMatchObject({ text: "★", font: "bold 17px Arial", baseline: "middle" });
      expect(c.ctx.rotate).not.toHaveBeenCalled();
      expect(c.ctx.translate).not.toHaveBeenCalled();
      expect(c.snapshot()).toEqual(before);
      expect(c.stack).toHaveLength(0);
    }
  });

  it("uses only awarded hit/target state for star/checkmark and the established colors", () => {
    const c = canvas(), view = { scale: .4, cameraX: 0, worldOriginY: 0 };
    const p = piece(), before = structuredClone(p);
    drawDemolitionPiece(c.ctx, p);
    drawDemolitionTargetBadge(c.ctx, p, view);
    expect(c.rectangles[0]?.fill).toBe("#e9b59a");
    expect(c.texts.at(-1)).toMatchObject({ text: "★", fill: "#fff8e7" });
    const hit = piece({ hit: true });
    expect(resolveDemolitionTargetBadge(hit, view)).toMatchObject({ glyph: "✓", fill: "#fff8e7", glyphColor: "#263d38" });
    const firstHitRectangle = c.rectangles.length;
    drawDemolitionPiece(c.ctx, hit);
    expect(c.rectangles[firstHitRectangle]?.fill).toBe("#f0c34b");
    drawDemolitionTargetBadge(c.ctx, hit, view);
    expect(c.texts.at(-1)).toMatchObject({ text: "✓", fill: "#263d38" });
    expect(resolveDemolitionTargetBadge(piece({ target: false }), view)).toBeNull();
    const untouched = canvas();
    drawDemolitionTargetBadge(untouched.ctx, piece({ target: false }), view);
    expect(untouched.ctx.save).not.toHaveBeenCalled();
    expect(p).toEqual(before);
  });

  it("bounds material detail work and restores canvas state across paper, supports, planks and water", () => {
    const cases = [
      { appearance: piece(), lines: 0 },
      { appearance: piece({ w: 24, h: 68, color: "#d75c46", target: false, label: undefined }), lines: 4 },
      { appearance: piece({ w: 62, h: 16, kind: "plank", target: false, label: undefined }), lines: 3 },
      { appearance: piece({ w: 110, h: 90, kind: "tank", target: false, label: "WATER" }), lines: 1 },
    ];
    for (const { appearance, lines } of cases) {
      const c = canvas(2), before = c.snapshot(), original = structuredClone(appearance);
      drawDemolitionPiece(c.ctx, appearance);
      expect(c.ctx.lineTo).toHaveBeenCalledTimes(lines);
      expect(c.ctx.fillRect).toHaveBeenCalledTimes(appearance.kind === "tank" ? 6 : appearance.w > 80 ? 6 : 3);
      expect(c.ctx.save).toHaveBeenCalledTimes(1);
      expect(c.ctx.restore).toHaveBeenCalledTimes(1);
      expect(c.snapshot()).toEqual(before);
      expect(c.stack).toHaveLength(0);
      expect(appearance).toEqual(original);
    }
  });

  it("restores canvas state if a drawing operation throws", () => {
    const c = canvas(), before = c.snapshot();
    vi.mocked(c.ctx.fillRect).mockImplementationOnce(() => { throw new Error("Draw interrupted"); });
    expect(() => drawDemolitionPiece(c.ctx, piece())).toThrow("Draw interrupted");
    expect(c.snapshot()).toEqual(before); expect(c.stack).toHaveLength(0);
    vi.mocked(c.ctx.fillText).mockImplementationOnce(() => { throw new Error("Text interrupted"); });
    expect(() => drawDemolitionTargetBadge(c.ctx, piece(), { scale: .65, cameraX: 0, worldOriginY: 0 })).toThrow("Text interrupted");
    expect(c.snapshot()).toEqual(before); expect(c.stack).toHaveLength(0);
  });
});
