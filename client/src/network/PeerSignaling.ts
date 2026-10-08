// First-party rendezvous adaptation from Dead Arrival signaling.js (5998acb1).
// Only the creating instance owns DELETE rights. No origin or endpoint inference.
export class PeerSignaling {
  private readonly endpoint: string;
  private closed = false;
  private ownedCode = "";
  private readonly controllers = new Set<AbortController>();
  constructor(origin: string, private readonly fetcher: typeof fetch = fetch) {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) throw new Error("Enter the signaling server origin, without a path.");
    this.endpoint = parsed.origin + "/__dead_arrival/signal";
  }
  private code(code: unknown): string {
    if (typeof code !== "string" || !/^[A-Z2-9]{6}$/.test(code)) throw new Error("Enter the six-character peer invitation.");
    return code;
  }
  private async request(path: string, method = "GET", body?: unknown, cleanup = false): Promise<Record<string, unknown>> {
    if (this.closed && !cleanup) throw new Error("Peer signaling cancelled.");
    const controller = new AbortController(); this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await this.fetcher(this.endpoint + path, { method, signal: controller.signal, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const raw = await response.text();
      if (new TextEncoder().encode(raw).byteLength > 300 * 1024) throw new Error("Signaling response too large.");
      const payload = JSON.parse(raw) as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Peer signaling failed.");
      return payload;
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }
  async createRoom(offer: string): Promise<string> {
    const result = await this.request("/rooms", "POST", { offer });
    const code = this.code(result.code);
    // A cancellation may race a successful HTTP response. Clean precisely that returned own code.
    if (this.closed) { await this.deleteOwned(code); throw new Error("Peer signaling cancelled."); }
    this.ownedCode = code; return code;
  }
  async getOffer(code: string): Promise<string> {
    const result = await this.request(`/rooms/${this.code(code)}/offer`);
    if (this.closed || typeof result.offer !== "string") throw new Error("Peer invitation unavailable.");
    return result.offer;
  }
  async submitAnswer(code: string, answer: string): Promise<void> {
    await this.request(`/rooms/${this.code(code)}/answer`, "POST", { answer });
    if (this.closed) throw new Error("Peer signaling cancelled.");
  }
  async waitForAnswer(code: string): Promise<string> {
    const deadline = performance.now() + 120_000;
    while (!this.closed && performance.now() < deadline) {
      const result = await this.request(`/rooms/${this.code(code)}/answer`);
      if (typeof result.answer === "string" && result.answer) return result.answer;
      await new Promise<void>(resolve => {
        // A bounded timer is cleared by close via the same owned controller.
        const controller = new AbortController(); this.controllers.add(controller);
        const finish = (): void => { clearTimeout(timer); this.controllers.delete(controller); controller.signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, 500); controller.signal.addEventListener("abort", finish, { once: true });
      });
    }
    throw new Error(this.closed ? "Peer signaling cancelled." : "Peer invitation expired.");
  }
  private async deleteOwned(code: string): Promise<void> {
    try { await this.request(`/rooms/${this.code(code)}`, "DELETE", undefined, true); } catch { /* TTL remains the server's bounded fallback. */ }
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const controller of [...this.controllers]) controller.abort();
    const owned = this.ownedCode; this.ownedCode = "";
    if (owned) await this.deleteOwned(owned);
  }
}
