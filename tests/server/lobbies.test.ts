import { describe, expect, it } from "vitest";
import {
  createLobbyCode,
  getLobby,
  listOpenLobbies,
  normalizeLobbyCode,
  removeLobby,
  upsertLobby,
} from "../../server/lobbies";

describe("lobby registry", () => {
  it("normalizes join codes", () => {
    expect(normalizeLobbyCode(" ab-c 123 ")).toBe("ABC123");
  });

  it("lists only open waiting lobbies", () => {
    const code = createLobbyCode();
    upsertLobby({
      roomId: "room-a",
      code,
      hostName: "Host",
      playerCount: 1,
      maxPlayers: 2,
      roundState: "waiting",
    });
    upsertLobby({
      roomId: "room-b",
      code: "FULL01",
      hostName: "Full",
      playerCount: 2,
      maxPlayers: 2,
      roundState: "waiting",
    });
    upsertLobby({
      roomId: "room-c",
      code: "ACTIVE",
      hostName: "Active",
      playerCount: 1,
      maxPlayers: 2,
      roundState: "active",
    });

    const lobbies = listOpenLobbies();
    expect(lobbies.some((lobby) => lobby.code === code)).toBe(true);
    expect(lobbies.some((lobby) => lobby.code === "FULL01")).toBe(false);
    expect(lobbies.some((lobby) => lobby.code === "ACTIVE")).toBe(false);

    removeLobby(code);
    removeLobby("FULL01");
    removeLobby("ACTIVE");
  });

  it("keeps full lobbies discoverable for split locations", () => {
    upsertLobby({
      roomId: "room-full",
      code: "FULL01",
      hostName: "Full",
      playerCount: 2,
      maxPlayers: 2,
      roundState: "waiting",
    });

    expect(getLobby("full-01")).toMatchObject({
      code: "FULL01",
      playerCount: 2,
      maxPlayers: 2,
    });

    removeLobby("FULL01");
  });

});
