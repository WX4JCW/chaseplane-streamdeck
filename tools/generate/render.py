"""Generator step 2: draw key images for out/plan.json and a preview sheet per folder.

Usage: python tools/generate/render.py
Glyphs come from Working Icons, keyed out of their black background and tinted to the
view's theme color. Off = glyph on black; on = glyph plus a glow outline in the theme color.
The glyph sits high so the Stream Deck title fits underneath. Output PNGs are opaque.
"""
import json
import os

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
WORK = "D:/Bundled Images/StreamDeck Icons/Working Icons"
SVG = "D:/Bundled Images/StreamDeck Icons/SVG"
BAR = 5 / 72  # top-bar height in the -on source PNGs

SIZE = 288
INSET, RADIUS, STROKE = 14, 46, 5
GLYPH_W = 0.78     # glyph fits in this share of the key's width...
GLYPH_H = 0.56     # ...and of its height, leaving room for a two-line title
GLYPH_Y = 0.39     # glyph centre, as a share of key height (title sits below)


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load_glyph(icon):
    """(off, on) source images; a single PNG serves both states."""
    single = os.path.join(WORK, f"SD_{icon}.png")
    if os.path.exists(single):
        g = Image.open(single).convert("RGB")
        return g, g, True
    if not os.path.exists(os.path.join(WORK, f"SD_{icon}-off.png")):
        # Not in Working Icons: use the PNG embedded in the SVG (Traffic_Red).
        import base64, io, re
        text = open(os.path.join(SVG, f"SD_{icon}-off.svg"), encoding="utf-8").read()
        g = Image.open(io.BytesIO(base64.b64decode(re.search(r'base64,([^"]+)', text).group(1)))).convert("RGB")
        return g, g, True
    off = Image.open(os.path.join(WORK, f"SD_{icon}-off.png")).convert("RGB")
    on = Image.open(os.path.join(WORK, f"SD_{icon}-on.png")).convert("RGB")
    a = np.asarray(on).copy()
    a[: round(on.height * BAR) + 1] = 0
    return off, Image.fromarray(a), False


def to_layer(src, tint):
    """Black becomes transparent; the glyph keeps its shading and takes the tint color (or its own colors)."""
    px = np.asarray(src, dtype=np.float32)
    lum = px.max(axis=2)
    peak = lum.max() or 1
    alpha = np.clip(lum / peak, 0, 1)
    if tint:
        color = np.broadcast_to(np.array(rgb(tint), dtype=np.float32), px.shape)
    else:
        color = np.clip(px / np.maximum(lum, 1)[..., None] * peak, 0, 255)
    return Image.fromarray(np.dstack([color, alpha * 255]).astype(np.uint8), "RGBA")


def place(off_layer, on_layer):
    mask = lambda g: g.getchannel("A").point(lambda v: 255 if v > 12 else 0)
    bbox = ImageChops.lighter(mask(off_layer), mask(on_layer)).getbbox()
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    scale = min(SIZE * GLYPH_W / w, SIZE * GLYPH_H / h)
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    out = []
    for g in (off_layer, on_layer):
        g = g.crop(bbox).resize(size, Image.LANCZOS)
        layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        layer.paste(g, ((SIZE - size[0]) // 2, round(SIZE * GLYPH_Y - size[1] / 2)))
        out.append(layer)
    return out


def solid(color, mask):
    layer = Image.new("RGBA", (SIZE, SIZE), color)
    layer.putalpha(mask)
    return layer


def scaled(mask, f):
    return mask.point(lambda v: min(255, int(v * f)))


def glow(glyph, color):
    c = rgb(color)
    rect = (INSET, INSET, SIZE - 1 - INSET, SIZE - 1 - INSET)
    inside = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(inside).rounded_rectangle(rect, RADIUS, fill=255)
    outline = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(outline).rounded_rectangle(rect, RADIUS, outline=255, width=STROKE)
    band = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(band).rounded_rectangle(rect, RADIUS, outline=255, width=26)
    inner = ImageChops.multiply(band.filter(ImageFilter.GaussianBlur(26)), inside)
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    img = Image.alpha_composite(img, solid((12, 15, 18), inside))
    img = Image.alpha_composite(img, solid(c, scaled(inner, 0.30)))
    img = Image.alpha_composite(img, solid(c, scaled(outline.filter(ImageFilter.GaussianBlur(7)), 1.6)))
    img = Image.alpha_composite(img, solid(c, outline))
    img = Image.alpha_composite(img, solid(c, scaled(glyph.getchannel("A").filter(ImageFilter.GaussianBlur(6)), 0.45)))
    return Image.alpha_composite(img, glyph)


def plain(glyph):
    return Image.alpha_composite(Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255)), glyph)


