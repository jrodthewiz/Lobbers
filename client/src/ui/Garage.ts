import { cloneVehicle, createVehiclePreset, parseVehicleDesign, VEHICLE_COLORS, type MechanicalKind, type VehicleDesign, type VectorPoint } from "../../../shared/game/vehicleDesign";
import { drawEffectCanvas, drawVehicleCanvas, garageDefault, saveVehicle } from "../game/vehicleArt";
import { createBurstFrames } from "../../../shared/game/vectorMorph";
import type { VehicleStroke } from "../../../shared/game/vehicleDesign";

type Tool = "select" | "hull" | "ink" | "erase" | MechanicalKind;
type DrawingStage = "vehicle" | "pose" | "start" | "end";
const PART_INFO: Record<MechanicalKind, string> = {
  wheel: "Wheels rotate by travel ÷ radius. Place them along the bottom of your chassis.",
  cannon: "Your cannon follows the aim vector. Pick a weapon in battle, then hold and release to fire.",
  thruster: "Thrusters flame with motion. Shift or DASH gives your existing movement burst.",
  shield: "Shield coils glow when you collect armor. The shell fades as your shield takes hits.",
};
export class Garage {
  private readonly panel: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private design = cloneVehicle(garageDefault());
  private tool: Tool = "select";
  private stage: DrawingStage = "vehicle";
  private color = "#237f87";
  private selected = -1;
  private open = false;
  private drawing: VectorPoint[] | null = null;
  private dragOffset: VectorPoint | null = null;
  private readonly history: VehicleDesign[] = [];
  private frame = 0;
  private frameStart = 0;
  private testThrust = 0;
  private testShield = false;
  constructor(private readonly root: HTMLElement) {
    this.panel = document.createElement("section");
    this.panel.className = "drawing-garage"; this.panel.hidden = true;
    this.panel.setAttribute("role", "dialog"); this.panel.setAttribute("aria-modal", "true"); this.panel.setAttribute("aria-label", "Contraption garage");
    this.panel.innerHTML = `
      <header class="garage-header"><div><span>THE HIGHLY QUESTIONABLE ENGINEERING DEPARTMENT</span><h2>Draw trouble.</h2></div><button type="button" data-garage="close" aria-label="Close garage">×</button></header>
      <div class="garage-layout">
        <aside class="garage-toolbox"><label for="vehicleName">NAME YOUR CONTRAPTION</label><input id="vehicleName" maxlength="24"/><div class="garage-tools" role="toolbar" aria-label="Drawing tools">
          ${[["select", "↖", "Move parts"], ["hull", "⬡", "Draw hull"], ["ink", "✎", "Draw ink"], ["erase", "×", "Erase"], ["wheel", "◎", "Wheel"], ["cannon", "↗", "Cannon"], ["thruster", "»", "Thruster"], ["shield", "◈", "Shield coil"]].map(([id, icon, label]) => `<button type="button" data-tool="${id}" aria-pressed="${id === "select"}"><b aria-hidden="true">${icon}</b>${label}</button>`).join("")}
        </div><div class="garage-colors" role="group" aria-label="Ink colors">${VEHICLE_COLORS.map(color => `<button type="button" data-ink="${color}" aria-label="Ink ${color}" aria-pressed="${color === this.color}" style="--ink:${color}"></button>`).join("")}</div>
        <label for="partSize">PART SIZE <span id="partSizeValue">18</span></label><input id="partSize" type="range" min="8" max="26" value="18"/>
        <p id="garageTip" class="garage-tip">Draw a hull, bolt on parts, and take your ridiculous idea into battle.</p>
        <div class="garage-presets"><span>START SOMEWHERE WEIRD</span><button type="button" data-preset="buggy">Bad idea buggy</button><button type="button" data-preset="crawler">Crater crawler</button><button type="button" data-preset="saucer">Lawn invader</button></div></aside>
        <div class="garage-workbench"><div class="garage-canvas-label"><span>BLUEPRINT / FRONT →</span><span id="garagePartCount">5 PARTS</span></div><canvas id="vehicleDrawingCanvas" width="880" height="520" aria-label="Vehicle drawing canvas. Draw a hull or choose a mechanical part and tap to place. Touch and mouse supported."></canvas><div class="garage-bench-actions"><button type="button" data-garage="undo">↶ Undo</button><button type="button" data-garage="clear">Clear hull</button><span id="garageStatus" role="status">Your imagination. Our insurance problem.</span></div>
        <div class="garage-test"><div><strong>DOES IT LOOK LIKE A BAD IDEA?</strong><p>Live vector preview · wheels + aim + exhaust + shield</p></div><div><button type="button" data-garage="thrust">Test thruster »</button><button type="button" data-garage="shield" aria-pressed="false">Test shield ◈</button></div></div><canvas id="vehiclePreviewCanvas" width="700" height="180" aria-label="Animated vehicle preview"></canvas>
        </div>
      </div><footer class="garage-footer"><p>Mechanical parts use the existing weapons, dash and armor. Every ride keeps the same battle hitbox.</p><div><button type="button" data-garage="stock">Use stock tank</button><button type="button" class="garage-save" data-garage="save">SAVE &amp; USE THIS RIDICULOUS THING ↗</button></div></footer>`;
    root.append(this.panel);
    const frames = document.createElement("div"); frames.className = "garage-frame-tabs";
    frames.setAttribute("role", "group"); frames.setAttribute("aria-label", "Animation drawing frames");
    frames.innerHTML = `<span>DRAW THE BEFORE. DRAW THE AFTER. LET PHYSICS DO THE REST.</span><div><button type="button" data-stage="vehicle" aria-pressed="true">Ride / beginning</button><button type="button" data-stage="pose" aria-pressed="false">Charged / end</button><button type="button" data-stage="start" aria-pressed="false">Burst / beginning</button><button type="button" data-stage="end" aria-pressed="false">Burst / end</button></div><div class="garage-animation-actions"><button type="button" data-frame-copy>Copy beginning → end</button><button type="button" data-effect-test>Test drawn burst ✹</button><span id="garageFrameHint">Your wheels and aim animate procedurally.</span></div>`;
    this.panel.querySelector(".garage-workbench")!.prepend(frames);
    this.canvas = this.panel.querySelector<HTMLCanvasElement>("#vehicleDrawingCanvas")!;
    this.bind();
    window.addEventListener("keydown", event => {
      if (!this.open) return;
      if (event.key === "Tab") {
        const targets = Array.from(this.panel.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)"));
        const index = targets.indexOf(document.activeElement as HTMLElement);
        event.preventDefault(); targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus();
      }
      if (event.key === "Escape") { event.preventDefault(); this.close(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); this.undo(); }
      event.stopImmediatePropagation();
    }, { capture: true });
  }
  show(): void {
    this.design = cloneVehicle(garageDefault()); this.history.length = 0; this.selected = -1;
    this.setStage("vehicle");
    this.open = true; this.panel.hidden = false; this.root.dataset.garageOpen = "true";
    this.panel.querySelector<HTMLInputElement>("#vehicleName")!.value = this.design.name;
    this.panel.querySelector<HTMLButtonElement>("[data-garage='close']")!.focus();
    this.frameStart = performance.now(); this.animate();
  }
  private close(): void {
    this.open = false; this.panel.hidden = true; delete this.root.dataset.garageOpen;
    cancelAnimationFrame(this.frame); this.drawing = null; this.dragOffset = null;
    this.root.querySelector<HTMLButtonElement>("#openGarageButton")?.focus();
  }
  private stash(): void { this.history.push(cloneVehicle(this.design)); if (this.history.length > 30) this.history.shift(); }
  private undo(): void { const previous = this.history.pop(); if (previous) { this.design = previous; this.selected = -1; this.paint(); } }
  private point(event: PointerEvent): VectorPoint {
    const box = this.canvas.getBoundingClientRect();
    return { x: Math.round(Math.max(-110, Math.min(110, ((event.clientX - box.left) / box.width * 880 - 440) / 3.1)) * 10) / 10, y: Math.round(Math.max(-85, Math.min(38, ((event.clientY - box.top) / box.height * 520 - 325) / 3.1)) * 10) / 10 };
  }
  private bind(): void {
    this.panel.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach(button => button.addEventListener("click", () => this.setStage(button.dataset.stage as DrawingStage)));
    this.panel.querySelector("[data-frame-copy]")!.addEventListener("click", () => {
      this.stash();
      if (this.stage === "pose" || this.stage === "vehicle") { this.design.chargedPose = cloneVehicle(this.design).strokes; this.setStage("pose"); }
      else { this.design.effect ??= createBurstFrames(); this.design.effect.end = JSON.parse(JSON.stringify(this.design.effect.start)); this.setStage("end"); }
    });
    this.panel.querySelector("[data-effect-test]")!.addEventListener("click", () => { this.design.effect ??= createBurstFrames(); this.setStage("start"); });
    this.panel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(button => button.addEventListener("click", () => {
      this.tool = button.dataset.tool as Tool;
      this.panel.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      this.tip(this.tool in PART_INFO ? PART_INFO[this.tool as MechanicalKind] : this.tool === "select" ? "Grab a part and drag it. Adjust its size below. Wheels turn using vector travel." : this.tool === "hull" ? "Draw a closed silhouette. We fill and outline it when you lift your finger." : this.tool === "erase" ? "Tap a part or an ink stroke to remove it. Undo brings it back." : "Draw stripes, eyes, bolts, lightning, a questionable spoiler…");
    }));
    this.panel.querySelectorAll<HTMLButtonElement>("[data-ink]").forEach(button => button.addEventListener("click", () => {
      this.color = button.dataset.ink!;
      this.panel.querySelectorAll("[data-ink]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    }));
    this.panel.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(button => button.addEventListener("click", () => {
      this.stash(); this.design = createVehiclePreset(button.dataset.preset as "buggy" | "crawler" | "saucer"); this.selected = -1;
      this.setStage("vehicle");
      this.panel.querySelector<HTMLInputElement>("#vehicleName")!.value = this.design.name;
    }));
    this.panel.querySelector<HTMLInputElement>("#partSize")!.addEventListener("input", event => {
      const size = Number((event.target as HTMLInputElement).value);
      this.panel.querySelector("#partSizeValue")!.textContent = String(size);
      if (this.selected >= 0 && this.design.parts[this.selected]) this.design.parts[this.selected]!.size = size;
    });
    this.panel.querySelector<HTMLInputElement>("#partSize")!.addEventListener("pointerdown", () => this.stash());
    this.panel.querySelectorAll<HTMLButtonElement>("[data-garage]").forEach(button => button.addEventListener("click", () => {
      const action = button.dataset.garage;
      if (action === "close") this.close();
      if (action === "undo") this.undo();
      if (action === "clear") { this.stash(); this.setFrameStrokes([]); }
      if (action === "thrust") this.testThrust = performance.now() + 1800;
      if (action === "shield") { this.testShield = !this.testShield; button.setAttribute("aria-pressed", String(this.testShield)); }
      if (action === "stock") { saveVehicle(null); this.close(); }
      if (action === "save") {
        if (!this.design.strokes.length) { this.tip("Draw at least one hull or ink stroke before saving."); return; }
        this.design.name = this.panel.querySelector<HTMLInputElement>("#vehicleName")!.value.trim().slice(0, 24) || "My contraption";
        const valid = parseVehicleDesign(JSON.stringify(this.design));
        if (!valid) { this.tip("This blueprint is too complex. Erase a stroke or simplify it before saving."); return; }
        saveVehicle(valid); this.close();
      }
    }));
    this.canvas.addEventListener("pointerdown", event => {
      event.preventDefault(); this.canvas.setPointerCapture(event.pointerId);
      const p = this.point(event);
      const partIndex = this.stage === "start" || this.stage === "end" ? -1 : this.design.parts.map((part, i) => Math.hypot(part.x - p.x, part.y - p.y) < part.size + 10 ? i : -1).filter(i => i >= 0).at(-1) ?? -1;
      if (this.tool === "select") {
        this.selected = partIndex;
        if (partIndex >= 0) { this.stash(); const part = this.design.parts[partIndex]!; this.dragOffset = { x: p.x - part.x, y: p.y - part.y }; this.panel.querySelector<HTMLInputElement>("#partSize")!.value = String(part.size); }
      } else if (this.tool === "erase") {
        this.stash(); if (partIndex >= 0) this.design.parts.splice(partIndex, 1);
        else { const strokes = this.frameStrokes(); const stroke = strokes.map((s, i) => s.points.some(v => Math.hypot(v.x - p.x, v.y - p.y) < 14) ? i : -1).filter(i => i >= 0).at(-1) ?? -1; if (stroke >= 0) strokes.splice(stroke, 1); }
      } else if (this.tool === "hull" || this.tool === "ink") {
        if (this.frameStrokes().length >= (this.stage === "start" || this.stage === "end" ? 4 : 10)) { this.tip("This frame has enough strokes. Erase one or start again."); return; }
        this.stash(); this.drawing = [p];
      } else {
        if (this.design.parts.length >= 12) { this.tip("12 parts is plenty of bad engineering. Erase one to add another."); return; }
        this.stash(); this.design.parts.push({ kind: this.tool, x: Math.max(-95, Math.min(95, p.x)), y: Math.max(-65, Math.min(25, p.y)), size: Number(this.panel.querySelector<HTMLInputElement>("#partSize")!.value) });
        this.selected = this.design.parts.length - 1;
      }
    });
    this.canvas.addEventListener("pointermove", event => {
      if (!this.canvas.hasPointerCapture(event.pointerId)) return;
      const p = this.point(event);
      if (this.dragOffset && this.selected >= 0) {
        const part = this.design.parts[this.selected]!; part.x = Math.max(-95, Math.min(95, p.x - this.dragOffset.x)); part.y = Math.max(-65, Math.min(25, p.y - this.dragOffset.y));
      }
      if (this.drawing && this.drawing.length < 128) { const last = this.drawing.at(-1)!; if (Math.hypot(p.x - last.x, p.y - last.y) > 1.8) this.drawing.push(p); }
    });
    const finish = () => {
      if (this.drawing && this.drawing.length >= 2) this.frameStrokes().push({ points: this.drawing, color: this.color, width: this.tool === "hull" ? 3 : 4, filled: this.tool === "hull" });
      this.drawing = null; this.dragOffset = null;
    };
    this.canvas.addEventListener("pointerup", finish);
    this.canvas.addEventListener("pointercancel", () => { this.drawing = null; this.dragOffset = null; });
    this.canvas.addEventListener("lostpointercapture", finish);
  }
  private tip(text: string): void { this.panel.querySelector("#garageTip")!.textContent = text; }
  private frameStrokes(): VehicleStroke[] {
    if (this.stage === "vehicle") return this.design.strokes;
    if (this.stage === "pose") return this.design.chargedPose ??= cloneVehicle(this.design).strokes;
    this.design.effect ??= createBurstFrames(); return this.stage === "start" ? this.design.effect.start : this.design.effect.end;
  }
  private setFrameStrokes(strokes: VehicleStroke[]): void {
    if (this.stage === "vehicle") this.design.strokes = strokes;
    else if (this.stage === "pose") this.design.chargedPose = strokes;
    else { this.design.effect ??= createBurstFrames(); if (this.stage === "start") this.design.effect.start = strokes; else this.design.effect.end = strokes; }
  }
  private setStage(stage: DrawingStage): void {
    this.stage = stage; this.drawing = null; this.dragOffset = null; this.selected = -1;
    const effect = stage === "start" || stage === "end";
    this.frameStrokes();
    this.panel.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.stage === stage)));
    this.panel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(button => { button.disabled = effect && !["hull", "ink", "erase"].includes(button.dataset.tool!); });
    if (effect) { this.tool = "ink"; this.panel.querySelectorAll("[data-tool]").forEach(button => button.setAttribute("aria-pressed", String(button.getAttribute("data-tool") === "ink"))); }
    this.panel.querySelector("#garageFrameHint")!.textContent = effect ? "Draw small → draw big. Your burst plays when a shot lands." : stage === "pose" ? "Draw a second silhouette. It morphs as you charge a shot." : "Your wheels and aim animate procedurally.";
    this.panel.querySelector("[data-garage='clear']")!.textContent = effect ? "Clear effect frame" : "Clear hull frame";
  }
  private paint(): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 880, 520); ctx.fillStyle = "#e8ede2"; ctx.fillRect(0, 0, 880, 520);
    ctx.strokeStyle = "#263d3814"; ctx.lineWidth = 1;
    for (let x = 0; x < 880; x += 31) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 520); ctx.stroke(); }
    for (let y = 15; y < 520; y += 31) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(880, y); ctx.stroke(); }
    ctx.save(); ctx.translate(440, 325); ctx.scale(3.1, 3.1);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = "#263d383b"; ctx.strokeRect(-88, -64, 176, 95); ctx.setLineDash([]);
    drawVehicleCanvas(ctx, { version: 1, name: this.design.name, strokes: this.frameStrokes(), parts: this.stage === "start" || this.stage === "end" ? [] : this.design.parts }, { angle: -.35, travel: 0, thrust: 0, charge: 0, shield: false, time: 0 });
    if (this.drawing) { ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.beginPath(); this.drawing.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
    const part = this.design.parts[this.selected];
    if (part) { ctx.strokeStyle = "#d75c46"; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(part.x - part.size - 4, part.y - part.size - 4, part.size * 2 + 8, part.size * 2 + 8); }
    ctx.restore();
    this.panel.querySelector("#garagePartCount")!.textContent = `${this.design.parts.length} PARTS · ${this.frameStrokes().length} STROKES`;
  }
  private animate = (): void => {
    if (!this.open) return;
    this.paint();
    const preview = this.panel.querySelector<HTMLCanvasElement>("#vehiclePreviewCanvas")!;
    const ctx = preview.getContext("2d")!; const now = performance.now(); const elapsed = (now - this.frameStart) / 1000;
    ctx.clearRect(0, 0, 700, 180); ctx.fillStyle = "#fff8e7"; ctx.fillRect(0, 0, 700, 180);
    ctx.strokeStyle = "#263d3830"; ctx.beginPath(); ctx.moveTo(20, 148); ctx.lineTo(680, 148); ctx.stroke();
    ctx.save(); ctx.translate(350, 105); ctx.scale(1.4, 1.4);
    drawVehicleCanvas(ctx, this.design, { angle: -.4 + Math.sin(elapsed * .7) * .4, travel: elapsed * 50, thrust: now < this.testThrust ? 1 : .22, charge: this.stage === "pose" ? (Math.sin(elapsed * 2) + 1) / 2 : 0, shield: this.testShield, time: now });
    if (this.stage === "start" || this.stage === "end") { ctx.translate(110, -10); drawEffectCanvas(ctx, this.design, (elapsed % 1.4) / 1.4); } ctx.restore();
    this.frame = requestAnimationFrame(this.animate);
  };
}
