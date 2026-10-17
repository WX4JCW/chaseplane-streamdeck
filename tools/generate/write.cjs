// Generator step 3: write the planned folders into the Stream Deck profile.
// Usage: node tools/generate/write.cjs [--dry-run]
// Refuses while Stream Deck runs; backs up the whole profile first. Each folder gets its own
// page (ID kept in state.json so a rerun replaces it) and a folder key on the parent page.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const DRY = process.argv.includes("--dry-run");
const HERE = __dirname;
const OUT = path.join(HERE, "out");
const STATE_FILE = path.join(HERE, "state.json");
const plan = JSON.parse(fs.readFileSync(path.join(OUT, "plan.json"), "utf8"));
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { folders: {} };

const PROFILE = path.join(process.env.APPDATA, "Elgato/StreamDeck/ProfilesV3", `${plan.profile}.sdProfile`);
const PAGES = path.join(PROFILE, "Profiles");
const PLUGIN = { Name: "ChasePlane Cameras", UUID: "com.acms.chaseplane", Version: "0.1.0.0" };

if (!DRY && execSync("tasklist").toString().toLowerCase().includes("streamdeck.exe")) {
	console.error("Stream Deck is running. Quit it first.");
	process.exit(1);
}

const titled = (image, title, color, show = !!title) => ({
	FontFamily: "Arial",
	FontSize: 9,
	FontStyle: "Bold",
	FontUnderline: false,
	Image: image,
	OutlineThickness: 2,
	ShowTitle: show,
	Title: title,
	TitleAlignment: "bottom",
	TitleColor: color,
});
const block = (name, uuid, plugin, settings, states) => ({
	ActionID: crypto.randomUUID(),
	LinkedTitle: true,
	Name: name,
	Plugin: plugin,
	Resources: null,
	Settings: settings,
	State: 0,
	States: states,
	UUID: uuid,
});
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// Pinned keys: copied as-is (settings, titles, images) from the owner's source page; read only.
const pinned = [];
if (plan.pinned) {
	const srcDir = path.join(process.env.APPDATA, "Elgato/StreamDeck/ProfilesV3", `${plan.pinned.profile}.sdProfile`, "Profiles", plan.pinned.page);
	const srcKeys = readJson(path.join(srcDir, "manifest.json")).Controllers.find((c) => c.Type === "Keypad").Actions ?? {};
	for (const pos of plan.pinned.keys) if (srcKeys[pos]) pinned.push({ pos, action: srcKeys[pos], srcDir });
}
/** Puts a fresh copy of each pinned key at its position in `keys`, copying its images into `dir`. */
function placePinned(keys, dir, onlyIfFree) {
	for (const p of pinned) {
		const existing = keys[p.pos];
		if (onlyIfFree && existing && existing.UUID !== p.action.UUID) {
			console.log(`  pinned ${p.pos} skipped: taken by ${existing.UUID}`);
			continue;
		}
		const copy = JSON.parse(JSON.stringify(p.action));
		copy.ActionID = crypto.randomUUID();
		if (!DRY)
			for (const s of copy.States ?? []) {
				const from = path.join(p.srcDir, s.Image ?? "");
				const to = path.join(dir, s.Image ?? "");
				if (s.Image && path.resolve(from) !== path.resolve(to)) fs.copyFileSync(from, to); // source may be this very page
			}
		keys[p.pos] = copy;
	}
}

if (!DRY) {
	const backup = path.join(HERE, "backup", new Date().toISOString().replace(/[:.]/g, "-"));
	fs.cpSync(PROFILE, backup, { recursive: true });
	console.log(`backup: ${backup}`);
}

const parentFile = path.join(PAGES, plan.parentPage, "manifest.json");
const parent = readJson(parentFile);
const parentKeys = (parent.Controllers.find((c) => c.Type === "Keypad").Actions ??= {});

