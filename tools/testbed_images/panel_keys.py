# Draws Stream Deck's own keys (folders, profile switches, hotkeys) in the deck's Panel key style,
# neutral version, to match the plugin's drawn keys. Usage: python panel_keys.py <out_dir> [--sheet]
import sys
from PIL import Image, ImageDraw, ImageFont

KEYS = {  # file: (caption, line 1, line 2, app)
    "cpdeck": ("GO TO", "CP DECK", "", "cpdeck"),
    "simdeck": ("GO TO", "SIMDECK", "", "simdeck"),
    "gsx": ("OPEN", "GSX", "", "gsx"),
    "sayintentions": ("GO TO", "SAY", "INTENTIONS", "sayintentions"),
    "anyflight": ("OPEN", "ANYFLIGHT", "", "anyflight"),
    "maxdeck": ("GO TO", "MAX DECK", "38M", "ifly"),
    "flightpanel": ("GO TO", "FLT PANEL", "38M", "ifly"),
    "weather": ("OPEN", "WEATHER", "", "weather"),
    "apps": ("OPEN", "APPS", "", "apps"),
    "campos": ("CHASEPLANE", "RESET", "CAM", "chaseplane"),
    "camnext": ("CHASEPLANE", "NEXT", "CAM", "chaseplane"),
    "camprev": ("CHASEPLANE", "PREV", "CAM", "chaseplane"),
    "screenshot": ("CAPTURE", "SCREEN", "SHOT", "screenshot"),
}
S = 4
K = 144 * S
import colorsys

# Color by kind of key, with the plugin's Panel recipe (themes.ts panelColors): deep fill at 11%
# lightness (saturation x0.8), band at 52%, name at 78%; caption black or white by contrast.
# One color per app, so each is easy to find (owner, 2026-10-31). SayIntentions and AnyFlight are
# sampled from their old key pictures; ChasePlane is its Remote's Pilot cyan, as on the live deck.
APPS = {
    "chaseplane": (190, 79), "sayintentions": (43, 75), "anyflight": (220, 85), "gsx": (295, 60),
    "ifly": (355, 75), "weather": (130, 55), "apps": (270, 60), "screenshot": (320, 70), "simdeck": (0, 0),
    # The CP DECK key: its own amber, because the WX Deck keys share ChasePlane's cyan (owner, 2026-11-01).
    "cpdeck": (41, 100),
}
# A band color the owner picked exactly, instead of the recipe's 52% lightness.
EXACT_BAND = {"cpdeck": (0xFF, 0xAE, 0x03)}

def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return (round(r * 255), round(g * 255), round(b * 255))

def ink(rgb):
    lin = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    l = 0.2126 * lin(rgb[0] / 255) + 0.7152 * lin(rgb[1] / 255) + 0.0722 * lin(rgb[2] / 255)
    return (10, 10, 10) if (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) else (255, 255, 255)
font = lambda n: ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", n * S)

def fit(d, text, base, width=128):
    size = base
    while size > 12 and d.textlength(text, font=font(size)) > width * S:
        size -= 1
    return font(size)

def draw(caption, l1, l2, app):
    h, sat = APPS[app]
    DEEP, BAND, TEXT = hsl(h, sat * 0.8, 11), EXACT_BAND.get(app, hsl(h, sat, 52)), hsl(h, sat, 78)
    INK = ink(BAND)
    im = Image.new("RGB", (K, K), (0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, K - 1, K - 1], 18 * S, fill=DEEP)
    d.rounded_rectangle([0, 0, K - 1, 30 * S], 18 * S, fill=BAND); d.rectangle([0, 16 * S, K - 1, 30 * S], fill=BAND)
    def c(y, t, f, fill):
        w = d.textlength(t, font=f); d.text(((K - w) / 2, y * S), t, font=f, fill=fill)
    c(8, caption, font(15), INK)
    if l2:
        c(50, l1, fit(d, l1, 22), TEXT); c(80, l2, fit(d, l2, 22), TEXT)
    else:
        c(66, l1, fit(d, l1, 26), TEXT)
    return im.resize((144, 144), Image.LANCZOS)

out = sys.argv[1]
imgs = {name: draw(*spec) for name, spec in KEYS.items()}
for name, im in imgs.items():
    im.save(f"{out}/{name}.png")
if "--sheet" in sys.argv:
    order = ["cpdeck", "gsx", "sayintentions", "anyflight", "maxdeck", "flightpanel", "weather", "apps", "campos",
             None, None, None, None, None, None, None, None, "camnext",
             None, None, None, None, None, None, None, None, "camprev",
             None, None, None, None, None, None, None, None, "screenshot"]
    G = 12; sheet = Image.new("RGB", (9 * 144 + 10 * G, 4 * 144 + 5 * G), (40, 40, 44))
    for i, n in enumerate(order):
        if n: sheet.paste(imgs[n], (G + (i % 9) * (144 + G), G + (i // 9) * (144 + G)))
    sheet.save(f"{out}/simdeck_main_preview.png")
print("ok")
