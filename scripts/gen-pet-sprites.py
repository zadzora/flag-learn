"""
The supporters' companion animals, from graphic/support-animals.png.

    python scripts/gen-pet-sprites.py            # writes the sprites
    python scripts/gen-pet-sprites.py --debug    # also draws the rig over each animal (<temp>/pets-debug/)

Writes
  public/pets.webp        every animal, one cell each - the static form, used
                          everywhere at once in a single request
  public/pets/<id>.webp   a strip of frames for the animated ones (RIGS below)
  data/petSprites.json    the order of the cells and the strips' frame counts

The sheet is a generated image, so nothing about it is exact: each animal is the
largest connected sticker in its cell, after flood-filling the grey background
in from the edges (the white sticker border stays - it is what makes the
animals read on the dark theme).

The animation is baked, not rigged at runtime. Each animated animal has a few
"bones": a soft region (a polygon, blurred so the bend has no seam), a pivot
and a motion over the loop - a rotation or a squash. Every frame is the sticker
warped by those bones, plus blinks painted over the eyes the script finds
itself (dark blobs inside the face). Playing the strip is a CSS background
step animation; nothing runs per frame in JavaScript.

Frame 0 of every strip is the untouched animal in exactly the static cell's
framing, so swapping the static cell for the strip never jumps.
"""
from pathlib import Path
from collections import deque
import json
import math
import tempfile
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "graphic" / "support-animals.png"
GRID = [["panda", "koala", "kangaroo", "penguin", "llama", "sloth"],
        ["fox", "polarbear", "elephant", "tiger", "camel", "beaver"],
        ["flamingo", "hedgehog", "turtle", "orangutan", "otter", "owl"]]
CELL = 96            # static cell, px - shown at up to 48 CSS px
FRAME = 160          # animated frame, px - shown at up to 80 CSS px
PAD = 0.10           # room round the sticker for ears and wings to move into
FRAMES = 48
FPS = 12
NAVY = (22, 27, 42)

# --- The rigs -----------------------------------------------------------------
# Coordinates are pixels of the animal's own crop (see --debug). Angles are
# degrees, clockwise on screen. A motion is a list of (t0, t1, value) keys; the
# value is eased between keys and 0 outside them.

def ease(x):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, x)))

def keys(*pts):
    """Piecewise eased curve through (t, value) points; 0 before the first and after the last."""
    def f(t):
        if t <= pts[0][0] or t >= pts[-1][0]:
            return 0.0 if t <= pts[0][0] else pts[-1][1]
        for (ta, va), (tb, vb) in zip(pts, pts[1:]):
            if ta <= t <= tb:
                return va + (vb - va) * ease((t - ta) / (tb - ta))
        return 0.0
    return f

def wave(cycles, amp, phase=0.0):
    return lambda t: amp * math.sin(2 * math.pi * (cycles * t + phase))

def twitch(at, amp, length=0.12):
    """A quick flick and a little bounce back - an ear catching a sound."""
    return keys((at, 0), (at + length * 0.25, amp), (at + length * 0.55, -amp * 0.3), (at + length, 0))

