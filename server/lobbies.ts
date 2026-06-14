import type { LobbyInfo } from "../shared/game/types";

type LobbyRecord = LobbyInfo & {
  updatedAtMs: number;
};

const lobbyByCode = new Map<string, LobbyRecord>();

export const normalizeLobbyCode = (value: unknown): string => (
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8)
);

export const hasLobbyCode = (code: string): boolean => lobbyByCode.has(normalizeLobbyCode(code));

export const createLobbyCode = (): string => {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (!hasLobbyCode(code)) return code;
  }
  return `${Date.now().toString(36).slice(-6)}`.toUpperCase();
};

export const createSplitLobbyCode = (rootCode: string): string => {
  const normalizedRoot = normalizeLobbyCode(rootCode);
  for (let attempt = 2; attempt < 1024; attempt += 1) {
    const suffix = attempt.toString(36).toUpperCase();
    const prefix = normalizedRoot.slice(0, Math.max(1, 8 - suffix.length));
    const code = `${prefix}${suffix}`;
    if (!hasLobbyCode(code)) return code;
  }
  return createLobbyCode();
};

export const upsertLobby = (info: LobbyInfo): void => {
  lobbyByCode.set(normalizeLobbyCode(info.code), {
    ...info,
    code: normalizeLobbyCode(info.code),
    updatedAtMs: Date.now(),
  });
};

export const removeLobby = (code: string): void => {
  lobbyByCode.delete(normalizeLobbyCode(code));
};

export const getLobby = (code: string): LobbyInfo | null => {
  const lobby = lobbyByCode.get(normalizeLobbyCode(code));
  if (!lobby) return null;
  const { updatedAtMs: _updatedAtMs, ...info } = lobby;
  return info;
};

export const listOpenLobbies = (): LobbyInfo[] => (
  Array.from(lobbyByCode.values())
    .filter((lobby) => lobby.roundState === "waiting" && lobby.playerCount < lobby.maxPlayers)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .map(({ updatedAtMs: _updatedAtMs, ...info }) => info)
);
