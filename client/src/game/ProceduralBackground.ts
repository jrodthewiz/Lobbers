import Phaser from "phaser";
import { WORLD } from "../../../shared/game/constants";

const SKY_TEXTURE = "lobbers-bg-sky";
const CLOUD_TEXTURE = "lobbers-bg-clouds";
const HAZE_TEXTURE = "lobbers-bg-haze";
const FIELD_TEXTURE = "lobbers-bg-field";

type BackgroundPalette = {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  glowRgb: string;
  cloudRgb: string;
  hazeRgb: string;
  ridgeFar: string;
  ridgeNear: string;
  stand: string;
  standLineRgb: string;
  towerRgb: string;
  groundTop: string;
  groundBottom: string;
  turfStripe: string;
};

const PALETTES: readonly BackgroundPalette[] = [
  {
    skyTop: "#111827",
    skyMid: "#26384a",
    skyHorizon: "#7f8f78",
    glowRgb: "250, 204, 21",
    cloudRgb: "238, 242, 232",
    hazeRgb: "221, 235, 212",
    ridgeFar: "rgba(35, 54, 58, 0.92)",
    ridgeNear: "rgba(26, 42, 42, 0.96)",
    stand: "rgba(15, 23, 42, 0.46)",
    standLineRgb: "248, 250, 252",
    towerRgb: "216, 222, 233",
    groundTop: "#4c613d",
    groundBottom: "#253126",
    turfStripe: "rgba(215, 230, 176, 0.08)",
  },
  {
    skyTop: "#172033",
    skyMid: "#36516a",
    skyHorizon: "#b58f6c",
    glowRgb: "251, 146, 60",
    cloudRgb: "255, 237, 213",
    hazeRgb: "254, 215, 170",
    ridgeFar: "rgba(62, 61, 58, 0.88)",
    ridgeNear: "rgba(35, 45, 43, 0.96)",
    stand: "rgba(30, 41, 59, 0.42)",
    standLineRgb: "255, 237, 213",
    towerRgb: "253, 186, 116",
    groundTop: "#55683d",
    groundBottom: "#243421",
    turfStripe: "rgba(253, 224, 171, 0.08)",
  },
  {
    skyTop: "#0b1020",
    skyMid: "#1d3351",
    skyHorizon: "#4f7e85",
    glowRgb: "56, 189, 248",
    cloudRgb: "203, 213, 225",
    hazeRgb: "125, 211, 252",
    ridgeFar: "rgba(23, 47, 66, 0.9)",
    ridgeNear: "rgba(10, 34, 43, 0.98)",
    stand: "rgba(8, 18, 32, 0.5)",
    standLineRgb: "186, 230, 253",
    towerRgb: "125, 211, 252",
    groundTop: "#36594b",
    groundBottom: "#172821",
    turfStripe: "rgba(125, 211, 252, 0.055)",
  },
  {
    skyTop: "#15172a",
    skyMid: "#403a5c",
    skyHorizon: "#776d90",
    glowRgb: "240, 171, 252",
    cloudRgb: "233, 213, 255",
    hazeRgb: "216, 180, 254",
    ridgeFar: "rgba(54, 45, 74, 0.9)",
    ridgeNear: "rgba(31, 32, 55, 0.98)",
    stand: "rgba(17, 24, 39, 0.5)",
    standLineRgb: "233, 213, 255",
    towerRgb: "216, 180, 254",
    groundTop: "#465c4a",
    groundBottom: "#1f2e28",
    turfStripe: "rgba(240, 171, 252, 0.055)",
  },
];

export class ProceduralBackground {
  private clouds: Phaser.GameObjects.TileSprite | null = null;
  private haze: Phaser.GameObjects.TileSprite | null = null;
  private fieldGrain: Phaser.GameObjects.TileSprite | null = null;
  private seed = hashText("Lobbers");
  private seedSource = "Lobbers";
  private palette = PALETTES[0] ?? failPalette();
  private wind = 1;

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    this.paintTextures();

