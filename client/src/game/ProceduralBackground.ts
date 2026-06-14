import Phaser from "phaser";
import { WORLD } from "../../../shared/game/constants";

const SKY_TEXTURE = "lobbers-bg-sky";
const CLOUD_TEXTURE = "lobbers-bg-clouds";
const HAZE_TEXTURE = "lobbers-bg-haze";
const FIELD_TEXTURE = "lobbers-bg-field";

export class ProceduralBackground {
  private clouds: Phaser.GameObjects.TileSprite | null = null;
  private haze: Phaser.GameObjects.TileSprite | null = null;
  private fieldGrain: Phaser.GameObjects.TileSprite | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    this.createSkyTexture();
    this.createCloudTexture();
    this.createHazeTexture();
    this.createFieldTexture();

    this.scene.add.image(0, 0, SKY_TEXTURE).setOrigin(0).setDepth(-50);
    this.clouds = this.scene.add
      .tileSprite(0, 72, WORLD.width, 210, CLOUD_TEXTURE)
      .setOrigin(0)
      .setDepth(-48)
      .setAlpha(0.38);
    this.haze = this.scene.add
      .tileSprite(0, WORLD.groundY - 230, WORLD.width, 128, HAZE_TEXTURE)
      .setOrigin(0)
      .setDepth(-47)
      .setAlpha(0.54);
    this.fieldGrain = this.scene.add
      .tileSprite(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY, FIELD_TEXTURE)
      .setOrigin(0)
      .setDepth(-46)
      .setAlpha(0.5);
  }

  update(timeMs: number): void {
    const seconds = timeMs / 1000;
    if (this.clouds) {
      this.clouds.tilePositionX = seconds * 8;
      this.clouds.tilePositionY = Math.sin(seconds * 0.18) * 4;
    }
    if (this.haze) {
      this.haze.tilePositionX = seconds * 3;
    }
    if (this.fieldGrain) {
      this.fieldGrain.tilePositionX = seconds * 1.4;
    }
  }

  private createSkyTexture(): void {
    this.withCanvas(SKY_TEXTURE, WORLD.width, WORLD.height, (ctx, width, height) => {
      const sky = ctx.createLinearGradient(0, 0, 0, WORLD.groundY);
      sky.addColorStop(0, "#111827");
      sky.addColorStop(0.5, "#26384a");
      sky.addColorStop(1, "#7f8f78");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, WORLD.groundY);

      const glow = ctx.createRadialGradient(width * 0.77, 150, 20, width * 0.77, 150, 360);
      glow.addColorStop(0, "rgba(250, 204, 21, 0.2)");
      glow.addColorStop(1, "rgba(250, 204, 21, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, WORLD.groundY);

      this.drawRidge(ctx, width, WORLD.groundY - 118, 62, "rgba(35, 54, 58, 0.92)", 11);
      this.drawRidge(ctx, width, WORLD.groundY - 76, 42, "rgba(26, 42, 42, 0.96)", 19);
      this.drawStands(ctx, width);
      this.drawLightTowers(ctx);
      this.drawGround(ctx, width, height);
    });
  }

  private createCloudTexture(): void {
    this.withCanvas(CLOUD_TEXTURE, 512, 256, (ctx, width, height) => {
      for (let i = 0; i < 24; i += 1) {
        const x = seeded(i, 31) * width;
        const y = 36 + (seeded(i, 43) * 118);
        const radius = 24 + (seeded(i, 59) * 34);
        const alpha = 0.1 + (seeded(i, 71) * 0.16);
        ctx.fillStyle = `rgba(238, 242, 232, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 1.8, radius * 0.46, seeded(i, 83) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  private createHazeTexture(): void {
    this.withCanvas(HAZE_TEXTURE, 1024, 128, (ctx, width, height) => {
      const haze = ctx.createLinearGradient(0, 0, 0, height);
      haze.addColorStop(0, "rgba(255, 255, 255, 0)");
      haze.addColorStop(0.55, "rgba(221, 235, 212, 0.14)");
      haze.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 38) {
        const top = 76 + (seeded(x, 101) * 22);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x + 18, top - 7);
        ctx.lineTo(x + 38, top);
        ctx.stroke();
      }
    });
  }

  private createFieldTexture(): void {
    this.withCanvas(FIELD_TEXTURE, 512, 256, (ctx, width, height) => {
      ctx.fillStyle = "rgba(215, 230, 176, 0.08)";
      for (let x = -height; x < width; x += 58) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x + 34, height);
        ctx.lineTo(x + height + 34, 0);
        ctx.lineTo(x + height, 0);
        ctx.closePath();
        ctx.fill();
      }

      for (let i = 0; i < 360; i += 1) {
        const x = seeded(i, 127) * width;
        const y = seeded(i, 149) * height;
        const alpha = 0.05 + (seeded(i, 163) * 0.12);
        ctx.fillStyle = `rgba(246, 241, 214, ${alpha})`;
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
    seed: number,
  ): void {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(0, WORLD.groundY);
    for (let x = 0; x <= width; x += 32) {
      const y = baseY - (noise1(x * 0.007, seed) * amplitude);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, WORLD.groundY);
    ctx.closePath();
    ctx.fill();
  }

  private drawStands(ctx: CanvasRenderingContext2D, width: number): void {
    const standY = WORLD.groundY - 118;
    ctx.fillStyle = "rgba(15, 23, 42, 0.42)";
    ctx.fillRect(130, standY, width - 260, 78);
    for (let row = 0; row < 4; row += 1) {
      const y = standY + 12 + (row * 15);
      ctx.strokeStyle = `rgba(248, 250, 252, ${0.08 + (row * 0.025)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(150, y);
      ctx.lineTo(width - 150, y);
      ctx.stroke();
    }
  }

  private drawLightTowers(ctx: CanvasRenderingContext2D): void {
    for (const x of [196, WORLD.width - 196]) {
      ctx.strokeStyle = "rgba(216, 222, 233, 0.26)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, WORLD.groundY - 98);
      ctx.lineTo(x, WORLD.groundY - 322);
      ctx.stroke();
      ctx.fillStyle = "rgba(250, 204, 21, 0.22)";
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(x - 35 + (i * 24), WORLD.groundY - 334, 18, 13);
      }
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const ground = ctx.createLinearGradient(0, WORLD.groundY, 0, height);
    ground.addColorStop(0, "#4c613d");
    ground.addColorStop(1, "#253126");
    ctx.fillStyle = ground;
    ctx.fillRect(0, WORLD.groundY, width, height - WORLD.groundY);

    ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
    for (let x = 0; x < width; x += 86) {
      ctx.fillRect(x, WORLD.groundY, 42, height - WORLD.groundY);
    }
  }

  private withCanvas(
    key: string,
    width: number,
    height: number,
    paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  ): void {
    if (this.scene.textures.exists(key)) return;
    const texture = this.scene.textures.createCanvas(key, width, height);
    if (!texture) throw new Error(`Unable to create background texture: ${key}`);
    paint(texture.getContext(), width, height);
    texture.refresh();
  }
}

const seeded = (index: number, seed: number): number => {
  let value = Math.imul(index ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
};

const noise1 = (value: number, seed: number): number => {
  const left = Math.floor(value);
  const t = smoothstep(value - left);
  return lerp(seeded(left, seed), seeded(left + 1, seed), t);
};

const smoothstep = (value: number): number => value * value * (3 - (2 * value));
const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);
