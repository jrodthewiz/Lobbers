import { AMMO_DEFINITIONS, AMMO_TYPES } from "../../../shared/game/ammo";
import { ROUND, WIND } from "../../../shared/game/constants";
import type { AmmoType, LobbyInfo, Side, TurnPhase } from "../../../shared/game/types";
import spriteAtlasData from "../assets/lobbers-minimal-atlas.json";
import {
  AMMO_UI_FRAMES,
  SPRITES,
  spriteAtlasImageUrl,
} from "../game/spriteAtlas";
import type { GameSnapshot, PlayerView } from "../game/viewModel";
import battleClubUrl from "../assets/battle-club.svg";

type HudCallbacks = {
  hostLobby: (playerName: string) => void;
  practiceBot: (playerName: string) => void;
  joinLobby: (code: string, playerName: string, source: "input" | "list") => void;
  refreshLobbies: () => void;
  hostPeer: (origin: string, playerName: string) => void;
  joinPeer: (origin: string, code: string, playerName: string) => void;
  leaveMatch: () => void;
  selectAmmo: (ammoType: AmmoType) => void;
  useAbility: () => void;
  setReady: (ready: boolean) => void;
  rematch: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  zoomIn: () => void;
  toggleOverview: () => void;
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
  cameraMode: "follow" | "overview" | "free";
  cameraZoom: number;
  currentTurnSessionId: string;
  turnPhase: TurnPhase;
  turnRemainingMs: number;
  lobbies: LobbyInfo[];
};

const displaySide = (side: Side | ""): string => (
  side === "blue" ? "Blue" : side === "red" ? "Red" : "-"
);

const hpPercent = (player: PlayerView | null): number => (
  player ? Math.max(0, Math.min(100, player.hp)) : 0
);

type HealthState = "waiting" | "healthy" | "low" | "critical" | "down";

const healthState = (player: PlayerView | null): HealthState => {
  if (!player) return "waiting";
  if (player.hp <= 0) return "down";
  if (player.hp <= 20) return "critical";
  if (player.hp <= 45) return "low";
  return "healthy";
};

type ChargeState = "idle" | "building" | "primed" | "full";

const chargeState = (ratio: number): ChargeState => {
  if (ratio <= 0.01) return "idle";
  if (ratio >= 0.98) return "full";
  if (ratio >= 0.62) return "primed";
  return "building";
};

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

type PickupToastKind = "armor" | "repair" | "ammo" | "dash" | "full" | "default";

const resolvePickupToastKind = (text: string): PickupToastKind => {
  const normalized = text.toLowerCase();
  if (normalized.includes("armor")) return "armor";
  if (normalized.includes("repair")) return "repair";
  if (normalized.includes("dash")) return "dash";
  if (normalized.includes("full")) return "full";
  if (normalized.includes("+1")) return "ammo";
  return "default";
};

const pickupToastGlyph = (kind: PickupToastKind): string => {
  if (kind === "armor") return "SH";
  if (kind === "repair") return "HP";
  if (kind === "ammo") return "+1";
  if (kind === "dash") return ">>";
  if (kind === "full") return "MAX";
  return "+";
};

export class Hud {
  private readonly root: HTMLElement;
  private callbacks: HudCallbacks | null = null;
  private ammoButtonsInitialized = false;
  private lobbyListKey = "";
  private lastPickupSeq = 0;
  private pickupToastTimeout: number | null = null;
  private lastRoundState: GameSnapshot["roundState"] | null = null;
  private lastCountdownToastSecond: number | null = null;
  private eventToastTimeout: number | null = null;
  private turnEventKey = "";
  private lastEnemyHp: number | null = null;
  private matchDamage = 0;
  private matchShots = 0;
  private initialThrowSeq = 0;
  private previousLocalThrowSeq = 0;
  private previousEnemyThrowSeq = 0;
  private lastShotWasLocal = false;
  private matchLongest = 0;
  private helpOpen = false;

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
    const localLaneIndex = local?.laneIndex ?? 0;
    const lanePlayers = snapshot.players.filter((player) => player.laneIndex === localLaneIndex);
    const blue = lanePlayers.find((player) => player.side === "blue") ?? null;
    const red = lanePlayers.find((player) => player.side === "red") ?? null;
    const paired = lanePlayers.some((player) => player.side === "blue") && lanePlayers.some((player) => player.side === "red");
    this.root.dataset.connected = String(context.connected);
    this.updateClubFeedback(snapshot, context, local);

    this.root.dataset.roundState = snapshot.roundState;
    this.root.dataset.localX = String(Math.round(local?.x ?? 0));
    this.root.dataset.localY = String(Math.round(local?.y ?? 0));
    this.root.dataset.localGrounded = String(local?.grounded === true);
    this.root.dataset.projectileCount = String(snapshot.projectiles.length);
    this.root.dataset.projectileAmmoTypes = snapshot.projectiles
      .map((projectile) => projectile.ammoType)
      .join(",");
    this.root.dataset.selectedAmmo = context.selectedAmmo;
    this.root.dataset.pickupCount = String(snapshot.pickups.filter((pickup) => pickup.active).length);
    this.root.dataset.worldPropCount = String(snapshot.worldProps.filter((prop) => prop.active).length);
    this.root.dataset.localShield = String(local?.shieldHp ?? 0);
    this.root.dataset.dashReady = String(local !== null && local.dashCooldownRemainingMs <= 0 && snapshot.roundState === "active");
    const dashCooldownProgress = local
      ? 1 - Math.min(1, Math.max(0, local.dashCooldownRemainingMs / Math.max(1, local.dashCooldownMs)))
      : 0;
    this.root.dataset.dashCooldownProgress = String(Math.round(dashCooldownProgress * 100));
    this.root.dataset.localPickupSeq = String(local?.pickupSeq ?? 0);
    this.root.dataset.localLastDistance = String(local?.lastThrowDistance ?? 0);
    this.root.dataset.windAccelerationX = String(Math.round(snapshot.windAccelerationX));
    this.root.dataset.chargeRatio = String(Math.round(context.chargeRatio * 100));
    const currentChargeState = chargeState(context.chargeRatio);
    this.root.dataset.chargeState = currentChargeState;
    this.root.dataset.blueHp = String(blue?.hp ?? 0);
    this.root.dataset.redHp = String(red?.hp ?? 0);
    const blueHealthState = healthState(blue);
    const redHealthState = healthState(red);
    this.root.dataset.blueHealthState = blueHealthState;
    this.root.dataset.redHealthState = redHealthState;
    this.root.dataset.cameraMode = context.cameraMode;
    this.root.dataset.cameraZoom = String(context.cameraZoom);
    this.root.dataset.currentTurnSessionId = context.currentTurnSessionId;
    this.root.dataset.turnPhase = context.turnPhase;
    this.root.dataset.localTurn = String(local !== null && context.currentTurnSessionId === local.sessionId);
    this.root.dataset.turnRemainingMs = String(Math.max(0, Math.round(context.turnRemainingMs)));

