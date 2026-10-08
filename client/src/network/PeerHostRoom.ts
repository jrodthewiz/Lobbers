import { LobbersState } from "../../../shared/game/LobbersState";
import { ThrowAuthority } from "../../../shared/game/ThrowAuthority";
import { CLIENT_MESSAGES } from "../../../shared/game/messages";
import { SIMULATION } from "../../../shared/game/constants";
import { DisplayClock, MAX_CONTROLS_PER_SECOND, PEER_VERSION, validInput, validState, type PeerPacket, type PeerState } from "../../../shared/game/peerProtocol";
import type { RoomConnection } from "./RoomConnection";
import { PeerSignaling } from "./PeerSignaling";
import { PeerTransport } from "./PeerTransport";

/** Renderer-independent fixed-step admission; explicit observed stall, not focus state. */
export class HostStepper {
  private previous: number;
  private accumulated = 0;
  private stalledMs = 0;
  constructor(now: number) { this.previous = now; }
  pump(now: number, step: () => void): boolean {
    const elapsed = now - this.previous; this.previous = now;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 10_000) return false;
    this.stalledMs = Math.max(0, this.stalledMs + (elapsed > 250 ? elapsed - 250 : -elapsed));
    if (this.stalledMs >= 15_000) return false;
    this.accumulated = Math.min(this.accumulated + elapsed, 4 * (1000 / SIMULATION.tickHz));
    let steps = 0;
    while (this.accumulated + 1e-6 >= 1000 / SIMULATION.tickHz && steps++ < 4) {
      this.accumulated -= 1000 / SIMULATION.tickHz; step();
    }
    return true;
  }
}

type Options = { signal: AbortSignal; status: (message: string) => void };
export class PeerHostRoom implements RoomConnection {
  private id = "";
  private readonly epoch: string;
  private readonly hostId: string;
  private guestId = "";
  private readonly controller = new AbortController();
  private readonly signaling: PeerSignaling;
  private readonly transport: PeerTransport;
  private readonly authority: ThrowAuthority | null;
  private readonly clock = new DisplayClock();
  private closed = false;
  private guestLeft = false;
  private raw: PeerState | null = null;
  private seq = 0;
  private acceptedSeq = -1;
  private inputSeq = 0;
  private acceptedInput = 0;
  private inputWindow = 0;
  private inputCount = 0;
  private detailText = "Peer connection starting";
  private timer: ReturnType<typeof setInterval> | null = null;
  private publicationTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private readonly stateListeners = new Set<(state: unknown) => void>();
  private readonly leaveListeners = new Set<() => void>();
  private readonly errorListeners = new Set<(code: number, message?: string) => void>();
  private readonly externalAbort: () => void;
  private readonly role: "host" | "guest";

  private constructor(role: "host" | "guest", origin: string, private readonly name: string, private readonly options: Options) {
    this.role = role;
    this.epoch = role === "host" ? crypto.randomUUID() : "";
    this.hostId = role === "host" ? `host:${crypto.randomUUID()}` : "";
    this.id = this.hostId;
    this.signaling = new PeerSignaling(origin);
    if (role === "host") {
      const state = new LobbersState();
      this.authority = new ThrowAuthority({ state, nowMs: () => Date.now(), listingChanged: () => {} });
      this.authority.configure({ hostName: name, playerName: name, bot: false }, "LOCAL");
      // Host exists before generating/publishing an invitation; no guest can claim this slot.
      this.authority.join(this.id, { playerName: name });
      const stepper = new HostStepper(performance.now());
      this.timer = setInterval(() => {
        if (this.closed) return;
        if (!stepper.pump(performance.now(), () => this.authority!.step(SIMULATION.stepSeconds))) this.fail("Host scheduler stalled; start a fresh peer match.");
      }, 1000 / SIMULATION.tickHz);
      this.publicationTimer = setInterval(() => this.publish(), 1000 / SIMULATION.patchHz);
    } else this.authority = null;
    try {
    this.transport = new PeerTransport({
      open: () => {
        if (this.closed) return;
        if (this.role === "guest") this.control({ v: PEER_VERSION, kind: "join", name });
      },
      packet: packet => { if (!this.closed) this.receive(packet); },
      terminal: reason => {
        if (this.closed) return;
        if (this.role === "host" && this.guestId) this.removeGuest(reason);
        else this.fail(reason);
      },
      status: message => { if (!this.closed) this.status(message); },
    }, this.controller.signal);
    } catch (error) {
      if (this.timer) clearInterval(this.timer);
      if (this.publicationTimer) clearInterval(this.publicationTimer);
      this.authority?.leave(this.id);
      void this.signaling.close();
      throw error;
    }
    this.externalAbort = () => { void this.leave(); };
    options.signal.addEventListener("abort", this.externalAbort, { once: true });
    if (options.signal.aborted) this.externalAbort();
  }

