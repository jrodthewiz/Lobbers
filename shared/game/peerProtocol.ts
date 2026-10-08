import { AMMO_TYPES } from "./ammo";
import { CLIENT_MESSAGES } from "./messages";
import { parseVehicleDesign, MAX_DESIGN_BYTES } from "./vehicleDesign";
import type { AuthorityMessage } from "./ThrowAuthority";

export const PEER_VERSION = 2;
export const MAX_PACKET_BYTES = 256 * 1024;
export const MAX_CONTROLS_PER_SECOND = 128;
export type PeerState = Record<string, unknown> & { players: Record<string, Record<string, unknown>> };
export type PeerPacket = Record<string, unknown>;
export const packetBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const safeKey = (key: string): boolean => !["__proto__", "prototype", "constructor"].includes(key);
export const plain = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && Object.keys(value).every(safeKey)
);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12;
// Epoch milliseconds already exceed1e12. Keep geometry bounds separate from Date's valid range.
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
const numericField = (key: string, value: unknown): boolean => key.endsWith("AtMs") ? timestamp(value) : finite(value);
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown, max = 256): value is string => typeof value === "string" && value.length <= max;
const identity = (value: unknown): value is string => text(value, 48) && /^[a-zA-Z0-9:_-]+$/.test(value);
const exact = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const values = (value: unknown, choices: readonly string[]): boolean => typeof value === "string" && choices.includes(value);
const shape = (entry: unknown, numeric: string, strings: string, booleans: string): entry is Record<string, unknown> => {
  if (!plain(entry)) return false;
  const ns = numeric.split(" ").filter(Boolean), ss = strings.split(" ").filter(Boolean), bs = booleans.split(" ").filter(Boolean);
  return exact(entry, [...ns, ...ss, ...bs]) && ns.every(k => numericField(k, entry[k])) && ss.every(k => k === "vehicleDesign" ? (entry[k] === "" || (text(entry[k], MAX_DESIGN_BYTES) && parseVehicleDesign(entry[k]) !== null)) : text(entry[k])) && bs.every(k => typeof entry[k] === "boolean");
};

/** Validates the actual Schema JSON fields, retaining ammo=-1, zero timestamps and empty turn/winner. */
export function validState(state: unknown): state is PeerState {
  if (!plain(state)) return false;
  const maps = ["players", "projectiles", "pickups", "worldProps"];
  const numbers = "serverTick worldWidth countdownEndsAtMs turnStartedAtMs turnEndsAtMs turnNumber terrainVersion windAccelerationX".split(" ");
  const strings = "roundState winnerSide code hostName currentTurnSessionId turnPhase terrainSeed terrainMode biomeId".split(" ");
  if (!exact(state, [...maps, ...numbers, ...strings]) || !numbers.every(k => numericField(k, state[k])) || !strings.every(k => text(state[k]))) return false;
  if (!integer(state.serverTick) || !integer(state.turnNumber) || !values(state.roundState, ["waiting", "countdown", "active", "ended"]) || !values(state.winnerSide, ["", "blue", "red"]) || !values(state.turnPhase, ["move", "fire", "resolving"]) || !values(state.terrainMode, ["classic", "procedural"])) return false;
  const playerNumbers = "laneIndex spawnIndex x y vx vy hp aimX aimY javelinAmmo shotputAmmo splitterAmmo discusAmmo mortarAmmo needleAmmo clusterAmmo anvilAmmo shieldHp shieldMaxHp dashCooldownMs dashCooldownEndsAtMs dashSeq pickupSeq lastThrowDistance bestThrowDistance throwSeq";
  const playerStrings = "side name selectedAmmo lastPickupLabel vehicleDesign";
  const playerBooleans = "charging connected ready rematchRequested isHost isBot grounded";
  for (const name of maps) {
    const map = state[name];
    if (!plain(map)) return false;
    const entries = Object.entries(map);
    if (entries.length > (name === "players" ? 2 : 1024)) return false;
    for (const [id, entry] of entries) {
      if (!identity(id)) return false;
      if (name === "players") {
        if (!shape(entry, playerNumbers, playerStrings, playerBooleans) || !values(entry.side, ["", "blue", "red"]) || !values(entry.selectedAmmo, AMMO_TYPES) || entry.isBot !== false || !text(entry.name, 18)) return false;
        for (const ammo of AMMO_TYPES) if (!finite(entry[`${ammo}Ammo`]) || !Number.isInteger(entry[`${ammo}Ammo`]) || (entry[`${ammo}Ammo`] as number) < -1) return false;
      } else if (name === "projectiles") {
        if (!shape(entry, "x y vx vy radius", "id ammoType ownerSessionId", "alive") || entry.id !== id || !values(entry.ammoType, AMMO_TYPES) || !identity(entry.ownerSessionId)) return false;
      } else if (name === "pickups") {
        if (!shape(entry, "laneIndex x y radius respawnAtMs", "id type", "active") || entry.id !== id || !values(entry.type, ["armor", "clusterAmmo", "dashCharge", "repair", "ammoCache"])) return false;
      } else if (!shape(entry, "laneIndex x y width height hp triggeredSeq", "id type", "active") || entry.id !== id || !values(entry.type, ["oilBarrel", "supplyCrate"])) return false;
    }
  }
  return state.currentTurnSessionId === "" || (identity(state.currentTurnSessionId) && Object.hasOwn(state.players as object, state.currentTurnSessionId));
}