    this.setText("statusText", context.status);
    this.setText("connectionStatusText", context.status);
    this.setText("roomCode", snapshot.code || "------");
    this.setText("roundState", this.roundLabel(snapshot, context, local));
    this.setRoomChipState(snapshot.roundState);
    this.setText("localSide", local ? `${displaySide(local.side)} L${local.laneIndex + 1}` : "-");
    this.setText("lastDistance", `${local?.lastThrowDistance.toFixed(1) ?? "0.0"} m`);
    this.setText("bestDistance", `${local?.bestThrowDistance.toFixed(1) ?? "0.0"} m`);

    this.setText("blueName", this.playerLabel(blue));
    this.setText("redName", this.playerLabel(red));
    this.setText("blueHpText", `${Math.round(blue?.hp ?? 0)} HP`);
    this.setText("redHpText", `${Math.round(red?.hp ?? 0)} HP`);
    this.setBar("blueHpBar", hpPercent(blue));
    this.setBar("redHpBar", hpPercent(red));
    this.setPlayerCardState("bluePlayerCard", blueHealthState);
    this.setPlayerCardState("redPlayerCard", redHealthState);
    this.setPlayerPortrait("blueTankPortrait", "blue", blue);
    this.setPlayerPortrait("redTankPortrait", "red", red);

    this.setBar("chargeFill", Math.round(context.chargeRatio * 100));
    this.setChargeMeterState(currentChargeState);
    this.setText("selectedAmmo", AMMO_DEFINITIONS[context.selectedAmmo].label);
    this.setText("ammoRole", this.ammoRole(context.selectedAmmo));
    this.setText("weaponHint", this.weaponHint(context.selectedAmmo));
    this.setText("ammoImpact", String(this.ammoImpact(context.selectedAmmo)));
    this.setText("ammoBlast", this.ammoBlast(context.selectedAmmo));
    this.setText("ammoArc", this.ammoArc(context.selectedAmmo));
    this.setText("windValue", this.windLabel(snapshot.windAccelerationX, local?.side ?? ""));
    this.setText("cameraModeLabel", context.cameraMode === "overview" ? "Map" : context.cameraMode === "free" ? "Free" : "Follow");
    this.setText("cameraZoomLabel", `${Math.round(context.cameraZoom * 100)}%`);
    this.setText("shieldValue", String(Math.round(local?.shieldHp ?? 0)));
    this.setBar("shieldFill", ((local?.shieldHp ?? 0) / Math.max(1, local?.shieldMaxHp ?? 1)) * 100);
    const dashReady = local !== null && local.dashCooldownRemainingMs <= 0 && snapshot.roundState === "active"
      && context.currentTurnSessionId === local.sessionId && context.turnPhase === "move";
    this.root.dataset.dashReady = String(dashReady);
    const dashButton = this.byId<HTMLButtonElement>("dashButton");
    if (dashButton) {
      dashButton.disabled = !dashReady;
      dashButton.dataset.ready = String(dashReady);
      dashButton.dataset.cooldownProgress = String(Math.round(dashCooldownProgress * 100));
      dashButton.style.setProperty("--dash-progress", `${dashCooldownProgress * 100}%`);
    }
    this.setText("dashCooldown", dashReady ? "Ready" : local && local.dashCooldownRemainingMs <= 0 ? "Move turn" : `${Math.ceil((local?.dashCooldownRemainingMs ?? 0) / 1000)}s`);
    if (local && local.pickupSeq > this.lastPickupSeq) {
      this.lastPickupSeq = local.pickupSeq;
      this.showPickupToast(local.lastPickupLabel || "Pickup secured");
    }
    const selectedAmmoIcon = this.byId<HTMLElement>("selectedAmmoIcon");
    if (selectedAmmoIcon) this.applySprite(selectedAmmoIcon, AMMO_UI_FRAMES[context.selectedAmmo]);

    this.toggle("lobbyPanel", !context.connected);
    this.toggle("waitingPanel", context.connected && snapshot.roundState === "waiting");
    this.toggle("endedPanel", context.connected && snapshot.roundState === "ended");
    this.toggle("activeHud", context.connected);
    this.updateRoundEventToast(snapshot, local, context.connected);

    this.setText(
      "waitingText",
      !paired
        ? "Waiting for an opposing player."
        : "All players must mark ready.",
    );
    this.setText(
      "winnerText",
      snapshot.winnerSide && local
        ? snapshot.winnerSide === local.side ? "The yard is yours." : "A grudge for next time."
        : "Round ended",
    );
    this.setText(
      "rematchText",
      local?.rematchRequested ? "Rematch requested. Your rival gets the next word." : "Shake it off. Settle it again.",
    );

