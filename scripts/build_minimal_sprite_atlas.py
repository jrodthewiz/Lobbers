from __future__ import annotations

import json
import math
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
        draw.ellipse((x + 8, y + 68, x + 120, y + 88), fill=(4, 10, 18, 122))
        draw.ellipse((x + 25, y + 72, x + 104, y + 83), fill=(3, 7, 13, 86))
        draw.rectangle((x + 30, y + 75, x + 98, y + 80), fill=(3, 7, 13, 42))
        return

    if pilot:
        skin = (245, 208, 169, 255)
        suit = palette["light"]
        helmet = palette["base"]
        helmet_dark = palette["dark"]
        draw.ellipse((x + 43, y + 29, x + 85, y + 69), fill=(62, 36, 24, 255))
        draw.ellipse((x + 48, y + 29, x + 80, y + 60), fill=skin)
        draw.pieslice((x + 45, y + 22, x + 83, y + 56), 190, 350, fill=helmet, outline=helmet_dark, width=2)
        draw.rectangle((x + 51, y + 39, x + 79, y + 47), fill=(15, 23, 42, 210))
        draw.rectangle((x + 55, y + 41, x + 62, y + 45), fill=(125, 211, 252, 210))
        draw.rectangle((x + 68, y + 41, x + 75, y + 45), fill=(125, 211, 252, 210))
        draw.line((x + 63, y + 44, x + 68, y + 44), fill=(226, 232, 240, 180), width=1)
        draw.arc((x + 58, y + 47, x + 76, y + 58), start=12, end=154, fill=(91, 47, 28, 220), width=2)
        draw.line((x + 77, y + 46, x + 88, y + 50), fill=(15, 23, 42, 255), width=2)
        draw.line((x + 88, y + 50, x + 97, y + 48), fill=(203, 213, 225, 210), width=2)
        draw_rounded(draw, (x + 41, y + 55, x + 87, y + 77), 10, suit, (8, 20, 36, 230), 2)
        draw.polygon([(x + 43, y + 59), (x + 63, y + 69), (x + 86, y + 58), (x + 86, y + 76), (x + 43, y + 76)], fill=palette["base"])
        draw.line((x + 49, y + 71, x + 78, y + 60), fill=(255, 255, 255, 95), width=2)
        draw.rectangle((x + 40, y + 73, x + 88, y + 78), fill=(15, 23, 42, 170))
        return

    base = palette["base"]
    dark = palette["dark"]
    light = palette["light"]
    accent = palette["accent"]
    metal = (202, 213, 225, 255)
    black = (6, 12, 24, 255)

    tread_y = y + 50 + (tread_phase % 2)
    draw.ellipse((x + 7, y + 61, x + 121, y + 86), fill=(2, 8, 23, 215))
    draw_rounded(draw, (x + 13, tread_y, x + 115, y + 79), 10, black, (12, 22, 40, 255), 2)
    draw.line((x + 20, y + 56, x + 108, y + 56), fill=(148, 163, 184, 95), width=2)
    draw.line((x + 20, y + 73, x + 108, y + 73), fill=(2, 6, 23, 210), width=2)
    for i in range(9):
        cx = x + 21 + (i * 10)
        offset = ((i + tread_phase) % 4) - 1
        shade = 44 + ((i + tread_phase) % 3) * 16
        draw_rounded(draw, (cx - 4, y + 57 + offset, cx + 8, y + 73 + offset), 5, (shade, 54, 75, 255), (203, 213, 225, 120), 1)
        draw.line((cx - 2, y + 61 + offset, cx + 6, y + 61 + offset), fill=(255, 255, 255, 56), width=1)

    hull = [(x + 18, y + 52), (x + 34, y + 31), (x + 89, y + 27), (x + 111, y + 47), (x + 104, y + 65), (x + 28, y + 67)]
    draw.polygon(hull, fill=base)
    draw.line(hull + [hull[0]], fill=dark, width=3, joint="curve")
    draw.polygon([(x + 35, y + 34), (x + 87, y + 31), (x + 101, y + 43), (x + 27, y + 49)], fill=light)
    draw.polygon([(x + 22, y + 54), (x + 104, y + 50), (x + 98, y + 63), (x + 30, y + 64)], fill=dark)
    draw.line((x + 34, y + 39, x + 89, y + 36), fill=(255, 255, 255, 110), width=2)
    for panel in range(4):
        px = x + 34 + panel * 15
        draw.line((px, y + 52, px + 5, y + 63), fill=(15, 23, 42, 95), width=2)

    draw_rounded(draw, (x + 44, y + 17, x + 84, y + 40), 9, base, dark, 3)
    draw.rectangle((x + 53, y + 21, x + 75, y + 32), fill=accent, outline=(255, 255, 255, 70), width=1)
    draw.line((x + 57, y + 23, x + 72, y + 23), fill=(255, 255, 255, 125), width=2)
    draw.line((x + 78, y + 29, x + 111, y + 24), fill=dark, width=5)
    draw.line((x + 80, y + 28, x + 112, y + 23), fill=metal, width=2)
    draw.ellipse((x + 25, y + 41, x + 42, y + 58), fill=metal, outline=dark, width=2)
    draw.ellipse((x + 86, y + 38, x + 105, y + 57), fill=metal, outline=dark, width=2)
    draw.ellipse((x + 29, y + 45, x + 38, y + 54), fill=(125, 211, 252, 230))
    draw.ellipse((x + 91, y + 43, x + 100, y + 52), fill=(250, 204, 21, 210))
    draw.rectangle((x + 25, y + 68, x + 103, y + 72), fill=(255, 255, 255, 64))
    draw.rectangle((x + 33, y + 66, x + 96, y + 69), fill=(8, 13, 24, 145))
    draw.line((x + 38, y + 30, x + 29, y + 15), fill=dark, width=2)
    draw.ellipse((x + 27, y + 12, x + 32, y + 17), fill=accent, outline=dark, width=1)
    for puff in range(max(0, tread_phase - 1)):
        draw.ellipse((x + 8 - puff * 7, y + 47 - puff * 3, x + 18 - puff * 7, y + 55 - puff * 3), fill=(148, 163, 184, 70 - puff * 18))

    if damaged:
        draw.line((x + 39, y + 34, x + 51, y + 44, x + 45, y + 55), fill=(15, 23, 42, 230), width=4)
        draw.line((x + 75, y + 33, x + 90, y + 46, x + 81, y + 60), fill=(15, 23, 42, 230), width=4)
        draw.polygon([(x + 29, y + 52), (x + 45, y + 47), (x + 42, y + 63)], fill=(248, 113, 113, 210))
        draw.polygon([(x + 79, y + 50), (x + 98, y + 45), (x + 92, y + 62)], fill=(251, 146, 60, 185))
        draw.ellipse((x + 3, y + 35, x + 24, y + 50), fill=(71, 85, 105, 110))
        draw.ellipse((x + 10, y + 27, x + 33, y + 43), fill=(30, 41, 59, 82))


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


