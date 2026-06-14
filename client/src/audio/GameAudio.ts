import chargeStartUrl from "../assets/audio/charge-start.ogg";
import fragmentImpactUrl from "../assets/audio/fragment-impact.ogg";
import itemPickupUrl from "../assets/audio/item-pickup.ogg";
import javelinImpactUrl from "../assets/audio/javelin-impact.ogg";
import playerHitUrl from "../assets/audio/player-hit.ogg";
import shotputImpactUrl from "../assets/audio/shotput-impact.ogg";
import splitterPopUrl from "../assets/audio/splitter-pop.ogg";
import throwReleaseUrl from "../assets/audio/throw-release.ogg";
import uiBackUrl from "../assets/audio/ui-back.ogg";
import uiClickUrl from "../assets/audio/ui-click.ogg";
import uiConfirmUrl from "../assets/audio/ui-confirm.ogg";
import uiErrorUrl from "../assets/audio/ui-error.ogg";
import uiSelectUrl from "../assets/audio/ui-select.ogg";

const AUDIO_SOURCES = {
  "charge-start": chargeStartUrl,
  "fragment-impact": fragmentImpactUrl,
  "item-pickup": itemPickupUrl,
  "javelin-impact": javelinImpactUrl,
  "player-hit": playerHitUrl,
  "shotput-impact": shotputImpactUrl,
  "splitter-pop": splitterPopUrl,
  "throw-release": throwReleaseUrl,
  "ui-back": uiBackUrl,
  "ui-click": uiClickUrl,
  "ui-confirm": uiConfirmUrl,
  "ui-error": uiErrorUrl,
  "ui-select": uiSelectUrl,
} as const;

const DEFAULT_VOLUME: Record<GameSoundKey, number> = {
  "charge-start": 0.42,
  "fragment-impact": 0.48,
  "item-pickup": 0.58,
  "javelin-impact": 0.5,
  "player-hit": 0.48,
  "shotput-impact": 0.62,
  "splitter-pop": 0.52,
  "throw-release": 0.48,
  "ui-back": 0.38,
  "ui-click": 0.32,
  "ui-confirm": 0.42,
  "ui-error": 0.42,
  "ui-select": 0.34,
};

export type GameSoundKey = keyof typeof AUDIO_SOURCES;

const clampVolume = (value: number): number => Math.max(0, Math.min(1, value));

export class GameAudio {
  private readonly clips = new Map<GameSoundKey, HTMLAudioElement>();

  constructor() {
    for (const [key, url] of Object.entries(AUDIO_SOURCES) as Array<[GameSoundKey, string]>) {
      const clip = new Audio(url);
      clip.preload = "auto";
      this.clips.set(key, clip);
    }
  }

  preload(): void {
    for (const clip of this.clips.values()) {
      clip.load();
    }
  }

  play(key: GameSoundKey, volumeScale = 1): void {
    const source = this.clips.get(key);
    if (!source) return;

    const clip = source.cloneNode(true) as HTMLAudioElement;
    clip.volume = clampVolume(DEFAULT_VOLUME[key] * volumeScale);
    clip.currentTime = 0;
    void clip.play().catch(() => {
      // Browsers may block playback until the first user gesture.
    });
  }
}
