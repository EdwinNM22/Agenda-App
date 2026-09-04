#!/usr/bin/env python3
"""Generate favicon + PWA icons from the EC Assistant wordmark PNG."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SRC = Path.home() / "Downloads" / "ec-assistant-logo.png"
BG = (10, 10, 10)
PADDING = 0.16
# Optical tweak after crosshair check (wide EC mark reads slightly low/left)
NUDGE_X = 60
NUDGE_Y = 22


def flatten(im: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", im.size, (*BG, 255))
    return Image.alpha_composite(bg, im).convert("RGB")


def extract_ec_mark(img: Image.Image) -> Image.Image:
    w, h = img.size
    ec = img.crop((0, 0, w, int(h * 0.715)))
    arr = np.array(ec)
    lum = arr[..., :3].max(axis=2)
    alpha = arr[..., 3]
    mask = (lum > 45) & (alpha > 30)
    ys, xs = np.where(mask)
    return ec.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def square_icon(mark: Image.Image) -> Image.Image:
    mw, mh = mark.size
    inner = 1 - 2 * PADDING
    side = int(max(mw / inner, mh / inner))
    canvas = Image.new("RGBA", (side, side), (*BG, 255))
    ox = (side - mw) // 2 + NUDGE_X
    oy = (side - mh) // 2 + NUDGE_Y
    canvas.paste(mark, (ox, oy), mark)
    return canvas


def save_png(im: Image.Image, path: Path, size: int) -> None:
    flatten(im).resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)


def save_jpg(im: Image.Image, path: Path, size: int | None) -> None:
    out = flatten(im)
    if size:
        out = out.resize((size, size), Image.Resampling.LANCZOS)
    out.save(path, "JPEG", quality=94, optimize=True)


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing source logo: {SRC}")

    img = Image.open(SRC).convert("RGBA")
    mark = extract_ec_mark(img)
    square = square_icon(mark)

    maskable_size = 512
    logo_px = int(maskable_size * 0.64)
    maskable = Image.new("RGBA", (maskable_size, maskable_size), (*BG, 255))
    scaled = square.resize((logo_px, logo_px), Image.Resampling.LANCZOS)
    maskable.paste(scaled, ((maskable_size - logo_px) // 2, (maskable_size - logo_px) // 2), scaled)

    brand = PUBLIC / "brand"
    pwa = PUBLIC / "pwa"
    brand.mkdir(parents=True, exist_ok=True)
    pwa.mkdir(parents=True, exist_ok=True)

    full = img.copy()
    if full.width > 480:
        ratio = 480 / full.width
        full = full.resize((480, int(full.height * ratio)), Image.Resampling.LANCZOS)
    full.save(brand / "ec-assistant-logo.png", optimize=True)
    square.save(brand / "ec-assistant-icon.png", optimize=True)

    for size in (16, 32, 48):
        save_png(square, PUBLIC / f"favicon-{size}.png", size)
    save_png(square, PUBLIC / "favicon.png", 48)

    save_jpg(square, PUBLIC / "apple-touch-icon.jpg", 180)
    save_jpg(square, pwa / "apple-touch-icon.jpg", 180)
    save_jpg(square, pwa / "icon-192x192.jpg", 192)
    save_jpg(square, pwa / "icon-512x512.jpg", 512)
    save_jpg(square, pwa / "maskable-192x192.jpg", 192)
    save_jpg(maskable, pwa / "maskable-512x512.jpg", None)

    print(f"OK mark={mark.size} canvas={square.size}")


if __name__ == "__main__":
    main()