export function validInput(type: unknown, payload: unknown): type is AuthorityMessage {
  if (!values(type, Object.values(CLIENT_MESSAGES))) return false;
  if (type === CLIENT_MESSAGES.CHARGE_CANCEL || type === CLIENT_MESSAGES.REMATCH) return payload === undefined || payload === null;
  if (!plain(payload)) return false;
  if (type === CLIENT_MESSAGES.VEHICLE_DESIGN) return exact(payload, ["design"]) && (payload.design === "" || parseVehicleDesign(payload.design) !== null);
  if (type === CLIENT_MESSAGES.CHARGE_START || type === CLIENT_MESSAGES.SELECT_AMMO) return exact(payload, ["ammoType"]) && values(payload.ammoType, AMMO_TYPES);
  if (type === CLIENT_MESSAGES.THROW_RELEASE) return exact(payload, ["aimX", "aimY"]) && finite(payload.aimX) && finite(payload.aimY) && Math.abs(payload.aimX) <= 1 && Math.abs(payload.aimY) <= 1;
  if (type === CLIENT_MESSAGES.MOVE_INPUT) return exact(payload, ["moveX", "jump"]) && finite(payload.moveX) && Math.abs(payload.moveX) <= 1 && typeof payload.jump === "boolean";
  if (type === CLIENT_MESSAGES.USE_ABILITY) return exact(payload, ["ability"]) && payload.ability === "dash";
  return exact(payload, ["ready"]) && typeof payload.ready === "boolean";
}

export function parsePacket(raw: unknown): PeerPacket | null {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > MAX_PACKET_BYTES) return null;
  let p: unknown;
  try { p = JSON.parse(raw); } catch { return null; }
  if (!plain(p) || p.v !== PEER_VERSION || !text(p.kind, 20)) return null;
  if (p.kind === "join") return exact(p, ["v", "kind", "name"]) && text(p.name, 18) ? p : null;
  if (!identity(p.epoch)) return null;
  if (p.kind === "input") return exact(p, ["v", "kind", "epoch", "seq", "type", "payload"]) && integer(p.seq) && p.seq > 0 && validInput(p.type, p.payload) ? p : null;
  if (p.kind === "welcome") return exact(p, ["v", "kind", "epoch", "sessionId", "hostId", "seq", "hostNow", "state"]) && identity(p.sessionId) && identity(p.hostId) && p.hostId !== p.sessionId && integer(p.seq) && timestamp(p.hostNow) && validState(p.state) && Object.hasOwn(p.state.players, p.sessionId) && Object.hasOwn(p.state.players, p.hostId) ? p : null;
  if (p.kind === "state") return exact(p, ["v", "kind", "epoch", "seq", "hostNow", "state"]) && integer(p.seq) && timestamp(p.hostNow) && validState(p.state) ? p : null;
  if (p.kind === "ping") return exact(p, ["v", "kind", "epoch", "nonce"]) && integer(p.nonce) ? p : null;
  if (p.kind === "pong") return exact(p, ["v", "kind", "epoch", "nonce", "hostNow"]) && integer(p.nonce) && timestamp(p.hostNow) ? p : null;
  if (p.kind === "leave") return exact(p, ["v", "kind", "epoch"]) ? p : null;
  return null;
}

/** One guest display projection. Raw host data is never rewritten. Nonces and RTT are monotonic. */
export class DisplayClock {
  private readonly pending = new Map<number, number>();
  private nonce = 0;
  private hostAnchor = 0;
  private monoAnchor = 0;
  private bestRtt = Infinity;
  synced = false;
  constructor(private readonly mono = () => performance.now(), private readonly wall = () => Date.now()) {}
  ping(): number {
    const nonce = ++this.nonce;
    if (this.pending.size >= 4) this.pending.delete(this.pending.keys().next().value as number);
    this.pending.set(nonce, this.mono());
    return nonce;
  }
  accept(nonce: number, hostNow: number): boolean {
    const started = this.pending.get(nonce);
    if (started === undefined) return false;
    this.pending.delete(nonce);
    const now = this.mono(), rtt = now - started;
    if (!timestamp(hostNow) || !Number.isFinite(rtt) || rtt < 0 || rtt > 2000) return false;
    // Refresh even after long sessions; older minimum RTT is not an immortal clock sample.
    if (!this.synced || rtt <= this.bestRtt + 5 || now - this.monoAnchor > 5000) {
      this.hostAnchor = hostNow + rtt / 2; this.monoAnchor = now; this.bestRtt = rtt; this.synced = true;
    }
    return true;
  }
  project(raw: PeerState): PeerState {
    if (!this.synced) throw new Error("Peer clock is syncing.");
    const hostNow = this.hostAnchor + this.mono() - this.monoAnchor;
    const localNow = this.wall();
    const deadline = (n: unknown): number => n === 0 ? 0 : localNow + (n as number) - hostNow;
    const players: PeerState["players"] = {};
    for (const [id, p] of Object.entries(raw.players)) players[id] = { ...p, dashCooldownEndsAtMs: deadline(p.dashCooldownEndsAtMs) };
    return { ...raw, players, countdownEndsAtMs: deadline(raw.countdownEndsAtMs), turnStartedAtMs: deadline(raw.turnStartedAtMs), turnEndsAtMs: deadline(raw.turnEndsAtMs) };
  }
  clear(): void { this.pending.clear(); this.synced = false; }
}