def build_generated_gameplay_sheet() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (512, 256), (255, 255, 255, 0))
    draw = ImageDraw.Draw(sheet, "RGBA")

    def glow(cx: int, cy: int, color: tuple[int, int, int, int]) -> None:
        draw.ellipse((cx - 38, cy - 38, cx + 38, cy + 38), fill=(color[0], color[1], color[2], 36))
        draw.ellipse((cx - 27, cy - 27, cx + 27, cy + 27), fill=(color[0], color[1], color[2], 54))

    # New ammo icons.
    glow(32, 32, (96, 165, 250, 255))
    draw.ellipse((10, 18, 54, 46), fill=(96, 165, 250, 255), outline=(219, 234, 254, 255), width=3)
    draw.arc((12, 20, 52, 44), 20, 340, fill=(30, 64, 175, 255), width=4)

    glow(96, 32, (251, 146, 60, 255))
    draw.ellipse((72, 10, 120, 54), fill=(71, 85, 105, 255), outline=(253, 186, 116, 255), width=3)
    draw.rectangle((89, 4, 103, 18), fill=(251, 146, 60, 255))
    draw.line((82, 43, 110, 22), fill=(255, 255, 255, 95), width=3)

    glow(160, 32, (250, 204, 21, 255))
    draw.polygon([(134, 36), (188, 10), (174, 30), (190, 38), (136, 50)], fill=(254, 240, 138, 255), outline=(113, 63, 18, 255))
    draw.line((145, 39, 179, 22), fill=(255, 255, 255, 150), width=3)

    glow(224, 32, (52, 211, 153, 255))
    draw.ellipse((200, 14, 248, 50), fill=(20, 184, 166, 255), outline=(187, 247, 208, 255), width=3)
    for angle in range(0, 360, 72):
        x = 224 + int(math.cos(math.radians(angle)) * 29)
        y = 32 + int(math.sin(math.radians(angle)) * 25)
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(240, 171, 252, 255))

    glow(288, 32, (203, 213, 225, 255))
    draw.polygon([(264, 14), (306, 10), (318, 28), (302, 54), (270, 50), (258, 30)], fill=(100, 116, 139, 255), outline=(226, 232, 240, 255))
    draw.line((272, 23, 302, 18), fill=(255, 255, 255, 105), width=3)

    # Pickup icons.
    glow(32, 112, (125, 211, 252, 255))
    draw_rounded(draw, (11, 90, 53, 134), 8, (37, 99, 235, 255), (219, 234, 254, 255), 3)
    draw.polygon([(32, 98), (47, 107), (43, 129), (32, 137), (21, 129), (17, 107)], fill=(125, 211, 252, 255))

    glow(96, 112, (52, 211, 153, 255))
    draw_rounded(draw, (71, 89, 121, 135), 9, (20, 83, 45, 255), (187, 247, 208, 255), 3)
    draw.ellipse((82, 99, 110, 127), fill=(52, 211, 153, 255))
    draw.line((77, 107, 116, 107), fill=(255, 255, 255, 110), width=3)

    glow(160, 112, (250, 204, 21, 255))
    draw.polygon([(134, 117), (158, 87), (154, 108), (188, 108), (162, 139), (166, 118)], fill=(250, 204, 21, 255), outline=(255, 251, 235, 255))

    # Interactive world props.
    draw.ellipse((16, 219, 72, 235), fill=(5, 9, 12, 96))
    draw_rounded(draw, (22, 166, 66, 228), 12, (95, 43, 31, 255), (28, 18, 16, 255), 3)
    draw.rectangle((22, 177, 66, 188), fill=(134, 63, 43, 255))
    draw.rectangle((22, 207, 66, 218), fill=(56, 31, 27, 255))
    draw.rectangle((26, 162, 62, 172), fill=(51, 65, 85, 255), outline=(203, 213, 225, 255), width=2)
    draw.rectangle((26, 222, 62, 232), fill=(51, 65, 85, 255), outline=(203, 213, 225, 255), width=2)
    draw.polygon([(44, 184), (55, 202), (45, 202), (52, 218), (32, 194), (43, 194)], fill=(250, 204, 21, 255), outline=(120, 53, 15, 255))
    draw.line((34, 171, 58, 169), fill=(255, 255, 255, 95), width=2)

    draw.ellipse((91, 222, 157, 237), fill=(5, 9, 12, 86))
    draw_rounded(draw, (91, 177, 157, 229), 6, (121, 83, 45, 255), (46, 28, 16, 255), 3)
    draw.rectangle((99, 185, 149, 221), fill=(151, 104, 53, 255), outline=(82, 49, 25, 255), width=2)
    draw.line((91, 196, 157, 196), fill=(229, 191, 113, 160), width=4)
    draw.line((123, 177, 123, 229), fill=(82, 49, 25, 210), width=4)
    draw_rounded(draw, (108, 192, 140, 212), 5, (20, 83, 45, 255), (187, 247, 208, 255), 2)
    draw.ellipse((117, 197, 131, 207), fill=(52, 211, 153, 255))

    sheet.save(SOURCE_DIR / "generated-gameplay-sprites.png")


