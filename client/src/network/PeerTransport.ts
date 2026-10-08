import { MAX_PACKET_BYTES, packetBytes, parsePacket, type PeerPacket } from "../../../shared/game/peerProtocol";

// First-party adaptation of Dead Arrival peer.js (433cc008): native ordered channel,
// fully gathered offer/answer and owned lifecycle. Lobbers protocol/queue is independent.
export type QueueKind = "edge" | "motion" | "state" | "clock";
export const MAX_QUEUED_BYTES = 512 * 1024;
export const MAX_CHANNEL_BYTES = 256 * 1024;
export const MAX_QUEUE_COUNT = 128;
type Item = { text: string; bytes: number; kind: QueueKind };

/** Adjacent edge-free samples only coalesce; never across a control or final-neutral edge. */
export class OrderedQueue {
  private items: Item[] = [];
  private bytes = 0;
  offer(packet: PeerPacket, kind: QueueKind, buffered: number): boolean {
    const text = JSON.stringify(packet), bytes = packetBytes(packet);
    if (bytes > MAX_PACKET_BYTES) return false;
    const previous = this.items[this.items.length - 1];
    const replace = (kind === "motion" || kind === "state") && previous?.kind === kind;
    const removed = replace ? previous.bytes : 0;
    if (this.bytes - removed + buffered + bytes > MAX_QUEUED_BYTES || (!replace && this.items.length >= MAX_QUEUE_COUNT)) return false;
    if (replace) this.items.pop();
    this.items.push({ text, bytes, kind }); this.bytes += bytes - removed;
    return true;
  }
  flush(channel: Pick<RTCDataChannel, "readyState" | "bufferedAmount" | "send">, maxMessageBytes = MAX_PACKET_BYTES): void {
    if (channel.readyState !== "open") return;
    while (this.items.length) {
      const first = this.items[0]!;
      if (first.bytes > maxMessageBytes) throw new Error("Peer packet exceeds negotiated channel size.");
      if (channel.bufferedAmount + first.bytes > MAX_CHANNEL_BYTES) return;
      channel.send(first.text); // Remove only after native send accepted; caller terminates on exception.
      this.items.shift(); this.bytes -= first.bytes;
    }
  }
  clear(): void { this.items = []; this.bytes = 0; }
  get length(): number { return this.items.length; }
  get pendingBytes(): number { return this.bytes; }
}