RIGS = {
    "panda": {
        "bones": [
            {"poly": [(0, 0), (72, 0), (74, 38), (54, 60), (22, 74), (0, 66)], "pivot": (52, 58), "rotate": keys((0.08, 0), (0.14, -12), (0.2, 4), (0.26, 0))},
            {"poly": [(140, 0), (224, 0), (224, 66), (200, 62), (172, 46), (140, 30)], "pivot": (172, 48), "rotate": keys((0.18, 0), (0.24, 12), (0.3, -4), (0.36, 0))},
            {"poly": [(0, 0), (224, 0), (224, 160), (0, 160)], "pivot": (112, 172), "rotate": keys((0.45, 0), (0.55, 6), (0.68, 6), (0.78, 0))},
        ],
        "eyes": [(98, 107, 14, 20), (173, 101, 13, 19)],
        "blink": 0.86,
    },
    "kangaroo": {
        "bones": [
            {"shift": keys((0.1, 0), (0.16, 16), (0.22, 0), (0.26, 6), (0.3, 0))},
            {"poly": [(20, 0), (110, 0), (112, 92), (90, 108), (40, 100), (20, 60)], "pivot": (95, 98), "rotate": keys((0.1, 0), (0.16, -10), (0.24, 5), (0.32, 0), (0.6, 0), (0.65, -12), (0.71, 0))},
            {"poly": [(145, 0), (229, 0), (229, 80), (200, 92), (165, 90), (145, 60)], "pivot": (172, 88), "rotate": keys((0.1, 0), (0.16, 10), (0.24, -5), (0.32, 0))},
            {"poly": [(0, 175), (70, 175), (84, 296), (0, 296)], "pivot": (70, 262), "rotate": keys((0.08, 0), (0.16, -10), (0.24, 4), (0.3, 0))},
        ],
        "blink": 0.5,
    },
    "llama": {
        "bones": [
            {"poly": [(40, 0), (110, 0), (108, 70), (95, 88), (60, 88), (40, 60)], "pivot": (88, 85), "rotate": twitch(0.15, -14)},
            {"poly": [(140, 0), (200, 0), (200, 60), (185, 75), (160, 70), (140, 45)], "pivot": (165, 68), "rotate": twitch(0.5, 14)},
        ],
        "blink": 0.75,
    },
    "sloth": {
        "bones": [
            {"poly": [(0, 0), (222, 0), (222, 158), (0, 158)], "pivot": (112, 170), "rotate": keys((0.05, 0), (0.3, 7), (0.55, 7), (0.85, 0))},
        ],
        "eyes": [(91, 96, 13, 18), (169, 89, 13, 18)],
        "blink": 0.36,
        "blink_hold": 7,
    },
    "polarbear": {
        "bones": [
            {"poly": [(10, 0), (80, 0), (78, 45), (55, 62), (25, 70), (10, 50)], "pivot": (58, 58), "rotate": keys((0.1, 0), (0.16, -12), (0.22, 4), (0.28, -8), (0.36, 0))},
            {"poly": [(150, 0), (224, 0), (224, 55), (200, 60), (170, 48), (150, 35)], "pivot": (172, 45), "rotate": keys((0.12, 0), (0.18, 12), (0.24, -4), (0.3, 8), (0.38, 0))},
            {"poly": [(0, 0), (224, 0), (224, 140), (0, 140)], "pivot": (110, 152), "rotate": keys((0.5, 0), (0.6, -6), (0.72, -6), (0.82, 0))},
        ],
        "blink": 0.42,
    },
    "tiger": {
        "bones": [
            {"poly": [(20, 0), (95, 0), (92, 50), (70, 72), (40, 80), (20, 60)], "pivot": (70, 65), "rotate": twitch(0.2, -14)},
            {"poly": [(155, 0), (243, 0), (243, 60), (215, 65), (180, 55), (155, 35)], "pivot": (182, 52), "rotate": twitch(0.55, 14)},
            {"poly": [(0, 150), (62, 150), (66, 254), (0, 254)], "pivot": (62, 228), "rotate": wave(2, 9)},
        ],
        "blink": 0.78,
    },
    "camel": {
        "bones": [
            {"poly": [(130, 0), (278, 0), (278, 125), (200, 128), (150, 112), (125, 60)], "pivot": (160, 112), "rotate": keys((0.1, 0), (0.2, 6), (0.3, -3), (0.4, 5), (0.5, 0))},
            {"poly": [(110, 0), (160, 0), (158, 48), (140, 58), (115, 50)], "pivot": (148, 50), "rotate": twitch(0.65, -14)},
        ],
        "eyes": [(181, 62, 15, 22)],
        "blink": 0.82,
    },
    "beaver": {
        "bones": [
            {"poly": [(0, 100), (95, 100), (98, 210), (0, 210)], "pivot": (95, 175), "rotate": keys((0.1, 0), (0.16, 14), (0.2, -4), (0.26, 12), (0.3, -3), (0.36, 0))},
            {"poly": [(70, 0), (130, 0), (128, 35), (110, 50), (80, 52), (70, 35)], "pivot": (105, 45), "rotate": twitch(0.55, -14)},
            {"poly": [(190, 0), (264, 0), (264, 40), (232, 50), (205, 42), (190, 28)], "pivot": (210, 40), "rotate": twitch(0.6, 14)},
        ],
        "blink": 0.8,
    },
    "flamingo": {
        "bones": [
            {"poly": [(30, 0), (230, 0), (230, 135), (160, 150), (60, 128)], "pivot": (122, 168), "rotate": keys((0.05, 0), (0.18, -7), (0.32, 4), (0.45, 0))},
            # The wing alone: reaching down to y 215 dragged the belly's outline up with it.
            {"poly": [(8, 132), (125, 138), (132, 196), (8, 202)], "pivot": (136, 170), "rotate": keys((0.55, 0), (0.6, 7), (0.65, 0), (0.7, 7), (0.76, 0))},
        ],
        "eyes": [(121, 62, 14, 20)],
        "blink": 0.88,
    },
    "hedgehog": {
        "bones": [
            {"poly": [(0, 0), (95, 0), (90, 255), (0, 255)], "pivot": (110, 150), "rotate": keys((0.15, 0), (0.18, 3), (0.21, -3), (0.24, 3), (0.27, -3), (0.3, 3), (0.33, 0))},
            {"poly": [(90, 40), (248, 40), (248, 190), (90, 190)], "pivot": (165, 200), "rotate": keys((0.5, 0), (0.6, 6), (0.72, 6), (0.82, 0))},
        ],
        "blink": 0.4,
    },
    "turtle": {
        "bones": [
            {"poly": [(115, 0), (261, 0), (261, 140), (150, 140), (115, 100)], "pivot": (150, 138), "rotate": keys((0.45, 0), (0.55, -7), (0.62, 3), (0.7, -5), (0.8, 0))},
            {"poly": [(85, 148), (145, 148), (145, 215), (85, 215)], "pivot": (122, 158), "rotate": wave(2, 10)},
            {"poly": [(180, 148), (225, 148), (225, 215), (180, 215)], "pivot": (190, 158), "rotate": wave(2, -10)},
            {"poly": [(10, 175), (80, 175), (80, 215), (10, 215)], "pivot": (72, 180), "rotate": wave(2, 8, 0.5)},
        ],
        "blink": 0.28,
    },
    "orangutan": {
        "bones": [
            {"poly": [(55, 15), (247, 15), (247, 192), (55, 192)], "pivot": (150, 205), "rotate": keys((0.1, 0), (0.22, 6), (0.36, 6), (0.48, 0))},
            {"poly": [(150, 205), (247, 205), (247, 266), (150, 266)], "pivot": (172, 210), "rotate": keys((0.6, 0), (0.64, -8), (0.68, 0), (0.72, -8), (0.76, 0))},
        ],
        "blink": 0.55,
    },
    "otter": {
        "bones": [
            {"poly": [(0, 0), (248, 0), (248, 140), (0, 140)], "pivot": (125, 152), "rotate": keys((0.1, 0), (0.2, -7), (0.32, -7), (0.42, 0))},
            {"poly": [(0, 140), (68, 140), (72, 215), (0, 215)], "pivot": (66, 196), "rotate": wave(2, 9)},
        ],
        "blink": 0.62,
    },
    "fox": {
        "bones": [
            {"poly": [(0, 0), (108, 0), (112, 92), (92, 116), (40, 128), (0, 118)], "pivot": (86, 114), "rotate": twitch(0.12, -14)},
            {"poly": [(140, 0), (255, 0), (255, 108), (228, 126), (182, 112), (142, 92)], "pivot": (180, 106), "rotate": twitch(0.42, 14)},
            {"poly": [(0, 168), (80, 168), (86, 261), (0, 261)], "pivot": (80, 222), "rotate": wave(2, 7)},
        ],
        "blink": 0.70,
    },
    "penguin": {
        "bones": [
            # Kept off the feet: a region reaching them dragged the foot round with the flipper.
            {"poly": [(0, 118), (62, 118), (64, 194), (30, 204), (0, 198)], "pivot": (60, 126),
             "rotate": keys((0.15, 0), (0.2, 12), (0.25, 2), (0.3, 12), (0.35, 2), (0.4, 12), (0.47, 0))},
            {"poly": [(184, 122), (222, 122), (222, 198), (192, 202)], "pivot": (188, 128),
             "rotate": keys((0.15, 0), (0.2, -12), (0.25, -2), (0.3, -12), (0.35, -2), (0.4, -12), (0.47, 0))},
        ],
        "blink": 0.72,
    },
    "elephant": {
        "bones": [
            {"poly": [(0, 18), (106, 18), (110, 162), (0, 162)], "pivot": (106, 90), "squash": keys((0.08, 0), (0.16, 0.14), (0.24, 0), (0.32, 0.14), (0.4, 0))},
            {"poly": [(200, 0), (273, 0), (273, 138), (200, 138)], "pivot": (202, 72), "squash": keys((0.08, 0), (0.16, 0.14), (0.24, 0), (0.32, 0.14), (0.4, 0))},
            {"poly": [(168, 96), (240, 96), (240, 142), (168, 142)], "pivot": (176, 102), "rotate": wave(1, 5)},
        ],
        "blink": 0.66,
    },
    "owl": {
        "bones": [
            {"poly": [(0, 0), (228, 0), (228, 146), (0, 146)], "pivot": (137, 150),
             "rotate": keys((0.05, 0), (0.15, 8), (0.3, 8), (0.4, 0), (0.48, -6), (0.56, -6), (0.64, 0))},
            {"poly": [(0, 152), (90, 152), (90, 240), (0, 240)], "pivot": (88, 156), "rotate": keys((0.8, 0), (0.84, 10), (0.88, 0), (0.92, 10), (0.96, 0))},
            {"poly": [(182, 152), (228, 152), (228, 232), (182, 232)], "pivot": (186, 156), "rotate": keys((0.8, 0), (0.84, -10), (0.88, 0), (0.92, -10), (0.96, 0))},
        ],
        "blink": 0.74,
    },
    "koala": {
        "bones": [
            {"poly": [(0, 10), (84, 10), (92, 70), (70, 132), (0, 132)], "pivot": (80, 76), "rotate": keys((0.1, 0), (0.17, -10), (0.24, 4), (0.31, -8), (0.4, 0))},
            {"poly": [(166, 0), (264, 0), (264, 136), (186, 126), (166, 70)], "pivot": (170, 66), "rotate": keys((0.14, 0), (0.21, 10), (0.28, -4), (0.35, 8), (0.44, 0))},
        ],
        "blink": 0.68,
    },
}

