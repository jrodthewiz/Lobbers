from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image
from PIL import ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "client" / "src" / "assets"
SOURCE_DIR = OUT_DIR / "source-sheets"
ATLAS_IMAGE = OUT_DIR / "lobbers-minimal-atlas.png"
ATLAS_JSON = OUT_DIR / "lobbers-minimal-atlas.json"
FAVICON_IMAGE = OUT_DIR / "lobbers-favicon.png"


@dataclass(frozen=True)
class FrameSource:
    name: str
    source: str
    box: tuple[int, int, int, int]


def draw_rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: tuple[int, int, int, int], outline: tuple[int, int, int, int] | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_tank_frame(
    image: Image.Image,
    x: int,
    y: int,
    palette: dict[str, tuple[int, int, int, int]],
    tread_phase: int,
    damaged: bool = False,
    pilot: bool = False,
    shadow: bool = False,
) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    if shadow:
        draw.ellipse((x + 14, y + 68, x + 114, y + 86), fill=(4, 10, 18, 110))
        draw.ellipse((x + 28, y + 72, x + 100, y + 82), fill=(3, 7, 13, 72))
        return

    if pilot:
        skin = (245, 208, 169, 255)
        suit = palette["light"]
        draw.ellipse((x + 47, y + 31, x + 81, y + 65), fill=(83, 48, 29, 255))
        draw.ellipse((x + 49, y + 28, x + 79, y + 58), fill=skin)
        draw.arc((x + 50, y + 27, x + 78, y + 56), start=194, end=344, fill=(114, 63, 38, 255), width=5)
        draw_rounded(draw, (x + 43, y + 53, x + 85, y + 75), 10, suit, (8, 20, 36, 210), 2)
        draw.ellipse((x + 61, y + 40, x + 67, y + 46), fill=(2, 6, 23, 255))
        draw.ellipse((x + 69, y + 39, x + 75, y + 45), fill=(2, 6, 23, 255))
        draw.arc((x + 61, y + 43, x + 76, y + 54), start=12, end=150, fill=(91, 47, 28, 230), width=2)
        draw.line((x + 52, y + 67, x + 76, y + 56), fill=(255, 255, 255, 90), width=2)
        return

    base = palette["base"]
    dark = palette["dark"]
    light = palette["light"]
    accent = palette["accent"]
    metal = (202, 213, 225, 255)
    black = (6, 12, 24, 255)

    draw.ellipse((x + 9, y + 60, x + 119, y + 84), fill=(2, 8, 23, 205))
    draw_rounded(draw, (x + 16, y + 48, x + 112, y + 77), 13, black, (12, 22, 40, 255), 2)
    for i in range(8):
        cx = x + 25 + (i * 11)
        offset = ((i + tread_phase) % 4) - 1
        draw_rounded(draw, (cx - 5, y + 56 + offset, cx + 8, y + 72 + offset), 5, (30, 41, 59, 255), (148, 163, 184, 135), 1)
    draw.line((x + 20, y + 61, x + 108, y + 61), fill=(226, 232, 240, 90), width=2)

    hull = [(x + 21, y + 51), (x + 35, y + 31), (x + 92, y + 28), (x + 110, y + 49), (x + 101, y + 64), (x + 28, y + 65)]
    draw.polygon(hull, fill=base)
    draw.line(hull + [hull[0]], fill=dark, width=3, joint="curve")
    draw.polygon([(x + 36, y + 35), (x + 90, y + 32), (x + 101, y + 45), (x + 28, y + 49)], fill=light)
    draw.polygon([(x + 24, y + 53), (x + 101, y + 50), (x + 96, y + 62), (x + 31, y + 63)], fill=dark)
    draw.line((x + 33, y + 38, x + 92, y + 36), fill=(255, 255, 255, 95), width=2)

    draw_rounded(draw, (x + 46, y + 17, x + 82, y + 39), 9, base, dark, 3)
    draw.rectangle((x + 55, y + 21, x + 73, y + 31), fill=accent)
    draw.line((x + 58, y + 22, x + 71, y + 22), fill=(255, 255, 255, 110), width=2)
    draw.ellipse((x + 27, y + 41, x + 43, y + 57), fill=metal, outline=dark, width=2)
    draw.ellipse((x + 86, y + 39, x + 103, y + 56), fill=metal, outline=dark, width=2)
    draw.rectangle((x + 26, y + 68, x + 101, y + 72), fill=(255, 255, 255, 58))

    if damaged:
        draw.line((x + 43, y + 35, x + 51, y + 44, x + 45, y + 52), fill=(15, 23, 42, 210), width=3)
        draw.line((x + 77, y + 34, x + 88, y + 45, x + 82, y + 58), fill=(15, 23, 42, 210), width=3)
        draw.polygon([(x + 34, y + 51), (x + 45, y + 47), (x + 42, y + 59)], fill=(248, 113, 113, 190))


