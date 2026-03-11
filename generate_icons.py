#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path("/Users/jeremy/Desktop/Code/DashNote")
ICONS_DIR = ROOT / "icons"
SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 4
ROTATION_DEGREES = 6  # clockwise


def draw_icon(size: int) -> Image.Image:
    hi = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (hi, hi), "#FFFFFF")
    draw = ImageDraw.Draw(canvas)

    note_size = round(hi * 0.65)
    x0 = (hi - note_size) // 2
    y0 = (hi - note_size) // 2
    x1 = x0 + note_size
    y1 = y0 + note_size

    stroke = SUPERSAMPLE  # downscales to ~1px
    draw.rectangle((x0, y0, x1, y1), outline="#000000", width=stroke)

    fold = max(1, int(note_size * 0.15))
    # Fold drawn as two diagonal lines from top-right edges to inward point.
    fold_point = (x1 - fold, y0 + fold)
    draw.line([(x1 - fold, y0), fold_point], fill="#000000", width=stroke)
    draw.line([(x1, y0 + fold), fold_point], fill="#000000", width=stroke)

    if size > 32:
        line_margin = int(note_size * 0.16)
        line_start_x = x0 + line_margin
        line_end_x = x1 - line_margin
        first_y = y0 + int(note_size * 0.60)
        gap = int(note_size * 0.16)
        draw.line([(line_start_x, first_y), (line_end_x, first_y)], fill="#000000", width=stroke)
        draw.line(
            [(line_start_x, first_y + gap), (line_end_x, first_y + gap)],
            fill="#000000",
            width=stroke,
        )

    rotated = canvas.rotate(-ROTATION_DEGREES, resample=Image.Resampling.BICUBIC, expand=False, fillcolor="#FFFFFF")
    return rotated.resize((size, size), resample=Image.Resampling.LANCZOS)


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    rendered: dict[int, Image.Image] = {}
    for size in SIZES:
        img = draw_icon(size)
        rendered[size] = img
        img.save(ICONS_DIR / f"icon{size}.png", format="PNG")

    rendered[128].save(ROOT / "icon.png", format="PNG")


if __name__ == "__main__":
    main()
