# SimDeck camera page generator

Builds the ChasePlane camera folders on the SimDeck Stream Deck profile from ChasePlane's
own view list. ChasePlane decides what views exist, their names, groups, order and colors;
`layout.json` decides which groups go in which folder and which glyph each view gets.

ChasePlane is only read, never changed.

## Run it

1. Start the sim with the aircraft loaded, and ChasePlane.
2. From any folder:

   ```
   powershell -ExecutionPolicy Bypass -File C:\Dev\ChasePlane\tools\generate\generate.ps1
   ```

3. When the script says so, quit Stream Deck from the tray icon (right-click, Quit).
   Closing the window is not enough; it keeps running in the tray.
4. When it prints "Done", start Stream Deck again.

The desktop shortcut "Update SimDeck Cameras" runs the same script and keeps its window open
at the end. It points at the copy in the worktree `plugin-reinstall-cabf55`, which holds the
CABIN change below until that change is merged into main.

To see what would change without writing anything:

```
powershell -ExecutionPolicy Bypass -File C:\Dev\ChasePlane\tools\generate\generate.ps1 -DryRun
```

Previews of every folder are written to `tools\generate\out\preview_<FOLDER>.png`.

## What a run does

| Step | File | What happens |
|---|---|---|
| 1 | `plan.mjs` | Reads ChasePlane's live views over `ws://localhost:8652` and works out every key. Reports any view not placed and any layout name ChasePlane no longer has. |
| 2 | `render.py` | Draws the key images (glyph tinted to its ChasePlane group color, glow for the active state) and the folder keys, plus previews. |
| 3 | `write.cjs` | Backs up the whole SimDeck profile to `tools\generate\backup\<time>\`, then writes the folders. Refuses while Stream Deck is running. |

## What it touches

- Its own folder pages: COCKPIT, SYSTEMS, CABIN, EXTERIOR, GROUND SVC, AIRPORT, TRAFFIC.
  Their page IDs are kept in `state.json`, so each run replaces the same pages.
- Their folder keys on the SimDeck main page. If you move one, it stays where you put it.
- Column 9 (A9 to D9) of every generated folder: a copy of the four keys in column 9 of the
  SimDeck main page (CAM POSITION, NEXT CAMERA, PREVIOUS CAMERA, Screenshot).

Everything else on SimDeck is left as it is, including folders you add yourself.

SimDeck holds one aircraft's pages at a time: a run for the 737 replaces the iFly's keys, and
the next run for the iFly puts them back. The aircraft is the one ChasePlane reports; each view
names it (`aircraft_readable`, for example "PMDG 737-800 SSW HUES SWA"). ChasePlane keeps views
per livery folder, so another livery of the same aircraft can have other views.

Do not edit keys inside the generated folders by hand; the next run replaces those pages.
Make changes in ChasePlane or in `layout.json` and run again.

## Common changes

| You want to | Do this |
|---|---|
| Rename a view | Rename it in ChasePlane. Titles follow live; rerun to update saved names. |
| Move a view to another folder | Change its camera profile (group) in ChasePlane, then rerun. |
| Reorder a folder | Reorder the views in ChasePlane, then rerun. Folders fill from A2, left to right, in ChasePlane's order. |
| Change a glyph | Edit `icons` in `layout.json` (`"View name": "Glyph"`, or `"Name\|L"` for one side), then rerun. Glyphs are the PNGs in `D:\Bundled Images\StreamDeck Icons\Working Icons`. |
| Change which groups a folder takes | Edit that folder's `themes` (and `include` / `exclude` for single views) in `layout.json`. |
| Change the cabin seat map | Edit CABIN's `place` and `seatMap` in `layout.json`. CABIN is the one folder laid out by hand, for the iFly (seats named like "7F"). |
| Change a folder key's color | `colorTheme` uses a ChasePlane group's color; `color` (for example `"#EA2C27"`) sets one directly. |

Name matching ignores capitals and extra spaces, so renaming "Terminal" to "TERMINAL" in
ChasePlane keeps its glyph and folder.

## Layout rules

- A1 is the back key in every folder; column 9 is the pinned keys.
- Views fill columns 1 to 8 from A2, left to right, row by row.
- Flashlight sits at D8; cinematic at D7 in AIRPORT.
- TRAFFIC: 28 live slots from A2, previous page D6, next page D7, My Aircraft D8.
- A view without a glyph is drawn by the plugin as text in its group color.
- CABIN uses its hand layout only when the aircraft has at least one of its names or seats.
  For any other aircraft (the PMDG 737 seats are named like "{VAPJ} Seat 7F") it fills from A2
  like the other folders, and step 1 lists the hand-laid names as `stale`; that is expected.

## When something goes wrong

| Message | Cause and fix |
|---|---|
| `ChasePlane is not reachable on ws://localhost:8652` | ChasePlane is not running. Start the sim and ChasePlane, then run again. |
| `Stream Deck is running. Quit it first.` | Quit Stream Deck from the tray, not just the window. |
| `... on the parent page is taken by ...` | A new generated folder's spot on the main page is already used. Move that key or change the folder's `parentKey`. |
| `stale: ...` in step 1 | A name in `layout.json` is not in this aircraft's views. Expected for CABIN on aircraft other than the iFly; otherwise update or remove it. |
| `NOT ON ANY PAGE: ...` in step 1 | A view belongs to a group no folder takes. Add the group to a folder's `themes`. |
| Keys say "unable to identify plugin" | The plugin is not installed. Install it (top-level `README.md`). |
| Buttons do nothing / dropdown empty | The plugin is not connected to ChasePlane. Start ChasePlane, then quit Stream Deck from the tray and start it again. |

If SimDeck is duplicated or exported and imported again, Stream Deck gives it a new ID.
Update `profile` and `parentPage` (and `pinned.profile` / `pinned.page`) in `layout.json`.

To undo a run, quit Stream Deck and copy the newest folder under `tools\generate\backup\`
back over `%APPDATA%\Elgato\StreamDeck\ProfilesV3\227856A2-5D79-4BA9-A9DA-769A3F195C15.sdProfile`.

## Requirements

- The Camera Deck for ChasePlane plugin (`com.acms.chaseplane`) installed in Stream Deck from its
  package (top-level `README.md`).
- Node.js and Python with Pillow and NumPy.
- The glyph PNGs in `D:\Bundled Images\StreamDeck Icons\Working Icons` (Traffic_Red falls back to
  `D:\Bundled Images\StreamDeck Icons\SVG`).
