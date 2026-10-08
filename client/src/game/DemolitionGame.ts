import Phaser from "phaser";
import { Garage } from "../ui/Garage";
import { GameAudio } from "../audio/GameAudio";
import { soundEnabled, toggleSound } from "../audio/preferences";
import { currentVehicle, drawVehicleCanvas, drawEffectCanvas, garageDefault } from "./vehicleArt";
import type { VehicleDesign } from "../../../shared/game/vehicleDesign";
type Point = {
    x: number;
    y: number;
};
type Body = {
    id: number;
    position: Point;
    velocity: Point;
    angle: number;
    angularVelocity: number;
    mass: number;
    vertices: Point[];
    isStatic: boolean;
};
type Joint = {
    bodyA: Body;
    bodyB: Body;
};
type Engine = {
    world: unknown;
};
type MatterAPI = {
    Engine: {
        create(options?: unknown): Engine;
        update(engine: Engine, dt: number): void;
        clear(engine: Engine): void;
    };
    Bodies: {
        rectangle(x: number, y: number, w: number, h: number, options?: unknown): Body;
        circle(x: number, y: number, r: number, options?: unknown): Body;
    };
    Body: {
        setVelocity(body: Body, v: Point): void;
        setAngularVelocity(body: Body, v: number): void;
        applyForce(body: Body, p: Point, f: Point): void;
        setPosition(body: Body, p: Point): void;
    };
    Composite: {
        add(world: unknown, objects: unknown[]): void;
        remove(world: unknown, object: unknown): void;
        clear(world: unknown, keepStatic: boolean): void;
    };
    Constraint: {
        create(options: unknown): Joint;
    };
};
const M = (Phaser.Physics.Matter as unknown as {
    Matter: MatterAPI;
}).Matter;
type Piece = {
    body: Body;
    w: number;
    h: number;
    color: string;
    start: Point;
    target: boolean;
    hit: boolean;
    label: string | undefined;
    kind: "brick" | "tank" | "plank";
};
type Scrap = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
};
const GROUND = 770;
const COURSES = [
    { name: "The leaning bakery", hint: "Hit the red supports. Let gravity handle the paperwork.", goal: 3 },
    { name: "Water under the bridge", hint: "Break the blue tank. Wash the bridge into tomorrow.", goal: 3 },
    { name: "Absolutely no dominoes", hint: "One good swing can start a very bad chain reaction.", goal: 4 },
];
export class DemolitionGame {
    private audio = new GameAudio();
    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private root!: HTMLElement;
    private garage!: Garage;
    private engine!: Engine;
    private chassis!: Body;
    private wheels: Body[] = [];
    private pieces: Piece[] = [];
    private joints: Joint[] = [];
    private design: VehicleDesign = garageDefault();
    private keys = new Set<string>();
    private particles: Scrap[] = [];
    private water: Body[] = [];
    private charge = 0;
    private charging = false;
    private swing = 0;
    private facing = 1;
    private travel = 0;
    private fuel = 100;
    private time = 60;
    private score = 0;
    private course = 0;
    private completed = false;
    private last = 0;
    private accumulator = 0;
    private camera = 0;
    private waterReleased = false;
    private best = 0;
    private burst: Point | null = null;
    private burstAge = 0;
    private jumpCooldown = 0;
    start(): void {
        this.root = document.querySelector<HTMLElement>("#hud-root")!;
        this.root.className = "hud demo-ui";
        this.root.innerHTML = `<header class="demo-top"><div class="demo-brand">LOBBERS.<small>DOODLE DEMOLITION DEPARTMENT</small></div><div class="demo-ticket"><strong id="demoMission"></strong><span id="demoObjective">Draw a machine. Make a beautiful mess.</span></div><div class="demo-tools"><select id="demoCourse" aria-label="Demolition challenge">${COURSES.map((c, i) => `<option value="${i}">${c.name}</option>`).join("")}</select><button id="openGarageButton">✎ Draw your machine</button><button id="demoRetry" aria-label="Retry challenge">↻ Retry</button></div></header><section class="demo-score" aria-label="Challenge progress"><div><strong id="demoTargets">0 / 3</strong><small>TARGETS TOPPLED</small></div><div><strong id="demoTime">60</strong><small>SECONDS OF BAD IDEAS</small></div><div><strong id="demoFuel">100%</strong><small>THRUSTER</small></div></section><div class="demo-hint" id="demoHint" role="status"></div><nav class="demo-controls" aria-label="Machine controls"><div><button data-hold="left" aria-label="Drive left">← A</button><button data-hold="right" aria-label="Drive right">D →</button><button data-tap="hop">↑ Hop</button></div><div><button data-hold="boost">» Boost</button><button data-tap="water">≈ Water</button><button data-hold="hammer" class="hammer">Hold → HAMMER</button></div></nav><section class="demo-results" id="demoResults" role="dialog" aria-label="Challenge results" hidden><small>OFFICIAL DAMAGE REPORT</small><h2 id="demoResultTitle"></h2><p id="demoResultText"></p><button id="demoAgain">↻ Another bad idea</button><button id="demoNext">Next playground →</button></section>`;
        this.canvas = document.createElement("canvas");
        this.canvas.className = "demolition-canvas";
        this.canvas.setAttribute("aria-label", "Paper demolition playground. Drive with A/D, hop with Space, hold J and release to swing, Shift boosts, W sprays water, R retries.");
        document.querySelector("#game-root")!.replaceChildren(this.canvas);
        this.ctx = this.canvas.getContext("2d")!;
        this.audio.preload();
        const sound = document.createElement("button");
        sound.type = "button";
        sound.id = "demoSound";
        sound.setAttribute("aria-label", "Toggle sound");
        const syncSound = () => { sound.textContent = soundEnabled() ? "♪ Sound on" : "♪ Sound off"; sound.setAttribute("aria-pressed", String(soundEnabled())); };
        syncSound();
        sound.addEventListener("click", () => { toggleSound(); syncSound(); });
        this.root.querySelector(".demo-tools")!.append(sound);
        this.garage = new Garage(this.root, "demolition");
        this.root.querySelector("#openGarageButton")!.addEventListener("click", () => { this.release(); this.garage.show(); });
        for (const id of ["demoRetry", "demoAgain"])
            this.root.querySelector(`#${id}`)!.addEventListener("click", () => this.reset());
        this.root.querySelector("#demoNext")!.addEventListener("click", () => { this.course = (this.course + 1) % COURSES.length; (this.root.querySelector("#demoCourse") as HTMLSelectElement).value = String(this.course); this.reset(); });
        this.root.querySelector("#demoCourse")!.addEventListener("change", e => { this.course = Number((e.target as HTMLSelectElement).value); this.reset(); });
        this.root.querySelectorAll<HTMLButtonElement>("[data-hold]").forEach(b => {
            b.addEventListener("pointerdown", e => { if (this.completed)
                return; e.preventDefault(); b.setPointerCapture(e.pointerId); this.input(b.dataset.hold!, true); b.dataset.held = "true"; });
            const up = () => { this.input(b.dataset.hold!, false); b.dataset.held = "false"; };
            b.addEventListener("pointerup", up);
            b.addEventListener("pointercancel", up);
            b.addEventListener("lostpointercapture", up);
        });
        this.root.querySelectorAll<HTMLButtonElement>("[data-tap]").forEach(b => b.addEventListener("click", () => b.dataset.tap === "hop" ? this.hop() : this.spray()));
        const mapping: Record<string, string> = { a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right", Shift: "boost", j: "hammer" };
        window.addEventListener("keydown", e => { if (this.paused() || /INPUT|SELECT/.test((e.target as HTMLElement)?.tagName))
            return; const key = mapping[e.key]; if (key) {
            e.preventDefault();
            this.input(key, true);
        } if (!e.repeat) {
            if (e.code === "Space") {
                e.preventDefault();
                this.hop();
            }
            if (e.key.toLowerCase() === "w")
                this.spray();
            if (e.key.toLowerCase() === "r")
                this.reset();
        } });
        window.addEventListener("keyup", e => { const key = mapping[e.key]; if (key)
            this.input(key, false); });
        window.addEventListener("blur", () => this.release());
        document.addEventListener("visibilitychange", () => { if (document.hidden)
            this.release(); });
        window.addEventListener("lobbers:vehicle", () => { this.design = garageDefault(); this.reset(); });
        window.addEventListener("resize", () => this.resize());
        this.resize();
        this.reset();
        (window as unknown as {
            render_game_to_text: () => string;
        }).render_game_to_text = () => JSON.stringify({ mode: "demolition", course: this.course, targets: this.score, goal: COURSES[this.course]!.goal, time: Math.ceil(this.time), fuel: Math.round(this.fuel), vehicle: { x: Math.round(this.chassis.position.x), y: Math.round(this.chassis.position.y) }, charge: this.charge, pieces: this.pieces.filter(p => p.hit).length, water: this.water.length, completed: this.completed });
        requestAnimationFrame(t => this.frame(t));
    }
    private paused() { return this.root.dataset.garageOpen === "true" || document.hidden; }
    private resize() { const ratio = Math.min(devicePixelRatio || 1, 2); this.canvas.width = Math.round(innerWidth * ratio); this.canvas.height = Math.round(innerHeight * ratio); }
    private input(key: string, down: boolean) { if (down)
        this.keys.add(key);
    else
        this.keys.delete(key); if (key === "hammer") {
        if (down && !this.charging && !this.completed) {
            this.charging = true;
            this.audio.play("charge-start");
        }
        else if (!down && this.charging) {
            this.charging = false;
            this.strike();
        }
    } }
    private release() { this.keys.clear(); this.charging = false; this.charge = 0; this.root.querySelectorAll<HTMLElement>("[data-held]").forEach(b => b.dataset.held = "false"); }
    private reset() {
        if (this.engine) {
            M.Composite.clear(this.engine.world, false);
            M.Engine.clear(this.engine);
        }
        this.engine = M.Engine.create({ gravity: { x: 0, y: 1, scale: .001 } });
        this.pieces = [];
        this.joints = [];
        this.wheels = [];
        this.water = [];
        this.particles = [];
        this.waterReleased = false;
        this.charge = 0;
        this.swing = 0;
        this.time = 60;
        this.score = 0;
        this.fuel = 100;
        this.completed = false;
        this.travel = 0;
        this.burst = null;
        this.jumpCooldown = 0;
        this.release();
        this.root.querySelector<HTMLElement>("#demoResults")!.hidden = true;
        this.text("demoMission", COURSES[this.course]!.name);
        this.text("demoHint", COURSES[this.course]!.hint);
        const floor = M.Bodies.rectangle(1100, GROUND + 35, 2400, 70, { isStatic: true, friction: .8 });
        M.Composite.add(this.engine.world, [floor, M.Bodies.rectangle(-50, 400, 80, 900, { isStatic: true }), M.Bodies.rectangle(2300, 400, 80, 900, { isStatic: true })]);
        this.design = currentVehicle() ?? garageDefault();
        this.chassis = M.Bodies.rectangle(350, 690, 120, 40, { density: .003, friction: .4, restitution: .1, collisionFilter: { group: -1 } });
        M.Composite.add(this.engine.world, [this.chassis]);
        const wheelParts = this.design.parts.filter(p => p.kind === "wheel");
        const mounts = wheelParts.length ? wheelParts.slice(0, 4) : [{ x: -55, y: 18, size: 20 }, { x: 55, y: 18, size: 20 }];
        for (const p of mounts) {
            const offset = { x: p.x * .65, y: Math.max(12, p.y * .65 + 18) };
            const wheel = M.Bodies.circle(350 + offset.x, 690 + offset.y, Math.max(10, p.size * .65), { density: .004, friction: 1.1, restitution: .15, collisionFilter: { group: -1 } });
            const joint = M.Constraint.create({ bodyA: this.chassis, pointA: offset, bodyB: wheel, length: 0, stiffness: .7, damping: .15 });
            M.Composite.add(this.engine.world, [wheel, joint]);
            this.wheels.push(wheel);
        }
        if (this.course === 0) {
            this.tower(720, 4, "BAKERY", true);
            this.tower(1010, 5, "HOTEL", true);
            this.tower(1330, 3, "NOODLES", true);
            this.tank(1570, 570);
        }
        if (this.course === 1) {
            this.tower(670, 3, "PAPER MILL", true);
            this.tower(1080, 4, "BRIDGE CLUB", true);
            this.tower(1490, 3, "SOGGY CAFE", true);
            this.tank(880, 450);
            for (let i = 0; i < 6; i++)
                this.piece(780 + i * 65, 570, 62, 16, "#91b4ae", false, "plank");
        }
        if (this.course === 2) {
            for (let i = 0; i < 4; i++)
                this.tower(650 + i * 270, 3 + i % 2, ["OOPS", "UH OH", "YIKES", "FINALE"][i]!, true);
            this.tank(1750, 550);
        }
        const scale = innerWidth <= 700 ? .65 : Math.max(.45, Math.min(innerWidth / 1440, innerHeight / 900));
        this.camera = Math.max(0, 350 - innerWidth / scale * (innerWidth <= 700 ? .25 : .35));
        this.accumulator = 0;
        this.hud();
    }
    private piece(x: number, y: number, w: number, h: number, color: string, target = false, kind: Piece["kind"] = "brick", label?: string): Piece {
        const body = M.Bodies.rectangle(x, y, w, h, { density: kind === "tank" ? .0009 : .0015, friction: .65, restitution: .07 });
        const p = { body, w, h, color, target, hit: false, start: { x, y }, kind, label };
        this.pieces.push(p);
        M.Composite.add(this.engine.world, [body]);
        return p;
    }
    private tower(x: number, floors: number, name: string, target: boolean) {
        const left = this.piece(x - 52, GROUND - 34, 24, 68, "#d75c46");
        const right = this.piece(x + 52, GROUND - 34, 24, 68, "#d75c46");
        let prev = [left, right];
        for (let row = 0; row < floors; row++) {
            const p = this.piece(x, GROUND - 100 - row * 66, 140, 62, ["#f0c34b", "#e9b59a", "#91b4ae"][row % 3]!, target && row === floors - 1, "brick", row === floors - 1 ? name : undefined);
            for (const q of prev) {
                const joint = M.Constraint.create({ bodyA: q.body, bodyB: p.body, pointA: { x: 0, y: -q.h / 2 }, pointB: { x: q.body.position.x - x, y: p.h / 2 }, length: 4, stiffness: .2 });
                this.joints.push(joint);
                M.Composite.add(this.engine.world, [joint]);
            }
            prev = [p];
        }
    }
    private tank(x: number, y: number) { this.piece(x, y, 110, 90, "#91b4ae", false, "tank", "WATER"); const height = GROUND - y - 45; this.piece(x - 42, GROUND - height / 2, 16, height, "#263d38"); this.piece(x + 42, GROUND - height / 2, 16, height, "#263d38"); }
    private hop() { if (this.completed || this.paused() || this.jumpCooldown > 0)
        return; const grounded = this.wheels.some(w => w.position.y > GROUND - 35) || this.pieces.some(p => Math.abs(p.body.position.x - this.chassis.position.x) < 90 && p.body.position.y > this.chassis.position.y && p.body.position.y - this.chassis.position.y < 70); if (!grounded)
        return; for (const b of [this.chassis, ...this.wheels])
        M.Body.setVelocity(b, { x: b.velocity.x, y: -9 }); this.jumpCooldown = .7; }
    private hammerAnchor(): Point { const mount = this.design.parts.find(p => p.kind === "cannon"); const x = (mount?.x ?? 15) * .65 * this.facing, y = (mount?.y ?? -25) * .65; const angle = this.chassis.angle; return { x: this.chassis.position.x + x * Math.cos(angle) - y * Math.sin(angle), y: this.chassis.position.y + x * Math.sin(angle) + y * Math.cos(angle) }; }
    private strike() {
        if (this.completed || this.paused())
            return;
        const power = .3 + this.charge * .7;
        this.swing = 1;
        const origin = this.hammerAnchor();
        const reach = 100 + power * (this.design.parts.find(p => p.kind === "cannon")?.size ?? 18) * 5;
        let hits = 0;
        for (const p of this.pieces) {
            const dx = p.body.position.x - origin.x;
            const dy = p.body.position.y - (origin.y - 25);
            if (dx * this.facing > -40 && dx * this.facing < reach && Math.abs(dy) < 110) {
                this.breakPiece(p, power);
                hits++;
            }
        }
        this.burst = { x: origin.x + this.facing * reach * .75, y: origin.y - 30 };
        this.burstAge = 0;
        this.scraps(this.burst.x, this.burst.y, hits ? 22 : 7, "#f0c34b");
        this.charge = 0;
        this.audio.play(hits ? "fragment-impact" : "throw-release");
        if (hits)
            this.text("demoHint", hits > 2 ? "That's a chain reaction. Our lawyers are delighted." : "Support removed. Stand back and admire your terrible work.");
    }
    private breakPiece(p: Piece, power: number) { for (const j of [...this.joints])
        if (j.bodyA === p.body || j.bodyB === p.body) {
            M.Composite.remove(this.engine.world, j);
            this.joints.splice(this.joints.indexOf(j), 1);
        } M.Body.setVelocity(p.body, { x: this.facing * (6 + power * 9), y: -3 - power * 4 }); M.Body.setAngularVelocity(p.body, this.facing * .035 * power); if (p.kind === "tank" && !this.waterReleased)
        this.flood(p.body.position); this.scraps(p.body.position.x, p.body.position.y, 6, p.color); }
    private flood(p: Point) { this.waterReleased = true; for (let i = 0; i < 100; i++) {
        const b = M.Bodies.circle(p.x + (i % 10) * 5 - 25, p.y - Math.floor(i / 10) * 6, 5, { density: .00035, friction: 0, restitution: .25 });
        M.Body.setVelocity(b, { x: (i % 9 - 4) * 1.5, y: -Math.floor(i / 10) * .3 });
        this.water.push(b);
        M.Composite.add(this.engine.world, [b]);
    } this.text("demoHint", "The tank burst! Water pushes loose paper. Follow the flood."); }
    private spray() { if (this.completed || this.paused() || this.fuel < 15)
        return; this.fuel -= 15; const p = this.chassis.position; for (let i = 0; i < 18; i++) {
        const b = M.Bodies.circle(p.x + this.facing * 70, p.y - 35 - i * 2, 4, { density: .0006, friction: 0, restitution: .2 });
        M.Body.setVelocity(b, { x: this.facing * (10 + i % 4), y: -3 - i % 3 });
        this.water.push(b);
        M.Composite.add(this.engine.world, [b]);
    } while (this.water.length > 180) {
        const b = this.water.shift()!;
        M.Composite.remove(this.engine.world, b);
    } }
    private scraps(x: number, y: number, count: number, color: string) { for (let i = 0; i < count; i++)
        this.particles.push({ x, y, vx: (Math.random() - .5) * 9, vy: -Math.random() * 8, life: 1, color }); if (this.particles.length > 180)
        this.particles.splice(0, this.particles.length - 180); }
    private step(dt: number) {
        if (this.completed || this.paused())
            return;
        this.time = Math.max(0, this.time - dt);
        this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
        this.swing = Math.max(0, this.swing - dt * 3);
        if (this.charging)
            this.charge = Math.min(1, this.charge + dt * .95);
        const direction = (this.keys.has("right") ? 1 : 0) - (this.keys.has("left") ? 1 : 0);
        if (direction)
            this.facing = direction;
        for (const w of this.wheels)
            M.Body.setAngularVelocity(w, direction * .24);
        if (direction)
            M.Body.applyForce(this.chassis, this.chassis.position, { x: direction * .0018 * this.chassis.mass, y: 0 });
        const boosting = this.keys.has("boost") && this.fuel > 0;
        const thruster = this.design.parts.find(p => p.kind === "thruster");
        if (boosting) {
            this.fuel = Math.max(0, this.fuel - dt * 32);
            M.Body.applyForce(this.chassis, { x: this.chassis.position.x, y: this.chassis.position.y + (thruster?.y ?? 0) * .5 }, { x: this.facing * .005 * this.chassis.mass, y: -.0009 * this.chassis.mass });
        }
        else
            this.fuel = Math.min(100, this.fuel + dt * 9);
        if (Math.abs(this.chassis.velocity.x) > 12)
            M.Body.setVelocity(this.chassis, { x: Math.sign(this.chassis.velocity.x) * 12, y: this.chassis.velocity.y });
        M.Engine.update(this.engine, 1000 / 60);
        this.travel += this.chassis.velocity.x;
        for (const p of this.pieces) {
            if (p.target && !p.hit && (Math.abs(p.body.angle) > .52 || p.body.position.y - p.start.y > 80)) {
                p.hit = true;
                this.score++;
                this.scraps(p.body.position.x, p.body.position.y, 20, p.color);
            }
            if (p.kind === "tank" && !this.waterReleased && (Math.abs(p.body.angle) > .4 || p.body.position.y - p.start.y > 70))
                this.flood(p.body.position);
        }
        for (const p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += .18;
            p.life -= dt * .7;
        }
        this.particles = this.particles.filter(p => p.life > 0);
        if (this.burst)
            this.burstAge += dt;
        if (this.chassis.position.y > 1000)
            this.recover();
        this.hud();
        if (this.score >= COURSES[this.course]!.goal || this.time <= 0)
            this.finish();
    }
    private recover() { for (const b of [this.chassis, ...this.wheels]) {
        M.Body.setPosition(b, { x: 230 + (b === this.chassis ? 0 : (this.wheels.indexOf(b) - .5) * 60), y: b === this.chassis ? 690 : 730 });
        M.Body.setVelocity(b, { x: 0, y: 0 });
        M.Body.setAngularVelocity(b, 0);
    } this.text("demoHint", "Back on your wheels. Keep making bad decisions."); }
    private finish() { this.completed = true; this.hud(); this.release(); const won = this.score >= COURSES[this.course]!.goal; this.audio.play(won ? "round-win" : "round-lose"); this.text("demoResultTitle", won ? "Beautiful disaster." : "Needs more chaos."); const points = this.score * 1000 + Math.ceil(this.time) * 10; try {
        this.best = Math.max(points, Number(localStorage.getItem(`lobbers-demo-best-${this.course}`) || 0));
        localStorage.setItem(`lobbers-demo-best-${this.course}`, String(this.best));
    }
    catch {
        this.best = points;
    } this.text("demoResultText", `${this.score} targets toppled · ${points.toLocaleString()} damage points · Best ${this.best.toLocaleString()}. ${won ? "Your invention passed inspection. Somehow." : "Move a wheel, charge a bigger swing, or break the tank. Try another idea."}`); this.root.querySelector<HTMLElement>("#demoResults")!.hidden = false; }
    private text(id: string, value: string) { const el = this.root.querySelector(`#${id}`)!; if (el.textContent !== value)
        el.textContent = value; }
    private hud() { this.text("demoTargets", `${this.score} / ${COURSES[this.course]!.goal}`); this.text("demoTime", String(Math.ceil(this.time))); this.text("demoFuel", `${Math.round(this.fuel)}%`); this.root.dataset.demoTargets = String(this.score); this.root.dataset.demoCompleted = String(this.completed); }
    private frame(t: number) { const elapsed = Math.min(.08, (t - this.last) / 1000 || 0); this.last = t; if (!this.paused()) {
        this.accumulator += elapsed;
        let n = 0;
        while (this.accumulator >= 1 / 60 && n++ < 5) {
            this.step(1 / 60);
            this.accumulator -= 1 / 60;
        }
    }
    else
        this.accumulator = 0; this.draw(t); requestAnimationFrame(t2 => this.frame(t2)); }
    private draw(t: number) {
        const ctx = this.ctx;
        const w = innerWidth, h = innerHeight;
        const phone = w <= 700;
        const scale = phone ? .65 : Math.max(.45, Math.min(w / 1440, h / 900));
        const vw = w / scale;
        this.camera += (Math.max(0, Math.min(2200 - vw, this.chassis.position.x - vw * (phone ? .25 : .35))) - this.camera) * .08;
        ctx.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0);
        ctx.fillStyle = "#fff8e7";
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.scale(scale, scale);
        ctx.translate(-this.camera, (h - (phone ? 170 : 105)) / scale - GROUND);
        ctx.strokeStyle = "#263d380b";
        ctx.lineWidth = 1;
        for (let x = 0; x < 2400; x += 35) {
            ctx.beginPath();
            ctx.moveTo(x, -1200);
            ctx.lineTo(x, 900);
            ctx.stroke();
        }
        for (let y = -800; y < 1000; y += 35) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(2400, y);
            ctx.stroke();
        }
        ctx.fillStyle = "#f0c34b";
        ctx.beginPath();
        ctx.arc(1850, 180, 65, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#263d38";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#91b4ae55";
        ctx.beginPath();
        ctx.moveTo(-100, GROUND);
        for (let x = -100; x < 2400; x += 70)
            ctx.lineTo(x, 650 + Math.sin(x * .004) * 40);
        ctx.lineTo(2400, GROUND);
        ctx.fill();
        ctx.fillStyle = "#dce6ca";
        ctx.fillRect(-100, GROUND, 2600, 300);
        ctx.strokeStyle = "#263d38";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-100, GROUND);
        ctx.lineTo(2400, GROUND);
        ctx.stroke();
        for (let x = 0; x < 2200; x += 120) {
            ctx.fillStyle = "#263d3850";
            ctx.font = "10px Arial";
            ctx.fillText(`${x / 10} m`, x, GROUND + 25);
        }
        for (const p of this.pieces) {
            ctx.save();
            ctx.translate(p.body.position.x, p.body.position.y);
            ctx.rotate(p.body.angle);
            ctx.fillStyle = p.hit ? "#f0c34b" : p.color;
            ctx.strokeStyle = "#263d38";
            ctx.lineWidth = 2.5;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
            if (p.kind === "tank") {
                ctx.fillStyle = "#237f8780";
                ctx.fillRect(-p.w / 2 + 5, 0, p.w - 10, p.h / 2 - 5);
            }
            else if (p.w > 80) {
                for (let i = -1; i <= 1; i++) {
                    ctx.fillStyle = "#fff8e7";
                    ctx.fillRect(i * 35 - 9, -10, 18, 22);
                    ctx.strokeRect(i * 35 - 9, -10, 18, 22);
                }
            }
            if (p.target) {
                ctx.fillStyle = p.hit ? "#fff8e7" : "#d75c46";
                ctx.beginPath();
                ctx.arc(0, -p.h / 2 - 18, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = p.hit ? "#263d38" : "#fff8e7";
                ctx.font = "bold 17px Arial";
                ctx.textAlign = "center";
                ctx.fillText(p.hit ? "✓" : "★", 0, -p.h / 2 - 12);
            }
            if (p.label) {
                ctx.fillStyle = "#263d38";
                ctx.font = "bold 10px Arial";
                ctx.textAlign = "center";
                ctx.fillText(p.label, 0, 23);
            }
            ctx.restore();
        }
        ctx.fillStyle = "#237f87aa";
        for (const b of this.water) {
            ctx.beginPath();
            ctx.arc(b.position.x, b.position.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        const p = this.chassis.position;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(this.chassis.angle);
        ctx.scale(.65 * this.facing, .65);
        drawVehicleCanvas(ctx, { ...this.design, parts: this.design.parts.filter(part => part.kind !== "wheel" && part.kind !== "cannon") }, { angle: -.15, travel: this.travel, thrust: this.keys.has("boost") ? 1 : 0, charge: this.charge, shield: false, time: t });
        ctx.restore();
        for (const wheel of this.wheels) {
            const radius = Math.max(...wheel.vertices.map(v => Math.hypot(v.x - wheel.position.x, v.y - wheel.position.y)));
            ctx.save();
            ctx.translate(wheel.position.x, wheel.position.y);
            ctx.rotate(wheel.angle);
            ctx.fillStyle = "#263d38";
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff8e7";
            ctx.beginPath();
            ctx.arc(0, 0, radius * .65, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#263d38";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-radius * .6, 0);
            ctx.lineTo(radius * .6, 0);
            ctx.moveTo(0, -radius * .6);
            ctx.lineTo(0, radius * .6);
            ctx.stroke();
            ctx.restore();
        }
        const anchor = this.hammerAnchor();
        ctx.save();
        ctx.translate(anchor.x, anchor.y);
        ctx.scale(this.facing, 1);
        const angle = this.swing > 0 ? -.7 + 2 * (1 - this.swing) : -1.2 - this.charge * .8;
        ctx.rotate(angle);
        ctx.fillStyle = "#e9b59a";
        ctx.strokeStyle = "#263d38";
        ctx.lineWidth = 3;
        ctx.fillRect(0, -7, 105 + this.charge * 45, 14);
        ctx.strokeRect(0, -7, 105 + this.charge * 45, 14);
        ctx.fillStyle = "#f0c34b";
        ctx.fillRect(95 + this.charge * 45, -27, 35, 54);
        ctx.strokeRect(95 + this.charge * 45, -27, 35, 54);
        ctx.restore();
        if (this.charging) {
            ctx.fillStyle = "#263d38";
            ctx.fillRect(p.x - 40, p.y - 95, 80, 8);
            ctx.fillStyle = "#f0c34b";
            ctx.fillRect(p.x - 38, p.y - 93, 76 * this.charge, 4);
        }
        for (const s of this.particles) {
            ctx.globalAlpha = s.life;
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x, s.y, 7, 4);
        }
        ctx.globalAlpha = 1;
        if (this.burst && this.burstAge < 1) {
            ctx.save();
            ctx.translate(this.burst.x, this.burst.y);
            drawEffectCanvas(ctx, this.design, this.burstAge);
            ctx.restore();
        }
        ctx.restore();
    }
}
