import Phaser from "phaser";
import type { GameSnapshot } from "./viewModel";
import { WORLD } from "../../../shared/game/constants";

type Scrap = { x: number; y: number; vx: number; vy: number; born: number; color: number; rotation: number };
type Trace = { points: { x: number; y: number }[]; lastSeen: number; color: number; lane: number };

/** Presentation only: never changes the simulation clock or network state. */
export class BattleSpectacle {
  private readonly ink: Phaser.GameObjects.Graphics;
  private readonly scraps: Scrap[] = [];
  private readonly traces = new Map<string, Trace>();
  private readonly hp = new Map<string, number>();
  private ended = false;
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  constructor(private readonly scene: Phaser.Scene) {
    this.ink = scene.add.graphics().setDepth(30);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.ink.destroy());
  }
  observe(snapshot: GameSnapshot, localSessionId: string): void {
    const now = performance.now();
    const local = snapshot.players.find(p => p.sessionId === localSessionId);
    if (snapshot.roundState === "waiting" || snapshot.roundState === "countdown") {
      this.traces.clear(); this.scraps.length = 0; this.ended = false;
    }
    for (const p of snapshot.players) {
      const previous = this.hp.get(p.sessionId);
      if (previous !== undefined && previous > p.hp && p.laneIndex === local?.laneIndex) {
        this.burst(p.x, p.y - 65, Math.min(36, Math.round(previous - p.hp)), false);
      }
      this.hp.set(p.sessionId, p.hp);
    }
    for (const id of this.hp.keys()) if (!snapshot.players.some(p => p.sessionId === id)) this.hp.delete(id);
    for (const p of snapshot.projectiles) {
      const owner = snapshot.players.find(player => player.sessionId === p.ownerSessionId);
      if (!owner || owner.laneIndex !== local?.laneIndex) continue;
      let trace = this.traces.get(p.id);
      if (!trace) {
        trace = { points: [], lastSeen: now, color: owner.side === "blue" ? 0x237f87 : 0xd75c46, lane: owner.laneIndex };
        this.traces.set(p.id, trace);
      }
      const last = trace.points.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 20) {
        trace.points.push({ x: p.x, y: p.y });
        if (trace.points.length > 100) trace.points.shift();
      }
      trace.lastSeen = now;
    }
    if (snapshot.roundState === "ended" && !this.ended) {
      this.ended = true;
      const winner = snapshot.players.find(p => p.side === snapshot.winnerSide && p.laneIndex === local?.laneIndex);
      if (winner) this.burst(winner.x, winner.y - 200, 100, true);
    }
  }
  private burst(x: number, y: number, count: number, celebration: boolean): void {
    if (this.reduced.matches) return;
    const colors = celebration ? [0xf0c34b, 0xd75c46, 0x237f87, 0xfff8e7] : [0xf0c34b, 0xfff8e7, 0xd75c46];
    for (let i = 0; i < count && this.scraps.length < 180; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (celebration ? 180 : 70) + Math.random() * 320;
      this.scraps.push({ x, y, vx: Math.cos(angle) * speed, vy: -Math.abs(Math.sin(angle) * speed) - 120, born: performance.now(), color: colors[i % colors.length]!, rotation: Math.random() * Math.PI });
    }
  }
  update(): void {
    const g = this.ink; g.clear();
    const now = performance.now();
    for (const [id, trace] of this.traces) {
      const age = now - trace.lastSeen;
      if (age > 2200) { this.traces.delete(id); continue; }
      // A fading dotted record of the real flight helps the next adjustment.
      const alpha = Math.min(.42, (1 - age / 2200) * .42);
      for (let i = 0; i < trace.points.length; i += 2) {
        const point = trace.points[i]!;
        g.fillStyle(trace.color, alpha); g.fillCircle(point.x, point.y, 3);
      }
    }
    for (let i = this.scraps.length - 1; i >= 0; i--) {
      const scrap = this.scraps[i]!;
      const t = (now - scrap.born) / 1000;
      if (t > 2.4) { this.scraps.splice(i, 1); continue; }
      const x = scrap.x + scrap.vx * t;
      const y = scrap.y + scrap.vy * t + 260 * t * t;
      if (y > WORLD.height) continue;
      g.fillStyle(scrap.color, Math.min(1, (2.4 - t) * 2));
      if (i % 3 === 0) g.fillCircle(x, y, 4);
      else {
        const a = scrap.rotation + t * 7;
        const dx = Math.cos(a) * 7, dy = Math.sin(a) * 7;
        g.fillTriangle(x - dx, y - dy, x + dx, y + dy, x + Math.sin(a) * 5, y - Math.cos(a) * 5);
      }
    }
  }
}