    this.scene.add.image(0, 0, SKY_TEXTURE).setOrigin(0).setDepth(-50);
    this.clouds = this.scene.add
      .tileSprite(0, 72, WORLD.width, 210, CLOUD_TEXTURE)
      .setOrigin(0)
      .setDepth(-48)
      .setAlpha(0.34 + (this.seeded(17) * 0.1));
    this.haze = this.scene.add
      .tileSprite(0, WORLD.groundY - 230, WORLD.width, 128, HAZE_TEXTURE)
      .setOrigin(0)
      .setDepth(-47)
      .setAlpha(0.46 + (this.seeded(23) * 0.16));
    this.fieldGrain = this.scene.add
      .tileSprite(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY, FIELD_TEXTURE)
      .setOrigin(0)
      .setDepth(-46)
      .setAlpha(0.46 + (this.seeded(29) * 0.12));
  }

  setSeed(seedSource: string): void {
    const normalized = seedSource.trim() || "Lobbers";
    if (normalized === this.seedSource) return;
    this.seedSource = normalized;
    this.seed = hashText(normalized);
    this.palette = PALETTES[this.seed % PALETTES.length] ?? PALETTES[0] ?? failPalette();
    this.wind = 0.72 + (this.seeded(7) * 0.86);
    this.paintTextures();
  }

  update(timeMs: number): void {
    const seconds = timeMs / 1000;
    if (this.clouds) {
      this.clouds.tilePositionX = seconds * (5.5 + (this.wind * 5.5));
      this.clouds.tilePositionY = Math.sin((seconds * 0.18) + this.seeded(31)) * (3 + (this.seeded(37) * 4));
    }
    if (this.haze) {
      this.haze.tilePositionX = seconds * (2.2 + (this.wind * 2.4));
    }
    if (this.fieldGrain) {
      this.fieldGrain.tilePositionX = seconds * (0.8 + (this.wind * 0.9));
    }
  }

  private paintTextures(): void {
    this.paintSkyTexture();
    this.paintCloudTexture();
    this.paintHazeTexture();
    this.paintFieldTexture();
  }

  private paintSkyTexture(): void {
    this.paintCanvas(SKY_TEXTURE, WORLD.width, WORLD.height, (ctx, width, height) => {
      const sky = ctx.createLinearGradient(0, 0, 0, WORLD.groundY);
      sky.addColorStop(0, this.palette.skyTop);
      sky.addColorStop(0.48, this.palette.skyMid);
      sky.addColorStop(1, this.palette.skyHorizon);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, WORLD.groundY);

      const glowX = width * (0.22 + (this.seeded(41) * 0.6));
      const glowY = 110 + (this.seeded(43) * 120);
      const glow = ctx.createRadialGradient(glowX, glowY, 18, glowX, glowY, 310 + (this.seeded(47) * 120));
      glow.addColorStop(0, `rgba(${this.palette.glowRgb}, 0.22)`);
      glow.addColorStop(1, `rgba(${this.palette.glowRgb}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, WORLD.groundY);

      this.drawRidge(ctx, width, WORLD.groundY - 126, 48 + (this.seeded(53) * 44), this.palette.ridgeFar, 61);
      this.drawRidge(ctx, width, WORLD.groundY - 78, 34 + (this.seeded(67) * 32), this.palette.ridgeNear, 71);
      this.drawStands(ctx, width);
      this.drawLightTowers(ctx);
      this.drawGround(ctx, width, height);
    });
  }

  private paintCloudTexture(): void {
    this.paintCanvas(CLOUD_TEXTURE, 512, 256, (ctx, width) => {
      for (let i = 0; i < 20; i += 1) {
        const x = this.seeded(101 + i) * width;
        const y = 30 + (this.seeded(131 + i) * 132);
        const radius = 18 + (this.seeded(151 + i) * 42);
        const alpha = 0.08 + (this.seeded(173 + i) * 0.16);
        ctx.fillStyle = `rgba(${this.palette.cloudRgb}, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(x, y, radius * (1.55 + this.seeded(191 + i)), radius * 0.42, this.seeded(211 + i) * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  private paintHazeTexture(): void {
    this.paintCanvas(HAZE_TEXTURE, 1024, 128, (ctx, width, height) => {
      const haze = ctx.createLinearGradient(0, 0, 0, height);
      haze.addColorStop(0, `rgba(${this.palette.hazeRgb}, 0)`);
      haze.addColorStop(0.55, `rgba(${this.palette.hazeRgb}, 0.13)`);
      haze.addColorStop(1, `rgba(${this.palette.hazeRgb}, 0)`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = `rgba(${this.palette.standLineRgb}, 0.09)`;
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 38) {
        const top = 72 + (this.seeded(233 + x) * 28);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x + 18, top - 7);
        ctx.lineTo(x + 38, top);
        ctx.stroke();
      }
    });
  }

  private paintFieldTexture(): void {
    this.paintCanvas(FIELD_TEXTURE, 512, 256, (ctx, width, height) => {
      ctx.fillStyle = this.palette.turfStripe;
      for (let x = -height; x < width; x += 54 + Math.round(this.seeded(271) * 12)) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x + 34, height);
        ctx.lineTo(x + height + 34, 0);
        ctx.lineTo(x + height, 0);
        ctx.closePath();
        ctx.fill();
      }

      for (let i = 0; i < 340; i += 1) {
        const x = this.seeded(300 + i) * width;
        const y = this.seeded(700 + i) * height;
        const alpha = 0.045 + (this.seeded(1100 + i) * 0.12);
        ctx.fillStyle = `rgba(${this.palette.standLineRgb}, ${alpha})`;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    });
  }

  private drawRidge(
    ctx: CanvasRenderingContext2D,
    width: number,
    baseY: number,
    amplitude: number,
    fillStyle: string,
    seedOffset: number,
  ): void {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(0, WORLD.groundY);
    for (let x = 0; x <= width; x += 32) {
      const y = baseY - (this.noise1((x * 0.0065) + this.seeded(seedOffset), seedOffset) * amplitude);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, WORLD.groundY);
    ctx.closePath();
    ctx.fill();
  }

  private drawStands(ctx: CanvasRenderingContext2D, width: number): void {
    const inset = 94 + (this.seeded(311) * 88);
    const standY = WORLD.groundY - (108 + (this.seeded(313) * 34));
    const standHeight = 62 + (this.seeded(317) * 30);
    const railY = standY + standHeight + 7;
    ctx.fillStyle = "rgba(8, 13, 24, 0.2)";
    ctx.fillRect(inset - 22, standY - 18, width - ((inset - 22) * 2), 18);
    ctx.fillStyle = this.palette.stand;
    ctx.fillRect(inset, standY, width - (inset * 2), standHeight);

    const sectionWidth = (width - (inset * 2)) / 6;
    for (let section = 0; section < 6; section += 1) {
      const x = inset + (section * sectionWidth);
      const alpha = 0.035 + (this.seeded(329 + section) * 0.055);
      ctx.fillStyle = section % 2 === 0
        ? `rgba(${this.palette.glowRgb}, ${alpha})`
        : `rgba(${this.palette.standLineRgb}, ${alpha})`;
      ctx.fillRect(x + 4, standY + 4, sectionWidth - 8, standHeight - 8);
    }

    for (let row = 0; row < 5; row += 1) {
      const y = standY + 10 + (row * (standHeight / 5));
      ctx.strokeStyle = `rgba(${this.palette.standLineRgb}, ${0.055 + (row * 0.024)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(inset + 18, y);
      ctx.lineTo(width - inset - 18, y);
      ctx.stroke();
    }

    for (let i = 0; i < 95; i += 1) {
      const x = inset + 24 + (this.seeded(400 + i) * (width - (inset * 2) - 48));
      const y = standY + 14 + (this.seeded(520 + i) * (standHeight - 24));
      const alpha = 0.12 + (this.seeded(640 + i) * 0.18);
      ctx.fillStyle = i % 3 === 0
        ? `rgba(${this.palette.glowRgb}, ${alpha})`
        : `rgba(${this.palette.standLineRgb}, ${alpha})`;
      ctx.fillRect(x, y, 3, 2);
    }

    ctx.fillStyle = `rgba(${this.palette.standLineRgb}, 0.22)`;
    ctx.fillRect(inset - 28, railY, width - ((inset - 28) * 2), 4);
    ctx.fillStyle = "rgba(15, 23, 42, 0.32)";
    for (let i = 0; i < 10; i += 1) {
      const bannerX = inset + 36 + (i * ((width - (inset * 2) - 72) / 9));
      ctx.fillRect(bannerX - 2, railY + 4, 4, 18);
      ctx.fillStyle = i % 2 === 0
        ? `rgba(${this.palette.glowRgb}, 0.24)`
        : `rgba(${this.palette.standLineRgb}, 0.2)`;
      ctx.fillRect(bannerX + 3, railY + 6, 28, 11);
      ctx.fillStyle = "rgba(15, 23, 42, 0.32)";
    }
  }

  private drawLightTowers(ctx: CanvasRenderingContext2D): void {
    const leftX = 150 + (this.seeded(811) * 110);
    const rightX = WORLD.width - leftX;
    const towerHeight = 206 + (this.seeded(823) * 70);

    for (const x of [leftX, rightX]) {
      ctx.strokeStyle = `rgba(${this.palette.towerRgb}, 0.26)`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, WORLD.groundY - 98);
      ctx.lineTo(x, WORLD.groundY - 98 - towerHeight);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${this.palette.towerRgb}, 0.12)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 20, WORLD.groundY - 98);
      ctx.lineTo(x + 20, WORLD.groundY - 98 - towerHeight);
      ctx.moveTo(x + 20, WORLD.groundY - 98);
      ctx.lineTo(x - 20, WORLD.groundY - 98 - towerHeight);
      ctx.stroke();

      ctx.fillStyle = `rgba(${this.palette.glowRgb}, 0.2)`;
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(x - 35 + (i * 24), WORLD.groundY - 113 - towerHeight, 18, 13);
        ctx.fillStyle = `rgba(${this.palette.glowRgb}, 0.07)`;
        ctx.beginPath();
        ctx.moveTo(x - 26 + (i * 24), WORLD.groundY - 100 - towerHeight);
        ctx.lineTo(x - 82 + (i * 24), WORLD.groundY - 8);
        ctx.lineTo(x + 30 + (i * 24), WORLD.groundY - 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(${this.palette.glowRgb}, 0.2)`;
      }
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const ground = ctx.createLinearGradient(0, WORLD.groundY, 0, height);
    ground.addColorStop(0, this.palette.groundTop);
    ground.addColorStop(1, this.palette.groundBottom);
    ctx.fillStyle = ground;
    ctx.fillRect(0, WORLD.groundY, width, height - WORLD.groundY);

    ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
    const stripeWidth = 34 + (this.seeded(907) * 20);
    const gap = 78 + (this.seeded(911) * 22);
    for (let x = 0; x < width; x += gap) {
      ctx.fillRect(x, WORLD.groundY, stripeWidth, height - WORLD.groundY);
    }

    ctx.strokeStyle = "rgba(248, 250, 252, 0.07)";
    ctx.lineWidth = 1;
    for (let y = WORLD.groundY + 32; y < height; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  private paintCanvas(
    key: string,
    width: number,
    height: number,
    paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  ): void {
    const texture = this.scene.textures.exists(key)
      ? this.scene.textures.get(key) as Phaser.Textures.CanvasTexture
      : this.scene.textures.createCanvas(key, width, height);
    if (!texture) throw new Error(`Unable to create background texture: ${key}`);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, width, height);
    paint(ctx, width, height);
    texture.refresh();
  }

  private seeded(offset: number): number {
    return seeded(offset, this.seed);
  }

  private noise1(value: number, seedOffset: number): number {
    const left = Math.floor(value);
    const t = smoothstep(value - left);
    return lerp(seeded(left + seedOffset, this.seed), seeded(left + seedOffset + 1, this.seed), t);
  }
}

const failPalette = (): BackgroundPalette => {
  throw new Error("At least one background palette is required.");
};

const hashText = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seeded = (index: number, seed: number): number => {
  let value = Math.imul((index + 0x9e3779b9) ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
};

const smoothstep = (value: number): number => value * value * (3 - (2 * value));
const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);
