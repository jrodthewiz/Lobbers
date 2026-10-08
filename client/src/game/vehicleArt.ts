import { createVehiclePreset, parseVehicleDesign, transformVector, type VehicleDesign, type VectorPoint } from "../../../shared/game/vehicleDesign";
import { morphStrokes } from "../../../shared/game/vectorMorph";
export type VectorPrimitive = { points?: VectorPoint[]; center?: VectorPoint; radius?: number; color: string; fill: boolean; width: number; alpha?: number };
export type VehicleMotion = { angle: number; travel: number; thrust: number; charge: number; shield: boolean; time: number };
let saved: VehicleDesign | null = null;
try { saved = parseVehicleDesign(localStorage.getItem("lobbers-vehicle")); } catch { /* Optional persistence. */ }
export const currentVehicle = (): VehicleDesign | null => saved;
export function saveVehicle(design: VehicleDesign | null): void {
  saved = design;
  try { if (design) localStorage.setItem("lobbers-vehicle", JSON.stringify(design)); else localStorage.removeItem("lobbers-vehicle"); } catch { /* Keep in memory. */ }
  window.dispatchEvent(new Event("lobbers:vehicle"));
}
export function vehiclePrimitives(design: VehicleDesign, motion: VehicleMotion): VectorPrimitive[] {
  const body = design.chargedPose?.length ? morphStrokes(design.strokes, design.chargedPose, motion.charge) : design.strokes.map(s => ({ ...s, alpha: 1 }));
  const result: VectorPrimitive[] = body.map(s => ({ points: s.points, color: s.color, fill: s.filled, width: s.width, alpha: s.alpha }));
  for (const part of design.parts) {
    const { x, y, size } = part;
    const center = { x, y };
    if (part.kind === "wheel") {
      result.push({ center, radius: size, color: "#263d38", fill: true, width: 2 }, { center, radius: size * .7, color: "#fff8e7", fill: true, width: 2 });
      for (let spoke = 0; spoke < 4; spoke++) {
        const angle = motion.travel / size + spoke * Math.PI / 2;
        result.push({ points: [center, transformVector({ x: size * .63, y: 0 }, center, angle)], color: "#263d38", fill: false, width: 2 });
      }
      result.push({ center, radius: 4, color: "#f0c34b", fill: true, width: 1 });
    } else if (part.kind === "cannon") {
      const length = size * 3;
      const points = [{ x: -5, y: -size / 3 }, { x: length, y: -size / 3 }, { x: length, y: size / 3 }, { x: -5, y: size / 3 }].map(p => transformVector(p, center, motion.angle));
      result.push({ points, color: "#fff8e7", fill: true, width: 3 }, { center, radius: size * .55, color: "#f0c34b", fill: true, width: 2 });
      if (motion.charge > .01) result.push({ center: transformVector({ x: length + 4, y: 0 }, center, motion.angle), radius: 5 + motion.charge * 10, color: "#f0c34b", fill: false, width: 2 });
    } else if (part.kind === "thruster") {
      result.push({ points: [{ x: x - size / 2, y: y - size / 2 }, { x: x + size / 2, y: y - size / 3 }, { x: x + size / 2, y: y + size / 3 }, { x: x - size / 2, y: y + size / 2 }], color: "#263d38", fill: true, width: 2 });
      if (motion.thrust > .05) {
        const flame = 15 + motion.thrust * 45 + Math.sin(motion.time * .04) * 8;
        result.push({ points: [{ x: x - size / 2, y: y - size / 3 }, { x: x - flame, y: y - 4 }, { x: x - flame * .6, y: y + 3 }, { x: x - size / 2, y: y + size / 3 }], color: "#d75c46", fill: true, width: 1 });
        result.push({ points: [{ x: x - size / 2, y: y - size / 5 }, { x: x - flame * .6, y }, { x: x - size / 2, y: y + size / 5 }], color: "#f0c34b", fill: true, width: 1 });
      }
    } else {
      result.push({ center, radius: size * .65, color: "#91b4ae", fill: true, width: 2 }, { center, radius: size * .3, color: "#fff8e7", fill: true, width: 1 });
      if (motion.shield) result.push({ center: { x: 0, y: -8 }, radius: 106 + Math.sin(motion.time * .006) * 3, color: "#91b4ae", fill: false, width: 3 });
    }
  }
  return result;
}
export function drawVehicleCanvas(ctx: CanvasRenderingContext2D, design: VehicleDesign, motion: VehicleMotion): void {
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const p of vehiclePrimitives(design, motion)) {
    ctx.globalAlpha = p.alpha ?? 1;
    ctx.beginPath();
    if (p.center && p.radius) ctx.arc(p.center.x, p.center.y, p.radius, 0, Math.PI * 2);
    if (p.points?.length) {
      ctx.moveTo(p.points[0]!.x, p.points[0]!.y);
      for (const v of p.points.slice(1)) ctx.lineTo(v.x, v.y);
      if (p.fill) ctx.closePath();
    }
    if (p.fill) { ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = "#263d38"; }
    else ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
export function drawEffectCanvas(ctx: CanvasRenderingContext2D, design: VehicleDesign, progress: number): void {
  if (!design.effect) return;
  const eased = 1 - (1 - progress) ** 3;
  for (const stroke of morphStrokes(design.effect.start, design.effect.end, eased)) {
    ctx.globalAlpha = stroke.alpha * (1 - progress); ctx.beginPath();
    stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.lineJoin = "round"; ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
    if (stroke.filled) { ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#263d38"; }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
export const garageDefault = () => currentVehicle() ?? createVehiclePreset();
