# ChasePlane Cameras (Stream Deck plugin)

From ACMS Digital Systems, makers of [Datalink Pro](https://acmsdigital.com): a Windows app that puts a virtual ACARS terminal in your MSFS 2020 or 2024 cockpit, with an automated airline dispatch office on the other end.

Stream Deck keys for ChasePlane in MSFS 2024: camera views, flashlight, cinematics and live
traffic. The plugin mirrors what ChasePlane reports, live, over `ws://localhost:8652`. It never
changes ChasePlane, through its API or its files.

For the owner's deck only. UUID `com.acms.chaseplane`, version 0.1.0.0.

The camera folders on the SimDeck profile are built by the generator in `tools/generate/`
(see its README). Verified ChasePlane facts and open work are in `PLAN.md`.

## Actions

| Action | Press | Key shows | Settings |
|---|---|---|---|
| Camera | Switches ChasePlane to the view (`set_view_by_guid`) | Glow (state 1) while that view is active | `guid`, `name`, `mode`, `draw`, `liveTitle` |
| Flashlight | `cam_flashlight_toggle` | Glow while `sim_state.flashlight_enabled` | none |
| Cinematic | `cam_cinematic_toggle` | Glow while `cam_mode_set.cinematic_enabled` | none |
| Traffic Slot | Camera to that aircraft (`cam_go_to_traffic`) | Aircraft number `slot` of ChasePlane's traffic list, drawn in the airline color; glow while viewed | `slot` |
| Traffic Page | Previous or next page of slots | Page as `2/5` | `direction` (-1 or 1) |
| My Aircraft | Camera back to your aircraft (`user_aircraft_track`) | Fixed image | none |
| Status | Nothing | Green dot, CHASEPLANE and the loaded aircraft while connected; red OFFLINE while not (the plugin retries every 3 s) | none |
| Deck Key | Depends on its job (below) | One key of the live deck, drawn by the plugin | none; its job comes from its position |
| SVG Test (temporary) | Next drawing test | Shapes, embedded image, mask, filter | none |

Deck Key: a page filled with Deck Keys works like an app, entirely live.
- Home: one row each for onboard, outside and world; the area's name in column 1, then its groups in
  ChasePlane's order with their view counts. A group shows only while it has views on the loaded
  aircraft; the group holding the active camera glows.
- A group: A1 returns home; the other Deck Keys show the group's views in ChasePlane's order, the
  active one glowing. When they do not fit, the last two keys page.
- Groups come from ChasePlane's group files (`work\group\onboard|outside|world\*.json`), which the
  API does not report; the plugin reads them, never writes them, and rereads them when they change.
  Views come from the API; each names its group (`profile_preset`).
- `node tools/testbed.cjs` fills page 1 of CP Test Bed: Deck Keys, plus Flashlight, Cinematic,
  My Aircraft and Traffic at columns 6 to 9 of the bottom row. Quit Stream Deck first; it backs up
  the profile to `tools/backup_testbed/`.

Camera settings:
- `guid` picks the view. World views (Tower, Traffic and the rest) get new GUIDs, so `name` and
  `mode` are kept too: a GUID ChasePlane no longer lists falls back to the same name and mode,
  and the saved GUID is updated. With no match the key shows an alert.
- `draw`: the plugin draws the key, name and tags in the view's ChasePlane theme color, for
  views without a glyph image.
- `liveTitle`: the plugin keeps the title on ChasePlane's current name and tags, so renames show
  without regenerating. A title stored on the key wins over it.
- The property inspector lists every view as `INT|EXT|WORLD · name (tags)`.

## Naming views and groups in ChasePlane

Keys show names as ChasePlane serves them, so the names are the layout:

- Views: `SUBJECT / DETAIL` in capitals, at most two lines of about 9 characters (13 at most;
  longer is cut). ` / ` (a slash with a space each side) breaks the line: `GOPRO / CAPT 1`.
  `F/O` and `WATER/TOILET` (no spaces) stay whole. Names up to 11 characters need no break.
- Leave out the side: ChasePlane adds L, R, FWD, MID and AFT from the camera position and the key
  shows them on its bottom line.
- Groups: 10 characters or fewer. The group name is the caption band on every one of its view
  keys; up to 11 shows at full size, longer shrinks, past about 17 it is cut.
- Same words every time: CAPT, F/O, FWD, AFT, ENG, GSX; CLOSE for close-ups.
- Seats: a name ending in row and letter (`1A`, `SEAT 14F`) lays its group out as a cabin, one deck
  row per letter, front to back.
- `|` also breaks a line, but ChasePlane drops it when it loads its view files ("GOPRO|CAPT 1" came
  back "GOPROCAPT 1", 2026-10-31), so it lasts only until the next sim start. Group names keep it,
  since the plugin reads groups from ChasePlane's files.

The traffic list follows ChasePlane Remote's traffic filters. Page size is the highest slot
number on the page.

## Build, package, install

```
npm install
npm run build
npx streamdeck pack com.acms.chaseplane.sdPlugin -o dist --force
```

Double-click `dist\com.acms.chaseplane.streamDeckPlugin` to install it. Raise `Version` in the
manifest first: Stream Deck skips a package whose version is already installed
("AlreadyInstalled" in its log, 2026-10-27) and replaces the installed copy otherwise.

Developer mode is off in Stream Deck on this PC. Stream Deck then does not load a copy linked with
`streamdeck link` (its keys show "unable to identify plugin"), and it refuses
`streamdeck restart` ("Feature only enabled in developer mode" in its log). So every code change
goes through build, pack and install.

## Source

| File | Does |
|---|---|
| `src/plugin.ts` | Registers the actions and connects |
| `src/chaseplane/client.ts` | The one ChasePlane connection: handshake, requests by id with timeout, reconnect, events for camera, flashlight, views and traffic |
| `src/chaseplane/themes.ts` | ChasePlane Remote's theme colors and the view tags (L, R, FWD, MID, AFT) |
| `src/actions/camera.ts` | Camera action |
| `src/actions/view-key.ts` | Drawn camera keys and two-line names |
| `src/actions/toggles.ts` | Flashlight and Cinematic |
| `src/actions/traffic.ts` | Traffic Slot, Traffic Page, My Aircraft |
| `src/actions/traffic-key.ts` | Drawn traffic keys |
| `com.acms.chaseplane.sdPlugin/` | Manifest, images, property inspector (`ui/camera.html`); `bin/` is built |

Tools for checking ChasePlane by hand (they read, except where a mode toggles something and
puts it back):

| Tool | Does |
|---|---|
| `node tools/probe.mjs switch` | Switches to another camera and back, logs `cam_mode_set` |
| `node tools/probe.mjs toggles` | Flashlight and cinematic on, then off again |
| `node tools/probe.mjs idle [seconds]` | Holds a silent connection, reports if it drops |
| `node tools/probe_traffic.mjs` | Logs the `ai_traffic` pushes |

## When something goes wrong

| What you see | Cause and fix |
|---|---|
| Keys say "unable to identify plugin" | The plugin is not installed. Install the package (above). |
| Keys do nothing, dropdown empty | ChasePlane is not running, or the plugin has not reconnected. Start the sim and ChasePlane; if it persists, quit Stream Deck from the tray and start it again. |
| A camera key shows an alert | ChasePlane has no view with that GUID, name and mode. Pick the view again in the key's dropdown. |

The plugin's log is in `%APPDATA%\Elgato\StreamDeck\Plugins\com.acms.chaseplane.sdPlugin\logs\`;
Stream Deck's own log is `%APPDATA%\Elgato\StreamDeck\logs\StreamDeck.log`.
