import { AMMO_DEFINITIONS, AMMO_TYPES } from "../../../shared/game/ammo";
import type { AmmoType, LobbyInfo, Side } from "../../../shared/game/types";
import type { GameSnapshot, PlayerView } from "../game/viewModel";

type HudCallbacks = {
  hostLobby: (playerName: string) => void;
  practiceBot: (playerName: string) => void;
  joinLobby: (code: string, playerName: string) => void;
  refreshLobbies: () => void;
  selectAmmo: (ammoType: AmmoType) => void;
  setReady: (ready: boolean) => void;
  rematch: () => void;
};

export type HudContext = {
  connected: boolean;
  connecting: boolean;
  status: string;
  localSessionId: string;
  selectedAmmo: AmmoType;
  chargeRatio: number;
  lobbies: LobbyInfo[];
};

const displaySide = (side: Side | ""): string => (
  side === "blue" ? "Blue" : side === "red" ? "Red" : "-"
);

const hpPercent = (player: PlayerView | null): number => (
  player ? Math.max(0, Math.min(100, player.hp)) : 0
);

export class Hud {
  private readonly root: HTMLElement;
  private callbacks: HudCallbacks | null = null;
  private ammoButtonsInitialized = false;
  private lobbyListKey = "";

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = "hud";
    this.root.innerHTML = this.buildMarkup();
    this.bindStaticEvents();
  }

  setCallbacks(callbacks: HudCallbacks): void {
    this.callbacks = callbacks;
  }

  render(snapshot: GameSnapshot, context: HudContext): void {
    const local = snapshot.players.find((player) => player.sessionId === context.localSessionId) ?? null;
    const blue = snapshot.players.find((player) => player.side === "blue") ?? null;
    const red = snapshot.players.find((player) => player.side === "red") ?? null;

    this.root.dataset.roundState = snapshot.roundState;
    this.root.dataset.localX = String(Math.round(local?.x ?? 0));
    this.root.dataset.localY = String(Math.round(local?.y ?? 0));
    this.root.dataset.localGrounded = String(local?.grounded === true);
    this.root.dataset.projectileCount = String(snapshot.projectiles.length);
    this.root.dataset.projectileAmmoTypes = snapshot.projectiles
      .map((projectile) => projectile.ammoType)
      .join(",");
    this.root.dataset.selectedAmmo = context.selectedAmmo;
    this.root.dataset.localLastDistance = String(local?.lastThrowDistance ?? 0);
    this.root.dataset.blueHp = String(blue?.hp ?? 0);
    this.root.dataset.redHp = String(red?.hp ?? 0);

    this.setText("statusText", context.status);
    this.setText("roomCode", snapshot.code || "------");
    this.setText("roundState", snapshot.roundState.toUpperCase());
    this.setText("localSide", displaySide(local?.side ?? ""));
    this.setText("lastDistance", `${local?.lastThrowDistance.toFixed(1) ?? "0.0"} m`);
    this.setText("bestDistance", `${local?.bestThrowDistance.toFixed(1) ?? "0.0"} m`);

    this.setText("blueName", this.playerLabel(blue));
    this.setText("redName", this.playerLabel(red));
    this.setText("blueHpText", `${Math.round(blue?.hp ?? 0)} HP`);
    this.setText("redHpText", `${Math.round(red?.hp ?? 0)} HP`);
    this.setBar("blueHpBar", hpPercent(blue));
    this.setBar("redHpBar", hpPercent(red));

    this.setBar("chargeFill", Math.round(context.chargeRatio * 100));
    this.setText("selectedAmmo", AMMO_DEFINITIONS[context.selectedAmmo].label);

    this.toggle("lobbyPanel", !context.connected);
    this.toggle("waitingPanel", context.connected && snapshot.roundState === "waiting");
    this.toggle("endedPanel", context.connected && snapshot.roundState === "ended");
    this.toggle("activeHud", context.connected);

    this.setText(
      "waitingText",
      snapshot.players.length < 2
        ? "Waiting for an opponent."
        : "Both players must mark ready.",
    );
    this.setText(
      "winnerText",
      snapshot.winnerSide ? `${displaySide(snapshot.winnerSide)} wins` : "Round ended",
    );
    this.setText(
      "rematchText",
      local?.rematchRequested ? "Rematch requested." : "Request a rematch when ready.",
    );

    this.renderAmmoButtons(context.selectedAmmo);
    this.renderLobbyList(context.lobbies);

    const readyButton = this.byId<HTMLButtonElement>("readyButton");
    if (readyButton) {
      readyButton.textContent = local?.ready ? "Ready" : "Mark Ready";
      readyButton.disabled = context.connecting || local?.ready === true || snapshot.players.length < 2;
    }
  }

  private buildMarkup(): string {
    return `
      <section id="lobbyPanel" class="lobby-panel">
        <div class="brand-row">
          <div>
            <h1>Lobbers</h1>
            <p>Olympic artillery for two throwers.</p>
          </div>
          <div class="status-pill" id="statusText">Offline</div>
        </div>
        <div class="lobby-controls">
          <label>
            Name
            <input id="playerNameInput" maxlength="18" autocomplete="off" value="Lobber" />
          </label>
          <div class="button-row">
            <button id="hostButton" type="button">Host Lobby</button>
            <button id="botButton" type="button">Practice Bot</button>
            <button id="refreshButton" type="button">Browse Lobbies</button>
          </div>
          <label>
            Lobby code
            <input id="joinCodeInput" maxlength="8" autocomplete="off" placeholder="ABC123" />
          </label>
          <button id="joinButton" type="button">Join By Code</button>
        </div>
        <div class="lobby-list" id="lobbyList"></div>
      </section>

      <section id="activeHud" class="active-hud">
        <div class="top-strip">
          <div class="player-card blue-side">
            <span id="blueName">Waiting</span>
            <strong id="blueHpText">0 HP</strong>
            <div class="meter"><span id="blueHpBar"></span></div>
          </div>
          <div class="room-chip">
            <span id="roundState">WAITING</span>
            <strong id="roomCode">------</strong>
            <small>Your side: <span id="localSide">-</span></small>
          </div>
          <div class="player-card red-side">
            <span id="redName">Waiting</span>
            <strong id="redHpText">0 HP</strong>
            <div class="meter"><span id="redHpBar"></span></div>
          </div>
        </div>

        <div class="ammo-strip" id="ammoButtons"></div>

        <div class="distance-strip">
          <span>Ammo <strong id="selectedAmmo">Javelin</strong></span>
          <span>Last <strong id="lastDistance">0.0 m</strong></span>
          <span>Best <strong id="bestDistance">0.0 m</strong></span>
        </div>

        <div class="charge-meter">
          <span id="chargeFill"></span>
        </div>
      </section>

      <section id="waitingPanel" class="match-panel">
        <p id="waitingText">Waiting for an opponent.</p>
        <button id="readyButton" type="button">Mark Ready</button>
      </section>

      <section id="endedPanel" class="match-panel">
        <h2 id="winnerText">Round ended</h2>
        <p id="rematchText">Request a rematch when ready.</p>
        <button id="rematchButton" type="button">Rematch</button>
      </section>
    `;
  }

  private bindStaticEvents(): void {
    this.byId("hostButton")?.addEventListener("click", () => {
      this.callbacks?.hostLobby(this.getPlayerName());
    });
    this.byId("botButton")?.addEventListener("click", () => {
      this.callbacks?.practiceBot(this.getPlayerName());
    });
    this.byId("refreshButton")?.addEventListener("click", () => {
      this.callbacks?.refreshLobbies();
    });
    this.byId("joinButton")?.addEventListener("click", () => {
      const code = this.byId<HTMLInputElement>("joinCodeInput")?.value ?? "";
      this.callbacks?.joinLobby(code, this.getPlayerName());
    });
    this.byId("readyButton")?.addEventListener("click", () => {
      this.callbacks?.setReady(true);
    });
    this.byId("rematchButton")?.addEventListener("click", () => {
      this.callbacks?.rematch();
    });
  }

  private renderAmmoButtons(selectedAmmo: AmmoType): void {
    const container = this.byId("ammoButtons");
    if (!container) return;

    if (!this.ammoButtonsInitialized || container.childElementCount !== AMMO_TYPES.length) {
      container.replaceChildren();
      for (const ammoType of AMMO_TYPES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ammo-button";
        button.dataset.ammoType = ammoType;
        button.textContent = AMMO_DEFINITIONS[ammoType].label;
        button.addEventListener("click", () => this.callbacks?.selectAmmo(ammoType));
        container.appendChild(button);
      }
      this.ammoButtonsInitialized = true;
    }

    for (const ammoType of AMMO_TYPES) {
      const button = container.querySelector<HTMLButtonElement>(`button[data-ammo-type="${ammoType}"]`);
      if (!button) continue;
      const selected = ammoType === selectedAmmo;
      button.className = selected ? "ammo-button selected" : "ammo-button";
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  private renderLobbyList(lobbies: LobbyInfo[]): void {
    const container = this.byId("lobbyList");
    if (!container) return;
    const nextKey = lobbies
      .map((lobby) => `${lobby.code}:${lobby.hostName}:${lobby.playerCount}:${lobby.maxPlayers}:${lobby.roundState}`)
      .join("|");
    if (nextKey === this.lobbyListKey) return;
    this.lobbyListKey = nextKey;
    container.replaceChildren();
    if (lobbies.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-list";
      empty.textContent = "No open lobbies yet.";
      container.appendChild(empty);
      return;
    }

    for (const lobby of lobbies) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lobby-row";
      const label = document.createElement("span");
      const code = document.createElement("strong");
      code.textContent = lobby.code;
      label.append(code, ` ${lobby.hostName}`);
      const count = document.createElement("span");
      count.textContent = `${lobby.playerCount}/${lobby.maxPlayers}`;
      button.append(label, count);
      button.addEventListener("click", () => this.callbacks?.joinLobby(lobby.code, this.getPlayerName()));
      container.appendChild(button);
    }
  }

  private getPlayerName(): string {
    const input = this.byId<HTMLInputElement>("playerNameInput");
    return input?.value.trim() || "Lobber";
  }

  private playerLabel(player: PlayerView | null): string {
    if (!player) return "Waiting";
    return player.isBot ? `${player.name} CPU` : player.name;
  }

  private setText(id: string, value: string): void {
    const element = this.byId(id);
    if (element) element.textContent = value;
  }

  private setBar(id: string, percent: number): void {
    const element = this.byId<HTMLElement>(id);
    if (element) element.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  private toggle(id: string, visible: boolean): void {
    const element = this.byId<HTMLElement>(id);
    if (element) element.hidden = !visible;
  }

  private byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.root.querySelector<T>(`#${id}`);
  }
}
