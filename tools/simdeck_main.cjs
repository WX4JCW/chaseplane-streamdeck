// Restyle SimDeck's main page in the deck's Panel style (one color per app; pictures from
// tools/testbed_images/panel_keys.py) and move its column 9 keys (camera hotkeys and Screenshot)
// to CP Test Bed, owner 2026-10-31: "next previous and reset cam should be with chaseplane",
// "screenshot as well should move to the chaseplane profile not on simdeck".
// Only pictures and titles change on the restyled keys; what each key does is untouched.
// Usage: node tools/simdeck_main.cjs [--dry-run]. Run tools/testbed.cjs after it: that writer
// places the moved keys on CP Test Bed from tools/testbed_images/moved_keys.json.
// Refuses while Stream Deck runs; backs up the SimDeck profile first.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DRY = process.argv.includes("--dry-run");
const PROFILE = path.join(process.env.APPDATA, "Elgato/StreamDeck/ProfilesV3/227856A2-5D79-4BA9-A9DA-769A3F195C15.sdProfile");
const PAGE = path.join(PROFILE, "Profiles/A0D29719-64E3-4B2E-8A44-C77CB9CD9CAE");
const IMAGES = path.join(__dirname, "testbed_images");
const MOVED = path.join(IMAGES, "moved_keys.json");

// Position on SimDeck's main page: picture (panel_keys.py name). Checked against what each key opens.
const RESTYLE = {
	"0,0": "cpdeck",
	"1,0": "gsx",
	"2,0": "sayintentions",
	"3,0": "anyflight",
	"4,0": "maxdeck",
	"5,0": "flightpanel",
	"6,0": "weather",
	"7,0": "apps",
};
// Column 9 keys that move to CP Test Bed: position there, picture.
const MOVE = {
	"8,0": { to: "1,3", image: "campos" },
	"8,1": { to: "2,3", image: "camnext" },
	"8,2": { to: "3,3", image: "camprev" },
	"8,3": { to: "4,3", image: "screenshot" },
};

if (!DRY && execSync("tasklist").toString().toLowerCase().includes("streamdeck.exe")) {
	console.error("Stream Deck is running. Quit it from the tray icon first.");
	process.exit(1);
}

const file = path.join(PAGE, "manifest.json");
const page = JSON.parse(fs.readFileSync(file, "utf8"));
const keys = page.Controllers.find((c) => c.Type === "Keypad").Actions;

for (const [pos, image] of Object.entries(RESTYLE)) {
	if (!keys[pos]) throw new Error(`${pos} is empty on SimDeck's main page; layout changed, nothing written`);
}
const moved = {};
for (const [pos, m] of Object.entries(MOVE)) {
	if (!keys[pos]) {
		console.log(`${pos} already moved`);
		continue;
	}
	moved[m.to] = { action: keys[pos], image: m.image };
}

for (const [pos, image] of Object.entries(RESTYLE)) console.log(`${DRY ? "would restyle" : "restyle"} ${pos} ${keys[pos].Name} -> ${image}`);
for (const [to, m] of Object.entries(moved)) console.log(`${DRY ? "would move" : "move"} ${m.action.Name} (${m.action.States?.[0]?.Title?.replace(/\n/g, " ") ?? ""}) -> CP Test Bed ${to}`);
if (DRY) return console.log("dry run, nothing written");

const backup = path.join(__dirname, "generate/backup", `${new Date().toISOString().replace(/[:.]/g, "-")}_before_restyle`);
fs.cpSync(PROFILE, backup, { recursive: true });
console.log(`backup: ${backup}`);

for (const [pos, image] of Object.entries(RESTYLE)) {
	const rel = `Images/GEN_${image}.png`;
	fs.copyFileSync(path.join(IMAGES, `${image}.png`), path.join(PAGE, rel));
	// The picture carries the text; a stored title would be drawn on top of it.
	keys[pos].States = keys[pos].States.map((s) => ({ ...s, Image: rel, ShowTitle: false, Title: "" }));
}
if (Object.keys(moved).length) {
	// Keep the moved keys (settings, keystrokes) for testbed.cjs, merged with any moved earlier.
	const prior = fs.existsSync(MOVED) ? JSON.parse(fs.readFileSync(MOVED, "utf8")) : {};
	fs.writeFileSync(MOVED, JSON.stringify({ ...prior, ...moved }, null, 1));
	for (const pos of Object.keys(MOVE)) delete keys[pos];
}
fs.writeFileSync(file, JSON.stringify(page));
console.log("done");
