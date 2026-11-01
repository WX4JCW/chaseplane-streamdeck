// Fill the ChasePlaneTest TRAFFIC folder: My Aircraft, page keys and 27 traffic slots.
// Usage: node tools/traffic_page.cjs [--dry-run]
// Refuses to run while Stream Deck is open; keeps the existing back key; backs up the page first.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const DRY = process.argv.includes("--dry-run");
const PAGE = path.join(process.env.APPDATA, "Elgato/StreamDeck/ProfilesV3/227856A2-5D79-4BA9-A9DA-769A3F195C15.sdProfile/Profiles/FE5831E1-5723-4DA0-8CBB-DFA035454D37");
const BACKUP = path.join(__dirname, "backup_traffic_page");
const PLUGIN = { Name: "Camera Deck for ChasePlane", UUID: "com.acms.chaseplane", Version: "0.1.0.0" };

if (!DRY && execSync("tasklist").toString().toLowerCase().includes("streamdeck.exe")) {
	console.error("Stream Deck is running. Quit it first.");
	process.exit(1);
}

const file = path.join(PAGE, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const keypad = manifest.Controllers.find((c) => c.Type === "Keypad");
// Only empty positions are filled, so a re-run restores missing keys and leaves the rest alone.
const existing = new Set(Object.keys(keypad.Actions ?? {}));

const button = (name, kind, settings, states) => ({
	ActionID: crypto.randomUUID(),
	LinkedTitle: true,
	Name: name,
	Plugin: PLUGIN,
	Resources: null,
	Settings: settings,
	State: 0,
	States: states,
	UUID: `com.acms.chaseplane.${kind}`,
});

const add = {
	"1,0": button("My Aircraft", "my-aircraft", {}, [{}]),
	"7,0": button("Traffic Page", "traffic-page", { direction: -1 }, [{}]),
	"8,0": button("Traffic Page", "traffic-page", { direction: 1 }, [{}]),
};
let slot = 1;
for (let row = 1; row <= 3; row++) for (let col = 0; col <= 8; col++) add[`${col},${row}`] = button("Traffic Slot", "traffic-slot", { slot: slot++ }, [{}, {}]);

for (const pos of Object.keys(add)) if (existing.has(pos)) delete add[pos];
if (!Object.keys(add).length) {
	console.log("nothing missing");
	process.exit(0);
}
if (!DRY) fs.cpSync(PAGE, BACKUP, { recursive: true });
keypad.Actions = { ...keypad.Actions, ...add };
for (const [pos, a] of Object.entries(add)) console.log(`${DRY ? "would add" : "added"}  ${pos.padEnd(4)} ${a.UUID.split(".").pop()} ${JSON.stringify(a.Settings)}`);
if (!DRY) fs.writeFileSync(file, JSON.stringify(manifest));
console.log(DRY ? "dry run, nothing written" : `done; backup in ${BACKUP}`);
