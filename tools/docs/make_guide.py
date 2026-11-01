# Builds docs/Camera Deck for ChasePlane Setup Guide.pdf: the end-user setup guide in plain English.
# Usage: python tools/docs/make_guide.py   (run from the repository root)
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = "docs/Camera Deck for ChasePlane Setup Guide.pdf"
CYAN = colors.HexColor("#1FA3C2")
INK = colors.HexColor("#1B1F24")
GREY = colors.HexColor("#5C6670")
PALE = colors.HexColor("#EEF6F8")

base = ParagraphStyle("base", fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK, alignment=TA_LEFT)
title = ParagraphStyle("title", base, fontName="Helvetica-Bold", fontSize=26, leading=30, textColor=INK)
subtitle = ParagraphStyle("subtitle", base, fontSize=12.5, leading=17, textColor=GREY)
h1 = ParagraphStyle("h1", base, fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=CYAN, spaceBefore=14, spaceAfter=6)
h2 = ParagraphStyle("h2", base, fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=8, spaceAfter=3)
body = ParagraphStyle("body", base, spaceAfter=6)
bullet = ParagraphStyle("bullet", base, leftIndent=14, bulletIndent=2, spaceAfter=3)
note = ParagraphStyle("note", base, fontSize=9.5, leading=13, textColor=GREY)
cell = ParagraphStyle("cell", base, fontSize=9.5, leading=12.5)
cellb = ParagraphStyle("cellb", cell, fontName="Helvetica-Bold")
code = ParagraphStyle("code", cell, fontName="Courier-Bold", fontSize=9.5)

story = []
P = lambda t, s=body: story.append(Paragraph(t, s))
B = lambda items: [story.append(Paragraph(i, bullet, bulletText="•")) for i in items]