def build_tank_source_sheet() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (1024, 384), (255, 255, 255, 0))
    palettes = {
        "blue": {
            "base": (37, 99, 235, 255),
            "dark": (30, 64, 175, 255),
            "light": (125, 211, 252, 255),
            "accent": (219, 234, 254, 255),
        },
        "red": {
            "base": (220, 38, 38, 255),
            "dark": (153, 27, 27, 255),
            "light": (253, 164, 175, 255),
            "accent": (254, 226, 226, 255),
        },
    }

    draw_tank_frame(sheet, 0, 0, palettes["blue"], 0, shadow=True)
    for side_index, side in enumerate(("blue", "red")):
        row_y = 96 + (side_index * 96)
        draw_tank_frame(sheet, 0, row_y, palettes[side], 0)
        draw_tank_frame(sheet, 128, row_y, palettes[side], 0, damaged=True)
        for phase in range(4):
            draw_tank_frame(sheet, 256 + (phase * 128), row_y, palettes[side], phase)
        draw_tank_frame(sheet, 768, row_y, palettes[side], 0, pilot=True)

    sheet.save(SOURCE_DIR / "tank-sprites.png")


FRAMES: tuple[FrameSource, ...] = (
    # Runtime-compatible weapon frames from the previous atlas.
    FrameSource("ammo/javelin", "equipment-icons-fx.png", (181, 512, 295, 633)),
    FrameSource("ammo/shotput", "equipment-icons-fx.png", (456, 510, 572, 632)),
    FrameSource("ammo/splitter", "equipment-icons-fx.png", (822, 772, 925, 840)),
    FrameSource("props/barrier-striped", "stadium-props.png", (279, 415, 410, 478)),
    FrameSource("props/flag-blue", "stadium-props.png", (1079, 852, 1130, 966)),
    FrameSource("props/flag-red", "stadium-props.png", (1012, 852, 1062, 966)),

    # Player tank sprites.
    FrameSource("tank/shadow", "tank-sprites.png", (0, 0, 128, 96)),
    FrameSource("tank/blue/body-idle", "tank-sprites.png", (0, 96, 128, 192)),
    FrameSource("tank/blue/body-damaged", "tank-sprites.png", (128, 96, 256, 192)),
    FrameSource("tank/blue/tread-0", "tank-sprites.png", (256, 96, 384, 192)),
    FrameSource("tank/blue/tread-1", "tank-sprites.png", (384, 96, 512, 192)),
    FrameSource("tank/blue/tread-2", "tank-sprites.png", (512, 96, 640, 192)),
    FrameSource("tank/blue/tread-3", "tank-sprites.png", (640, 96, 768, 192)),
    FrameSource("tank/blue/pilot", "tank-sprites.png", (768, 96, 896, 192)),
    FrameSource("tank/red/body-idle", "tank-sprites.png", (0, 192, 128, 288)),
    FrameSource("tank/red/body-damaged", "tank-sprites.png", (128, 192, 256, 288)),
    FrameSource("tank/red/tread-0", "tank-sprites.png", (256, 192, 384, 288)),
    FrameSource("tank/red/tread-1", "tank-sprites.png", (384, 192, 512, 288)),
    FrameSource("tank/red/tread-2", "tank-sprites.png", (512, 192, 640, 288)),
    FrameSource("tank/red/tread-3", "tank-sprites.png", (640, 192, 768, 288)),
    FrameSource("tank/red/pilot", "tank-sprites.png", (768, 192, 896, 288)),

    # UI identity icons.
    FrameSource("ui/ammo-javelin", "equipment-icons-fx.png", (181, 512, 295, 633)),
    FrameSource("ui/ammo-shotput", "equipment-icons-fx.png", (456, 510, 572, 632)),
    FrameSource("ui/ammo-splitter", "equipment-icons-fx.png", (318, 510, 440, 632)),
    FrameSource("ui/medal-gold", "equipment-icons-fx.png", (734, 512, 846, 628)),
    FrameSource("ui/target-red", "equipment-icons-fx.png", (443, 656, 538, 724)),
    FrameSource("ui/target-blue", "equipment-icons-fx.png", (573, 656, 668, 724)),
    FrameSource("ui/arrow-red", "equipment-icons-fx.png", (680, 665, 784, 725)),
    FrameSource("ui/arrow-blue", "equipment-icons-fx.png", (788, 665, 877, 725)),
    FrameSource("ui/arrow-gold", "equipment-icons-fx.png", (880, 665, 970, 725)),
    FrameSource("ui/crate-star", "equipment-icons-fx.png", (174, 806, 267, 899)),
    FrameSource("ui/crate-health", "equipment-icons-fx.png", (596, 806, 690, 900)),
    FrameSource("ui/trophy-generated", "generated-ui-sprites.png", (30, 56, 304, 350)),
    FrameSource("ui/medal-silver-generated", "generated-ui-sprites.png", (348, 60, 522, 350)),
    FrameSource("ui/warning-generated", "generated-ui-sprites.png", (566, 88, 832, 338)),
    FrameSource("ui/ready-badge-generated", "generated-ui-sprites.png", (852, 130, 1218, 332)),
    FrameSource("ui/power-token-generated", "generated-ui-sprites.png", (1250, 100, 1492, 342)),
    FrameSource("ui/pennant-red-generated", "generated-ui-sprites.png", (36, 406, 260, 648)),
    FrameSource("ui/pennant-blue-generated", "generated-ui-sprites.png", (298, 406, 524, 648)),
    FrameSource("ui/start-button-generated", "generated-ui-sprites.png", (556, 416, 822, 632)),
    FrameSource("ui/score-plaque-generated", "generated-ui-sprites.png", (862, 450, 1202, 624)),
    FrameSource("ui/speed-arrow-generated", "generated-ui-sprites.png", (1270, 468, 1500, 604)),
    FrameSource("ui/bracket-left-generated", "generated-ui-sprites.png", (978, 736, 1182, 932)),
    FrameSource("ui/bracket-right-generated", "generated-ui-sprites.png", (1256, 736, 1446, 932)),

    # Arena props.
    FrameSource("props/rack-javelin", "stadium-props.png", (18, 511, 166, 614)),
    FrameSource("props/rack-shotput", "stadium-props.png", (224, 511, 406, 614)),
    FrameSource("props/rack-discs", "stadium-props.png", (430, 511, 590, 614)),
    FrameSource("props/equipment-crate", "stadium-props.png", (690, 511, 815, 614)),
    FrameSource("props/cone-stack", "stadium-props.png", (827, 512, 902, 614)),
    FrameSource("props/scoreboard", "stadium-props.png", (253, 855, 496, 957)),
    FrameSource("props/torch", "stadium-props.png", (633, 852, 710, 960)),
    FrameSource("props/pennants", "stadium-props.png", (798, 842, 940, 900)),

    # VFX sprites.
    FrameSource("fx/confetti-small", "equipment-icons-fx.png", (42, 646, 142, 710)),
    FrameSource("fx/confetti-burst", "equipment-icons-fx.png", (176, 646, 292, 714)),
    FrameSource("fx/impact-javelin", "equipment-icons-fx.png", (430, 965, 505, 1030)),
    FrameSource("fx/impact-shotput", "equipment-icons-fx.png", (548, 958, 642, 1036)),
    FrameSource("fx/spark-blue", "equipment-icons-fx.png", (696, 964, 738, 1018)),
    FrameSource("fx/spark-purple", "equipment-icons-fx.png", (801, 965, 842, 1018)),
    FrameSource("fx/spark-green", "equipment-icons-fx.png", (896, 965, 940, 1018)),
    FrameSource("fx/trail-gold", "equipment-icons-fx.png", (1137, 970, 1195, 1017)),
    FrameSource("fx/trail-blue", "equipment-icons-fx.png", (1229, 970, 1288, 1017)),
    FrameSource("fx/trail-red", "equipment-icons-fx.png", (1322, 970, 1380, 1017)),
    FrameSource("fx/trail-green", "equipment-icons-fx.png", (1404, 970, 1448, 1017)),
    FrameSource("fx/smoke-small", "equipment-icons-fx.png", (40, 936, 112, 1002)),
    FrameSource("fx/smoke-medium", "equipment-icons-fx.png", (202, 925, 302, 1008)),
    FrameSource("fx/smoke-large", "equipment-icons-fx.png", (318, 920, 414, 1016)),
    FrameSource("fx/starburst-gold-generated", "generated-ui-sprites.png", (34, 714, 304, 952)),
    FrameSource("fx/starburst-blue-generated", "generated-ui-sprites.png", (384, 726, 566, 940)),
    FrameSource("fx/confetti-generated", "generated-ui-sprites.png", (620, 690, 912, 940)),
)


