# Builds the ready-made "Camera Deck for ChasePlane" profile for the Stream Deck + XL, packed into the plugin:
#   com.acms.chaseplane.sdPlugin/profiles/ChasePlaneDeck-PlusXL.streamDeckProfile
# Only this plugin's own actions: Deck Keys everywhere, Flashlight, Cinematic, My Aircraft and Status
# at the bottom right, a Deck Dial on each of the six dials (owner, 2026-10-31: "No other buttons or
# stuff just whats relevant so we can package those profiles").
#
# Format, copied from the profiles other plugins ship (read only): a zip holding
# <PROFILE>.sdProfile/manifest.json (Device model with an empty UUID = any device of that model, Name,
# Pages, Version "3.0") and <PROFILE>.sdProfile/Profiles/<PAGE>/manifest.json (Controllers: Keypad and
# Encoder, actions keyed "column,row"). Fixed IDs, so a newer file replaces the profile instead of adding
# a copy. Usage: python tools/profile/make_profile.py   (from the repository root)
import json
import zipfile

MANIFEST = "com.acms.chaseplane.sdPlugin/manifest.json"
OUT = "com.acms.chaseplane.sdPlugin/profiles/ChasePlaneDeck-PlusXL.streamDeckProfile"
PROFILE_ID = "C9A3F0D2-6B1E-4C7A-9E55-3D8B2A1F0C01"
PAGE_ID = "5E2B7C10-8F4D-4A39-B6E1-0A9C3D7F2B01"
PLUS_XL_MODEL = "20GBX9901"  # the owner's + XL reports this model
COLUMNS, ROWS, DIALS = 9, 4, 6

plugin = json.load(open(MANIFEST, encoding="utf-8"))
PLUGIN = {"Name": plugin["Name"], "UUID": plugin["UUID"], "Version": plugin["Version"]}


def action(n, name, kind, states, settings=None):
    # ActionIDs are fixed per position, like the IDs above.
    return {
        "ActionID": f"5E2B7C10-0000-4000-8000-{n:012d}",
        "LinkedTitle": True,
        "Name": name,
        "Plugin": PLUGIN,
        "Resources": None,
        "Settings": settings or {},
        "State": 0,
        "States": states,
        "UUID": f"{PLUGIN['UUID']}.{kind}",
    }


FIXED = {
    (5, 3): ("Flashlight", "flashlight", [{}, {}]),
    (6, 3): ("Cinematic", "cinematic", [{}, {}]),
    (7, 3): ("My Aircraft", "my-aircraft", [{}]),
    (8, 3): ("Status", "status", [{}]),
}
keys = {}
for row in range(ROWS):
    for col in range(COLUMNS):
        name, kind, states = FIXED.get((col, row), ("Deck Key", "deck", [{}]))
        keys[f"{col},{row}"] = action(row * COLUMNS + col, name, kind, states)
dials = {f"{col},0": action(100 + col, "Deck Dial", "dial", [{}]) for col in range(DIALS)}

root = {
    "Device": {"Model": PLUS_XL_MODEL, "UUID": ""},
    "Name": "Camera Deck for ChasePlane",
    "Pages": {"Current": PAGE_ID.lower(), "Default": PAGE_ID.lower(), "Pages": [PAGE_ID.lower()]},
    "Version": "3.0",
}
page = {"Controllers": [{"Actions": keys, "Type": "Keypad"}, {"Actions": dials, "Type": "Encoder"}], "Icon": "", "Name": ""}

base = f"{PROFILE_ID}.sdProfile/"
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(base, "")
    z.writestr(base + "manifest.json", json.dumps(root))
    z.writestr(base + "Profiles/", "")
    z.writestr(f"{base}Profiles/{PAGE_ID}/", "")
    z.writestr(f"{base}Profiles/{PAGE_ID}/manifest.json", json.dumps(page))
print(f"written {OUT}: {len(keys)} keys, {len(dials)} dials, plugin {PLUGIN['Version']}")