type Callbacks = { open(): void; packet(p: PeerPacket): void; terminal(reason: string): void; status(status: string): void };
export class PeerTransport {
  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private closed = false;
  private readonly queue = new OrderedQueue();
  private readonly cleanup: (() => void)[] = [];
  private openedTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setInterval>;
  private invalidCount = 0;
  constructor(private readonly callbacks: Callbacks, private readonly signal: AbortSignal) {
    if (typeof RTCPeerConnection === "undefined") throw new Error("This browser does not support WebRTC.");
    // No new STUN/TURN permission/secret/service. First local two-window proof uses host ICE candidates.
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.listen(this.pc, "datachannel", event => this.bind((event as RTCDataChannelEvent).channel));
    this.listen(this.pc, "connectionstatechange", () => {
      if (["failed", "closed"].includes(this.pc.connectionState)) this.fail("Peer connection closed.");
    });
    this.listen(signal, "abort", () => this.close());
    this.armConnectionTimeout(30_000);
    this.flushTimer = setInterval(() => this.flush(), 25);
    if (signal.aborted) this.close();
  }
  private listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }
  private alive(): void { if (this.closed || this.signal.aborted) throw new Error("Peer attempt cancelled."); }
  armConnectionTimeout(milliseconds: number): void {
    if (this.openedTimer !== null) clearTimeout(this.openedTimer);
    this.openedTimer = null;
    if (this.closed || this.channel?.readyState === "open") return;
    if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 120_000) throw new Error("Invalid peer connection timeout.");
    this.openedTimer = setTimeout(() => this.fail("Peer channel timed out."), milliseconds);
  }
  private bind(channel: RTCDataChannel): void {
    if (this.closed || this.channel || channel.label !== "lobbers-v1" || channel.protocol !== "lobbers/1" || !channel.ordered || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) { channel.close(); return; }
    this.channel = channel;
    channel.bufferedAmountLowThreshold = MAX_CHANNEL_BYTES / 2;
    this.listen(channel, "bufferedamountlow", () => this.flush());
    this.listen(channel, "open", () => {
      if (this.closed) return;
      if (this.openedTimer !== null) clearTimeout(this.openedTimer);
      this.openedTimer = null; this.callbacks.status("RTC channel open"); this.callbacks.open(); this.flush();
    });
    this.listen(channel, "close", () => this.fail("Peer channel closed."));
    this.listen(channel, "error", () => this.fail("Peer channel failed."));
    this.listen(channel, "message", event => {
      if (this.closed) return;
      const packet = parsePacket((event as MessageEvent).data);
      if (!packet) { if (++this.invalidCount >= 3) this.fail("Invalid peer protocol."); return; }
      this.callbacks.packet(packet);
    });
  }
  private async gathered(): Promise<string> {
    this.alive();
    if (this.pc.iceGatheringState !== "complete") {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error): void => {
          clearTimeout(timer); this.pc.removeEventListener("icegatheringstatechange", changed); this.signal.removeEventListener("abort", aborted);
          if (error) reject(error); else resolve();
        };
        const changed = (): void => { if (this.pc.iceGatheringState === "complete") finish(); };
        const aborted = (): void => finish(new Error("Peer attempt cancelled."));
        const timer = setTimeout(() => finish(new Error("ICE gathering timed out.")), 8000);
        this.pc.addEventListener("icegatheringstatechange", changed); this.signal.addEventListener("abort", aborted, { once: true });
        changed(); if (this.signal.aborted) aborted();
      });
    }
    this.alive();
    const description = this.pc.localDescription;
    if (!description) throw new Error("WebRTC did not return a description.");
    return JSON.stringify({ v: 1, type: description.type, sdp: description.sdp });
  }
  private description(raw: string, type: "offer" | "answer"): RTCSessionDescriptionInit {
    if (new TextEncoder().encode(raw).byteLength > 256 * 1024) throw new Error("Peer description too large.");
    const p = JSON.parse(raw) as { v?: unknown; type?: unknown; sdp?: unknown };
    if (p.v !== 1 || p.type !== type || typeof p.sdp !== "string") throw new Error("Invalid peer description.");
    return { type, sdp: p.sdp };
  }
  async host(): Promise<string> {
    this.alive(); this.bind(this.pc.createDataChannel("lobbers-v1", { ordered: true, protocol: "lobbers/1" }));
    const offer = await this.pc.createOffer(); this.alive(); await this.pc.setLocalDescription(offer); this.alive(); return this.gathered();
  }
  async join(offer: string): Promise<string> {
    this.alive(); await this.pc.setRemoteDescription(this.description(offer, "offer")); this.alive();
    const answer = await this.pc.createAnswer(); this.alive(); await this.pc.setLocalDescription(answer); this.alive(); return this.gathered();
  }
  async accept(answer: string): Promise<void> { this.alive(); await this.pc.setRemoteDescription(this.description(answer, "answer")); this.alive(); }
  send(packet: PeerPacket, kind: QueueKind): boolean {
    if (this.closed) return false;
    const accepted = this.queue.offer(packet, kind, this.channel?.bufferedAmount ?? 0);
    if (!accepted && kind === "edge") { this.fail("Peer control queue full; match closed."); return false; }
    if (accepted) this.flush();
    return accepted && !this.closed;
  }
  private flush(): void {
    if (this.closed || !this.channel) return;
    try { this.queue.flush(this.channel, this.pc.sctp?.maxMessageSize || MAX_PACKET_BYTES); }
    catch (error) { this.fail(error instanceof Error ? error.message : "Peer send failed."); }
  }
  private fail(reason: string): void {
    if (this.closed) return;
    this.close(); this.callbacks.terminal(reason);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.openedTimer !== null) clearTimeout(this.openedTimer);
    this.openedTimer = null; clearInterval(this.flushTimer); this.queue.clear();
    for (const remove of this.cleanup.splice(0)) remove();
    this.channel?.close(); this.pc.close();
  }
}