def is_background(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a < 18:
        return True
    if r > 190 and g < 80 and b > 170:
        return True
    return r > 218 and g > 218 and b > 218 and max(r, g, b) - min(r, g, b) < 18


def neighbors(x: int, y: int, width: int, height: int) -> Iterable[tuple[int, int]]:
    if x > 0:
        yield x - 1, y
    if x < width - 1:
        yield x + 1, y
    if y > 0:
        yield x, y - 1
    if y < height - 1:
        yield x, y + 1


def remove_checkerboard(crop: Image.Image) -> Image.Image:
    image = crop.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        pixel = pixels[x, y]
        if not is_background(pixel):
            continue

        pixels[x, y] = (255, 255, 255, 0)
        for next_x, next_y in neighbors(x, y, width, height):
            if (next_x, next_y) not in seen:
                queue.append((next_x, next_y))

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 18:
                pixels[x, y] = (255, 255, 255, 0)
                continue
            if r > 170 and g < 115 and b > 150:
                pixels[x, y] = (255, 255, 255, 0)

    return trim_transparent(image)


def trim_transparent(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        return image
    left, top, right, bottom = bounds
    padding = 2
    return image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))


def next_power_of_two(value: int) -> int:
    size = 1
    while size < value:
        size *= 2
    return size


def build_atlas() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build_tank_source_sheet()
    sprites: list[tuple[FrameSource, Image.Image]] = []
    favicon_sprite: Image.Image | None = None

    for frame in FRAMES:
        source = Image.open(SOURCE_DIR / frame.source)
        sprite = remove_checkerboard(source.crop(frame.box))
        if frame.name == "ui/medal-gold":
            favicon_sprite = sprite
        sprites.append((frame, sprite))

    padding = 4
    max_width = 1024
    x = padding
    y = padding
    row_height = 0
    placements: list[tuple[FrameSource, Image.Image, int, int]] = []

    for frame, sprite in sprites:
        if x + sprite.width + padding > max_width:
            x = padding
            y += row_height + padding
            row_height = 0
        placements.append((frame, sprite, x, y))
        x += sprite.width + padding
        row_height = max(row_height, sprite.height)

    atlas_width = next_power_of_two(max_width)
    atlas_height = next_power_of_two(y + row_height + padding)
    atlas = Image.new("RGBA", (atlas_width, atlas_height), (255, 255, 255, 0))
    frames: dict[str, object] = {}

    for frame, sprite, frame_x, frame_y in placements:
        atlas.alpha_composite(sprite, (frame_x, frame_y))
        frames[frame.name] = {
            "frame": {
                "x": frame_x,
                "y": frame_y,
                "w": sprite.width,
                "h": sprite.height,
            },
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {
                "x": 0,
                "y": 0,
                "w": sprite.width,
                "h": sprite.height,
            },
            "sourceSize": {
                "w": sprite.width,
                "h": sprite.height,
            },
        }

    atlas.save(ATLAS_IMAGE)
    if favicon_sprite is not None:
        favicon_sprite.resize((64, 64), Image.Resampling.LANCZOS).save(FAVICON_IMAGE)
    ATLAS_JSON.write_text(
        json.dumps(
            {
                "frames": frames,
                "meta": {
                    "app": "scripts/build_minimal_sprite_atlas.py",
                    "image": ATLAS_IMAGE.name,
                    "format": "RGBA8888",
                    "size": {
                        "w": atlas_width,
                        "h": atlas_height,
                    },
                    "scale": "1",
                },
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build_atlas()
