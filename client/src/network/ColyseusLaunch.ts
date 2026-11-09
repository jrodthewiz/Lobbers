import type { RoomConnection } from "./RoomConnection";

export const COLYSEUS_LAUNCH_TIMEOUT_MS = 15_000;

/** Bound the app attempt; the SDK request itself may still complete after cancellation. */
export const waitForColyseusLaunch = (
  connection: Promise<RoomConnection>,
  signal: AbortSignal,
): Promise<RoomConnection> => new Promise((resolve, reject) => {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cleanup = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    signal.removeEventListener("abort", cancel);
  };
  const fail = (error: unknown): void => {
    if (settled) return;
    settled = true; cleanup(); reject(error);
  };
  const cancel = (): void => fail(new Error("Connection canceled."));
  timer = setTimeout(() => fail(new Error("Connection timed out. Check your connection and try again.")), COLYSEUS_LAUNCH_TIMEOUT_MS);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();

  void connection.then(room => {
    if (settled) {
      // A late SDK success must not attach or keep its authoritative actor alive.
      void Promise.resolve().then(() => room.leave()).catch(() => { /* Best-effort disposal of a terminal room. */ });
      return;
    }
    settled = true; cleanup(); resolve(room);
  }, fail);
});
