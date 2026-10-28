"""
Cuts the badge sheets in graphic/ into one transparent WebP per asset in public/badges/.

    python scripts/gen-badge-sprites.py

The sheets are generated images (prompts in graphic/badges-prompts.md), so nothing
about them is exact: the grid is found from the whitespace between icons, not from
the image size, and the white around each icon is removed by flood fill from the
cell's edge - white *inside* an outline (an eye, a highlight) stays white.

Sizes are kept relative within a sheet: every icon of a sheet is cropped to the
same square, so a small lightning bolt stays smaller than a wide book. Frames are
the exception - they are centred on their cream disc, because an emblem is placed
on that disc and a star or ribbon must not push it off centre.

Re-run after replacing a sheet. The names below are the contract with
src/utils/achievements.ts; a sheet whose grid does not match is refused.
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "graphic"
OUT = ROOT / "public" / "badges"
SIZE = 192          # output px; shown at up to 96 CSS px, so sharp at 2x
OUTLINE = np.array([0x2B, 0x1A, 0x10], dtype=np.float32)
# Emblems whose lines enclose bare paper (the constellation's triangle, the gaps
# in the letter wheel): every white region is background, not just the outer one.
# Not applied generally - the ferry's hull and the stamp's face are white paint.
KNOCKOUT = {"constellations", "word-wheel"}

SHEETS = {
    "badges_frames.png": (3, 2, ["frame-bronze", "frame-silver", "frame-gold", "frame-platinum", "frame-locked", "frame-special"]),
    "badges_emblems_1.png": (4, 4, [
        "flags", "capitals", "us-states", "map",
        "constellations", "elements", "quantities", "formulas",
        "sharp-eye", "paint", "word-wheel", "higher-lower",
        "scholar", "dedication", "all-rounder", "rally",
    ]),
    "badges_emblems_2.png": (4, 4, [
        "streak", "full-day", "gauntlet", "deduction",
        "connections", "flagle", "road-trip", "continents",
        "stamps", "landmarks", "border-chain", "conqueror",
        "pvp", "highscore", "ferries", "drift",
    ]),
    "badges_ranks.png": (4, 2, [f"rank-{i}" for i in range(8)]),
    "badges_fx.png": (3, 2, ["lock", "unlock", "ribbon", "sparkle", "burst", "confetti"]),
}


def content_mask(rgb: np.ndarray) -> np.ndarray:
    """Anything that is not near-white paper."""
    lo = rgb.min(axis=2)
    spread = rgb.max(axis=2) - lo
    return (lo < 225) | (spread > 30)


def bands(profile: np.ndarray, count: int) -> list[tuple[int, int]]:
    """Splits a 1-D occupancy profile into `count` runs at its widest empty gaps."""
    filled = profile > 0
    runs, start = [], None
    for i, f in enumerate(filled):
        if f and start is None:
            start = i
        elif not f and start is not None:
            runs.append([start, i])
            start = None
    if start is not None:
        runs.append([start, len(filled)])
    # Merge across the narrowest gaps until the expected count remains (separate
    # parts of one icon - rays, confetti, bubbles - leave small gaps).
    while len(runs) > count:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        j = int(np.argmin(gaps))
        runs[j] = [runs[j][0], runs[j + 1][1]]
        del runs[j + 1]
    if len(runs) != count:
        raise SystemExit(f"expected {count} bands, found {len(runs)}")
    # Cut midway through each gap so every cell keeps its own margin.
    cuts = [0] + [(runs[i][1] + runs[i + 1][0]) // 2 for i in range(count - 1)] + [len(filled)]
    return [(cuts[i], cuts[i + 1]) for i in range(count)]


def flood_background(cell: np.ndarray, everywhere: bool = False) -> np.ndarray:
    """Pixels light enough to be paper or anti-aliasing, reachable from the cell edge
    (or, with `everywhere`, from any pure-white pixel)."""
    h, w, _ = cell.shape
    light = cell.min(axis=2) > 150
    seen = np.zeros((h, w), bool)
    stack = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    if everywhere:
        paper = (cell.min(axis=2) > 246) & (cell.max(axis=2).astype(int) - cell.min(axis=2) < 8)
        stack += list(zip(*np.nonzero(paper)))
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x] or not light[y, x]:
            continue
        seen[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    return seen


def cutout(cell: np.ndarray, everywhere: bool = False) -> np.ndarray:
    """RGBA: the paper gone, its anti-aliased rim re-expressed as outline colour + alpha."""
    rgb = cell.astype(np.float32)
    bg = flood_background(cell, everywhere)
    alpha = np.ones(rgb.shape[:2], np.float32)
    # A rim pixel is white blended over the dark outline: recover how much outline it holds.
    lum = rgb.mean(axis=2)
    out_lum = OUTLINE.mean()
    rim = np.clip((255 - lum) / (255 - out_lum), 0, 1)
    alpha[bg] = rim[bg]
    rgb[bg] = OUTLINE
    alpha[alpha < 0.04] = 0
    return np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)


def disc_centre(rgba: np.ndarray) -> tuple[float, float]:
    """Centre of the frame's cream disc (#FFF1C9-ish), which is what an emblem sits on."""
    r, g, b, a = [rgba[..., i].astype(int) for i in range(4)]
    cream = (a > 200) & (r > 235) & (g > 215) & (b > 160) & (b < 225) & (r - b > 25)
    # The locked frame's disc is the same cream; fall back to the bounding box if not found.
    if cream.sum() < 500:
        ys, xs = np.nonzero(a > 0)
        return (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    # Largest cream area near the middle: take the central row/column extents.
    ys, xs = np.nonzero(cream)
    cy, cx = np.median(ys), np.median(xs)
    row = np.nonzero(cream[int(cy)])[0]
    col = np.nonzero(cream[:, int(cx)])[0]
    return (col.min() + col.max()) / 2, (row.min() + row.max()) / 2


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet, (cols, rows, names) in SHEETS.items():
        path = SRC / sheet
        if not path.exists():
            raise SystemExit(f"missing {path}")
        rgb = np.asarray(Image.open(path).convert("RGB"))
        mask = content_mask(rgb)
        ybands = bands(mask.sum(axis=1), rows)
        cells = []
        for (y0, y1) in ybands:
            xbands = bands(mask[y0:y1].sum(axis=0), cols)
            for (x0, x1) in xbands:
                name = names[len(cells)]
                rgba = cutout(rgb[y0:y1, x0:x1], name in KNOCKOUT)
                ys, xs = np.nonzero(rgba[..., 3] > 0)
                cells.append((rgba, ys.min(), ys.max(), xs.min(), xs.max()))

        is_frame = sheet == "badges_frames.png"
        # One square for the whole sheet, so relative sizes survive.
        if is_frame:
            centres = [disc_centre(c[0]) for c in cells]
            half = max(max(cy - y0, y1 - cy, cx - x0, x1 - cx) for (c, y0, y1, x0, x1), (cy, cx) in zip(cells, centres))
        else:
            centres = [((y0 + y1) / 2, (x0 + x1) / 2) for (_, y0, y1, x0, x1) in cells]
            half = max(max(y1 - y0, x1 - x0) / 2 for (_, y0, y1, x0, x1) in cells)
        half = int(half * 1.04) + 2

        for (rgba, *_), (cy, cx), name in zip(cells, centres, names):
            canvas = Image.new("RGBA", (half * 2, half * 2), (0, 0, 0, 0))
            img = Image.fromarray(rgba, "RGBA")
            canvas.paste(img, (int(round(half - cx)), int(round(half - cy))))
            canvas.resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f"{name}.webp", "WEBP", quality=90, method=6)
        print(f"{sheet}: {len(cells)} -> {', '.join(names)}")


if __name__ == "__main__":
    sys.setrecursionlimit(10000)
    main()