    this.renderAmmoButtons(context.selectedAmmo, local?.ammoCounts);
    this.renderLobbyList(context.lobbies);
    for (const id of ["hostButton", "botButton", "joinButton", "refreshButton", "peerHostButton", "peerJoinButton"]) {
      const button = this.byId<HTMLButtonElement>(id);
      if (button) button.disabled = context.connecting;
    }

    this.toggle("cancelConnectionButton", context.connecting);

    const readyButton = this.byId<HTMLButtonElement>("readyButton");
    if (readyButton) {
      this.setText("readyButtonLabel", local?.ready ? "Ready" : "Mark Ready");
      readyButton.disabled = context.connecting || local?.ready === true || !paired;
    }
  }

  private buildMarkup(): string {
    return `
      <section id="lobbyPanel" class="lobby-panel">
        <header class="club-header"><span class="club-wordmark">L / B</span><span>THE BACKYARD BATTLE CLUB</span><span class="club-edition">SMALL TANKS. BIG FEELINGS.</span></header>
        <div class="club-poster">
          <span class="club-eyebrow">A FRIENDLY GAME OF UNFRIENDLY PHYSICS</span>
          <h1>LOB<span>B</span>ERS<span class="title-period">.</span></h1>
          <p class="club-tagline">Make a little <em>mayhem.</em></p>
          <img class="club-illustration" src="${battleClubUrl}" alt="Two cheeky worm pilots duel in toy tanks under a golden sun." />
          <div class="club-sticker">GOOD AIM.<br/>BAD INTENTIONS.<span>★</span></div>
          <p class="club-caption">Pick your perch. Read the wind. Send something ridiculous.</p>
        </div>
        <div class="club-entry">
          <div class="entry-kicker"><span>YOUR INVITATION TO CHAOS</span><span>↗</span></div>
          <h2>Come out<br/> and play.</h2>
          <p>One backyard. Two rivals.<br/>Absolutely no hard feelings. Probably.</p>
          <label for="playerNameInput">WHAT SHOULD WE CALL YOU?</label>
          <input id="playerNameInput" maxlength="18" autocomplete="nickname" value="Lobber" />
          <button id="botButton" class="club-primary" aria-label="Practice Bot" type="button"><span>LET’S LOB</span><span>↗</span></button>
          <span class="entry-note">Jump into a match against the practice bot</span>
          <div class="club-divider"><span>OR SETTLE IT WITH FRIENDS</span></div>
          <div class="club-friend-actions"><button id="hostButton" type="button">Host Lobby</button><button id="refreshButton" type="button">Browse Lobbies</button></div>
          <div class="club-join"><input id="joinCodeInput" aria-label="Lobby code" maxlength="8" autocomplete="off" placeholder="FRIEND’S CODE"/><button id="joinButton" aria-label="Join By Code" type="button">Join →</button></div>
          <details class="club-lobbies"><summary>Open backyards</summary><div class="lobby-list-rows" id="lobbyListRows"></div></details>
          <details class="club-lobbies">
            <summary>Direct match with a friend</summary>
            <label for="peerOriginInput">INVITATION SERVER</label>
            <input id="peerOriginInput" type="url" autocomplete="off" placeholder="Your invitation server origin" />
            <div class="club-friend-actions"><button id="peerHostButton" type="button">Host peer</button></div>
            <div class="club-join"><input id="peerCodeInput" aria-label="Peer invitation" maxlength="6" autocomplete="off" placeholder="PEER INVITE"/><button id="peerJoinButton" type="button">Join peer →</button></div>
          </details>
          <button id="cancelConnectionButton" type="button" hidden>Cancel connection</button>
          <div class="club-status"><span class="status-dot"></span><span id="statusText" role="status">Ready</span></div>
        </div>
        <footer class="club-footer"><span>01 / MOVE &amp; FIND YOUR ANGLE</span><span>02 / HOLD TO CHARGE</span><span>03 / RELEASE THE NONSENSE</span><button id="menuHelpButton" type="button">How to play ↗</button></footer>
      </section>

      <section id="activeHud" class="active-hud">
        <div class="club-match-tools"><button id="helpButton" type="button" aria-label="How to play">?</button><button id="leaveButton" type="button">Leave match</button><span id="connectionStatusText" role="status"></span></div>
        <div class="active-side-props active-side-props-left" aria-hidden="true">
          <span class="ui-sprite field-banner" id="blueFieldFlag"></span>
          <span class="ui-sprite field-crate" id="leftFieldCrate"></span>
        </div>

        <div class="turn-ticket" id="turnTicket"><div class="turn-clock" id="turnClock">7</div><div><strong id="turnHeadline">Find your perch</strong><span id="turnInstruction">A / D to move · Space to hop · Shift to dash</span></div><span id="turnCount">TURN 01</span><div class="turn-track"><span id="turnFill"></span></div></div>
        <div class="active-side-props active-side-props-right" aria-hidden="true">
          <span class="ui-sprite field-banner" id="redFieldFlag"></span>
          <span class="ui-sprite field-crate" id="rightFieldCrate"></span>
        </div>
        <div class="top-strip">
          <div id="bluePlayerCard" class="player-card blue-side">
            <span class="ui-sprite player-card-badge blue-card-badge" id="blueCardBadge" aria-hidden="true"></span>
            <span class="ui-sprite tank-portrait blue-tank-portrait" id="blueTankPortrait" aria-hidden="true"></span>
            <div class="player-card-content">
              <span class="player-name-line"><span class="ui-sprite side-flag" id="blueSideIcon" aria-hidden="true"></span><span id="blueName">Waiting</span></span>
              <strong id="blueHpText">0 HP</strong>
              <div class="meter"><span id="blueHpBar"></span></div>
            </div>
          </div>
          <div id="roomChip" class="room-chip">
            <span class="ui-sprite room-scoreboard" id="roomScoreboard" aria-hidden="true"></span>
            <span class="room-state-line"><span class="ui-sprite chip-icon" id="roundStateIcon" aria-hidden="true"></span><span id="roundState">WAITING</span></span>
            <strong id="roomCode">------</strong>
            <small>Your side: <span id="localSide">-</span></small>
          </div>
          <div id="redPlayerCard" class="player-card red-side">
            <span class="ui-sprite player-card-badge red-card-badge" id="redCardBadge" aria-hidden="true"></span>
            <span class="ui-sprite tank-portrait red-tank-portrait" id="redTankPortrait" aria-hidden="true"></span>
            <div class="player-card-content">
              <span class="player-name-line red-name-line"><span id="redName">Waiting</span><span class="ui-sprite side-flag" id="redSideIcon" aria-hidden="true"></span></span>
              <strong id="redHpText">0 HP</strong>
              <div class="meter"><span id="redHpBar"></span></div>
            </div>
          </div>
        </div>

        <div class="bottom-hud">
          <div class="ammo-loadout">
            <span class="ui-sprite ammo-prop ammo-prop-left" id="ammoRackLeft" aria-hidden="true"></span>
            <div class="ammo-strip" id="ammoButtons" role="toolbar" aria-label="Weapons"></div>
            <span class="ui-sprite ammo-prop ammo-prop-right" id="ammoRackRight" aria-hidden="true"></span>
          </div>

          <div class="distance-strip">
            <span class="weapon-hint" id="weaponHint">A fast, precise shot. Aim straight and keep it sharp.</span>
            <span><span class="ui-sprite metric-icon" id="selectedAmmoIcon" aria-hidden="true"></span>Ammo <strong id="selectedAmmo">Javelin</strong></span>
            <span class="ammo-telemetry-role"><span class="ui-sprite metric-icon" id="ammoRoleIcon" aria-hidden="true"></span>Role <strong id="ammoRole">Pierce</strong></span>
            <span><span class="ui-sprite metric-icon" id="ammoImpactIcon" aria-hidden="true"></span>Hit <strong id="ammoImpact">24</strong></span>
            <span><span class="ui-sprite metric-icon" id="ammoBlastIcon" aria-hidden="true"></span>Blast <strong id="ammoBlast">32px</strong></span>
            <span><span class="ui-sprite metric-icon" id="ammoArcIcon" aria-hidden="true"></span>Arc <strong id="ammoArc">Fast</strong></span>
            <span class="wind-telemetry"><span class="ui-sprite metric-icon" id="windIcon" aria-hidden="true"></span>Wind <strong id="windValue">Calm</strong></span>
            <span><span class="ui-sprite metric-icon" id="lastDistanceIcon" aria-hidden="true"></span>Last <strong id="lastDistance">0.0 m</strong></span>
            <span><span class="ui-sprite metric-icon" id="bestDistanceIcon" aria-hidden="true"></span>Best <strong id="bestDistance">0.0 m</strong></span>
          </div>

          <div class="camera-controls" aria-label="Camera controls">
            <button id="zoomOutButton" class="camera-button" type="button" aria-label="Zoom out" title="Zoom out (- / wheel down)">-</button>
            <button id="overviewButton" class="camera-button camera-mode-button" type="button" aria-label="Toggle overview" title="Overview (Z), free camera (F or right/middle drag)">
              <span id="cameraModeLabel">Follow</span>
              <strong id="cameraZoomLabel">100%</strong>
            </button>
            <button id="zoomInButton" class="camera-button" type="button" aria-label="Zoom in" title="Zoom in (+ / wheel up)">+</button>
            <button id="zoomResetButton" class="camera-button" type="button" aria-label="Reset zoom" title="Reset zoom (0)">0</button>
          </div>

          <div class="ability-cluster">
            <button id="dashButton" class="dash-button" type="button" aria-label="Dash" aria-keyshortcuts="Shift">
              <span class="dash-glyph" aria-hidden="true"><span>Shift</span></span>
              <span>Dash</span>
              <small id="dashCooldown">Ready</small>
            </button>
            <div class="shield-chip" aria-label="Shield">
              <span>Shield</span>
              <strong id="shieldValue">0</strong>
              <span class="shield-meter"><span id="shieldFill"></span></span>
            </div>
          </div>
          <div id="pickupToast" class="pickup-toast" role="status" aria-live="polite" hidden></div>
          <div id="roundEventToast" class="round-event-toast" role="status" aria-live="polite" hidden></div>

          <div id="chargeMeter" class="charge-meter">
            <span class="ui-sprite charge-icon charge-icon-left" id="chargeLeftIcon" aria-hidden="true"></span>
            <span id="chargeFill"></span>
            <span class="ui-sprite charge-icon charge-icon-right" id="chargeRightIcon" aria-hidden="true"></span>
          </div>
        </div>
      </section>

      <section id="waitingPanel" class="match-panel">
        <span class="ui-sprite popup-corner popup-corner-left" id="waitingCornerLeft" aria-hidden="true"></span>
        <span class="ui-sprite popup-corner popup-corner-right" id="waitingCornerRight" aria-hidden="true"></span>
        <span class="ui-sprite panel-icon" id="waitingPanelIcon" aria-hidden="true"></span>
        <span class="panel-eyebrow">THE BACKYARD IS YOURS</span>
        <h2>A little rivalry<br/>looks good on you.</h2>
        <p id="waitingText">Waiting for an opponent.</p>
        <p class="ready-tip">Move first. Then aim, hold to charge, and release to lob.<br/>Reduce your rival to 0 HP to win.</p>
        <button id="readyButton" class="panel-command" type="button"><span class="ui-sprite button-icon" id="readyButtonIcon" aria-hidden="true"></span><span id="readyButtonLabel">Mark Ready</span></button>
      </section>

      <section id="endedPanel" class="match-panel">
        <span class="ui-sprite popup-corner popup-corner-left" id="endedCornerLeft" aria-hidden="true"></span>
        <span class="ui-sprite popup-corner popup-corner-right" id="endedCornerRight" aria-hidden="true"></span>
        <span class="ui-sprite panel-icon" id="endedPanelIcon" aria-hidden="true"></span>
        <h2 id="winnerText">Round ended</h2>
        <p id="rematchText">Request a rematch when ready.</p>
        <div class="match-recap"><div><strong id="recapDamage">0</strong><span>DAMAGE DEALT</span></div><div><strong id="recapShots">0</strong><span>SHOTS LOBBED</span></div><div><strong id="recapBest">0 m</strong><span>LONGEST LOB</span></div></div>
        <button id="rematchButton" class="panel-command" type="button"><span class="ui-sprite button-icon" id="rematchButtonIcon" aria-hidden="true"></span><span>Rematch</span></button>
      </section>
      <section id="clubHelp" class="club-help" role="dialog" aria-modal="true" aria-label="How to play" hidden>
        <button id="closeHelpButton" class="help-close" type="button" aria-label="Close help">×</button>
        <span class="panel-eyebrow">THE EXTREMELY UNOFFICIAL RULEBOOK</span><h2>Aim high.<br/>Play dirty.</h2>
        <div class="help-step"><b>01</b><div><strong>Find a better perch.</strong><p>You get 6.5 seconds to move. A / D or arrow keys move, Space jumps, and Shift dashes. Grab supplies along the way.</p></div></div>
        <div class="help-step"><b>02</b><div><strong>Make your shot count.</strong><p>Then you get 7 seconds to fire. Aim with your mouse, hold the left button to build power, and release. The dotted arc helps you line it up. Esc cancels a charge.</p></div></div>
        <div class="help-step"><b>03</b><div><strong>Pick your flavor of trouble.</strong><p>Keys 1–8 choose weapons. Q / E cycle available ones. Some weapons need a pickup. Wind bends your shot; the last tank standing wins.</p></div></div>
        <p class="help-camera">Scroll to zoom · Z for the map · F for free camera · 0 resets zoom<br/>Best played with a keyboard and mouse.</p>
      </section>
    `;
  }

  private weaponHint(ammo: AmmoType): string {
    const hints: Record<AmmoType, string> = {
      javelin: "Javelin · Fast and precise. Keep your angle low.",
      shotput: "Shotput · A heavy hitter. Lob high for a bigger splash.",
      splitter: "Splitter · Splits in flight. Spread a little trouble.",
      discus: "Discus · A flatter arc. Keep it low and watch the wind.",
      mortar: "Mortar · Go high. Rain down the consequences.",
      needle: "Needle · Small target, sharp point. Precision pays.",
      cluster: "Cluster · One shot, a whole lot of chaos.",
      anvil: "Anvil · Subtle? Never heard of it. Drop it from above.",
    };
    return hints[ammo];
  }

  private updateClubFeedback(snapshot: GameSnapshot, context: HudContext, local: PlayerView | null): void {
    const isLocal = local !== null && context.currentTurnSessionId === local.sessionId;
    const active = context.connected && snapshot.roundState === "active";
    const enemy = local ? snapshot.players.find((p) => p.laneIndex === local.laneIndex && p.side !== local.side) : undefined;
    if (!active && snapshot.roundState !== "ended") {
      this.matchDamage = 0;
      this.matchShots = 0;
      this.initialThrowSeq = local?.throwSeq ?? 0;
      this.previousLocalThrowSeq = local?.throwSeq ?? 0;
      this.previousEnemyThrowSeq = enemy?.throwSeq ?? 0;
      this.lastShotWasLocal = false;
      this.matchLongest = 0;
      this.lastEnemyHp = enemy?.hp ?? null;
      this.turnEventKey = "";
    }
    if ((active || snapshot.roundState === "ended") && local) {
      this.matchShots = Math.max(0, local.throwSeq - this.initialThrowSeq);
      if (local.throwSeq > this.previousLocalThrowSeq) this.lastShotWasLocal = true;
      if (enemy && enemy.throwSeq > this.previousEnemyThrowSeq) this.lastShotWasLocal = false;
      this.previousLocalThrowSeq = local.throwSeq;
      this.previousEnemyThrowSeq = enemy?.throwSeq ?? 0;
      this.matchLongest = Math.max(this.matchLongest, local.lastThrowDistance);
      if (this.lastShotWasLocal && enemy && this.lastEnemyHp !== null && enemy.hp < this.lastEnemyHp) {
        const damage = Math.round(this.lastEnemyHp - enemy.hp);
        this.matchDamage += damage;
        this.showRoundEventToast(`${damage >= 30 ? "BIG OOF!" : "NICE LOB!"} −${damage} HP`);
      }
    }
    if (enemy) this.lastEnemyHp = enemy.hp;
    this.setText("recapDamage", String(this.matchDamage));
    this.setText("recapShots", String(this.matchShots));
    this.setText("recapBest", `${this.matchLongest.toFixed(1)} m`);
    this.toggle("turnTicket", active);
    const phase = context.turnPhase;
    const title = phase === "resolving" ? "Let it fly." : !isLocal ? "Your rival’s cooking…" : phase === "move" ? "Find your perch." : "Make some mayhem.";
    const instruction = phase === "resolving" ? "Watch your lob land. That’s the good bit." : !isLocal ? "Watch the wind. Plan your next move." : phase === "move" ? "A / D move · Space hop · Shift dash" : "Aim with mouse · Hold to charge · Release to lob";
    this.setText("turnHeadline", title);
    this.setText("turnInstruction", instruction);
    this.setText("turnClock", phase === "resolving" ? "↗" : String(Math.max(0, Math.ceil(context.turnRemainingMs / 1000))));
    this.setText("turnCount", `TURN ${String(snapshot.turnNumber).padStart(2, "0")}`);
    this.setBar("turnFill", context.turnRemainingMs / (phase === "move" ? ROUND.turnMoveMs : phase === "fire" ? ROUND.turnFireMs : ROUND.turnResolveMaxMs) * 100);
    const ticket = this.byId("turnTicket");
    if (ticket) ticket.dataset.urgent = String(isLocal && phase !== "resolving" && context.turnRemainingMs < 2000);
    const eventKey = `${snapshot.turnNumber}:${phase}`;
    if (active && eventKey !== this.turnEventKey) {
      if (isLocal && phase === "fire") this.showRoundEventToast("YOUR SHOT. MAKE IT COUNT.");
      this.turnEventKey = eventKey;
    }
  }

  private roundLabel(snapshot: GameSnapshot, context: HudContext, local: PlayerView | null): string {
    if (snapshot.roundState !== "active") return snapshot.roundState.toUpperCase();
    const isLocalTurn = Boolean(local && context.currentTurnSessionId === local.sessionId);
    if (context.turnPhase === "move") return isLocalTurn ? "YOUR MOVE" : "MOVE";
    if (context.turnPhase === "fire") return isLocalTurn ? "YOUR SHOT" : "AIM";
    return "RESOLVE";
  }

  private bindStaticEvents(): void {
    for (const id of ["helpButton", "menuHelpButton"]) this.byId(id)?.addEventListener("click", () => this.setHelpOpen(true));
    this.byId("closeHelpButton")?.addEventListener("click", () => this.setHelpOpen(false));
    this.byId("leaveButton")?.addEventListener("click", () => this.callbacks?.leaveMatch());
    this.byId("joinCodeInput")?.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") this.byId("joinButton")?.click();
    });
    window.addEventListener("keydown", (event) => {
      if (!this.helpOpen) return;
      if (event.key === "Escape") { this.setHelpOpen(false); event.preventDefault(); }
      else if (event.key === "Tab") {
        event.preventDefault();
        this.byId("closeHelpButton")?.focus();
      }
      event.stopImmediatePropagation();
    }, { capture: true });
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
    this.byId("peerHostButton")?.addEventListener("click", () => {
      this.callbacks?.hostPeer(this.byId<HTMLInputElement>("peerOriginInput")?.value ?? "", this.getPlayerName());
    });
    this.byId("peerJoinButton")?.addEventListener("click", () => {
      this.callbacks?.joinPeer(this.byId<HTMLInputElement>("peerOriginInput")?.value ?? "", this.byId<HTMLInputElement>("peerCodeInput")?.value ?? "", this.getPlayerName());
    });
    this.byId("peerCodeInput")?.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") this.byId("peerJoinButton")?.click();
    });
    this.byId("cancelConnectionButton")?.addEventListener("click", () => this.callbacks?.leaveMatch());
    this.byId("hostButton")?.addEventListener("click", () => {
      this.callbacks?.hostLobby(this.getPlayerName());
    });
    this.byId("botButton")?.addEventListener("click", () => {
      this.callbacks?.practiceBot(this.getPlayerName());
    });
    this.byId("refreshButton")?.addEventListener("click", () => {
      this.callbacks?.refreshLobbies();
    });
    this.byId("dashButton")?.addEventListener("click", () => {
      this.callbacks?.useAbility();
    });
    this.byId("zoomOutButton")?.addEventListener("click", () => {
      this.callbacks?.zoomOut();
    });
    this.byId("zoomResetButton")?.addEventListener("click", () => {
      this.callbacks?.resetZoom();
    });
    this.byId("zoomInButton")?.addEventListener("click", () => {
      this.callbacks?.zoomIn();
    });
    this.byId("overviewButton")?.addEventListener("click", () => {
      this.callbacks?.toggleOverview();
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

  private renderAmmoButtons(selectedAmmo: AmmoType, ammoCounts: Record<AmmoType, number> | undefined): void {
    const container = this.byId("ammoButtons");
    if (!container) return;

    if (!this.ammoButtonsInitialized || container.childElementCount !== AMMO_TYPES.length) {
      container.replaceChildren();
      for (const [index, ammoType] of AMMO_TYPES.entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ammo-button";
        button.dataset.ammoType = ammoType;
        button.dataset.ammoIndex = String(index + 1);
        button.setAttribute("aria-label", AMMO_DEFINITIONS[ammoType].label);
        button.setAttribute("aria-keyshortcuts", String(index + 1));
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
        const badge = document.createElement("span");
        badge.className = "ammo-badge";
        badge.textContent = "";
        button.append(icon, key, label, badge);
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
      const count = ammoCounts?.[ammoType] ?? -1;
      const limited = count >= 0;
      const locked = limited && count <= 0;
      button.dataset.empty = String(locked);
      button.dataset.locked = String(locked);
      button.disabled = locked;
      button.title = locked
        ? `${AMMO_DEFINITIONS[ammoType].label} - find a weapon pickup`
        : `${AMMO_DEFINITIONS[ammoType].label}${limited ? ` (${count})` : " (unlimited)"}`;
      const badge = button.querySelector<HTMLElement>(".ammo-badge");
      if (badge) {
        badge.textContent = locked ? "Find" : limited ? String(count) : "Inf";
      }
      button.setAttribute(
        "aria-label",
        locked
          ? `${AMMO_DEFINITIONS[ammoType].label}, locked until pickup`
          : `${AMMO_DEFINITIONS[ammoType].label}${limited ? `, ${count} shots` : ", unlimited"}`,
      );
    }
  }

  private setHelpOpen(open: boolean): void {
    this.helpOpen = open;
    this.toggle("clubHelp", open);
    this.root.dataset.helpOpen = String(open);
    if (open) this.byId("closeHelpButton")?.focus();
    else this.byId(this.root.dataset.connected === "true" ? "helpButton" : "menuHelpButton")?.focus();
  }

  private showPickupToast(text: string): void {
    const toast = this.byId<HTMLElement>("pickupToast");
    if (!toast) return;
    const kind = resolvePickupToastKind(text);
    toast.dataset.pickupKind = kind;
    toast.replaceChildren();
    const glyph = document.createElement("span");
    glyph.className = "pickup-toast-glyph";
    glyph.textContent = pickupToastGlyph(kind);
    const label = document.createElement("span");
    label.textContent = text;
    toast.append(glyph, label);
    toast.hidden = false;
    toast.classList.remove("is-visible");
    void toast.offsetWidth;
    toast.classList.add("is-visible");
    if (this.pickupToastTimeout !== null) window.clearTimeout(this.pickupToastTimeout);
    this.pickupToastTimeout = window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove("is-visible");
    }, 1400);
  }

  private updateRoundEventToast(snapshot: GameSnapshot, local: PlayerView | null, connected: boolean): void {
    if (!connected) {
      this.lastRoundState = null;
      this.lastCountdownToastSecond = null;
      return;
    }
    if (snapshot.roundState === "countdown") {
      const remainingMs = Math.max(0, snapshot.countdownEndsAtMs - Date.now());
      const remainingSecond = Math.max(1, Math.ceil(remainingMs / 1000));
      if (this.lastRoundState !== "countdown" || this.lastCountdownToastSecond !== remainingSecond) {
        this.showRoundEventToast(`Throw in ${remainingSecond}`);
      }
      this.lastRoundState = "countdown";
      this.lastCountdownToastSecond = remainingSecond;
      return;
    }
    this.lastCountdownToastSecond = null;
    if (this.lastRoundState === snapshot.roundState) return;
    this.lastRoundState = snapshot.roundState;
    if (snapshot.roundState === "waiting") return;

    if (snapshot.roundState === "active") {
      this.showRoundEventToast("Round live");
    } else if (snapshot.roundState === "ended") {
      const result = snapshot.winnerSide && local
        ? (snapshot.winnerSide === local.side ? "Victory" : "Defeat")
        : "Round complete";
      this.showRoundEventToast(result);
    }
  }

  private showRoundEventToast(text: string): void {
    const toast = this.byId<HTMLElement>("roundEventToast");
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    toast.classList.remove("is-visible");
    void toast.offsetWidth;
    toast.classList.add("is-visible");
    if (this.eventToastTimeout !== null) window.clearTimeout(this.eventToastTimeout);
    this.eventToastTimeout = window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove("is-visible");
    }, 1700);
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
      const emptyIcon = document.createElement("span");
      emptyIcon.className = "ui-sprite empty-list-icon";
      emptyIcon.setAttribute("aria-hidden", "true");
      this.applySprite(emptyIcon, SPRITES.ui.warningGenerated);
      const emptyText = document.createElement("span");
      emptyText.textContent = "No open lobbies yet.";
      empty.append(emptyIcon, emptyText);
      container.appendChild(empty);
      return;
    }

    for (const lobby of lobbies) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lobby-row";
      const icon = document.createElement("span");
      icon.className = "ui-sprite lobby-row-icon";
      icon.setAttribute("aria-hidden", "true");
      this.applySprite(icon, lobby.playerCount >= lobby.maxPlayers ? SPRITES.ui.warningGenerated : SPRITES.ui.readyBadgeGenerated);
      const label = document.createElement("span");
      label.className = "lobby-row-label";
      const code = document.createElement("strong");
      code.textContent = lobby.code;
      label.append(code, ` ${lobby.hostName}`);
      const count = document.createElement("span");
      count.className = "lobby-row-count";
      count.textContent = `${lobby.playerCount}/${lobby.maxPlayers}`;
      button.append(icon, label, count);
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

  private setPlayerCardState(id: string, state: HealthState): void {
    const element = this.byId<HTMLElement>(id);
    if (!element) return;
    element.dataset.healthState = state;
  }

  private setChargeMeterState(state: ChargeState): void {
    const element = this.byId<HTMLElement>("chargeMeter");
    if (!element) return;
    element.dataset.chargeState = state;
  }

  private setRoomChipState(state: GameSnapshot["roundState"]): void {
    const element = this.byId<HTMLElement>("roomChip");
    if (!element) return;
    element.dataset.roundState = state;
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
      brandMark: SPRITES.ui.trophyGenerated,
      statusIcon: SPRITES.ui.readyBadgeGenerated,
      nameLabelIcon: SPRITES.ui.medalSilverGenerated,
      codeLabelIcon: SPRITES.ui.scorePlaqueGenerated,
      hostButtonIcon: SPRITES.ui.scorePlaqueGenerated,
      botButtonIcon: SPRITES.ui.targetRed,
      refreshButtonIcon: SPRITES.ui.speedArrowGenerated,
      joinButtonIcon: SPRITES.ui.startButtonGenerated,
      lobbyListIcon: SPRITES.ui.scorePlaqueGenerated,
      entryBoardIcon: SPRITES.ui.medalSilverGenerated,
      menuLeftProp: SPRITES.ui.bracketLeftGenerated,
      menuRightProp: SPRITES.ui.bracketRightGenerated,
      waitingCornerLeft: SPRITES.ui.bracketLeftGenerated,
      waitingCornerRight: SPRITES.ui.bracketRightGenerated,
      endedCornerLeft: SPRITES.ui.bracketLeftGenerated,
      endedCornerRight: SPRITES.ui.bracketRightGenerated,
      blueSideIcon: SPRITES.ui.pennantBlueGenerated,
      redSideIcon: SPRITES.ui.pennantRedGenerated,
      blueCardBadge: SPRITES.ui.pennantBlueGenerated,
      redCardBadge: SPRITES.ui.pennantRedGenerated,
      roundStateIcon: SPRITES.ui.scorePlaqueGenerated,
      selectedAmmoIcon: AMMO_UI_FRAMES.javelin,
      ammoRoleIcon: SPRITES.ui.warningGenerated,
      ammoImpactIcon: SPRITES.ui.targetRed,
      ammoBlastIcon: SPRITES.fx.starburstGoldGenerated,
      ammoArcIcon: SPRITES.ui.speedArrowGenerated,
      windIcon: SPRITES.ui.powerTokenGenerated,
      lastDistanceIcon: SPRITES.ui.targetBlue,
      bestDistanceIcon: SPRITES.ui.trophyGenerated,
      chargeLeftIcon: SPRITES.ui.speedArrowGenerated,
      chargeRightIcon: SPRITES.ui.powerTokenGenerated,
      blueTankPortrait: SPRITES.tank.blue.bodyIdle,
      redTankPortrait: SPRITES.tank.red.bodyIdle,
      blueFieldFlag: SPRITES.props.flagBlue,
      redFieldFlag: SPRITES.props.flagRed,
      leftFieldCrate: SPRITES.props.equipmentCrate,
      rightFieldCrate: SPRITES.props.coneStack,
      roomScoreboard: SPRITES.props.scoreboard,
      ammoRackLeft: SPRITES.props.rackJavelin,
      ammoRackRight: SPRITES.props.rackShotput,
      waitingPanelIcon: SPRITES.ui.readyBadgeGenerated,
      readyButtonIcon: SPRITES.ui.powerTokenGenerated,
      endedPanelIcon: SPRITES.fx.confettiGenerated,
      rematchButtonIcon: SPRITES.ui.trophyGenerated,
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

  private ammoRole(ammoType: AmmoType): string {
    if (ammoType === "needle") return "Pierce";
    if (ammoType === "shotput" || ammoType === "mortar" || ammoType === "anvil") return "Impact";
    if (ammoType === "splitter" || ammoType === "cluster") return "Burst";
    if (ammoType === "discus") return "Float";
    return "Range";
  }

  private ammoImpact(ammoType: AmmoType): number {
    const ammo = AMMO_DEFINITIONS[ammoType];
    return Math.max(ammo.directDamage, ammo.blastDamage, ammo.fragmentDamage);
  }

  private ammoBlast(ammoType: AmmoType): string {
    const ammo = AMMO_DEFINITIONS[ammoType];
    const radius = Math.max(ammo.blastRadius, ammo.fragmentBlastRadius);
    return radius > 0 ? `${radius}px` : "Direct";
  }

  private ammoArc(ammoType: AmmoType): string {
    const ammo = AMMO_DEFINITIONS[ammoType];
    if (ammo.gravityScale >= 1.1) return "Drop";
    if (ammo.gravityScale <= 0.55) return "Flat";
    if (ammo.dragPerSecond >= 0.025) return "Drift";
    return "True";
  }

  private windLabel(windAccelerationX: number, side: Side | ""): string {
    if (Math.abs(windAccelerationX) < WIND.calmThresholdPxPerSecondSq) return "Calm";
    const magnitude = Math.abs(Math.round(windAccelerationX));
    if (side === "") return `${windAccelerationX > 0 ? "East" : "West"} ${magnitude}`;
    const tailwind = (side === "blue" && windAccelerationX > 0) || (side === "red" && windAccelerationX < 0);
    return `${tailwind ? "Tail" : "Head"} ${magnitude}`;
  }

  private setPlayerPortrait(id: string, side: Exclude<Side, "">, player: PlayerView | null): void {
    const element = this.byId<HTMLElement>(id);
    if (!element) return;
    const sideSprites = side === "blue" ? SPRITES.tank.blue : SPRITES.tank.red;
    const frame = player && player.hp <= 45 ? sideSprites.bodyDamaged : sideSprites.bodyIdle;
    this.applySprite(element, frame);
    element.classList.toggle("is-waiting", !player);
    element.classList.toggle("is-damaged", Boolean(player && player.hp <= 45));
  }

  private maxSpriteSize(element: HTMLElement): { width: number; height: number } {
    if (element.classList.contains("brand-mark")) return { width: 64, height: 58 };
    if (element.classList.contains("menu-corner-prop")) return { width: 112, height: 92 };
    if (element.classList.contains("field-banner")) return { width: 34, height: 76 };
    if (element.classList.contains("field-crate")) return { width: 50, height: 44 };
    if (element.classList.contains("room-scoreboard")) return { width: 88, height: 42 };
    if (element.classList.contains("tank-portrait")) return { width: 72, height: 48 };
    if (element.classList.contains("ammo-prop")) return { width: 72, height: 42 };
    if (element.classList.contains("panel-icon")) return { width: 38, height: 30 };
    if (element.classList.contains("popup-corner")) return { width: 44, height: 38 };
    if (element.classList.contains("button-icon")) return { width: 34, height: 30 };
    if (element.classList.contains("ammo-icon")) return { width: 34, height: 34 };
    if (element.classList.contains("board-icon")) return { width: 30, height: 24 };
    if (element.classList.contains("chip-icon")) return { width: 36, height: 22 };
    if (element.classList.contains("charge-icon")) return { width: 28, height: 22 };
    if (element.classList.contains("lobby-row-icon")) return { width: 40, height: 26 };
    if (element.classList.contains("empty-list-icon")) return { width: 56, height: 36 };
    if (element.classList.contains("form-label-icon")) return { width: 24, height: 22 };
    if (element.classList.contains("player-card-badge")) return { width: 42, height: 40 };
    if (element.classList.contains("side-flag")) return { width: 26, height: 30 };
    if (element.classList.contains("metric-icon")) return { width: 18, height: 18 };
    if (element.classList.contains("pill-icon")) return { width: 56, height: 26 };
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
