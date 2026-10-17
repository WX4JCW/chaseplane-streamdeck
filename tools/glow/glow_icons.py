"""Make on/off Stream Deck key images where "on" glows instead of showing a top bar.

Usage: python glow_icons.py <svg_dir> <working_dir> <out_dir> [name ...]
  name = the part between "SD_" and "-on.svg", e.g. GoPro_Cam. No names = every pair in svg_dir.

Sources, per icon:
  - glow color: the top-bar color in svg_dir/SD_<name>-on.svg
  - glyph: working_dir/SD_<name>.png (same glyph for off and on), or
           working_dir/SD_<name>-off.png and -on.png (top bar of the -on file is blacked out), or
           the PNG embedded in the SVG when the working folder has neither.
Output PNGs are opaque (black background), so a profile background cannot show through.
"""
import base64, glob, io, os, re, sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 288            # output px (2x of the 144 Stream Deck key image)
INSET = 14            # outline distance from key edge, leaves room for the outer glow
RADIUS = 46           # outline corner radius
STROKE = 5            # outline width
GLYPH_BOX = 0.60      # glyph fits in this fraction of the key
BAR = 5 / 72          # top-bar height as a fraction of the source image


def load_sources(svg_dir, work_dir, name):
    """Return (off_glyph, on_glyph, color, source) or None."""
    text = open(os.path.join(svg_dir, f"SD_{name}-on.svg"), encoding="utf-8").read()
    bar = re.search(r'height="5" fill="(#[0-9A-Fa-f]{6})"', text)
    if not bar:
        return None
    color = bar.group(1)

    single = os.path.join(work_dir, f"SD_{name}.png")
    off_p, on_p = (os.path.join(work_dir, f"SD_{name}-{s}.png") for s in ("off", "on"))
    if os.path.exists(single):
        g = Image.open(single).convert("RGBA")
        return g, g, color, "working png"
    if os.path.exists(off_p) and os.path.exists(on_p):
        off, on = Image.open(off_p).convert("RGBA"), Image.open(on_p).convert("RGBA")
        ImageDraw.Draw(on).rectangle((0, 0, on.width, round(on.height * BAR) + 1), fill=(0, 0, 0, 255))
        return off, on, color, "working off/on png"
    m = re.search(r'base64,([^"]+)', text)
    if m:
        g = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")
        return g, g, color, "svg embedded png"
    return None


def key_out_black(glyph):
    """Sources are a colored glyph on solid black; turn the black into transparency."""
    px = np.asarray(glyph, dtype=np.float32)
    rgb, a = px[..., :3], px[..., 3] / 255
    lum = rgb.max(axis=2)
    peak = lum.max() or 1
    alpha = np.clip(lum / peak, 0, 1) * a
    # Un-premultiply so anti-aliased edges keep full color and only fade in alpha.
    color = np.clip(rgb / np.maximum(lum, 1)[..., None] * peak, 0, 255)
    out = np.dstack([color, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def place_glyphs(off, on):
    """Key out both glyphs and fit them with one shared crop and scale, so the icon does not jump between states."""
    off, on = key_out_black(off), key_out_black(on.resize(off.size, Image.LANCZOS))
    mask = lambda g: g.getchannel("A").point(lambda v: 255 if v > 12 else 0)
    bbox = ImageChops.lighter(mask(off), mask(on)).getbbox()
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    scale = int(SIZE * GLYPH_BOX) / max(w, h)
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    layers = []
    for g in (off, on):
        g = g.crop(bbox).resize(size, Image.LANCZOS)
        layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        layer.paste(g, ((SIZE - size[0]) // 2, (SIZE - size[1]) // 2))
        layers.append(layer)
    return layers


def solid(color, alpha_mask):
    layer = Image.new("RGBA", (SIZE, SIZE), color)
    layer.putalpha(alpha_mask)
    return layer


def scaled(mask, factor):
    return mask.point(lambda v: min(255, int(v * factor)))


def render_off(glyph_layer):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    return Image.alpha_composite(img, glyph_layer)


def render_on(glyph_layer, color):
    rect = (INSET, INSET, SIZE - 1 - INSET, SIZE - 1 - INSET)

    inside = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(inside).rounded_rectangle(rect, RADIUS, fill=255)

    outline = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(outline).rounded_rectangle(rect, RADIUS, outline=255, width=STROKE)

    # Inner glow: a thick band along the edge, blurred, kept inside the tile.
    band = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(band).rounded_rectangle(rect, RADIUS, outline=255, width=26)
    inner = ImageChops.multiply(band.filter(ImageFilter.GaussianBlur(26)), inside)

    outer = outline.filter(ImageFilter.GaussianBlur(7))
    halo = glyph_layer.getchannel("A").filter(ImageFilter.GaussianBlur(6))

    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    img = Image.alpha_composite(img, solid((12, 15, 18, 255), inside))
    img = Image.alpha_composite(img, solid(color, scaled(inner, 0.30)))
    img = Image.alpha_composite(img, solid(color, scaled(outer, 1.6)))
    img = Image.alpha_composite(img, solid(color, outline))
    img = Image.alpha_composite(img, solid(color, scaled(halo, 0.45)))
    return Image.alpha_composite(img, glyph_layer)


def main():
    svg_dir, work_dir, out_dir, *names = sys.argv[1:]
    os.makedirs(out_dir, exist_ok=True)
    if not names:
        names = sorted(os.path.basename(p)[3:-7] for p in glob.glob(os.path.join(svg_dir, "SD_*-on.svg")))
    for name in names:
        src = load_sources(svg_dir, work_dir, name)
        if src is None:
            print(f"skip  {name}: no glyph source found")
            continue
        off, on, color, how = src
        off_layer, on_layer = place_glyphs(off, on)
        render_off(off_layer).convert("RGB").save(os.path.join(out_dir, f"SD_{name}-off.png"))
        render_on(on_layer, color).convert("RGB").save(os.path.join(out_dir, f"SD_{name}-on.png"))
        print(f"done  {name:30} {color}  from {how}")


if __name__ == "__main__":
    main()
