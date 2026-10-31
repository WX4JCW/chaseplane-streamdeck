// Fill page 1 of the owner's CP Test Bed profile with the live deck: Deck Keys everywhere,
// plus Flashlight, Cinematic, My Aircraft and Status on the bottom row (columns 6 to 9), as the
// owner laid out SimDeck page 2 (2026-10-31), a key back to SimDeck at the bottom left, and the
// camera hotkeys and Screenshot moved from SimDeck (columns 2 to 5 of the bottom row). The six
// dials get a Deck Dial each.
// Usage: node tools/testbed.cjs [--dry-run]
// Refuses while Stream Deck runs; backs up the whole profile to tools/backup_testbed/<time>/ first.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const DRY = process.argv.includes("--dry-run");
const PROFILE = path.join(process.env.APPDATA, "Elgato/StreamDeck/ProfilesV3/49DB96C1-84C9-4EE8-8FED-D9E661830FFC.sdProfile");
const PAGE = "427BF197-8210-4CD2-A1A5-E336F4D3041E";
const COLUMNS = 9;
const ROWS = 4;
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../com.acms.chaseplane.sdPlugin/manifest.json"), "utf8"));
const PLUGIN = { Name: manifest.Name, UUID: manifest.UUID, Version: manifest.Version };

if (!DRY && execSync("tasklist").toString().toLowerCase().includes("streamdeck.exe")) {
	console.error("Stream Deck is running. Quit it from the tray icon first.");
	process.exit(1);
}

const block = (name, kind, settings, states) => ({
	ActionID: crypto.randomUUID(),
	LinkedTitle: true,
	Name: name,
	Plugin: PLUGIN,
	Resources: null,
	Settings: settings,
	State: 0,
	States: states,
	UUID: `${PLUGIN.UUID}.${kind}`,
});

// Stream Deck's own Switch Profile key back to SimDeck's first page (shape copied from a key
// Stream Deck wrote: UUID profile.rotate, Settings DeviceUUID/PageIndex/ProfileUUID). Its image is
// drawn in the deck's key style (tools/testbed_images/simdeck.png), since the plugin cannot draw a
// key that is not its own.
const SIMDECK = "227856a2-5d79-4ba9-a9da-769a3f195c15";
const SIMDECK_IMAGE = "Images/GEN_simdeck.png";
const switchProfile = {
	ActionID: crypto.randomUUID(),
	LinkedTitle: true,
	Name: "Switch Profile",
	Plugin: { Name: "Switch Profile", UUID: "com.elgato.streamdeck.profile.rotate", Version: "1.0" },
	Resources: null,
	Settings: { DeviceUUID: "", PageIndex: 1, ProfileUUID: SIMDECK },
	State: 0,
	States: [{ Image: SIMDECK_IMAGE, ShowTitle: false, Title: "" }],
	UUID: "com.elgato.streamdeck.profile.rotate",
};

const fixed = {
	"0,3": switchProfile,
	"5,3": block("Flashlight", "flashlight", {}, [{}, {}]),
	"6,3": block("Cinematic", "cinematic", {}, [{}, {}]),
	"7,3": block("My Aircraft", "my-aircraft", {}, [{}]),
	"8,3": block("Status", "status", {}, [{}]),
};
// Keys moved here from SimDeck's main page by simdeck_main.cjs (camera hotkeys, Screenshot): their
// settings and keystrokes as they were, with a Panel picture instead of their old image and title.
const MOVED_FILE = path.join(__dirname, "testbed_images/moved_keys.json");
const moved = fs.existsSync(MOVED_FILE) ? JSON.parse(fs.readFileSync(MOVED_FILE, "utf8")) : {};
const movedImages = [];
for (const [pos, m] of Object.entries(moved)) {
	const rel = `Images/GEN_${m.image}.png`;
	movedImages.push([m.image, rel]);
	fixed[pos] = {
		...m.action,
		ActionID: crypto.randomUUID(),
		States: m.action.States.map((s) => ({ ...s, Image: rel, ShowTitle: false, Title: "" })),
	};
}

const keys = {};
for (let row = 0; row < ROWS; row++)
	for (let col = 0; col < COLUMNS; col++) {
		const pos = `${col},${row}`;
		keys[pos] = fixed[pos] ?? block("Deck Key", "deck", {}, [{}]);
	}

const file = path.join(PROFILE, "Profiles", PAGE, "manifest.json");
const page = JSON.parse(fs.readFileSync(file, "utf8"));
const keypad = page.Controllers.find((c) => c.Type === "Keypad");
const existing = Object.keys(keypad.Actions ?? {}).length;
console.log(`${DRY ? "would write" : "write"} CP Test Bed page 1 (${PAGE}): ${Object.keys(keys).length} keys, replacing ${existing}; plugin ${PLUGIN.Version}`);
if (DRY) return console.log("dry run, nothing written");

const backup = path.join(__dirname, "backup_testbed", new Date().toISOString().replace(/[:.]/g, "-"));
fs.cpSync(PROFILE, backup, { recursive: true });
console.log(`backup: ${backup}`);
keypad.Actions = keys;
// The + XL's six dials: one Deck Dial each; the plugin gives each its job by position.
const encoder = page.Controllers.find((c) => c.Type === "Encoder") ?? (page.Controllers.push({ Actions: null, Type: "Encoder" }), page.Controllers.at(-1));
encoder.Actions = Object.fromEntries([0, 1, 2, 3, 4, 5].map((col) => [`${col},0`, block("Deck Dial", "dial", {}, [{}])]));
fs.mkdirSync(path.join(path.dirname(file), "Images"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "testbed_images/simdeck.png"), path.join(path.dirname(file), SIMDECK_IMAGE));
for (const [image, rel] of movedImages) fs.copyFileSync(path.join(__dirname, `testbed_images/${image}.png`), path.join(path.dirname(file), rel));
fs.writeFileSync(file, JSON.stringify(page));
console.log("done");