  static async host(origin: string, name: string, options: Options): Promise<PeerHostRoom> {
    const room = new PeerHostRoom("host", origin, name, options);
    try {
      const offer = await room.transport.host(); room.alive();
      const code = await room.signaling.createRoom(offer); room.alive();
      // Start the full friend-invitation window when its code becomes available.
      room.transport.armConnectionTimeout(120_000);
      room.authority!.state.code = code;
      room.status(`Peer host · Invite ${code} · Waiting for friend`); room.publish();
      void room.signaling.waitForAnswer(code).then(async answer => {
        room.alive(); await room.transport.accept(answer); room.alive();
      }).catch(error => { if (!room.closed) room.fail(error instanceof Error ? error.message : "Peer invitation failed."); });
      return room;
    } catch (error) { await room.leave(); throw error; }
  }

  static async join(origin: string, code: string, name: string, options: Options): Promise<PeerHostRoom> {
    const room = new PeerHostRoom("guest", origin, name, options);
    try {
      // Register completion before ICE can open the channel and deliver welcome.
      const ready = new Promise<void>((resolve, reject) => {
        room.resolveReady = resolve; room.rejectReady = reject;
        room.readyTimer = setTimeout(() => room.fail("Peer welcome/clock timed out."), 30_000);
      });
      // Mark handled during getOffer/join/submitAnswer, then await the same result below.
      void ready.catch(() => {});
      const offer = await room.signaling.getOffer(code); room.alive();
      const answer = await room.transport.join(offer); room.alive();
      await room.signaling.submitAnswer(code, answer); room.alive();
      await ready; room.alive(); return room;
    } catch (error) { await room.leave(); throw error; }
  }

  private alive(): void { if (this.closed || this.options.signal.aborted) throw new Error("Peer attempt cancelled."); }
  get sessionId(): string { return this.id; }
  get detail(): string { return this.detailText; }
  get state(): unknown {
    if (this.authority) return this.authority.state;
    return this.raw && this.clock.synced ? this.clock.project(this.raw) : null;
  }
  private status(text: string): void { this.detailText = text; this.options.status(text); }
  private control(packet: PeerPacket): void {
    if (!this.transport.send(packet, "edge")) {
      if (!this.closed) this.fail("Peer control could not be accepted; match closed.");
      throw new Error("Peer control could not be accepted.");
    }
  }
  send(type: string, payload?: unknown): void {
    this.alive();
    if (!validInput(type, payload)) throw new Error("Invalid game input.");
    if (this.authority) { this.authority.input(this.id, type, payload); return; }
    if (!this.raw || !this.clock.synced || !this.id) throw new Error("Peer clock is syncing.");
    const packet = { v: PEER_VERSION, kind: "input", epoch: this.rawEpoch, seq: ++this.inputSeq, type, payload: payload ?? null };
    const motion = type === CLIENT_MESSAGES.MOVE_INPUT && (payload as { moveX: number; jump: boolean }).moveX !== 0 && !(payload as { jump: boolean }).jump;
    if (!this.transport.send(packet, motion ? "motion" : "edge")) {
      // A held-movement acceptance failure also must not silently latch old authoritative input.
      this.fail("Peer input queue full; match closed."); throw new Error("Peer input could not be accepted.");
    }
  }

