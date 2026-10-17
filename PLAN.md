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