FRAMES: tuple[FrameSource, ...] = (
    # Runtime-compatible weapon frames from the previous atlas.
    FrameSource("ammo/javelin", "equipment-icons-fx.png", (181, 512, 295, 633)),
    FrameSource("ammo/shotput", "equipment-icons-fx.png", (456, 510, 572, 632)),
    FrameSource("ammo/splitter", "equipment-icons-fx.png", (822, 772, 925, 840)),
    FrameSource("ammo/discus-generated", "generated-gameplay-sprites.png", (0, 0, 64, 64)),
    FrameSource("ammo/mortar-generated", "generated-gameplay-sprites.png", (64, 0, 128, 64)),
    FrameSource("ammo/needle-generated", "generated-gameplay-sprites.png", (128, 0, 192, 64)),
    FrameSource("ammo/cluster-generated", "generated-gameplay-sprites.png", (192, 0, 256, 64)),
    FrameSource("ammo/anvil-generated", "generated-gameplay-sprites.png", (256, 0, 320, 64)),
    FrameSource("pickup/armor-generated", "generated-gameplay-sprites.png", (0, 64, 64, 160)),
    FrameSource("pickup/cluster-ammo-generated", "generated-gameplay-sprites.png", (64, 64, 128, 160)),
    FrameSource("pickup/dash-generated", "generated-gameplay-sprites.png", (128, 64, 192, 160)),
    FrameSource("props/oil-barrel-generated", "generated-gameplay-sprites.png", (0, 160, 88, 244)),
    FrameSource("props/supply-crate-generated", "generated-gameplay-sprites.png", (88, 160, 168, 244)),
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
    build_generated_gameplay_sheet()
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
