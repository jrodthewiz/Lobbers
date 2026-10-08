export type VectorPoint = { x: number; y: number };
export type MechanicalKind = "wheel" | "cannon" | "thruster" | "shield";
export type VehicleStroke = { points: VectorPoint[]; color: string; width: number; filled: boolean };
export type MechanicalPart = { kind: MechanicalKind; x: number; y: number; size: number };
export type VehicleDesign = { version: 1; name: string; strokes: VehicleStroke[]; parts: MechanicalPart[]; chargedPose?: VehicleStroke[]; effect?: { start: VehicleStroke[]; end: VehicleStroke[] } };
export const VEHICLE_COLORS = ["#237f87", "#d75c46", "#f0c34b", "#91b4ae", "#263d38", "#fff8e7", "#b98ac6"] as const;
export const MAX_DESIGN_BYTES = 24_000;
const kinds: MechanicalKind[] = ["wheel", "cannon", "thruster", "shield"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const bounded = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
function parseStrokes(value: unknown, limit = 10): VehicleStroke[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const strokes: VehicleStroke[] = [];
  for (const stroke of value) {
    if (!record(stroke) || !Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 128 || !VEHICLE_COLORS.includes(stroke.color as typeof VEHICLE_COLORS[number]) || !bounded(stroke.width, 1, 12) || typeof stroke.filled !== "boolean") return null;
    const points: VectorPoint[] = [];
    for (const p of stroke.points) {
      if (!record(p) || !bounded(p.x, -110, 110) || !bounded(p.y, -85, 38)) return null;
      points.push({ x: p.x, y: p.y });
    }
    strokes.push({ points, color: stroke.color as string, width: stroke.width, filled: stroke.filled });
  }
  return strokes;
}

/** Shared wire boundary: geometry is bounded and never executes drawing commands from the network. */
export function parseVehicleDesign(raw: unknown): VehicleDesign | null {
  if (typeof raw !== "string" || raw.length > MAX_DESIGN_BYTES) return null;
  let value: unknown; try { value = JSON.parse(raw); } catch { return null; }
  if (!record(value) || value.version !== 1 || typeof value.name !== "string" || value.name.length > 24 || !Array.isArray(value.strokes) || !Array.isArray(value.parts) || value.strokes.length > 10 || value.parts.length > 12) return null;
  const strokes = parseStrokes(value.strokes);
  if (!strokes) return null;
  const parts: MechanicalPart[] = [];
  for (const part of value.parts) {
    if (!record(part) || !kinds.includes(part.kind as MechanicalKind) || !bounded(part.x, -95, 95) || !bounded(part.y, -65, 25) || !bounded(part.size, 8, 26)) return null;
    parts.push({ kind: part.kind as MechanicalKind, x: part.x, y: part.y, size: part.size });
  }
  if (!strokes.length) return null;
  const result: VehicleDesign = { version: 1, name: value.name.trim().slice(0, 24) || "My contraption", strokes, parts };
  if (value.chargedPose !== undefined) { const pose = parseStrokes(value.chargedPose); if (!pose) return null; result.chargedPose = pose; }
  if (value.effect !== undefined) {
    if (!record(value.effect)) return null;
    const start = parseStrokes(value.effect.start, 4), end = parseStrokes(value.effect.end, 4);
    if (!start || !end) return null;
    result.effect = { start, end };
  }
  return result;
}
export const cloneVehicle = (design: VehicleDesign): VehicleDesign => JSON.parse(JSON.stringify(design));
export const createVehiclePreset = (id: "buggy" | "crawler" | "saucer" = "buggy"): VehicleDesign => {
  const color = id === "saucer" ? "#b98ac6" : id === "crawler" ? "#d75c46" : "#237f87";
  const body = id === "saucer" ? [{ x: -90, y: -4 }, { x: -45, y: -30 }, { x: -25, y: -55 }, { x: 25, y: -55 }, { x: 45, y: -30 }, { x: 90, y: -4 }, { x: 50, y: 13 }, { x: -50, y: 13 }]
    : id === "crawler" ? [{ x: -88, y: 13 }, { x: -77, y: -22 }, { x: -43, y: -22 }, { x: -30, y: -44 }, { x: 36, y: -44 }, { x: 56, y: -22 }, { x: 85, y: -22 }, { x: 94, y: 13 }]
    : [{ x: -83, y: 10 }, { x: -73, y: -21 }, { x: -36, y: -21 }, { x: -20, y: -48 }, { x: 30, y: -48 }, { x: 48, y: -21 }, { x: 77, y: -21 }, { x: 86, y: 10 }];
  return { version: 1, name: id === "saucer" ? "Lawn invader" : id === "crawler" ? "Crater crawler" : "Bad idea buggy", strokes: [{ points: body, color, width: 3, filled: true }], parts: [
    { kind: "wheel", x: -55, y: 12, size: 19 }, { kind: "wheel", x: 55, y: 12, size: 19 },
    { kind: "cannon", x: 12, y: -36, size: 17 }, { kind: "thruster", x: -76, y: -8, size: 14 }, { kind: "shield", x: 0, y: -12, size: 12 },
  ] };
};
export function transformVector(p: VectorPoint, origin: VectorPoint, angle: number, scale = 1): VectorPoint {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: origin.x + (p.x * c - p.y * s) * scale, y: origin.y + (p.x * s + p.y * c) * scale };
}
