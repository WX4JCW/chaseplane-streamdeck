# Plan: ChasePlane Cameras plugin (com.acms.chaseplane)

Every step rests only on facts verified on this PC on 2026-10-17. Each fact names
its evidence. Anything not yet proven is listed under "Unverified" with the check
that settles it, and is not built on until it is checked.

## Environment (verified)

| Fact | Evidence |
|---|---|
| ChasePlane runs on this PC | This PC's IPv4 is 192.168.0.163, the host serving ChasePlane Remote |
| ChasePlane 2026.39.1.16, MSFS2024, Steam, API version 2 | `initialized` and `api_version` messages on connect |
| Stream Deck 7.6.0 | StreamDeck.exe product version; template requires 7.1+ |
| Node 25 / npm 11 locally; plugin runtime Node 24 | `node --version`; manifest `Nodejs.Version` |
| Elgato CLI 1.9.0 has `link`, `restart`, `validate`, `pack` | `streamdeck --help` |
| SDK `@elgato/streamdeck` 3.0.2 has `KeyAction.setState(state)` | `dist/plugin/actions/key.d.ts` |
| Project builds and type-checks clean | `npm run build`, `tsc --noEmit` |

## Step 1. ChasePlane connection (shared client)

Verified:
- WebSocket at `ws://localhost:8652`. The stalexcorp plugin defaults to that URL (its `plugin.js`).
- Handshake: send `{"message":"api_connect","payload":{"client_name":"..."}}` (remote UI source; our probe connected with it).
- Request: `{"message":"api_request","request_id":"<id>","command":"<name>","payload":{...}}`. Reply: `{"message":"api_reply","request_id":"<id>","status":200,"payload":{...}}` (our `get_views` and `set_view_by_guid` calls).
- On connect the server pushes `api_version`, `initialized`, `cam_mode_set`, `sim_state` and others (probe log).
- `cam_mode_set` carries `preset_guid` (active camera), `mode`, `cinematic_enabled` (probe payload). stalexcorp reads `activeGuid` from `currentCamera.preset_guid`.
- `sim_state` carries `flashlight_available`, `flashlight_enabled`, and repeats every second or so (probe log).
- Server sends an app-level `ping` message. No reply is needed: stalexcorp has no handler for it and stays connected.
- Server pushes `view_created`, `view_modified`, `view_deleted` (stalexcorp handles all three).

Build: one client module: connect, handshake, request/reply by id with timeout, auto-reconnect, events for active camera, cinematic, flashlight and views changed.

Also verified (2026-10-17, `tools/probe.mjs`):
- Replies can be wrapped: `get_views` arrives as `payload.payload.views`; `set_view_by_guid` as `payload.{success,guid}`. The client unwraps `{message,payload}` envelopes the same way the remote UI does.
- `initialized` arrives after `api_connect`; the client treats it as "ready".

Verified (`probe.mjs idle 300`): a client that sends nothing after `api_connect` stays connected for 5 minutes; the server sends a `ping` message about once per second. No keep-alive or ping reply is needed.

Built: `src/chaseplane/client.ts`.

## Step 2. Camera action

Verified:
- `get_views` returns 96 views with `guid`, `name`, `mode` (probe).
- `set_view_by_guid {guid}` switches the camera: reply `success:true`, and the owner saw the view change (Pilot test).
- Button state is driven with `setState`: state 0 off, state 1 active. The 66 buttons' glow images are per-button images in the profile and swap correctly under stalexcorp, which calls `setState`.
- Camera dropdown: stalexcorp fills it with `sendToPropertyInspector({event, items:[{label,value}]})` and an sdpi-components `datasource` in `ui/camera.html`.

Build: action `com.acms.chaseplane.camera`, setting `guid`; press sends `set_view_by_guid`; state 1 when `guid === preset_guid`, else 0; `showAlert` on failure; dropdown from `get_views`.
Do not call `setImage`, so per-button glow images in the profile stay in charge.

Verified (`probe.mjs switch`): `cam_mode_set` arrives about 0.1 s after our own `set_view_by_guid`, carrying the new `preset_guid`. The action therefore waits for the push and does not set state itself.
Verified: view suffix flags (`has_left_suffix` etc.) are the LEFT/RIGHT/FWD/MID/AFT tags ChasePlane Remote shows (e.g. "Jumpseat" + right, "Lavatories" + left + fwd). Modes seen: 0, 1, 2.
Dropdown is a flat list `INT|EXT|WORLD · name (tags)`, the `{label,value}` item shape stalexcorp proves works.
Manifest sets `DisableAutomaticStates` so a press never flips state on its own.

