# Plan: ChasePlane Cameras plugin (com.acms.chaseplane)

Facts here were verified on this PC; each names its evidence and date. Anything not proven is
under "Open" with the check that settles it, and nothing is built on it until it is checked.

How to build, install and use the plugin: `README.md`. How to run the page generator:
`tools/generate/README.md`. Rulings: `CLAUDE.md`.

## Status

| Item | State |
|---|---|
| ChasePlane client, Camera, Flashlight, Cinematic | Built, owner tested (2026-10-17: "the plugin does work") |
| Traffic page: Traffic Slot, Traffic Page, My Aircraft | Built, owner tested (2026-10-17: "the TRAFFIC folder works") |
| Drawn camera keys (`draw`) and live titles (`liveTitle`) | Built, seen on the device 2026-10-17 |
| Generator writing the SimDeck camera folders | Built; run for the iFly (2026-10-17) and the PMDG 737-800 SSW HUES SWA (2026-10-25) |
| CABIN for aircraft other than the iFly | Built 2026-10-25: falls back to filling from A2 (`plan.mjs`); uncommitted in worktree `plugin-reinstall-cabf55` |
| Step 6: move the 66 Flight Panel buttons from the stalexcorp plugin | Not done; no migration script exists. The stalexcorp plugin was uninstalled 2026-10-22 (Stream Deck log), so any Flight Panel key still on it does nothing |
| M5: one generated profile per aircraft | Not built |
| M6: in-plugin dynamic page | Built 2026-10-27 as the Deck Key on CP Test Bed page 1: home of ChasePlane groups, group screens of views, all live; owner tested ("it works"); edits made in ChasePlane show on the deck live (owner, 2026-10-27: "it does update"). Views show as text; glyphs not yet |
| Phase 3: deck features, flight phase, Smart Cam (P1 to P6) | Planned 2026-10-31; P1 (verify commands) is next |
| Page title on the + XL touch strip | Later. Owner, 2026-10-17: "touch strip after we get the dynamic pages, dont get ahead". Mockup `tools/generate/out/title_options_page.png`, template `tools/generate/template_plusxl.png` |

## Environment

| Fact | Evidence |
|---|---|
| ChasePlane 2026.39.1.16, MSFS2024, Steam, API version 2 | `initialized` and `api_version` on connect (2026-10-17, again 2026-10-25) |
| ChasePlane Remote is served from this PC (192.168.0.163) | IPv4 of this PC |
| Stream Deck 7.6.0; the plugin needs 7.1+ | StreamDeck.exe version; manifest |
| Node 25 / npm 11 locally; plugin runtime Node 24 | `node --version`; manifest `Nodejs.Version` |
| SDK `@elgato/streamdeck` 3.0.2; Elgato CLI 1.9.0 with `link`, `restart`, `validate`, `pack` | package files; `streamdeck --help` |
| Developer mode is off: a linked copy is not loaded and `streamdeck restart` is refused | Stream Deck log 2026-10-22, "Feature only enabled in developer mode"; keys showed "unable to identify plugin" until the package was installed |

## ChasePlane API

Connection:
- WebSocket `ws://localhost:8652`, the stalexcorp plugin's default.
- Handshake `{"message":"api_connect","payload":{"client_name":"..."}}`; `initialized` follows and means ready.
- Request `{"message":"api_request","request_id":"<id>","command":"<name>","payload":{...}}`; reply `api_reply` with the same `request_id` and `status`.
- Replies can be wrapped: `get_views` arrives as `payload.payload.views`; `set_view_by_guid` as `payload.{success,guid}`. The client unwraps them as the remote UI does.
- On connect the server pushes `api_version`, `initialized`, `cam_mode_set`, `sim_state`, `camera_runtime_state`, `user_settings`, `airports`, `airport_changed` (listen, 2026-10-25).
- The server sends `ping` about once a second; no reply is needed. A client sending nothing stayed connected 5 minutes (`probe.mjs idle 300`).
- The full command list is in ChasePlane Remote's `remote-ui.js`. The API cannot rename or edit views; only `reorder_views` changes them. The plugin does not use it.

