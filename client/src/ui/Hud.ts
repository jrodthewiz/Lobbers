import { AMMO_DEFINITIONS, AMMO_TYPES } from "../../../shared/game/ammo";
import type { AmmoType, LobbyInfo, Side } from "../../../shared/game/types";
import spriteAtlasData from "../assets/lobbers-minimal-atlas.json";
import {
  AMMO_UI_FRAMES,
  SPRITES,
  spriteAtlasImageUrl,
} from "../game/spriteAtlas";
import type { GameSnapshot, PlayerView } from "../game/viewModel";

type HudCallbacks = {
  hostLobby: (playerName: string) => void;
  practiceBot: (playerName: string) => void;
  joinLobby: (code: string, playerName: string, source: "input" | "list") => void;
  refreshLobbies: () => void;
  selectAmmo: (ammoType: AmmoType) => void;
  setReady: (ready: boolean) => void;
  rematch: () => void;
  uiFocus: () => void;
  uiHover: () => void;
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

type AtlasFrame = {
  frame: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

type AtlasData = {
  frames: Record<string, AtlasFrame>;
  meta: {
    size: {
      w: number;
      h: number;
    };
  };
};

const ATLAS = spriteAtlasData as AtlasData;

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
    this.applyStaticSprites();
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
    const selectedAmmoIcon = this.byId<HTMLElement>("selectedAmmoIcon");
    if (selectedAmmoIcon) this.applySprite(selectedAmmoIcon, AMMO_UI_FRAMES[context.selectedAmmo]);

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
        <span class="ui-sprite menu-corner-prop menu-corner-prop-left" id="menuLeftProp" aria-hidden="true"></span>
        <span class="ui-sprite menu-corner-prop menu-corner-prop-right" id="menuRightProp" aria-hidden="true"></span>
        <div class="brand-row">
          <div class="title-lockup">
            <span class="ui-sprite brand-mark" id="brandMark" aria-hidden="true"></span>
            <div>
              <h1>Lobbers</h1>
              <p>Wind up, pick an angle, break the record.</p>
            </div>
          </div>
          <div class="status-pill"><span class="ui-sprite pill-icon" id="statusIcon" aria-hidden="true"></span><span id="statusText">Offline</span></div>
        </div>
        <div class="lobby-controls">
          <label>
            Name
            <input id="playerNameInput" maxlength="18" autocomplete="off" value="Lobber" />
          </label>
          <div class="button-row">
            <button id="hostButton" type="button"><span class="ui-sprite button-icon" id="hostButtonIcon" aria-hidden="true"></span><span>Host Lobby</span></button>
            <button id="botButton" type="button"><span class="ui-sprite button-icon" id="botButtonIcon" aria-hidden="true"></span><span>Practice Bot</span></button>
            <button id="refreshButton" type="button"><span class="ui-sprite button-icon" id="refreshButtonIcon" aria-hidden="true"></span><span>Browse Lobbies</span></button>
          </div>
          <label>
            Lobby code
            <input id="joinCodeInput" maxlength="8" autocomplete="off" placeholder="ABC123" />
          </label>
          <button id="joinButton" class="wide-command" type="button"><span class="ui-sprite button-icon" id="joinButtonIcon" aria-hidden="true"></span><span>Join By Code</span></button>
        </div>
        <div class="lobby-list">
          <div class="lobby-list-title">
            <span class="ui-sprite board-icon" id="lobbyListIcon" aria-hidden="true"></span>
            <span>Open Lobbies</span>
          </div>
          <div class="lobby-list-rows" id="lobbyListRows"></div>
        </div>
      </section>

      <section id="activeHud" class="active-hud">
        <div class="top-strip">
          <div class="player-card blue-side">
            <span class="player-name-line"><span class="ui-sprite side-flag" id="blueSideIcon" aria-hidden="true"></span><span id="blueName">Waiting</span></span>
            <strong id="blueHpText">0 HP</strong>
            <div class="meter"><span id="blueHpBar"></span></div>
          </div>
          <div class="room-chip">
            <span id="roundState">WAITING</span>
            <strong id="roomCode">------</strong>
            <small>Your side: <span id="localSide">-</span></small>
          </div>
          <div class="player-card red-side">
            <span class="player-name-line red-name-line"><span id="redName">Waiting</span><span class="ui-sprite side-flag" id="redSideIcon" aria-hidden="true"></span></span>
            <strong id="redHpText">0 HP</strong>
            <div class="meter"><span id="redHpBar"></span></div>
          </div>
        </div>

        <div class="ammo-strip" id="ammoButtons"></div>

        <div class="distance-strip">
          <span><span class="ui-sprite metric-icon" id="selectedAmmoIcon" aria-hidden="true"></span>Ammo <strong id="selectedAmmo">Javelin</strong></span>
          <span><span class="ui-sprite metric-icon" id="lastDistanceIcon" aria-hidden="true"></span>Last <strong id="lastDistance">0.0 m</strong></span>
          <span><span class="ui-sprite metric-icon" id="bestDistanceIcon" aria-hidden="true"></span>Best <strong id="bestDistance">0.0 m</strong></span>
        </div>

        <div class="charge-meter">
          <span id="chargeFill"></span>
        </div>
      </section>

      <section id="waitingPanel" class="match-panel">
        <span class="ui-sprite panel-icon" id="waitingPanelIcon" aria-hidden="true"></span>
        <p id="waitingText">Waiting for an opponent.</p>
        <button id="readyButton" type="button">Mark Ready</button>
      </section>

      <section id="endedPanel" class="match-panel">
        <span class="ui-sprite panel-icon" id="endedPanelIcon" aria-hidden="true"></span>
        <h2 id="winnerText">Round ended</h2>
        <p id="rematchText">Request a rematch when ready.</p>
        <button id="rematchButton" type="button">Rematch</button>
      </section>
    `;
  }

  private bindStaticEvents(): void {
    this.root.addEventListener("pointerover", (event) => {
      const button = this.eventButton(event);
      if (!button || button.disabled || this.isRelatedTargetInside(event, button)) return;
      this.callbacks?.uiHover();
    });
    this.root.addEventListener("focusin", (event) => {
      const button = this.eventButton(event);
      if (!button || button.disabled) return;
      this.callbacks?.uiFocus();
    });
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
      this.callbacks?.joinLobby(code, this.getPlayerName(), "input");
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
      for (const [index, ammoType] of AMMO_TYPES.entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ammo-button";
        button.dataset.ammoType = ammoType;
        button.setAttribute("aria-label", AMMO_DEFINITIONS[ammoType].label);
        button.title = `${AMMO_DEFINITIONS[ammoType].label} (${index + 1})`;
        const icon = document.createElement("span");
        icon.className = "ui-sprite ammo-icon";
        icon.setAttribute("aria-hidden", "true");
        this.applySprite(icon, AMMO_UI_FRAMES[ammoType]);
        const key = document.createElement("span");
        key.className = "ammo-key";
        key.textContent = String(index + 1);
        const label = document.createElement("span");
        label.className = "ammo-name";
        label.textContent = AMMO_DEFINITIONS[ammoType].label;
        button.append(icon, key, label);
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
    const container = this.byId("lobbyListRows");
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
      button.addEventListener("click", () => this.callbacks?.joinLobby(lobby.code, this.getPlayerName(), "list"));
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

  private applyStaticSprites(): void {
    const spriteById: Record<string, string> = {
      brandMark: SPRITES.ui.medalGold,
      statusIcon: SPRITES.fx.sparkBlue,
      hostButtonIcon: SPRITES.props.scoreboard,
      botButtonIcon: SPRITES.ui.targetRed,
      refreshButtonIcon: SPRITES.props.equipmentCrate,
      joinButtonIcon: SPRITES.ui.arrowGold,
      lobbyListIcon: SPRITES.ui.targetBlue,
      menuLeftProp: SPRITES.props.rackJavelin,
      menuRightProp: SPRITES.props.coneStack,
      blueSideIcon: SPRITES.props.flagBlue,
      redSideIcon: SPRITES.props.flagRed,
      selectedAmmoIcon: AMMO_UI_FRAMES.javelin,
      lastDistanceIcon: SPRITES.ui.targetBlue,
      bestDistanceIcon: SPRITES.ui.medalGold,
      waitingPanelIcon: SPRITES.props.pennants,
      endedPanelIcon: SPRITES.fx.confettiBurst,
    };

    for (const [id, frameName] of Object.entries(spriteById)) {
      const element = this.byId(id);
      if (element) this.applySprite(element, frameName);
    }
  }

  private applySprite(element: HTMLElement, frameName: string, scaleOverride?: number): void {
    const atlasFrame = ATLAS.frames[frameName];
    if (!atlasFrame) return;

    const maxSize = this.maxSpriteSize(element);
    const scale = scaleOverride ?? Math.min(1, maxSize.width / atlasFrame.frame.w, maxSize.height / atlasFrame.frame.h);
    const width = Math.max(1, Math.round(atlasFrame.frame.w * scale));
    const height = Math.max(1, Math.round(atlasFrame.frame.h * scale));

    element.style.display = "inline-block";
    element.style.flex = "0 0 auto";
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.backgroundImage = `url("${spriteAtlasImageUrl}")`;
    element.style.backgroundRepeat = "no-repeat";
    element.style.backgroundSize = `${Math.round(ATLAS.meta.size.w * scale)}px ${Math.round(ATLAS.meta.size.h * scale)}px`;
    element.style.backgroundPosition = `${Math.round(-atlasFrame.frame.x * scale)}px ${Math.round(-atlasFrame.frame.y * scale)}px`;
    element.style.verticalAlign = "middle";
  }

  private maxSpriteSize(element: HTMLElement): { width: number; height: number } {
    if (element.classList.contains("brand-mark")) return { width: 54, height: 54 };
    if (element.classList.contains("menu-corner-prop")) return { width: 82, height: 62 };
    if (element.classList.contains("panel-icon")) return { width: 38, height: 30 };
    if (element.classList.contains("button-icon")) return { width: 30, height: 28 };
    if (element.classList.contains("ammo-icon")) return { width: 34, height: 34 };
    if (element.classList.contains("board-icon")) return { width: 30, height: 24 };
    if (element.classList.contains("side-flag")) return { width: 20, height: 26 };
    if (element.classList.contains("metric-icon")) return { width: 18, height: 18 };
    if (element.classList.contains("pill-icon")) return { width: 16, height: 16 };
    return { width: 22, height: 22 };
  }

  private eventButton(event: Event): HTMLButtonElement | null {
    if (!(event.target instanceof Element)) return null;
    const button = event.target.closest("button");
    return button instanceof HTMLButtonElement && this.root.contains(button) ? button : null;
  }

  private isRelatedTargetInside(event: PointerEvent, element: HTMLElement): boolean {
    return event.relatedTarget instanceof Node && element.contains(event.relatedTarget);
  }
}
