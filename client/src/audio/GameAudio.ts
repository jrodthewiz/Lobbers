const AUDIO_SOURCES = {
  "ammo-javelin-select": [
    new URL("../assets/audio/ammo-javelin-select-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ammo-javelin-select-2.ogg", import.meta.url).href,
  ],
  "ammo-shotput-select": [
    new URL("../assets/audio/ammo-shotput-select-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ammo-shotput-select-2.ogg", import.meta.url).href,
  ],
  "ammo-splitter-select": [
    new URL("../assets/audio/ammo-splitter-select-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ammo-splitter-select-2.ogg", import.meta.url).href,
  ],
  "charge-start": [
    new URL("../assets/audio/charge-start.ogg", import.meta.url).href,
    new URL("../assets/audio/charge-start-2.ogg", import.meta.url).href,
    new URL("../assets/audio/charge-start-3.ogg", import.meta.url).href,
    new URL("../assets/audio/charge-start-4.ogg", import.meta.url).href,
    new URL("../assets/audio/charge-start-5.ogg", import.meta.url).href,
    new URL("../assets/audio/charge-start-6.ogg", import.meta.url).href,
  ],
  "fragment-impact": [
    new URL("../assets/audio/fragment-impact.ogg", import.meta.url).href,
    new URL("../assets/audio/fragment-impact-2.ogg", import.meta.url).href,
    new URL("../assets/audio/fragment-impact-3.ogg", import.meta.url).href,
    new URL("../assets/audio/fragment-impact-4.ogg", import.meta.url).href,
    new URL("../assets/audio/fragment-impact-5.ogg", import.meta.url).href,
  ],
  "item-pickup": [
    new URL("../assets/audio/item-pickup.ogg", import.meta.url).href,
    new URL("../assets/audio/item-pickup-2.ogg", import.meta.url).href,
    new URL("../assets/audio/item-pickup-3.ogg", import.meta.url).href,
    new URL("../assets/audio/item-pickup-4.ogg", import.meta.url).href,
    new URL("../assets/audio/item-pickup-5.ogg", import.meta.url).href,
  ],
  "javelin-impact": [
    new URL("../assets/audio/javelin-impact.ogg", import.meta.url).href,
    new URL("../assets/audio/javelin-impact-2.ogg", import.meta.url).href,
    new URL("../assets/audio/javelin-impact-3.ogg", import.meta.url).href,
    new URL("../assets/audio/javelin-impact-4.ogg", import.meta.url).href,
    new URL("../assets/audio/javelin-impact-5.ogg", import.meta.url).href,
    new URL("../assets/audio/javelin-impact-6.ogg", import.meta.url).href,
  ],
  "player-hit": [
    new URL("../assets/audio/player-hit.ogg", import.meta.url).href,
    new URL("../assets/audio/player-hit-2.ogg", import.meta.url).href,
    new URL("../assets/audio/player-hit-3.ogg", import.meta.url).href,
    new URL("../assets/audio/player-hit-4.ogg", import.meta.url).href,
  ],
  "player-jump": [
    new URL("../assets/audio/player-jump-1.ogg", import.meta.url).href,
    new URL("../assets/audio/player-jump-2.ogg", import.meta.url).href,
  ],
  "player-step": [
    new URL("../assets/audio/player-step-1.ogg", import.meta.url).href,
    new URL("../assets/audio/player-step-2.ogg", import.meta.url).href,
  ],
  "round-countdown": [
    new URL("../assets/audio/round-countdown-1.ogg", import.meta.url).href,
    new URL("../assets/audio/round-countdown-2.ogg", import.meta.url).href,
  ],
  "round-lose": [
    new URL("../assets/audio/round-lose-1.ogg", import.meta.url).href,
    new URL("../assets/audio/round-lose-2.ogg", import.meta.url).href,
    new URL("../assets/audio/round-lose-3.ogg", import.meta.url).href,
  ],
  "round-start": [
    new URL("../assets/audio/round-start-1.ogg", import.meta.url).href,
    new URL("../assets/audio/round-start-2.ogg", import.meta.url).href,
    new URL("../assets/audio/round-start-3.ogg", import.meta.url).href,
  ],
  "round-win": [
    new URL("../assets/audio/round-win-1.ogg", import.meta.url).href,
    new URL("../assets/audio/round-win-2.ogg", import.meta.url).href,
    new URL("../assets/audio/round-win-3.ogg", import.meta.url).href,
    new URL("../assets/audio/round-win-4.ogg", import.meta.url).href,
  ],
  "shotput-impact": [
    new URL("../assets/audio/shotput-impact.ogg", import.meta.url).href,
    new URL("../assets/audio/shotput-impact-2.ogg", import.meta.url).href,
    new URL("../assets/audio/shotput-impact-3.ogg", import.meta.url).href,
    new URL("../assets/audio/shotput-impact-4.ogg", import.meta.url).href,
    new URL("../assets/audio/shotput-impact-5.ogg", import.meta.url).href,
    new URL("../assets/audio/shotput-impact-6.ogg", import.meta.url).href,
  ],
  "splitter-pop": [
    new URL("../assets/audio/splitter-pop.ogg", import.meta.url).href,
    new URL("../assets/audio/splitter-pop-2.ogg", import.meta.url).href,
    new URL("../assets/audio/splitter-pop-3.ogg", import.meta.url).href,
    new URL("../assets/audio/splitter-pop-4.ogg", import.meta.url).href,
    new URL("../assets/audio/splitter-pop-5.ogg", import.meta.url).href,
    new URL("../assets/audio/splitter-pop-6.ogg", import.meta.url).href,
    new URL("../assets/audio/splitter-pop-7.ogg", import.meta.url).href,
  ],
  "throw-release": [
    new URL("../assets/audio/throw-release.ogg", import.meta.url).href,
    new URL("../assets/audio/throw-release-2.ogg", import.meta.url).href,
    new URL("../assets/audio/throw-release-3.ogg", import.meta.url).href,
    new URL("../assets/audio/throw-release-4.ogg", import.meta.url).href,
    new URL("../assets/audio/throw-release-5.ogg", import.meta.url).href,
    new URL("../assets/audio/throw-release-6.ogg", import.meta.url).href,
    new URL("../assets/audio/throw-release-7.ogg", import.meta.url).href,
    new URL("../assets/audio/throw-release-8.ogg", import.meta.url).href,
  ],
  "ui-back": [
    new URL("../assets/audio/ui-back.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-back-2.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-back-3.ogg", import.meta.url).href,
  ],
  "ui-browse-lobbies": [
    new URL("../assets/audio/ui-browse-lobbies-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-browse-lobbies-2.ogg", import.meta.url).href,
  ],
  "ui-click": [
    new URL("../assets/audio/ui-click.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-click-2.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-click-3.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-click-4.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-click-5.ogg", import.meta.url).href,
  ],
  "ui-confirm": [
    new URL("../assets/audio/ui-confirm.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-confirm-2.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-confirm-3.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-confirm-4.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-confirm-5.ogg", import.meta.url).href,
  ],
  "ui-error": [
    new URL("../assets/audio/ui-error.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-error-2.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-error-3.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-error-4.ogg", import.meta.url).href,
  ],
  "ui-focus": [
    new URL("../assets/audio/ui-focus-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-focus-2.ogg", import.meta.url).href,
  ],
  "ui-host-lobby": [
    new URL("../assets/audio/ui-host-lobby-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-host-lobby-2.ogg", import.meta.url).href,
  ],
  "ui-hover": [
    new URL("../assets/audio/ui-hover-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-hover-2.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-hover-3.ogg", import.meta.url).href,
  ],
  "ui-join-lobby": [
    new URL("../assets/audio/ui-join-lobby-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-join-lobby-2.ogg", import.meta.url).href,
  ],
  "ui-lobby-row": [
    new URL("../assets/audio/ui-lobby-row-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-lobby-row-2.ogg", import.meta.url).href,
  ],
  "ui-practice-bot": [
    new URL("../assets/audio/ui-practice-bot-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-practice-bot-2.ogg", import.meta.url).href,
  ],
  "ui-ready": [
    new URL("../assets/audio/ui-ready-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-ready-2.ogg", import.meta.url).href,
  ],
  "ui-rematch": [
    new URL("../assets/audio/ui-rematch-1.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-rematch-2.ogg", import.meta.url).href,
  ],
  "ui-select": [
    new URL("../assets/audio/ui-select.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-select-2.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-select-3.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-select-4.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-select-5.ogg", import.meta.url).href,
    new URL("../assets/audio/ui-select-6.ogg", import.meta.url).href,
  ],
} as const;