Camera:
- `cam_mode_set` carries `preset_guid` (active view), `mode`, `cinematic_enabled`, `views_loaded`. It arrives about 0.1 s after `set_view_by_guid`, so the plugin waits for it and never sets state itself.
- `set_view_by_guid {guid}` switches the view. For a GUID not in `get_views` it still replies `200 success:true` and does not switch; the plugin therefore refuses GUIDs not in `get_views`.
- World views (mode 2: Explore, FlyBy, Overview, Tower, Runway, Parking, Spotting, Traffic) get new GUIDs; they are found again by name and mode.
- `cam_cinematic_toggle` turns cinematics on even from a view with `can_cinematics: false`.
- `cam_flashlight_toggle` works while `sim_state.flashlight_available` reads `false`; that field is not used.
- Toggles reply `200 {success:true}`; `flashlight_enabled` and `cinematic_enabled` follow within 2 s (`probe.mjs toggles`, owner saw it).
- After a sim crash the plugin had connected before the views loaded and kept an empty list; it now fetches views again when `cam_mode_set` reports `views_loaded` and its list is empty (cause inferred from timing, not reproduced).

Views (`get_views`, `view_created`, `view_modified`, `view_deleted`):
- Each view has `guid`, `name`, `mode` (0, 1, 2), `index` (ChasePlane's order), `profile_theme`, and LEFT/RIGHT/FWD/MID/AFT suffix flags (`has_left_suffix` and so on), the tags ChasePlane Remote shows.
- Each view names its group: `profile_preset` is the GUID of a group file in `work\group\onboard|outside|world\` (all 76 views of the 737 matched, 2026-10-27). A group file has `name`, `index` (order within its area), `theme`, `description`, `is_grouped` and camera physics. The API has no group command (none in ChasePlane Remote's `remote-ui.js`; guessed names reply 404), and ChasePlane Remote itself lists views by theme. Several groups can share a theme (Instruments, Pilot Instruments and Systems are all ONBOARD_SYSTEMS). Themes seen beyond the list below: ONBOARD_MISC, OUTSIDE_CABIN, WORLD_MISC.
- ChasePlane's LVARs (`p42_cp_*`) carry camera state and load flags (`p42_cp_load_groups_lib`), no group or view names (owner's list, 2026-10-27).
- Each view names the loaded aircraft: `aircraft` ("pmdg 737_800 ssw hues swa") and `aircraft_readable` ("PMDG 737-800 SSW HUES SWA"). Views shared by every aircraft carry `%GLOBAL%` (8 on the 737) (listen, 2026-10-25).
- Themes: ONBOARD_PIC, ONBOARD_SYSTEMS, ONBOARD_MOUNTED, ONBOARD_CABIN, OUTSIDE_ORBIT, OUTSIDE_MISC, OUTSIDE_AIRFRAME, OUTSIDE_CHASE, WORLD_DEFAULT/TOWER/RUNWAY/PARKING/SPOTTING/TRAFFIC. ChasePlane Remote gives each a hue and saturation; lightness 55% for bars, 72% for text (`remote-ui.js`, `remote-ui.css`).
- Same-name views are distinct cameras with their own GUIDs. Saved files hold only the base name ("Throttle"); ChasePlane adds the side from the camera position when it serves `get_views`. The generator places them by GUID; titles may repeat ("Throttle L").

Traffic:
- No next/previous traffic command exists.
- `request_ai_traffic` makes ChasePlane push `ai_traffic` with `snapshot`, `added`/`updated`/`removed`, `order` (uIds), `traffic_counts`, `filters`. Entries carry `uId`, `callsign`, `display_name`, `atc_type`, `atc_model`, `atc_airline`, `distance`, `phase`, `kind`. The list follows ChasePlane Remote's filters.
- With `start_ai_traffic_refresh`, pushes arrive about every 2 s; non-snapshot pushes carry no `order`.
- `cam_go_to_traffic {simobject_id}` and `ai_traffic_view {id}` switch to the World Traffic view on that aircraft; `ai_traffic_track {id}` keeps the view and looks at it. `camera_runtime_state.ai_traffic_tracking_id` reports the aircraft.
- Selecting the World Traffic view again steps to the next aircraft in `order` (ChasePlane Remote's "Next TFC"), so a Camera key on WORLD · Traffic works as Next TFC.
- At KDFW, none of 63 aircraft carried a flight number, callsign, ATC id or route (`callsign_source: title_refined`); `atc_airline` and `atc_model` were filled. Line 1 of a traffic key falls back flight number > callsign > airline > ATC id > type.

## ChasePlane files (read only)

| Fact | Evidence |
|---|---|
| One JSON per saved view, per aircraft: `%APPDATA%\Microsoft Flight Simulator 2024\WASM\MSFS2024\p42-util-chaseplane\work\aircraft\<aircraft>\onboard\<guid>.json` and `...\outside\` | iFly folder: 64 onboard + 24 outside; Pilot file identical to its `get_views` record |
| Folders are per livery: 7 for the PMDG 737-800 alone (bw hd, bw tc, ssw hd, ssw hues swa, ssw sc, ssw tc, and 900er ssw tc) besides the iFly, Fenix, FSLabs and E175 folders | directory listings 2026-10-17 and 2026-10-25 |
| `metadata.txt` per aircraft gives the aircraft.cfg path and view counts; some folders have none | file contents |
| The 8 World views are not stored on disk | not in the folders |

## Stream Deck

| Fact | Evidence |
|---|---|
| Key state drives the glow: `setState` 0 off, 1 on; `DisableAutomaticStates` stops a press flipping it | stalexcorp; our Camera action |
| `setImage` with SVG renders on this Stream Deck; drawn camera and traffic keys use it | TRAFFIC slots, GROUND SVC |
| SVG in `setImage` also renders an embedded base64 PNG `<image>`, a luminance `<mask>` over it, and an `feColorMatrix` filter on it; both recolored the plane glyph | temporary SVG Test action, owner saw all four variants, 2026-10-27 |
| A key can be animated by sending a new `setImage` on a timer (10 frames a second ran smoothly); SVG's own `<animate>` is not relied on | SVG Test step 6, owner, 2026-10-27 |
| `setTitle` carries text only, so the title color is the key's stored `TitleColor` | SDK `SetTitle` payload |
| A Title stored on a key wins over `setTitle`; generated keys store only `TitleColor`, font and size | device, 2026-10-17 |
| A long title is clipped, not wrapped; the plugin splits names over two lines past ~12 characters (10 in capitals) | device |
| Action block a profile needs: ActionID, LinkedTitle, Name, Plugin {Name, UUID, Version}, Resources, Settings, State, States[].Image, UUID | `tools/test_profile.cjs` keys loaded and worked |
| Folder pages are page directories opened by a key `com.elgato.streamdeck.profile.openchild` (`Settings.ProfileUUID`) and are not listed in the profile's `Pages`; creating one works | Flight Panel and ChasePlaneTest manifests; CABIN written 2026-10-17 |
| Profile writes need Stream Deck quit from the tray | write.cjs; owner |
| A plugin can switch only to profiles packed inside it (`switchToProfile`); it has no access to the user's own profiles | SDK docs, guides/profiles.md, "User profiles" |
| `setTitle` options are only `state` and `target`; title color and font come from the key's stored state or the manifest | SDK docs, guides/keys.md `setTitle`; references/manifest.md `TitleColor`, `FontFamily` |
| A `.streamDeckProfile` is a zip of `package.json` plus `Profiles/<id>.sdProfile/` | existing PMDG profile file |
| Two plugins on the same ChasePlane at once ran with no conflict | Flight Panel on stalexcorp, ChasePlaneTest on ours, 2026-10-17 |

## Design choices on record

- Colors: owner, 2026-10-17: "i think chaseplanes colors might be easier". Keys use ChasePlane Remote's theme colors (55% glow and outline, 72% text); a folder key takes its main theme's color.
- Glyphs are tinted at generate time: black keyed out, glyph painted in the theme color, off/glow pair baked into the profile. A view moved to another theme is repainted on the next run.
- Titles: owner, 2026-10-17: "we will need a text title for each view like the existing original plugin does, but i want the text color to match". The generator writes `TitleColor` from the theme; the plugin keeps the text live.
- Layout: owner, 2026-10-17: "with the exception of the seating that we fill from A2 letf to right". Folders fill from A2 in ChasePlane's order; CABIN keeps the iFly seat map. Glyphs fit 78% of key width and 56% of height, centred at 39% height.
- COCKPIT is split from SYSTEMS because PIC + Systems + Mounted (40 on the iFly) exceeds a folder's free keys.

# Phase 3: deck features and Smart Cam

Goal: the live deck (SimDeck page 2, CP Test Bed page 1) gains the camera features the
ClearedToCode "ChasePlane Deck" pro version shows (owner's screenshots and its free plugin, read
2026-10-31), built our own way: on the owner's ChasePlane groups, with no fixed slots. Our own
code only; ClearedToCode's plugin was read to learn which ChasePlane commands exist, and nothing
is copied from it. ChasePlane is only sent camera commands, never changed (CLAUDE.md). The deck
works without Datalink Pro running (owner, 2026-10-31: "i want the streamdeck profile to be
independant"); Datalink's phase rules are ported into the plugin.

Order: P1 to P6, each finished and checked on the deck before the next starts.

## P1. Verify the extra ChasePlane commands (probe only, nothing built)

Seen in ClearedToCode's plugin and/or ChasePlane Remote's `remote-ui.js`, payloads not yet proven
here. One probe run, each command sent once and undone where it changes something:

| Command | Payload as seen | Check |
|---|---|---|
| `set_camera_mode` | `{mode: 0/1/2}` | Cockpit, exterior, world; `cam_mode_set.mode` follows |
| `cam_load_default` | none | Camera goes to the aircraft's default view |
| `set_master_enabled` | `{enabled: bool}` | ChasePlane off, then on; which message reports it |
| `cam_lookat_unset` | none | Look-at released; which field reports a lock |
| `cam_cinematic_next` | none | Next shot while cinematics are on |
| `cam_go_to_nearest` | `{kind: tower/runway/parking/spotting}` | Each switches to the nearest spot |
| `cam_go_to_airport_index` | unknown | Payload and what it selects (runway stepping depends on it) |
| `ai_traffic_auto_target_set` | `{enabled: bool}` | Auto target on/off; `camera_runtime_state.ai_traffic_auto_target_enabled` follows |

Done when each row is verified or struck, with evidence recorded under "ChasePlane API".

## P2. Deck keys from the verified commands

- Next and Previous view: step through the open group in ChasePlane's order (on the home
  screen: through the active camera's group), skipping views with `skip_cycle`. Our own logic;
  ChasePlane has no next/previous command (remote-ui.js, 2026-10-27).
- Mode keys (cockpit, exterior, world), lit on the current mode.
- ChasePlane on/off, default view, look-at release, next cinematic shot.
- Nearest tower, runway, parking, spotting.
- Hold to peek on view keys: hold to look, release to return (threshold about half a second).
- Where: new key actions the owner places, plus fixed keys on the deck's bottom row. Which keys
  go on the bottom row is the owner's pick, shown as a mockup first.

Done when each key works on the deck (owner check).

## P3. Flight phase in the plugin (no Datalink needed)

The plugin gets its own SimConnect connection (npm `node-simconnect` 4.2.1, LGPL-3.0, current
2026-10-03; owner's own deck only, so bundling it is fine) and reads, about twice a second:
SIM ON GROUND, GROUND VELOCITY, PLANE ALT ABOVE GROUND, BRAKE PARKING POSITION,
GENERAL ENG COMBUSTION:1 and :2, VERTICAL SPEED, PLANE LATITUDE/LONGITUDE.

Phase rules ported from Datalink Pro `datalink/oooi.py` (same thresholds and debounces, so the
deck and Datalink agree):

| Phase | Condition | Holds for |
|---|---|---|
| GATE → OUT (taxi) | Parking brake off and (moved 12 m from where it was parked, or ground speed > 2 kt) | 15 s |
| OUT → OFF (takeoff) | Not on ground | 10 s |
| OFF → AIRBORNE | Height above ground > 1500 ft (immediate) | — |
| OFF/AIRBORNE → ON (landed) | On ground and ground speed < 30 kt | 20 s |
| ON → IN (at gate) | Ground speed < 1 kt, parking brake set, both engines off (2 misses of the 500 ms poll tolerated) | 30 s |

Differences from Datalink, because the deck has no flight plan:
- No SimBrief, SOBT, TPS or NOTOC steps; the start state is GATE (on ground, brake set) or
  AIRBORNE (sim started in the air).
- After IN, the next brake release starts a new cycle (Datalink waits for a new-flight reset).
- AIRBORNE splits by vertical speed: CLIMB above +500 fpm, DESCENT below -500 fpm, else CRUISE,
  each held 20 s so a level-off does not flicker.
- Final approach: DESCENT and height above ground under 2500 ft gives APPROACH.

Shown on a Flight Phase key (and the Status key: CONNECTED plus the phase).

Unverified, checked first in P3: `node-simconnect` reaches MSFS 2024 on this PC from inside a
Stream Deck plugin (default pipe), while Datalink Pro holds its own SimConnect connection.
Check: a probe script reads the eight values once; then the same from the plugin.

Done when a whole flight (gate to gate) shows every phase at the right moment on the deck,
compared with Datalink Pro's OOOI times for the same flight.

## P4. Smart Cam and Auto Tour

- Smart Cam: on each phase change, switch to the camera the owner assigned to that phase
  (a view, or a group to tour). Defaults proposed in a mockup, the owner decides.
- Auto Tour: switch through a group's views (or all) every N seconds, slower and faster keys.
- Both pause when the owner presses any view key (HOLD shown) and resume with a Resume key or on
  the next phase change.
- Settings kept in the plugin's global settings, so they survive restarts.

Done when a flight runs hands-off with Smart Cam and the owner can take over and give back.

## P5. Stream Deck + XL dials and touch strip

Owner, 2026-10-17: "touch strip after we get the dynamic pages, dont get ahead"; the dynamic
pages are done (M6). Touch strip shows the open group and active view; a dial steps through the
group's views, push to open home; one dial for Auto Tour speed. Mockup first
(`tools/generate/out/title_options_page.png` exists), built after.

## P6. Runway camera stepping

Depends on P1's `cam_go_to_airport_index` and the `airports` / `airport_changed` pushes: show the
active airport and runway, step through runways, flip runway end. Built only if P1 shows
ChasePlane supports it.

## Open

- Step 6, the 66 Flight Panel buttons: the mapping (page, position, icon) is in `tools/glow/glow_mapping.json`; each button keeps its camera in `Settings.guid`. Plan: per mapped button, swap the action UUID and plugin block to `com.acms.chaseplane.camera` (flashlight and cinematic to their actions), carry over `Settings.guid`, `name` and `mode`, keep both state images, change nothing else; check every GUID against `get_views` first and report any not listed; Stream Deck quit and a backup taken before writing.
- M5, one profile per aircraft: unverified that a profile directory created from scratch (root manifest with Device, Name, Pages, Version) is listed and opens. Check: generate one, start Stream Deck, open it. Switching to it automatically from the plugin is not possible unless it is packed inside the plugin (see Stream Deck).
- M6, in-plugin dynamic page (theme tabs, paging, slots filled live from `get_views`) for views on no generated page and aircraft without one. Live glyph tinting works in SVG (mask or filter, see Stream Deck), so no image library is needed.
- Pulsing glow on the active view (owner asked, 2026-10-27). A timer-driven outline pulse worked (0.1.0.7, 3 s breath; owner: "more like an outline than a real glow"). Versions 0.1.0.8 to 0.1.0.10 failed on the deck: a blur/gradient/halo glow, then each piece alone (`feGaussianBlur`, `radialGradient`, offset glyph copies), then stacked faint outlines and layered squares. The last uses only shapes that drew before, so the cause is not settled. Next check: what the key shows on SVG Test steps 7 to 9 (title over black, or no change) and whether steps 1 to 5 still draw.
- Systems (grey-green) and Misc (brown-grey) may read dim on the hardware; if so, raise saturation, same hue.
