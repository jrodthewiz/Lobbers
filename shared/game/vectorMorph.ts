import type { VectorPoint, VehicleStroke } from "./vehicleDesign";
export type MorphStroke = VehicleStroke & { alpha: number };
const cache = new WeakMap<VehicleStroke, WeakMap<VehicleStroke, { start: VectorPoint[]; end: VectorPoint[] }>>();

/** Arc-length sampling makes a 5-point doodle interpolate with a 70-point doodle. */
export function resamplePath(points: VectorPoint[], count: number, closed: boolean): VectorPoint[] {
  if (!points.length) return [];
  const path = closed ? [...points, points[0]!] : points;
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y));
  const total = lengths.at(-1)!;
  if (total < .001) return Array.from({ length: count }, () => ({ ...points[0]! }));
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const d = total * i / Math.max(1, closed ? count : count - 1);
    while (segment < path.length - 1 && lengths[segment]! < d) segment++;
    const a = path[segment - 1]!, b = path[segment]!;
    const t = (d - lengths[segment - 1]!) / Math.max(.001, lengths[segment]! - lengths[segment - 1]!);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}
function pair(a: VehicleStroke, b: VehicleStroke): { start: VectorPoint[]; end: VectorPoint[] } {
  let targets = cache.get(a); if (!targets) { targets = new WeakMap(); cache.set(a, targets); }
  const existing = targets.get(b); if (existing) return existing;
  const count = Math.min(64, Math.max(16, a.points.length, b.points.length));
  const start = resamplePath(a.points, count, a.filled), end = resamplePath(b.points, count, b.filled);
  let aligned = end;
  if (a.filled && b.filled) {
    let best = Infinity;
    // Closed silhouettes may begin at different corners or be drawn clockwise/counterclockwise.
    for (const direction of [1, -1]) for (let shift = 0; shift < count; shift++) {
      let cost = 0;
      for (let i = 0; i < count; i++) { const p = end[(shift + direction * i + count * 2) % count]!; cost += (start[i]!.x - p.x) ** 2 + (start[i]!.y - p.y) ** 2; }
      if (cost < best) { best = cost; aligned = start.map((_, i) => end[(shift + direction * i + count * 2) % count]!); }
    }
  }
  const value = { start, end: aligned }; targets.set(b, value); return value;
}
const channel = (color: string, offset: number) => Number.parseInt(color.slice(offset, offset + 2), 16);
function mixColor(a: string, b: string, t: number): string {
  return `#${[1, 3, 5].map(i => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
}
export function morphStrokes(start: VehicleStroke[], end: VehicleStroke[], progress: number): MorphStroke[] {
  const t = Math.max(0, Math.min(1, progress));
  return Array.from({ length: Math.max(start.length, end.length) }, (_, i) => {
    const a = start[i], b = end[i];
    if (!a) return { ...b!, alpha: t };
    if (!b) return { ...a, alpha: 1 - t };
    const paths = pair(a, b);
    return { points: paths.start.map((p, j) => ({ x: p.x + (paths.end[j]!.x - p.x) * t, y: p.y + (paths.end[j]!.y - p.y) * t })), color: mixColor(a.color, b.color, t), width: a.width + (b.width - a.width) * t, filled: t < .5 ? a.filled : b.filled, alpha: 1 };
  });
}
export function createBurstFrames(): { start: VehicleStroke[]; end: VehicleStroke[] } {
  const star = (radius: number): VectorPoint[] => Array.from({ length: 20 }, (_, i) => {
    const a = i / 20 * Math.PI * 2; const r = i % 2 ? radius * .48 : radius;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r - 20 };
  });
  return { start: [{ points: star(12), color: "#fff8e7", width: 2, filled: true }], end: [{ points: star(52), color: "#f0c34b", width: 3, filled: true }] };
}
