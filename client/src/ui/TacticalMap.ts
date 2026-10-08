import { WORLD } from "../../../shared/game/constants";
import { generateTerrainLane, type TerrainLane } from "../../../shared/game/terrain";
import type { GameSnapshot, PlayerView } from "../game/viewModel";
export class TacticalMap {
  private key = "";
  private terrain: TerrainLane | null = null;
  constructor(private readonly canvas: HTMLCanvasElement) {}
  render(snapshot: GameSnapshot, local: PlayerView | null): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx || !local) return;
    const key = `${snapshot.terrainMode}:${snapshot.terrainSeed}`;
    if (this.key !== key) {
      this.key = key;
      this.terrain = snapshot.terrainMode === "classic" ? generateTerrainLane("classic-flat", WORLD.width, WORLD.groundY, WORLD.width) : generateTerrainLane(snapshot.terrainSeed || "Lobbers");
    }
    const w = this.canvas.width, h = this.canvas.height;
    const sx = w / WORLD.width, sy = (h - 8) / WORLD.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#e5e9cc"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b7ab87"; ctx.beginPath(); ctx.moveTo(0, h);
    for (const p of this.terrain!.samples) ctx.lineTo(p.x * sx, p.y * sy);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    const offset = local.laneIndex * WORLD.width;
    for (const p of snapshot.pickups.filter(p => p.active && p.laneIndex === local.laneIndex)) {
      ctx.fillStyle = "#d29225"; ctx.fillRect((p.x - offset) * sx - 2, p.y * sy - 4, 4, 4);
    }
    for (const p of snapshot.players.filter(p => p.laneIndex === local.laneIndex && p.hp > 0)) {
      const x = (p.x - offset) * sx, y = p.y * sy - 4;
      ctx.fillStyle = p.side === "blue" ? "#237f87" : "#d75c46";
      ctx.fillRect(x - 5, y - 3, 10, 6);
      if (p.sessionId === snapshot.currentTurnSessionId) { ctx.strokeStyle = "#263d38"; ctx.lineWidth = 1.5; ctx.strokeRect(x - 8, y - 6, 16, 12); }
      if (p.sessionId === local.sessionId) { ctx.fillStyle = "#263d38"; ctx.beginPath(); ctx.moveTo(x - 3, y - 12); ctx.lineTo(x + 3, y - 12); ctx.lineTo(x, y - 8); ctx.fill(); }
    }
    ctx.fillStyle = "#263d38";
    for (const p of snapshot.projectiles) {
      if (p.x < offset || p.x > offset + WORLD.width) continue;
      ctx.beginPath(); ctx.arc((p.x - offset) * sx, p.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}
