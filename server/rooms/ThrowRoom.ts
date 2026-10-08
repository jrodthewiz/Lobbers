import { Client, Room } from "colyseus";
import { ROUND, SIMULATION } from "../../shared/game/constants";
import { CLIENT_MESSAGES } from "../../shared/game/messages";
import { ThrowAuthority, type AuthorityListingFields, type CreateOptions, type JoinOptions } from "../../shared/game/ThrowAuthority";
import { LobbersState } from "../schema/LobbersState";
import { createLobbyCode, removeLobby, upsertLobby } from "../lobbies";

export class ThrowRoom extends Room<LobbersState> {
  override maxClients = ROUND.maxPlayers;
  override state = new LobbersState();
  private readonly authority = new ThrowAuthority({
    state: this.state,
    nowMs: () => Date.now(),
    listingChanged: (fields) => this.syncLobbyMetadata(fields),
  });

  requestJoin(options: JoinOptions, isNewRoom: boolean): boolean {
    return this.authority.requestJoin(options, isNewRoom);
  }

  override onCreate(options: CreateOptions): void {
    this.authority.configure(options, createLobbyCode());
    this.setPatchRate(1000 / SIMULATION.patchHz);
    this.setSimulationInterval(() => this.authority.step(SIMULATION.stepSeconds), 1000 / SIMULATION.tickHz);
    this.registerMessageHandlers();
    this.authority.publishListing();
  }

  override onJoin(client: Client, options: JoinOptions): void {
    this.authority.join(client.sessionId, options);
  }

  override onLeave(client: Client): void {
    this.authority.leave(client.sessionId);
  }

  override onDispose(): void {
    removeLobby(this.state.code);
  }

  private registerMessageHandlers(): void {
    for (const type of Object.values(CLIENT_MESSAGES)) {
      this.onMessage(type, (client, payload: unknown) => {
        this.authority.input(client.sessionId, type, payload);
      });
    }
  }

  private syncLobbyMetadata(fields: AuthorityListingFields): void {
    const { fixtures, ...info } = fields;
    const lobbyInfo = { roomId: this.roomId, ...info };
    const listingFields = { ...lobbyInfo, fixtures };
    upsertLobby(lobbyInfo);
    this.syncLobbyListingFields(listingFields);
    this.setMetadata(listingFields);
  }

  private syncLobbyListingFields(fields: AuthorityListingFields): void {
    if (!this.listing) return;
    Object.assign(this.listing, {
      code: fields.code,
      hostName: fields.hostName,
      playerCount: fields.playerCount,
      maxPlayers: fields.maxPlayers,
      roundState: fields.roundState,
    });
  }
}