export type GameSoundKey = keyof typeof AUDIO_SOURCES;

type QueuedSound = {
  key: GameSoundKey;
  delayMs?: number;
  volumeScale?: number;
  rateScale?: number;
};

const DEFAULT_VOLUME: Record<GameSoundKey, number> = {
  "ammo-javelin-select": 0.42,
  "ammo-shotput-select": 0.5,
  "ammo-splitter-select": 0.44,
  "charge-start": 0.42,
  "fragment-impact": 0.42,
  "item-pickup": 0.58,
  "javelin-impact": 0.5,
  "player-hit": 0.52,
  "player-jump": 0.28,
  "player-step": 0.24,
  "round-countdown": 0.42,
  "round-lose": 0.44,
  "round-start": 0.48,
  "round-win": 0.5,
  "shotput-impact": 0.64,
  "splitter-pop": 0.54,
  "throw-release": 0.5,
  "ui-back": 0.34,
  "ui-browse-lobbies": 0.32,
  "ui-click": 0.28,
  "ui-confirm": 0.4,
  "ui-error": 0.42,
  "ui-focus": 0.2,
  "ui-host-lobby": 0.36,
  "ui-hover": 0.16,
  "ui-join-lobby": 0.38,
  "ui-lobby-row": 0.32,
  "ui-practice-bot": 0.36,
  "ui-ready": 0.36,
  "ui-rematch": 0.38,
  "ui-select": 0.32,
};