Verified in ChasePlaneTest (owner, 2026-10-17): 6 of 8 camera buttons, Flashlight and Cinematic work. Tower and Traffic did nothing.
Cause, verified by probe: World-mode views (mode 2: Explore, FlyBy, Overview, Tower, Runway, Parking, Spotting, Traffic) get new GUIDs; the old GUIDs were not in `get_views`, and ChasePlane still replied `200 success:true` while not switching.
Fix: settings keep `name` and `mode` with `guid`; a GUID not in `get_views` falls back to the same name and mode and the saved GUID is updated; with no match the key shows an alert. `setView` refuses GUIDs not in `get_views`.
Verified: cinematic turns on with one `cam_cinematic_toggle` even from a view with `can_cinematics: false` (18 of 96 views have it); `cam_mode_set` shows `cinematic_enabled: true` 0.1 s later.

Built: `src/actions/camera.ts`, `ui/camera.html`.

## Step 3. Flashlight and Cinematic actions

Verified:
- Commands `cam_flashlight_toggle` and `cam_cinematic_toggle` exist in the remote UI and in stalexcorp.
- State sources: `sim_state.flashlight_enabled`, `cam_mode_set.cinematic_enabled` (probe payloads).

Verified (`probe.mjs toggles`, owner saw it on screen): each toggle replies `200 {success:true}`; `flashlight_enabled` and `cinematic_enabled` follow within 2 s; toggling twice restores the original state.
Verified: `sim_state.flashlight_available` read `false` while the flashlight toggled fine. It is not used.

Built: `src/actions/toggles.ts`.

## Step 4. Remove the sample counter

Verified: `src/actions/increment-counter.ts`, its manifest entry, `ui/increment-counter.html` and `imgs/actions/counter` are Elgato template content only.

Done: all removed. Action images come from the glow set (camera default: Orbit2). `tsc`, `npm run build` and `streamdeck validate` pass.

## Step 5. Link and test in the ChasePlaneTest profile

The owner created the profile ChasePlaneTest for this test, so Flight Panel is not touched until step 6.

Verified: `streamdeck link` and `streamdeck restart com.acms.chaseplane` exist (CLI help).

Test: link, restart the plugin, place camera actions in ChasePlaneTest, confirm press switches the camera and the glow follows.

Done (owner, 2026-10-17: "the plugin does work"):
- Linked with `streamdeck link`; test buttons written by `tools/test_profile.cjs` into ChasePlaneTest loaded and worked, so that action block shape (ActionID, LinkedTitle, Name, Plugin {Name, UUID, Version}, Resources, Settings, State, States[].Image, UUID) is what step 6 writes.
- Both plugins ran at the same time (Flight Panel on stalexcorp, ChasePlaneTest on ours) with no conflict reported.
- The camera dropdown works: the owner fixed Tower by picking it there.

## Traffic page (added 2026-10-17, ChasePlaneTest > TRAFFIC folder)

Verified (`tools/probe_traffic.mjs` and probes):
- No next/previous traffic command exists in the API.
- `request_ai_traffic` makes ChasePlane push `ai_traffic` with `snapshot`, `added`/`updated`/`removed`, `order` (uIds), `traffic_counts`, `filters`. Entries carry `uId`, `callsign`, `display_name`, `atc_type`, `atc_model`, `distance`, `phase`, `kind`. The list follows ChasePlane Remote's filters.
- `cam_go_to_traffic {simobject_id}` and `ai_traffic_view {id}` both switch to the World Traffic view on that aircraft; `ai_traffic_track {id}` keeps the current view and looks at the aircraft. `camera_runtime_state.ai_traffic_tracking_id` reports the aircraft.
- ChasePlane Remote's "Next TFC" is the World Traffic view selected again: each `set_view_by_guid` on Traffic while on it steps to the next aircraft in `order`, wrapping around. A Camera button set to WORLD · Traffic therefore works as Next TFC.

Owner, 2026-10-17: "the TRAFFIC folder works".

Built: `src/actions/traffic.ts` (Traffic Slot, My Aircraft = `user_aircraft_track`, Traffic Page); `tools/traffic_page.cjs` wrote 27 slots, My Aircraft and two page keys into the folder.

Drawn keys (owner screenshot, KDFW, 2026-10-17): slots are SVG images sent with `setImage` (`src/actions/traffic-key.ts`): three lines (identity, type, phase + distance) in the airline color, glow outline in that color while viewed. SVG via `setImage` is verified to render on this Stream Deck. Title color cannot be set from the SDK (`setTitle` takes only title, state, target), which is why the key is drawn.
Verified at KDFW: of 63 listed aircraft none carried a flight number, callsign, ATC id or route (`callsign_source: title_refined`); `atc_airline` (radio callsign name) and `atc_model` were filled. Line 1 falls back flight number > callsign > airline > ATC id > type.
Verified: with `start_ai_traffic_refresh`, `ai_traffic` pushes arrive about every 2 s; non-snapshot pushes carry no `order`.
The My Aircraft key once went missing from the saved page; `tools/traffic_page.cjs` now fills only empty positions and restored it, and it stayed.