def render_folder(folder):
    d = os.path.join(OUT, "img", folder["name"])
    os.makedirs(d, exist_ok=True)
    cache = {}
    for pos, k in folder["keys"].items():
        if not k.get("icon"):
            continue
        tint = k["text"] if k["kind"] == "camera" else None
        ck = (k["icon"], tint, k["glow"])
        if ck not in cache:
            off_src, on_src, _ = load_glyph(k["icon"])
            off_l, on_l = place(to_layer(off_src, tint), to_layer(on_src, tint))
            cache[ck] = (plain(off_l).convert("RGB"), glow(on_l, k["glow"]).convert("RGB"))
        off, on = cache[ck]
        name = pos.replace(",", "_")
        off.save(os.path.join(d, f"{name}_off.png"))
        on.save(os.path.join(d, f"{name}_on.png"))
        k["images"] = [f"{name}_off.png", f"{name}_on.png"]
    off_src, _, _ = load_glyph(folder["folderIcon"])
    (layer,) = place(to_layer(off_src, folder["text"]), to_layer(off_src, folder["text"]))[:1]
    plain(layer).convert("RGB").save(os.path.join(d, "folder.png"))
    folder["folderImage"] = "folder.png"


def preview(folder):
    """Off states with the title drawn roughly where Stream Deck puts it; one on-state example per row."""
    cell, pad = 150, 8
    sheet = Image.new("RGB", (9 * cell + pad, 4 * cell + pad), (30, 30, 30))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("arialbd.ttf", 12)
    d = os.path.join(OUT, "img", folder["name"])
    for pos, k in folder["keys"].items():
        x, y = (int(v) for v in pos.split(","))
        X, Y = pad + x * cell, pad + y * cell
        if "images" in k:
            state = 1 if x == 1 else 0  # column 1 shows the glow state
            img = Image.open(os.path.join(d, k["images"][state])).resize((cell - pad, cell - pad), Image.LANCZOS)
            sheet.paste(img, (X, Y))
        if k.get("draw"):
            # Drawn by the plugin at run time; approximate it: name centred in the text color.
            draw.rectangle((X, Y, X + cell - pad - 1, Y + cell - pad - 1), fill=(0, 0, 0))
            big = ImageFont.truetype("arialbd.ttf", 17)
            parts = k["title"].split("\n")
            for i, line in enumerate(parts):
                tw = draw.textlength(line, font=big)
                draw.text((X + (cell - pad - tw) / 2, Y + 50 + 24 * i - 12 * (len(parts) - 1)), line, fill=k["text"], font=big)
            continue
        lines = k.get("title", "").split("\n")
        for i, line in enumerate(lines):
            tw = draw.textlength(line, font=font)
            draw.text((X + (cell - pad - tw) / 2, Y + cell - pad - 14 * (len(lines) - i) - 6), line, fill=k.get("text", "#ffffff"), font=font)
    draw.text((pad + 8, pad + 60), "BACK", fill="#888888", font=font)
    sheet.save(os.path.join(OUT, f"preview_{folder['name']}.png"))


plan = json.load(open(os.path.join(OUT, "plan.json"), encoding="utf-8"))
for f in plan["folders"]:
    render_folder(f)
    preview(f)
    print(f"{f['name']}: {sum(1 for k in f['keys'].values() if 'images' in k)} keys rendered, preview_{f['name']}.png")
json.dump(plan, open(os.path.join(OUT, "plan.json"), "w", encoding="utf-8"), indent=1)