for (const folder of plan.folders) {
	const pageId = (state.folders[folder.name] ?? crypto.randomUUID()).toUpperCase();
	const pageDir = path.join(PAGES, pageId);
	const src = path.join(OUT, "img", folder.name);

	// Folder key on the parent page: if the owner moved this folder's key, keep it where it is;
	// otherwise use the layout spot, which must be empty.
	const moved = Object.entries(parentKeys).find(([, a]) => a.Settings?.ProfileUUID?.toUpperCase() === pageId)?.[0];
	const folderPos = moved ?? folder.parentKey;
	if (!moved && parentKeys[folderPos]) throw new Error(`${folderPos} on the parent page is taken by ${parentKeys[folderPos].UUID}`);

	const keys = {
		"0,0": block("Parent Folder", "com.elgato.streamdeck.profile.backtoparent", { Name: "Open Parent Folder", UUID: "com.elgato.streamdeck.profile.backtoparent", Version: "1.0" }, {}, [{}]),
	};
	for (const [pos, k] of Object.entries(folder.keys)) {
		const images = (k.images ?? []).map((f) => `Images/${f}`);
		if (k.kind === "camera" && k.draw) {
			// The plugin draws this key, so it carries no image or title of its own.
			keys[pos] = block("Camera", `${PLUGIN.UUID}.camera`, PLUGIN, { guid: k.guid, name: k.name, mode: k.mode, draw: true }, [{}, {}]);
		} else if (k.kind === "camera") {
			// Title text left empty: a Title stored on the key counts as the user's own and Stream Deck shows it
			// instead of the plugin's setTitle. The plugin supplies the (wrapped, live) text; the key keeps color and font.
			keys[pos] = block("Camera", `${PLUGIN.UUID}.camera`, PLUGIN, { guid: k.guid, name: k.name, mode: k.mode, liveTitle: true }, [titled(images[0], "", k.text, true), titled(images[1], "", k.text, true)]);
		} else {
			// Flashlight, cinematic, traffic slot: two states; my-aircraft and traffic-page: one (as in the plugin manifest).
			const states = ["my-aircraft", "traffic-page"].includes(k.kind) ? [{}] : [{ Image: images[0] }, { Image: images[1] }];
			const name = { "traffic-slot": "Traffic Slot", "traffic-page": "Traffic Page", "my-aircraft": "My Aircraft" }[k.kind] ?? k.kind[0].toUpperCase() + k.kind.slice(1);
			keys[pos] = block(name, `${PLUGIN.UUID}.${k.kind}`, PLUGIN, k.settings ?? {}, states);
		}
	}
	console.log(`${DRY ? "would write" : "write"} ${folder.name}: page ${pageId} (${state.folders[folder.name] ? "replace" : "new"}), ${Object.keys(keys).length} keys, folder key at ${folderPos}${moved ? " (kept where the owner put it)" : ""}`);
	if (DRY) continue;

	fs.rmSync(pageDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(pageDir, "Images"), { recursive: true });
	for (const f of fs.readdirSync(src)) if (f !== "folder.png") fs.copyFileSync(path.join(src, f), path.join(pageDir, "Images", f));
	placePinned(keys, pageDir, false);
	fs.writeFileSync(
		path.join(pageDir, "manifest.json"),
		JSON.stringify({ Controllers: [{ Actions: keys, Type: "Keypad" }, { Actions: null, Type: "Encoder" }], Icon: "", Name: "" }),
	);

	const folderImage = `Images/GEN_${folder.name.replace(/[^A-Za-z0-9]/g, "_")}_folder.png`;
	fs.copyFileSync(path.join(src, "folder.png"), path.join(PAGES, plan.parentPage, folderImage));
	parentKeys[folderPos] = block(
		"Create Folder",
		"com.elgato.streamdeck.profile.openchild",
		{ Name: "Create Folder", UUID: "com.elgato.streamdeck.profile.openchild", Version: "1.0" },
		{ ProfileUUID: pageId.toLowerCase() },
		[titled(folderImage, folder.name, folder.text)],
	);
	state.folders[folder.name] = pageId;
}

// Folders not built here (live TRAFFIC page): restyle only their folder key; the page is not touched.
for (const k of plan.keyOnly ?? []) {
	const pos = Object.entries(parentKeys).find(([, a]) => a.Settings?.ProfileUUID?.toUpperCase() === k.page.toUpperCase())?.[0];
	if (!pos) {
		console.log(`skip ${k.name}: no folder key for page ${k.page} on the parent page`);
		continue;
	}
	const image = `Images/GEN_${k.name.replace(/[^A-Za-z0-9]/g, "_")}_folder.png`;
	console.log(`${DRY ? "would restyle" : "restyle"} ${k.name} folder key at ${pos} (page untouched)`);
	if (DRY) continue;
	fs.copyFileSync(path.join(OUT, "img", k.name, "folder.png"), path.join(PAGES, plan.parentPage, image));
	parentKeys[pos].States[0] = { ...parentKeys[pos].States[0], ...titled(image, k.name, k.text) };
}

if (plan.pinned?.onParent) {
	console.log(`${DRY ? "would pin" : "pin"} ${pinned.map((p) => p.pos).join(" ")} on the parent page where free`);
	placePinned(parentKeys, path.join(PAGES, plan.parentPage), true);
}

if (!DRY) {
	fs.writeFileSync(parentFile, JSON.stringify(parent));
	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
	console.log("done");
} else console.log("dry run, nothing written");