## Step 6. Migrate the 66 buttons

Verified:
- Mapping of all 66 buttons (page, position, icon) is in `tools/glow/glow_mapping.json`.
- Each button keeps its camera in `Settings.guid` (profile manifests).
- Profile writes need Stream Deck closed; the owner quits and reopens it. A backup is taken before every write (as `tools/glow/apply_glow.js` does).

Build: a script that, per mapped button, swaps the action UUID and plugin block to `com.acms.chaseplane.camera` (flashlight and cinematic to their actions), keeps `Settings.guid`, keeps both state images, and changes nothing else.

Action block shape: as written in step 5 (verified working).
Carry over `Settings.name` and `Settings.mode` from the stalexcorp settings (every camera button has them; the 4 flashlight and 1 cinematic buttons have no settings) so world views resolve by name. Check every GUID against `get_views` before writing; report any that are not listed.

# Phase 2: generated camera pages

Goal: an offline generator that builds organized ChasePlane camera pages for any aircraft
from ChasePlane's own view data, laid out with flow logic (like the CABIN seat map), and
updates them in place when rerun. For the owner's deck only (CLAUDE.md).

Owner constraints (2026-10-17):
- "i dont want the files touched yet": ChasePlane's files are read only. The generator never writes under `p42-util-chaseplane`.
- "an external generator script to run offline and update the profiles".

## What is verified