def table(rows, widths, header=True):
    data = [[Paragraph(str(c), cellb if (header and r == 0) else cell) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D3DA")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), PALE)]
    t.setStyle(TableStyle(style))
    # Short tables move whole to the next page instead of splitting.
    story.append(KeepTogether([t, Spacer(1, 8)]) if len(rows) <= 8 else t)
    if len(rows) > 8:
        story.append(Spacer(1, 8))


def tip(text):
    t = Table([[Paragraph(text, cell)]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 0.6, CYAN),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(t)
    story.append(Spacer(1, 8))


def picture(path, caption, width=6.5 * inch):
    from PIL import Image as PILImage
    w, h = PILImage.open(path).size
    img = Image(path, width=width, height=width * h / w)
    story.append(KeepTogether([img, Spacer(1, 3), Paragraph(caption, note), Spacer(1, 8)]))


# ---- Cover
story.append(Spacer(1, 1.4 * inch))
P("Camera Deck for ChasePlane", title)
story.append(Spacer(1, 6))
P("Setup guide: your ChasePlane cameras on the Stream Deck, organised the way you organise them in ChasePlane.", subtitle)
story.append(Spacer(1, 18))
picture("docs/guide_home.png", "The home screen: your ChasePlane groups on the keys, and the camera dials and touch strip below.")
P("ACMS Digital Systems · Camera Deck for ChasePlane 0.1.0.23 · Microsoft Flight Simulator 2024", note)
story.append(PageBreak())

# ---- 1
P("1. What it does", h1)
P("The deck is a page on your Stream Deck that fills itself from ChasePlane while you fly. You do not set up keys one by one. "
  "You organise your cameras in ChasePlane, and the deck follows:")
B([
    "<b>Home screen:</b> your ChasePlane groups, one row each for Onboard, Outside and World.",
    "<b>Press a group:</b> the same keys show that group's camera views. Press a view to switch the camera.",
    "<b>Live:</b> rename, reorder, add or delete a view or group in ChasePlane and the deck changes within a second. Load another aircraft and the deck shows its views.",
    "<b>Lit:</b> the group and the view the camera is on are highlighted (white name and a ring).",
])
P("Nothing in ChasePlane is changed by the deck. It only reads your views and groups and asks ChasePlane to switch cameras.", note)

P("2. What you need", h1)
table([
    ["Item", "Notes"],
    ["Microsoft Flight Simulator 2024", "Running, with an aircraft loaded."],
    ["ChasePlane by Parallel 42", "Running. The deck talks to ChasePlane on this PC; nothing to set up."],
    ["Stream Deck + XL", "9 x 4 keys and 6 dials. The layout in this guide is for the + XL."],
    ["Stream Deck app 7.1 or newer", "Windows 10 or 11."],
    ["Camera Deck for ChasePlane plugin", "The file <b>com.acms.chaseplane.streamDeckPlugin</b>."],
], [2.2 * inch, 4.3 * inch])

P("3. Install the plugin", h1)
B([
    "Keep the Stream Deck app open and double-click <b>com.acms.chaseplane.streamDeckPlugin</b>. Click Install if asked.",
    "Stream Deck offers the ready-made <b>Camera Deck for ChasePlane</b> profile for your + XL. Accept it: the whole deck is set up for you (section 4 shows what is on it).",
    "In the Stream Deck app, the action list on the right now has a <b>Camera Deck for ChasePlane</b> category.",
    "Updating later: double-click the new file the same way. Stream Deck only accepts a file with a newer version number.",
])

# ---- 4
P("4. The deck page", h1)
P("The <b>Camera Deck for ChasePlane</b> profile comes laid out like this. To build it on another page yourself, drag the same actions from the <b>Camera Deck for ChasePlane</b> list:")
table([
    ["Where", "What to drag", "What it becomes"],
    ["Rows 1 to 3, every key", "<b>Deck Key</b>", "The live keys: group names on the home screen, camera views inside a group."],
    ["Row 4, right", "<b>Flashlight</b>, <b>Cinematic</b>, <b>My Aircraft</b>, <b>Status</b>", "Fixed controls on every screen. Status shows green CONNECTED and your aircraft, or red OFFLINE. The rest of row 4 is Deck Keys; swap any for keys of your own."],
    ["All 6 dials", "<b>Deck Dial</b>", "Each dial takes its job from its position (section 8)."],
], [1.45 * inch, 2.15 * inch, 2.9 * inch])
tip("<b>Tip:</b> a Deck Key works out its job from where it sits, so every Deck Key is the same. Drag one, then copy and paste it to fill the rows. "
    "Keep the top-left key a Deck Key: inside a group it becomes the <b>Home</b> key.")

# ---- 5
P("5. Set up your groups in ChasePlane", h1)
P("Groups are ChasePlane's camera profiles (Pilot, Instruments, Cabin and so on). On the deck each group is one key on the home screen.")
table([
    ["Rule", "Why"],
    ["Keep group names to <b>10 letters or fewer</b>, in capitals: PILOT, PANELS, GOPRO, SEATING.", "The group name is printed in the coloured band on every one of its view keys. Longer names shrink, and past about 17 letters they are cut short."],
    ["Put the groups in the order you want them.", "The home screen shows them in ChasePlane's order, Onboard first, then Outside, then World."],
    ["Pick each group's category (theme) with care.", "The category sets the colour: cockpit cyan, cabin purple, chase red, and so on. Groups in the same category share a colour."],
    ["Empty groups are fine.", "A group with no views on the loaded aircraft is hidden, and appears when it has one."],
    ["To break a long group name over two lines, type <b>|</b> where the break goes: CABIN|VIEWS.", "Group names keep the | character. (View names do not; see section 6.)"],
], [3.0 * inch, 3.5 * inch])

# ---- 6
P("6. Name your camera views", h1)
P("The view name is what the key shows, so the name is the layout. Use this format:")
tip("<b>SUBJECT / DETAIL</b> in capitals. A slash with a space on each side starts a second line. "
    "<b>GOPRO / CAPT 1</b> shows as GOPRO over CAPT 1.")
table([
    ["Rule", "Example"],
    ["At most two lines of about 9 letters each (13 at most).", "OVERHEAD / UPPER"],
    ["Short names need no break. Up to 11 letters fit on one line.", "MCP, EFB, PILOT, JUMPSEAT"],
    ["A slash <b>without</b> spaces stays on one line.", "GOPRO / F/O, WATER/TOILET / GSX"],
    ["Leave out left and right. ChasePlane adds L, R, FWD, MID and AFT from where the camera sits, and the key shows them on its bottom line.", "THROTTLE (not THROTTLE LEFT)"],
    ["Use the same words every time.", "CAPT, F/O, FWD, AFT, ENG, GSX, CLOSE"],
    ["Give copies a real difference instead of -1 or Copy of.", "ENGINE / 2 ALT"],
], [3.6 * inch, 2.9 * inch])
tip("<b>Do not use | in view names.</b> It works while you type it, but ChasePlane removes it the next time the sim starts, "
    "and the name then runs together (GOPRO|CAPT 1 becomes GOPROCAPT 1). Use the slash with spaces instead.")

# ---- 7
P("7. Passenger seats", h1)
P("A group of seats is laid out like a cabin seen from above: one deck row per seat letter (A above F), seats front to back from left to right. "
  "This happens by itself when a group has at least four views whose names end in a row number and a letter:")
table([
    ["Works", "Does not work"],
    ["1A, 14F, SEAT 7A, SEAT / 23F", "WINDOW 14 LEFT, SEAT A14, 14 F WINDOW"],
], [3.25 * inch, 3.25 * inch])
B([
    "Up to <b>8 seat rows</b> and <b>3 seat letters</b> fit. A bigger cabin falls back to ChasePlane's order.",
    "Other views in the same group (galleys, FA panels) fill the free keys after the seats.",
    "Name the group anything you like, for example SEATING.",
])
picture("docs/guide_seating.png", "A seating group: A seats on one row, F seats below, front to back. The dials and touch strip follow the open group.")

# ---- 8
P("8. The dials", h1)
P("Each dial has a section of the touch strip above it showing what it controls. Push the dial or tap its section of the strip to use the push action.")
table([
    ["Dial", "Turn", "Push or tap"],
    ["1  GROUP", "Step through your groups; the keys follow", "Back to the home screen"],
    ["2  VIEW", "Previous or next view in the open group (or the group the camera is in)", "First view of the group"],
    ["3  MODE", "Cockpit, Exterior, World", "Next mode"],
    ["4  CINEMATIC", "Next cinematic shot", "Cinematics on or off"],
    ["5  SMART CAM", "Not yet available", "Not yet available"],
    ["6  TRAFFIC", "Step through nearby aircraft", "Back to your aircraft"],
], [1.3 * inch, 2.9 * inch, 2.3 * inch])
P("Turning quickly shows your choice straight away and switches the camera once the dial stops.", note)

# ---- 9
story.append(PageBreak())
P("9. When something is not right", h1)
table([
    ["What you see", "What to do"],
    ["Status is red OFFLINE, home screen empty", "Start the sim and ChasePlane. The deck connects by itself within a few seconds."],
    ["Keys say \"unable to identify plugin\"", "The plugin is not installed. Double-click the plugin file (section 3)."],
    ["A group is missing from the home screen", "It has no views on this aircraft. Add a view to it in ChasePlane."],
    ["A view name runs together (GOPROCAPT 1)", "It was written with |. Rename it with a slash and spaces: GOPRO / CAPT 1."],
    ["A group name is cut short on the keys", "Shorten it to 10 letters or fewer in ChasePlane."],
    ["Seats are not in cabin order", "Check the names end in number and letter (14F), and that the cabin has 8 rows or fewer."],
    ["A key shows a yellow warning triangle", "ChasePlane could not switch to that view. Check it still exists in ChasePlane."],
], [2.6 * inch, 3.9 * inch])


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GREY)
    canvas.drawString(inch, 0.55 * inch, "Camera Deck for ChasePlane · Setup guide")
    canvas.drawRightString(letter[0] - inch, 0.55 * inch, f"Page {doc.page}")
    canvas.restoreState()


SimpleDocTemplate(OUT, pagesize=letter, leftMargin=inch, rightMargin=inch, topMargin=0.8 * inch, bottomMargin=0.85 * inch,
                  title="Camera Deck for ChasePlane Setup Guide", author="ACMS Digital Systems").build(story, onFirstPage=footer, onLaterPages=footer)
print("written", OUT)
