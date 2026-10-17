// Put test buttons for com.acms.chaseplane on the ChasePlaneTest profile (current page).
// Usage: node tools/test_profile.cjs [--dry-run]
// Refuses to run while Stream Deck is open; backs up the page first.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const DRY = process.argv.includes("--dry-run");
const GLOW = "D:/Bundled Images/StreamDeck Icons/Working Icons/Glow";
const PAGE = path.join(process.env.APPDATA, "Elgato/StreamDeck/ProfilesV3/227856A2-5D79-4BA9-A9DA-769A3F195C15.sdProfile/Profiles/A0D29719-64E3-4B2E-8A44-C77CB9CD9CAE");
const BACKUP = path.join(__dirname, "backup_test_profile");
const PLUGIN = { Name: "ChasePlane Cameras", UUID: "com.acms.chaseplane", Version: "0.1.0.0" };

// position -> [action, camera guid or null, glow icon or null (plugin default image)]
const BUTTONS = {
	"0,0": ["camera", "f402649d-0000-0000-a0ca-4aaa284e6c7e", "Pilot_1"], // Pilot
	"1,0": ["camera", "e7a77649-0000-0000-9303-40314acf66c4", "GoPro_Cam"], // Co-pilot GoPro
	"2,0": ["camera", "f1143ff3-0000-0000-aa96-45fda4a02d64", "EFB"], // EFB (L)
	"3,0": ["camera", "8e77eb2a-0000-0000-856b-4a68b232883b", "MCP_Inverse"], // MCP EFIS
	"4,0": ["camera", "6e176c1a-0000-0000-8d01-472dd09fdc4f", "Orbit2"], // Spot View
	"5,0": ["camera", "908083c4-0000-0000-9a67-4669178ef293", "Nose2"], // Nose View
	"6,0": ["camera", "cf672953-0000-0000-87ac-44ca0de269e0", "Tower2"], // Tower
	"7,0": ["camera", "f8a0f262-0000-0000-9dae-47512802b842", "Traffic_Red"], // Traffic
	"0,1": ["flashlight", null, "Flashlight_Beam"],
	"1,1": ["cinematic", null, "Cinematic_Camera"],
	"2,1": ["camera", null, null], // unset: tests the dropdown and the plugin's default images
};
const NAMES = { camera: "Camera", flashlight: "Flashlight", cinematic: "Cinematic" };

if (!DRY && execSync("tasklist").toString().toLowerCase().includes("streamdeck.exe")) {
	console.error("Stream Deck is running. Quit it first.");
	process.exit(1);
}

const file = path.join(PAGE, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const keypad = manifest.Controllers.find((c) => c.Type === "Keypad");
if (keypad.Actions && Object.keys(keypad.Actions).length) throw new Error("Test page is not empty; refusing to overwrite.");
keypad.Actions = {};

if (!DRY) fs.cpSync(PAGE, BACKUP, { recursive: true });

for (const [pos, [kind, guid, icon]] of Object.entries(BUTTONS)) {
	const states = [{}, {}];
	if (icon) {
		const safe = icon.replace(/[^A-Za-z0-9_]/g, "_");
		["off", "on"].forEach((state, i) => {
			const rel = `Images/GLOW_${safe}_${state.toUpperCase()}.png`;
			if (!DRY) fs.copyFileSync(path.join(GLOW, `SD_${icon}-${state}.png`), path.join(PAGE, rel));
			states[i].Image = rel;
		});
	}
	keypad.Actions[pos] = {
		ActionID: crypto.randomUUID(),
		LinkedTitle: true,
		Name: NAMES[kind],
		Plugin: PLUGIN,
		Resources: null,
		Settings: guid ? { guid } : {},
		State: 0,
		States: states,
		UUID: `com.acms.chaseplane.${kind}`,
	};
	console.log(`${DRY ? "would add" : "added"}  ${pos.padEnd(4)} ${kind.padEnd(10)} ${icon ?? "(plugin default)"}`);
}

if (!DRY) fs.writeFileSync(file, JSON.stringify(manifest));
console.log(DRY ? "dry run, nothing written" : `done; backup in ${BACKUP}`);
