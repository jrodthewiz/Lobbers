import type { Room } from "colyseus.js";

export interface RoomConnection {
  readonly sessionId: string;
  readonly state: unknown;
  readonly detail: string;
  send(type: string, payload?: unknown): void;
  onStateChange(callback: (state: unknown) => void): () => void;
  onLeave(callback: () => void): () => void;
  onError(callback: (code: number, message?: string) => void): () => void;
  leave(): Promise<void>;
}

/** Normalize installed Colyseus signal.remove; registration returns an emitter, not unsubscribe. */
export class ColyseusConnection implements RoomConnection {
  private closed = false;
  readonly detail = "";
  constructor(private readonly room: Room) {}
  get sessionId(): string { return this.room.sessionId; }
  get state(): unknown { return this.room.state; }
  send(type: string, payload?: unknown): void {
    if (this.closed) throw new Error("Room is closed.");
    this.room.send(type, payload);
  }
  onStateChange(callback: (state: unknown) => void): () => void {
    this.room.onStateChange(callback);
    return () => this.room.onStateChange.remove(callback);
  }
  onLeave(callback: () => void): () => void {
    const owned = (): void => callback();
    this.room.onLeave(owned);
    return () => this.room.onLeave.remove(owned);
  }
  onError(callback: (code: number, message?: string) => void): () => void {
    this.room.onError(callback);
    return () => this.room.onError.remove(callback);
  }
  async leave(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.room.leave();
  }
}
