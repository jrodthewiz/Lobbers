import Phaser from "phaser";
import { parseVehicleDesign, type VehicleDesign } from "../../../shared/game/vehicleDesign";
import { SIDE_SIGN } from "../../../shared/game/constants";
import { currentVehicle, vehiclePrimitives } from "./vehicleArt";
import type { PlayerView } from "./viewModel";
import type { GameSnapshot, ProjectileView } from "./viewModel";
import { morphStrokes } from "../../../shared/game/vectorMorph";
export class VehicleRenderer {
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly cache = new Map<string, { raw: string; design: VehicleDesign | null }>();
  private readonly previousProjectiles = new Map<string, { projectile: ProjectileView; design: VehicleDesign }>();
  private readonly bursts: { x: number; y: number; design: VehicleDesign; time: number }[] = [];
  draw(g: Phaser.GameObjects.Graphics, player: PlayerView, localId: string, aim: { x: number; y: number }, charge: number): boolean {
    const raw = player.vehicleDesign ?? "";
    let cached = this.cache.get(player.sessionId);
    if (!cached || cached.raw !== raw) { cached = { raw, design: parseVehicleDesign(raw) }; this.cache.set(player.sessionId, cached); }
    const design = cached.design ?? (player.sessionId === localId ? currentVehicle() : null);
    if (!design) return false;
    const now = performance.now(), sign = SIDE_SIGN[player.side], scale = .58;
    const origin = { x: player.x, y: player.y - 19 };
    const thrust = Math.min(1.5, Math.abs(player.vx) / 370);
    const alpha = player.connected ? player.hp > 0 ? 1 : .5 : .45;
    const point = (p: { x: number; y: number }) => ({ x: origin.x + p.x * scale * sign, y: origin.y + p.y * scale });
    g.fillStyle(0x263d38, .15); g.fillEllipse(player.x, player.y + 5, 120, 15);
    for (const primitive of vehiclePrimitives(design, { angle: Math.atan2(aim.y, aim.x * sign), travel: player.x * sign / scale, thrust, charge, shield: player.shieldHp > 0, time: now })) {
      const color = Number.parseInt(primitive.color.slice(1), 16);
      if (primitive.fill) g.fillStyle(color, alpha * (primitive.alpha ?? 1));
      g.lineStyle(Math.max(1, primitive.width * scale), primitive.fill ? 0x263d38 : color, alpha * (primitive.alpha ?? 1));
      if (primitive.center && primitive.radius) {
        const p = point(primitive.center);
        if (primitive.fill) g.fillCircle(p.x, p.y, primitive.radius * scale);
        g.strokeCircle(p.x, p.y, primitive.radius * scale);
      } else if (primitive.points?.length) {
        const points = primitive.points.map(point);
        g.beginPath(); g.moveTo(points[0]!.x, points[0]!.y);
        for (const p of points.slice(1)) g.lineTo(p.x, p.y);
        if (primitive.fill) { g.closePath(); g.fillPath(); }
        g.strokePath();
      }
    }
    if (thrust > .1 && !this.reduced.matches) {
      for (const jet of design.parts.filter(p => p.kind === "thruster")) {
        for (let i = 0; i < 7; i++) {
          const t = ((now * .0016 + i / 7) % 1);
          const p = point({ x: jet.x - 10 - t * (30 + thrust * 80), y: jet.y + Math.sin(i * 5 + t * 4) * t * 15 });
          g.fillStyle(i % 2 ? 0xf0c34b : 0xd75c46, (1 - t) * .65);
          g.fillRect(p.x, p.y, 2 + t * 3, 2 + t * 3);
        }
      }
    }
    return true;
  }
  retain(ids: Set<string>): void { for (const id of this.cache.keys()) if (!ids.has(id)) this.cache.delete(id); }
  observe(snapshot: GameSnapshot, localId: string): void {
    if (snapshot.roundState === "waiting" || snapshot.roundState === "countdown") { this.previousProjectiles.clear(); this.bursts.length = 0; return; }
    const next = new Set(snapshot.projectiles.map(p => p.id));
    for (const [id, previous] of this.previousProjectiles) {
      if (!next.has(id)) {
        this.bursts.push({ x: previous.projectile.x, y: previous.projectile.y, design: previous.design, time: performance.now() });
        if (this.bursts.length > 12) this.bursts.shift();
      }
    }
    this.previousProjectiles.clear();
    for (const projectile of snapshot.projectiles) {
      const owner = snapshot.players.find(p => p.sessionId === projectile.ownerSessionId);
      if (!owner) continue;
      const design = this.cache.get(owner.sessionId)?.design ?? (owner.sessionId === localId ? currentVehicle() : null);
      if (design?.effect) this.previousProjectiles.set(projectile.id, { projectile, design });
    }
  }
  drawEffects(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    const now = performance.now();
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!; const t = (now - burst.time) / 850;
      if (t >= 1) { this.bursts.splice(i, 1); continue; }
      const progress = this.reduced.matches ? 1 : 1 - (1 - t) ** 3;
      for (const stroke of morphStrokes(burst.design.effect!.start, burst.design.effect!.end, progress)) {
        const color = Number.parseInt(stroke.color.slice(1), 16); const alpha = stroke.alpha * (1 - t);
        g.fillStyle(color, alpha); g.lineStyle(stroke.width, stroke.filled ? 0x263d38 : color, alpha);
        g.beginPath();
        stroke.points.forEach((p, j) => j ? g.lineTo(burst.x + p.x, burst.y + p.y) : g.moveTo(burst.x + p.x, burst.y + p.y));
        if (stroke.filled) { g.closePath(); g.fillPath(); } g.strokePath();
      }
    }
  }
}