  private rawEpoch = "";
  private remoteHostId = "";
  private receive(p: PeerPacket): void {
    if (this.authority) {
      if (p.kind === "join") {
        if (this.guestId || this.authority.state.players.size !== 1 || !this.authority.requestJoin({ code: this.authority.state.code }, false)) { this.fail("Peer room is not accepting players."); return; }
        this.guestId = `guest:${crypto.randomUUID()}`;
        this.authority.join(this.guestId, { code: this.authority.state.code, playerName: p.name });
        const state = this.hostSnapshot();
        if (!state) return;
        this.control({ v: PEER_VERSION, kind: "welcome", epoch: this.epoch, hostId: this.hostId, sessionId: this.guestId, seq: ++this.seq, hostNow: Date.now(), state });
        this.status(`Peer host · Invite ${this.authority.state.code} · RTC connected`);
        this.notifyState();
      } else if (p.epoch === this.epoch && this.guestId && !this.guestLeft) {
        if (p.kind === "input") {
          if ((p.seq as number) <= this.acceptedInput) return;
          const now = performance.now();
          if (now - this.inputWindow >= 1000) { this.inputWindow = now; this.inputCount = 0; }
          if (++this.inputCount > MAX_CONTROLS_PER_SECOND) { this.fail("Peer input rate exceeded."); return; }
          this.acceptedInput = p.seq as number;
          this.authority.input(this.guestId, p.type as Parameters<ThrowAuthority["input"]>[1], p.payload);
        } else if (p.kind === "ping") {
          this.transport.send({ v: PEER_VERSION, kind: "pong", epoch: this.epoch, nonce: p.nonce, hostNow: Date.now() }, "clock");
        } else if (p.kind === "leave") this.removeGuest("Friend left the peer match.");
      }
      return;
    }
    if (p.kind === "welcome") {
      if (this.rawEpoch || this.id) { this.fail("Duplicate peer welcome."); return; }
      this.rawEpoch = p.epoch as string; this.id = p.sessionId as string; this.remoteHostId = p.hostId as string;
      this.acceptedSeq = p.seq as number; this.raw = p.state as PeerState;
      this.status("Peer guest · RTC connected · Clock syncing");
      this.ping(); this.pingTimer = setInterval(() => this.ping(), 1000);
    } else if (this.rawEpoch && p.epoch === this.rawEpoch) {
      if (p.kind === "state") {
        if ((p.seq as number) <= this.acceptedSeq) return;
        const state = p.state as PeerState;
        if (Object.keys(state.players).some(id => id !== this.id && id !== this.remoteHostId)) { this.fail("Peer snapshot identity changed."); return; }
        this.acceptedSeq = p.seq as number; this.raw = state;
        if (this.clock.synced) this.notifyState();
      } else if (p.kind === "pong" && this.clock.accept(p.nonce as number, p.hostNow as number)) {
        this.status("Peer guest · RTC connected · Clock synced");
        this.notifyState();
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.resolveReady?.(); this.resolveReady = null; this.rejectReady = null;
      } else if (p.kind === "leave") this.fail("Peer host left the match.");
    }
  }
  private ping(): void {
    if (this.closed) return;
    this.transport.send({ v: PEER_VERSION, kind: "ping", epoch: this.rawEpoch, nonce: this.clock.ping() }, "clock");
  }
  private hostSnapshot(): PeerState | null {
    const json = this.authority!.state.toJSON();
    if (!validState(json)) { this.fail("Authoritative peer snapshot is unsupported."); return null; }
    return json;
  }
  private publish(): void {
    if (this.closed) return;
    this.notifyState();
    if (this.guestId && !this.guestLeft) {
      const state = this.hostSnapshot();
      if (state) this.transport.send({ v: PEER_VERSION, kind: "state", epoch: this.epoch, seq: ++this.seq, hostNow: Date.now(), state }, "state");
    }
  }
  private notifyState(): void { if (!this.closed) for (const callback of [...this.stateListeners]) callback(this.state); }
  private removeGuest(reason: string): void {
    if (this.guestLeft || !this.guestId || !this.authority) return;
    this.guestLeft = true; this.authority.leave(this.guestId); this.transport.close();
    void this.signaling.close(); this.status(`Peer host · ${reason} Start a fresh invite.`); this.notifyState();
  }
  private fail(reason: string): void {
    if (this.closed) return;
    this.status(reason);
    for (const callback of [...this.errorListeners]) callback(1, reason);
    void this.leave();
  }
  onStateChange(callback: (state: unknown) => void): () => void { this.stateListeners.add(callback); return () => { this.stateListeners.delete(callback); }; }
  onLeave(callback: () => void): () => void { this.leaveListeners.add(callback); return () => { this.leaveListeners.delete(callback); }; }
  onError(callback: (code: number, message?: string) => void): () => void { this.errorListeners.add(callback); return () => { this.errorListeners.delete(callback); }; }
  async leave(): Promise<void> {
    if (this.closed) return;
    // Invalidate before callbacks, aborts and native channel close can reenter.
    this.closed = true;
    this.options.signal.removeEventListener("abort", this.externalAbort);
    if (this.timer) clearInterval(this.timer);
    if (this.publicationTimer) clearInterval(this.publicationTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.rawEpoch || this.authority) this.transport.send({ v: PEER_VERSION, kind: "leave", epoch: this.rawEpoch || this.epoch }, "edge");
    if (this.authority) { if (this.guestId && !this.guestLeft) { this.guestLeft = true; this.authority.leave(this.guestId); } this.authority.leave(this.id); }
    this.controller.abort(); this.transport.close(); this.clock.clear(); this.raw = null;
    this.rejectReady?.(new Error("Peer connection closed.")); this.resolveReady = null; this.rejectReady = null;
    for (const callback of [...this.leaveListeners]) callback();
    this.stateListeners.clear(); this.leaveListeners.clear(); this.errorListeners.clear();
    await this.signaling.close();
  }
}
