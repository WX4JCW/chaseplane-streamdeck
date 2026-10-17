"""Uniform folder key: a folder outline (tab top-left) in the theme color with one glyph inside.

Used by render.py for every generated folder, so all folder keys share one shape, weight and scale.
"""
import math

from PIL import Image, ImageDraw

SS = 4  # supersampling


def _rounded_path(points, radius, steps=10):
    """Closed polyline through `points` with each corner rounded by `radius` (per-point list or number)."""
    out = []
    n = len(points)
    for i in range(n):
        p0, p1, p2 = points[i - 1], points[i], points[(i + 1) % n]
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        v1 = (p0[0] - p1[0], p0[1] - p1[1])
        v2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        r = min(r, l1 / 2, l2 / 2)
        a = (p1[0] + v1[0] / l1 * r, p1[1] + v1[1] / l1 * r)
        b = (p1[0] + v2[0] / l2 * r, p1[1] + v2[1] / l2 * r)
        for s in range(steps + 1):
            t = s / steps
            # quadratic Bezier a -> p1 -> b
            out.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p1[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p1[1] + t * t * b[1]))
    return out


def folder_key(glyph_layer_fn, color_rgb, size=288, glyph_box=(0.58, 0.40), top=0.10, bottom=0.70):
    """Black key with the folder outline and the glyph from glyph_layer_fn(w, h) -> RGBA placed inside."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    x0, x1 = 0.13 * S, 0.87 * S
    y0, y2 = top * S, bottom * S
    y1 = y0 + 0.07 * S          # body top (below the tab)
    xa = x0 + 0.30 * S          # tab top-right
    xb = xa + 0.06 * S          # tab slant reaches the body top
    pts = [(x0, y0), (xa, y0), (xb, y1), (x1, y1), (x1, y2), (x0, y2)]
    r = 0.06 * S
    path = _rounded_path(pts, [r, 0.02 * S, 0.02 * S, r, r, r])
    width = round(0.042 * S)
    d.line(path + path[:1], fill=color_rgb, width=width, joint="curve")
    gw, gh = round(glyph_box[0] * S), round(glyph_box[1] * S)
    g = glyph_layer_fn(gw, gh)
    cx, cy = S / 2, (y1 + y2) / 2
    img.alpha_composite(g, (round(cx - g.width / 2), round(cy - g.height / 2)))
    return img.resize((size, size), Image.LANCZOS)