| Fact | Evidence |
|---|---|
| ChasePlane stores one JSON per saved view, per aircraft: `%APPDATA%\Microsoft Flight Simulator 2024\WASM\MSFS2024\p42-util-chaseplane\work\aircraft\<aircraft>\onboard\<guid>.json` and `...\outside\` | iFly folder: 64 onboard + 24 outside files; Pilot file identical to its `get_views` record |
| Aircraft folders present: ifly 737_max8, ifly 737_max8_166seats, pmdg 737_800 bw hd, fnx_321_iae_sl_tc, fnx_321_iae_wf_tc, fslabs a321_neo leap, e175 | directory listing |
| `metadata.txt` per aircraft: aircraft.cfg path, ..., onboard and outside counts (64, 24) | file contents |
| The 8 World views are not stored on disk; their GUIDs change | not in the folders; earlier GUID test |
| Every view has `profile_theme`: ONBOARD_PIC, ONBOARD_SYSTEMS, ONBOARD_MOUNTED, ONBOARD_CABIN, OUTSIDE_ORBIT, OUTSIDE_MISC, OUTSIDE_AIRFRAME, OUTSIDE_CHASE, WORLD_DEFAULT/TOWER/RUNWAY/PARKING/SPOTTING/TRAFFIC | `get_views`, iFly: 9/26/5/24/3/7/11/3/3+5 |
| ChasePlane Remote names and colors each theme (hue, saturation; lightness 55% bar, 72% text) | `remote-ui.js` theme table, `remote-ui.css` |
| Views carry `index` (ChasePlane order) and LEFT/RIGHT/FWD/MID/AFT suffix flags | `get_views` |
| The API cannot rename or edit views; only `reorder_views` changes them | full command list from `remote-ui.js` |
| Folder pages are page directories referenced by a folder key (`com.elgato.streamdeck.profile.openchild`, `Settings.ProfileUUID`) and are not listed in the profile's `Pages` | Flight Panel and ChasePlaneTest manifests |
| Writing camera keys, images and keys into existing folder pages works | steps 5, glow swap, TRAFFIC |
| Camera buttons with only name and mode (no GUID) resolve by name | `resolveView` fallback; Tower/Traffic fix |
| Drawn SVG keys via `setImage` render on this Stream Deck | TRAFFIC slots |
| A `.streamDeckProfile` is a zip of `package.json` (AppVersion, DeviceModel, FormatVersion 1, OSType, RequiredPlugins) plus `Profiles/<id>.sdProfile/` | existing PMDG profile file |

## Folder mapping (from themes)

| Folder | Themes |
|---|---|
| COCKPIT | ONBOARD_PIC, ONBOARD_SYSTEMS, ONBOARD_MOUNTED |
| CABIN | ONBOARD_CABIN |
| EXTERIOR | OUTSIDE_AIRFRAME, OUTSIDE_CHASE |
| GROUND SVC | OUTSIDE_MISC (Terminal goes to AIRPORT) |
| ORBIT/AIRPORT | OUTSIDE_ORBIT, all WORLD_* |
| TRAFFIC | live traffic page (built) |
| OTHER | any view no rule places |

Flow layouts per folder (layout file, hand placements by view name, rules for the rest):
- CABIN: zones across row 1; A seats over F seats, front to back; lavatories and flashlight on row 4 (the owner's existing layout).
- COCKPIT: captain side left, center, first officer right; rows overhead → eye level → panel → pedestal.
- EXTERIOR: aircraft seen from above, nose at top centre, left-wing views on the left half, right on the right, chase at bottom centre.
- GROUND SVC: front to back along the fuselage; left-side services over right-side.
- ORBIT/AIRPORT: near to far: around the aircraft, at the airport, in the world, watching others.

## Milestones

M1. Layout file and reader (`tools/generate/`). Reads the aircraft folders read only, applies the mapping and placements, reports placed / unplaced / stale per aircraft, and draws a preview image per folder. Writes nothing.

M2. One new folder. Writes CABIN for the iFly as a new folder key and folder page in ChasePlaneTest (Stream Deck closed, backup first). Owner opens it.
Proves the one unverified write: creating a folder page that did not exist.

M3. Drawn camera keys. Camera action draws a text key in the folder color when a button has no image, so views without a glow icon need no new art. Uses the proven SVG path.

M4. Full folder set for the iFly in ChasePlaneTest: all folders, flow layouts, OTHER, TRAFFIC link.

M5. One generated profile per aircraft, updated in place on rerun (the generator records each profile's ID). Stream Deck closed for writes.
Unverified: creating a new profile directory from scratch (root manifest with Device, Name, Pages, Version). Check: generate one, start Stream Deck, confirm it lists and opens.

M6 (optional). In-plugin dynamic page for the "Test Dynamic Folder": theme tabs, paging and view slots filled live from `get_views`, for views not on any generated page and for aircraft without a generated profile.

## Colors and glyphs

Owner, 2026-10-17: "i think chaseplanes colors might be easier". Keys use ChasePlane Remote's theme colors (55% lightness for glow and outline, 72% for text); a folder key takes the color of its main theme.

Glyph tinting at generate time (chosen):
- The generator keys out each glyph's black (as `tools/glow/glow_icons.py` does), paints the glyph in its view's theme color, and bakes the off/glow pair into the profile. The 34 glyphs in Working Icons become shapes recolored per theme; no new art.
- A view moved to another theme in ChasePlane is repainted on the next run.
- Uses only proven steps: Python image work and writing images into profiles.

Live tinting in the plugin (only if M6 needs it, unverified):
- SVG with an embedded glyph image tinted by mask or filter: needs Stream Deck's SVG renderer to support `<image>` plus masks or filters; only text and shapes are proven.
- Or tint the PNG in the plugin with a small image library (new dependency).
Check before use: one test key per method.

## View titles

Owner, 2026-10-17: "we will need a text title for each view like the existing original plugin does, but i want the text color to match".
- The generator writes each camera key's title (view name, suffix tags shortened: "EFB L", "Lavatories L FWD") and `TitleColor` = the theme's text color (72% lightness), plus `FontSize`, `FontFamily`, `TitleAlignment: bottom`. These state fields exist in profiles Stream Deck wrote (Flight Panel buttons carry them).
- The plugin calls `setTitle` with the current view name, so renames made in ChasePlane show without regenerating (as the stalexcorp plugin does). `setTitle` carries text only (SDK `SetTitle` payload: title, state, target), so the color stays the key's `TitleColor`.
- Glyph layout leaves room for the title: glyph moved up and slightly smaller; glow outline kept clear of the text.
Unverified: that a plugin `setTitle` keeps the key's `TitleColor`. Check: one test key with a colored title, then a rename in ChasePlane.

Possible adjustment: Systems (grey-green) and Misc (brown-grey) are muted; if they read too dim on the hardware, raise their saturation slightly, same hue.

## Same-name views

Verified (iFly view files, owner: "chaseplan dynamically names the potision"): saved files hold only the base name ("Throttle"), with no suffix fields. ChasePlane adds LEFT/RIGHT/FWD/MID/AFT from the camera position when it serves `get_views` (Throttle `102614ba` x 0.4998 right of the 0.491 seat anchor → RIGHT; `9070f790` and `afa899b0` x 0.4898 → LEFT, same spot, different pitch and zoom).
Same-name views are distinct cameras with their own GUIDs and are placed by GUID; their titles may repeat ("Throttle L"). Nothing to resolve. When reading the files offline, the generator takes the suffix from `get_views` when ChasePlane is running, else shows the base name.
