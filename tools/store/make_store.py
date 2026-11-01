# Builds the Elgato Marketplace pictures for Camera Deck for ChasePlane into store/:
#   icon.png (288 x 288), thumbnail.png and gallery-1..3.png (1920 x 960, the sizes Maker Console asks for).
# The deck pictures are the real screenshots in docs/. Keys that are not part of the plugin's packed
# profile (the owner's SIMDECK, camera hotkeys and screenshot keys) are covered with an empty key cut
# from the same screenshot, so the pictures show what a user gets.
# Usage: python tools/store/make_store.py   (from the repository root)
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = "store"
W, H = 1920, 960
FONTS = "C:/Windows/Fonts/"
BG = (14, 15, 19)
INK = (236, 238, 242)
DIM = (150, 156, 168)
CYAN = (34, 195, 230)  # the deck's ChasePlane band color
DEEP = (8, 38, 46)


def font(size, weight="b"):
    return ImageFont.truetype(FONTS + {"b": "segoeuib.ttf", "sb": "seguisb.ttf", "r": "segoeui.ttf"}[weight], size)


def blank_keys(shot, empty, keys, origin, pitch):
    """Covers keys (col, row) with the empty key at `empty` (x, y, size)."""
    ex, ey, size = empty
    tile = shot.crop((ex, ey, ex + size, ey + size))
    for col, row in keys:
        shot.paste(tile, (round(origin[0] + col * pitch[0]), round(origin[1] + row * pitch[1])))
    return shot


def home_shot():
    shot = Image.open("docs/guide_home.png").convert("RGB")
    return blank_keys(shot, (870, 20, 120), [(c, 3) for c in range(5)], (26, 20), (140.67, 141.3))


def seating_shot():
    shot = Image.open("docs/guide_seating.png").convert("RGB")
    return blank_keys(shot, (150, 10, 120), [(c, 3) for c in range(5)], (10, 10), (140.75, 141.2))


def framed(canvas, shot, box_w, center):
    """Pastes the screenshot scaled to box_w wide, with rounded corners and a soft shadow."""
    scale = box_w / shot.width
    img = shot.resize((box_w, round(shot.height * scale)), Image.LANCZOS)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *img.size), radius=28, fill=255)
    x, y = round(center[0] - img.width / 2), round(center[1] - img.height / 2)
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x - 6, y + 18, x + img.width + 6, y + img.height + 30), radius=36, fill=(0, 0, 0, 170))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(28)))
    canvas.paste(img, (x, y), mask)
    return y + img.height


def base():
    c = Image.new("RGBA", (W, H), BG + (255,))
    ImageDraw.Draw(c).rectangle((0, 0, W, 10), fill=CYAN)
    return c


def headline(c, title, sub, y=70):
    d = ImageDraw.Draw(c)
    d.text((W / 2, y), title, font=font(76), fill=INK, anchor="mt")
    d.text((W / 2, y + 104), sub, font=font(38, "r"), fill=DIM, anchor="mt")


def thumbnail():
    c = base()
    d = ImageDraw.Draw(c)
    d.text((110, 300), "Camera Deck", font=font(100), fill=INK, anchor="ls")
    d.text((114, 390), "for ChasePlane", font=font(68, "sb"), fill=CYAN, anchor="ls")
    lines = ["Every ChasePlane view on your", "Stream Deck + XL, sorted into", "your groups, kept up to date live."]
    for i, line in enumerate(lines):
        d.text((116, 490 + i * 58), line, font=font(40, "r"), fill=DIM, anchor="ls")
    d.text((116, 820), "Microsoft Flight Simulator 2024", font=font(32, "sb"), fill=DIM, anchor="ls")
    framed(c, home_shot(), 1000, (1370, 480))
    return c


def gallery_home():
    c = base()
    headline(c, "Your ChasePlane groups, live", "Rename, reorder or add views in ChasePlane and the deck follows within a second.")
    framed(c, home_shot(), 1180, (W / 2, 590))
    return c


def gallery_seating():
    c = base()
    headline(c, "Cabin seats laid out like the cabin", "Seat views appear A seats over F seats, front to back.")
    framed(c, seating_shot(), 1180, (W / 2, 590))
    return c


def gallery_dials():
    c = base()
    headline(c, "Six dials with live readouts", "Group, view, camera mode, cinematic and traffic on the touch strip.")
    strip = Image.open("docs/guide_home.png").convert("RGB").crop((30, 590, 1266, 692))
    bottom = framed(c, strip, 1760, (W / 2, 500))
    d = ImageDraw.Draw(c)
    jobs = [("Turn: pick a group", "Push: home"), ("Turn: pick a view", "in that group"), ("Turn: camera mode", "cockpit, exterior, world"),
            ("Push: cinematics on", "turn: next shot"), ("Smart Cam", "coming soon"), ("Turn: nearby traffic", "push: my aircraft")]
    for i, (a, b) in enumerate(jobs):
        x = (W - 1760) / 2 + 1760 / 6 * (i + 0.5)
        d.text((x, bottom + 60), a, font=font(30, "sb"), fill=INK, anchor="mt")
        d.text((x, bottom + 104), b, font=font(28, "r"), fill=DIM, anchor="mt")
    return c


def icon():
    s = 4  # draw at 4x, then shrink, for smooth edges
    c = Image.new("RGB", (288 * s, 288 * s), DEEP)
    d = ImageDraw.Draw(c)
    d.rectangle((0, 0, 288 * s, 70 * s), fill=CYAN)
    d.text((144 * s, 36 * s), "FOR CHASEPLANE", font=font(27 * s), fill=(0, 0, 0), anchor="mm")
    light = (190, 238, 248)
    d.text((144 * s, 140 * s), "CAMERA", font=font(62 * s), fill=light, anchor="mm")
    d.text((144 * s, 212 * s), "DECK", font=font(78 * s), fill=light, anchor="mm")
    return c.resize((288, 288), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon().save(f"{OUT}/icon.png")
for name, make in [("thumbnail", thumbnail), ("gallery-1", gallery_home), ("gallery-2", gallery_seating), ("gallery-3", gallery_dials)]:
    make().convert("RGB").save(f"{OUT}/{name}.png")
print("written", OUT)