# --- Cutting --------------------------------------------------------------------

def cut_animals():
    im = np.array(Image.open(SHEET).convert("RGB")).astype(np.int32)
    H, W, _ = im.shape
    corner = np.median(np.concatenate([im[0, :], im[-1, :], im[:, 0], im[:, -1]]), axis=0)
    cand = np.abs(im - corner).sum(axis=2) < 30
    bg = np.zeros((H, W), bool)
    q = deque((y, x) for y in (0, H - 1) for x in range(W) if cand[y, x])
    q.extend((y, x) for x in (0, W - 1) for y in range(H) if cand[y, x])
    for y, x in q:
        bg[y, x] = True
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < H and 0 <= nx < W and cand[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    fg = ~bg
    lab = np.zeros((H, W), np.int32)
    best = {}
    n = 0
    for y in range(H):
        for x in np.nonzero(fg[y] & (lab[y] == 0))[0]:
            if lab[y, x]:
                continue
            n += 1
            q = deque([(y, x)])
            lab[y, x] = n
            pts = 0; sx = sy = 0; x0 = x1 = x; y0 = y1 = y
            while q:
                cy, cx = q.popleft()
                pts += 1; sx += cx; sy += cy
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < H and 0 <= nx < W and fg[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
            if pts < 2000:
                continue
            name = GRID[int(sy / pts // (H / 3))][int(sx / pts // (W / 6))]
            if name not in best or best[name][1] < pts:
                best[name] = (n, pts, x0, y0, x1, y1)
    missing = [nm for row in GRID for nm in row if nm not in best]
    if missing:
        sys.exit(f"Could not find: {missing} - is the grid still 6x3?")
    out = {}
    for name, (k, _, x0, y0, x1, y1) in best.items():
        m = (lab[y0:y1 + 1, x0:x1 + 1] == k).astype(np.float32)
        out[name] = np.dstack([im[y0:y1 + 1, x0:x1 + 1].astype(np.float32), m * 255])
    return out

# --- Helpers --------------------------------------------------------------------

def blur(a, r):
    """Box blur, three passes ~ gaussian. Pure numpy, separable."""
    for _ in range(3):
        for axis in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(2)], mode="edge"), axis=axis)
            a = (np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return a

def polygon_mask(shape, poly):
    img = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(img).polygon(poly, fill=255)
    return np.array(img, np.float32) / 255

def sample(rgba, xs, ys):
    """Bilinear sample of premultiplied RGBA at float coords; outside is transparent."""
    H, W, _ = rgba.shape
    x0 = np.floor(xs).astype(int); y0 = np.floor(ys).astype(int)
    fx = (xs - x0)[..., None]; fy = (ys - y0)[..., None]
    def at(yy, xx):
        ok = (xx >= 0) & (xx < W) & (yy >= 0) & (yy < H)
        v = rgba[np.clip(yy, 0, H - 1), np.clip(xx, 0, W - 1)]
        return v * ok[..., None]
    return (at(y0, x0) * (1 - fx) * (1 - fy) + at(y0, x0 + 1) * fx * (1 - fy)
            + at(y0 + 1, x0) * (1 - fx) * fy + at(y0 + 1, x0 + 1) * fx * fy)

def find_eyes(rgba):
    """The two eyes: dark blobs of eye size, side by side, in the upper two thirds."""
    H, W, _ = rgba.shape
    dark = (rgba[..., :3].sum(axis=2) < 230) & (rgba[..., 3] > 0)
    lab = np.zeros((H, W), np.int32)
    blobs = []
    n = 0
    for y in range(H):
        for x in np.nonzero(dark[y] & (lab[y] == 0))[0]:
            if lab[y, x]:
                continue
            n += 1
            q = deque([(y, x)]); lab[y, x] = n; pts = []
            while q:
                cy, cx = q.popleft(); pts.append((cy, cx))
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < H and 0 <= nx < W and dark[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n; q.append((ny, nx))
            if 120 < len(pts) < 700:
                ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
                w, h = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
                if 0.45 < w / h < 1.15 and max(ys) < H * 0.7:
                    blobs.append({"cx": (min(xs) + max(xs)) / 2, "cy": (min(ys) + max(ys)) / 2, "w": w, "h": h, "area": len(pts)})
    pairs = [(a, b) for i, a in enumerate(blobs) for b in blobs[i + 1:]
             if abs(a["cy"] - b["cy"]) < 14 and 30 < abs(a["cx"] - b["cx"]) < 110 and 0.6 < a["area"] / b["area"] < 1.6]
    if not pairs:
        return []
    a, b = min(pairs, key=lambda p: abs(p[0]["cy"] - p[1]["cy"]))
    return sorted([a, b], key=lambda e: e["cx"])

def paint_blink(rgba, eyes, amount):
    """Closes the eyes by `amount` (0 open, 1 shut): fur over the eye from the top, and a lash line."""
    if amount <= 0 or not eyes:
        return rgba
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img)
    arr = rgba
    for e in eyes:
        cx, cy, w, h = e["cx"], e["cy"], e["w"], e["h"]
        # Fur colour: the median of the ring just outside the eye.
        yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
        r = ((xx - cx) / (w / 2 + 5)) ** 2 + ((yy - cy) / (h / 2 + 5)) ** 2
        # Anything but the outline navy: an eye inside a dark patch (panda, sloth) takes the patch's colour.
        ring = (r > 1.0) & (r < 1.6) & (arr[..., 3] > 200) & (arr[..., :3].sum(axis=2) > 150)
        fur = tuple(int(v) for v in np.median(arr[ring][:, :3], axis=0)) if ring.any() else (240, 230, 210)
        # A closed eye on a dark patch is drawn light, or it would vanish into it.
        lash = NAVY if sum(fur) > 330 else (236, 239, 246)
        top = cy - h / 2 - 2
        lid = top + (h + 4) * amount
        d.rectangle([cx - w / 2 - 2, top, cx + w / 2 + 2, lid], fill=fur + (255,))
        if amount >= 0.95:
            d.ellipse([cx - w / 2 - 2, cy - h / 2 - 2, cx + w / 2 + 2, cy + h / 2 + 2], fill=fur + (255,))
            # A closed eye: a soft downward arc, the kawaii sleeping eye.
            lw = max(3, round(w * 0.28))
            d.arc([cx - w * 0.62, cy - h * 0.55, cx + w * 0.62, cy + h * 0.35], 20, 160, fill=lash + (255,), width=lw)
        else:
            d.line([cx - w / 2 - 1, lid, cx + w / 2 + 1, lid], fill=lash + (255,), width=max(2, round(w * 0.2)))
    return np.array(img, np.float32)

def blink_amount(t, at, hold=2):
    """Open, closing, shut for `hold` frames, opening. A sloth holds it longer."""
    d = 1 / FRAMES
    steps = [(at, 0.5)] + [(at + (i + 1) * d, 1.0) for i in range(hold)] + [(at + (hold + 1) * d, 0.5)]
    for s, v in steps:
        if abs(t - s) < d / 2:
            return v
    return 0.0

# --- Frames ---------------------------------------------------------------------

def square(rgba):
    """The sticker on a square canvas: centred, sitting on the bottom, with PAD round it."""
    h, w, _ = rgba.shape
    side = int(max(w, h) * (1 + 2 * PAD))
    out = np.zeros((side, side, 4), np.float32)
    ox = (side - w) // 2
    oy = side - h - int(max(w, h) * PAD * 0.5)
    out[oy:oy + h, ox:ox + w] = rgba
    return out, ox, oy

def warp(canvas, bones, t, ox, oy):
    side = canvas.shape[0]
    pre = canvas.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    ys, xs = np.mgrid[0:side, 0:side].astype(np.float32)
    dx = np.zeros_like(xs); dy = np.zeros_like(ys)
    for b in bones:
        w = b["weight"]
        px, py = b["pivot"][0] + ox, b["pivot"][1] + oy
        rx, ry = xs - px, ys - py
        if "shift" in b:                        # the whole animal moves (a hop)
            sx, sy = xs, ys + b["shift"](t)
        elif "rotate" in b:
            a = math.radians(-b["rotate"](t))   # inverse map
            sx = px + rx * math.cos(a) - ry * math.sin(a)
            sy = py + rx * math.sin(a) + ry * math.cos(a)
        else:
            s = 1 - b["squash"](t)              # squash towards the pivot, horizontally
            sx = px + rx / max(s, 0.5)
            sy = ys
        dx += w * (sx - xs); dy += w * (sy - ys)
    out = sample(pre, xs + dx, ys + dy)
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 0, out[..., :3] * 255 / np.maximum(a, 1e-3), 0)
    return out

def to_image(arr, size):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    return img.resize((size, size), Image.LANCZOS)

def main():
    debug = "--debug" in sys.argv
    animals = cut_animals()
    order = [nm for row in GRID for nm in row]

    atlas = Image.new("RGBA", (CELL * 6, CELL * 3), (0, 0, 0, 0))
    for i, name in enumerate(order):
        canvas, _, _ = square(animals[name])
        atlas.paste(to_image(canvas, CELL), ((i % 6) * CELL, (i // 6) * CELL))
    (ROOT / "public").mkdir(exist_ok=True)
    atlas.save(ROOT / "public" / "pets.webp", "WEBP", quality=90, method=6)

    (ROOT / "public" / "pets").mkdir(exist_ok=True)
    animated = {}
    for name, rig in RIGS.items():
        src = animals[name]
        # Eyes the finder cannot see (inside a dark patch, or only one in profile) are given by hand.
        eyes = [{"cx": x, "cy": y, "w": w, "h": h} for x, y, w, h in rig["eyes"]] if "eyes" in rig else find_eyes(src)
        if not eyes:
            print(f"  {name}: no eyes found, no blink")
        canvas, ox, oy = square(src)
        bones = []
        for b in rig["bones"]:
            if "shift" in b:
                bones.append({**b, "pivot": (0, 0), "weight": np.ones(canvas.shape[:2], np.float32)})
                continue
            m = np.zeros(canvas.shape[:2], np.float32)
            m[oy:oy + src.shape[0], ox:ox + src.shape[1]] = polygon_mask(src.shape[:2], b["poly"])
            bones.append({**b, "weight": np.clip(blur(m, 5), 0, 1)})
        strip = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
        for f in range(FRAMES):
            t = f / FRAMES
            shut = blink_amount(t, rig["blink"], rig.get("blink_hold", 2))
            base = paint_blink(src, eyes, shut) if shut else src
            c, _, _ = square(base)
            frame = warp(c, bones, t, ox, oy)
            strip.paste(to_image(frame, FRAME), (f * FRAME, 0))
        strip.save(ROOT / "public" / "pets" / f"{name}.webp", "WEBP", quality=88, method=6)
        animated[name] = {"frames": FRAMES, "fps": FPS}
        print(f"  {name}: {FRAMES} frames, eyes {[(round(e['cx']), round(e['cy'])) for e in eyes]}")

        if debug:
            dbg_dir = Path(tempfile.gettempdir()) / "pets-debug"; dbg_dir.mkdir(exist_ok=True)
            img = Image.fromarray(np.clip(src, 0, 255).astype(np.uint8), "RGBA").convert("RGB").resize((src.shape[1] * 2, src.shape[0] * 2))
            d = ImageDraw.Draw(img)
            for b in rig["bones"]:
                if "poly" not in b:
                    continue
                d.polygon([(x * 2, y * 2) for x, y in b["poly"]], outline=(255, 0, 80))
                px, py = b["pivot"]; d.ellipse([px * 2 - 6, py * 2 - 6, px * 2 + 6, py * 2 + 6], fill=(0, 200, 255))
            for e in eyes:
                d.rectangle([(e["cx"] - e["w"] / 2) * 2, (e["cy"] - e["h"] / 2) * 2, (e["cx"] + e["w"] / 2) * 2, (e["cy"] + e["h"] / 2) * 2], outline=(0, 255, 0))
            img.save(dbg_dir / f"{name}.png")

    data = {"cell": CELL, "cols": 6, "order": order, "frame": FRAME, "animated": animated}
    (ROOT / "data" / "petSprites.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf8")
    print(f"Wrote public/pets.webp ({len(order)} animals) and {len(animated)} strips.")

if __name__ == "__main__":
    main()