const MIN_INTERVAL_MS: Partial<Record<GameSoundKey, number>> = {
  "fragment-impact": 22,
  "player-step": 140,
  "ui-focus": 70,
  "ui-hover": 55,
};

const RATE_JITTER: Partial<Record<GameSoundKey, number>> = {
  "fragment-impact": 0.1,
  "javelin-impact": 0.07,
  "player-hit": 0.05,
  "player-jump": 0.06,
  "player-step": 0.08,
  "shotput-impact": 0.05,
  "splitter-pop": 0.06,
  "throw-release": 0.04,
  "ui-click": 0.04,
  "ui-hover": 0.05,
  "ui-select": 0.04,
};

const clampVolume = (value: number): number => Math.max(0, Math.min(1, value));
const clampRate = (value: number): number => Math.max(0.55, Math.min(1.35, value));
const jitter = (range: number): number => 1 + (((Math.random() * 2) - 1) * range);

export class GameAudio {
  private readonly clips = new Map<GameSoundKey, HTMLAudioElement[]>();
  private readonly lastVariantIndex = new Map<GameSoundKey, number>();
  private readonly lastPlayedAtMs = new Map<GameSoundKey, number>();

  constructor() {
    for (const [key, urls] of Object.entries(AUDIO_SOURCES) as Array<[GameSoundKey, readonly string[]]>) {
      this.clips.set(
        key,
        urls.map((url) => {
          const clip = new Audio(url);
          clip.preload = "auto";
          return clip;
        }),
      );
    }
  }

  preload(): void {
    for (const clips of this.clips.values()) {
      for (const clip of clips) {
        clip.load();
      }
    }
  }

  play(key: GameSoundKey, volumeScale = 1, rateScale = 1): void {
    const now = performance.now();
    const minInterval = MIN_INTERVAL_MS[key] ?? 0;
    const lastPlayedAt = this.lastPlayedAtMs.get(key) ?? Number.NEGATIVE_INFINITY;
    if (now - lastPlayedAt < minInterval) return;
    this.lastPlayedAtMs.set(key, now);

    const source = this.pickClip(key);
    if (!source) return;

    const clip = source.cloneNode(true) as HTMLAudioElement;
    clip.volume = clampVolume(DEFAULT_VOLUME[key] * volumeScale);
    clip.playbackRate = clampRate(jitter(RATE_JITTER[key] ?? 0) * rateScale);
    clip.currentTime = 0;
    void clip.play().catch(() => {
      // Browsers may block playback until the first user gesture.
    });
  }

  playLayered(sounds: QueuedSound[]): void {
    for (const sound of sounds) {
      if ((sound.delayMs ?? 0) <= 0) {
        this.play(sound.key, sound.volumeScale, sound.rateScale);
        continue;
      }
      window.setTimeout(() => this.play(sound.key, sound.volumeScale, sound.rateScale), sound.delayMs);
    }
  }

  private pickClip(key: GameSoundKey): HTMLAudioElement | null {
    const clips = this.clips.get(key);
    if (!clips || clips.length === 0) return null;
    if (clips.length === 1) return clips[0] ?? null;

    const previous = this.lastVariantIndex.get(key) ?? -1;
    let next = Math.floor(Math.random() * clips.length);
    if (next === previous) {
      next = (next + 1) % clips.length;
    }
    this.lastVariantIndex.set(key, next);
    return clips[next] ?? null;
  }
}
