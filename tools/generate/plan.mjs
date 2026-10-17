// Generator step 1: read ChasePlane's live views (read only) and place them per layout.json.
// Usage: node tools/generate/plan.mjs   -> tools/generate/out/plan.json plus a placement report
// Mirrors ChasePlane as it reports itself (names, tags, themes, colors); never writes to it.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import WebSocket from "ws";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const layout = JSON.parse(fs.readFileSync(path.join(HERE, "layout.json"), "utf8"));

/** ChasePlane Remote's theme table (hue, saturation); lightness 55% for glow, 72% for text and glyph. */
const THEMES = {
	ONBOARD_PIC: [190, 79], ONBOARD_SYSTEMS: [155, 23], ONBOARD_MOUNTED: [94, 100], ONBOARD_CABIN: [250, 76], ONBOARD_MISC: [15, 21],
	OUTSIDE_AIRFRAME: [94, 100], OUTSIDE_CABIN: [250, 76], OUTSIDE_CHASE: [8, 98], OUTSIDE_ORBIT: [195, 86], OUTSIDE_MISC: [15, 21],
	WORLD_DEFAULT: [259, 84], WORLD_TOWER: [108, 40], WORLD_SPOTTING: [38, 86], WORLD_RUNWAY: [62, 73], WORLD_PARKING: [312, 88], WORLD_TRAFFIC: [195, 86], WORLD_MISC: [15, 21],
};
const FALLBACK = [270, 20];

function hsl(h, s, l) {
	s /= 100;
	l /= 100;
	const k = (n) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const themeColors = (theme) => {
	const [h, s] = THEMES[theme] ?? FALLBACK;
	return { glow: hsl(h, s, 55), text: hsl(h, s, 72) };
};

/** LEFT/RIGHT/FWD/MID/AFT as ChasePlane serves them, shortened for a key title. */
const tags = (v) =>
	[["left", "L"], ["right", "R"], ["fwd", "FWD"], ["mid", "MID"], ["aft", "AFT"]]
		.filter(([k]) => v[`has_${k}_suffix`])
		.map(([, t]) => t)
		.join(" ");

/** Same split as the plugin's live title (src/actions/camera.ts): two balanced lines past ~12 chars, 10 if all caps. */
function titleLines(name) {
	const max = name === name.toUpperCase() ? 10 : 12;
	const words = name.split(/\s+/).filter(Boolean);
	if (words.length < 2 || name.length <= max) return [name];
	let best = [name];
	let bestDiff = Infinity;
	for (let i = 1; i < words.length; i++) {
		const a = words.slice(0, i).join(" ");
		const b = words.slice(i).join(" ");
		if (Math.abs(a.length - b.length) < bestDiff) [best, bestDiff] = [[a, b], Math.abs(a.length - b.length)];
	}
	return best;
}

async function liveViews() {
	const ws = new WebSocket("ws://localhost:8652");
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("ChasePlane did not answer get_views")), 8000);
		ws.on("error", reject);
		ws.on("message", (raw) => {
			const m = JSON.parse(raw);
			if (m.message !== "api_reply" || m.request_id !== "plan") return;
			let p = m.payload;
			while (p && p.payload && p.message) p = p.payload;
			clearTimeout(timer);
			ws.close();
			resolve(p);
		});
		ws.on("open", () => {
			ws.send(JSON.stringify({ message: "api_connect", payload: { client_name: "acms-generator" } }));
			setTimeout(() => ws.send(JSON.stringify({ message: "api_request", request_id: "plan", command: "get_views", payload: {} })), 800);
		});
	});
}

const { metadata, views } = await liveViews();
const plan = { aircraft: metadata.aircraft_readable, profile: layout.profile, parentPage: layout.parentPage, folders: [] };

for (const folder of layout.folders) {
	const pool = views
		.filter((v) => (folder.themes.includes(v.profile_theme) && !(folder.exclude ?? []).includes(v.name)) || (folder.include ?? []).includes(v.name))
		.map((v) => ({ ...v, tags: tags(v) }));
	const used = new Set();
	const keys = {};
	const key = (pos, v, icon) => {
		const colors = themeColors(v.profile_theme);
		if (keys[pos]) console.log(`  clash: ${folder.name} ${pos} already holds "${keys[pos].name}"; "${v.name}" overwrites it`);
		// No glyph: the plugin draws the key (name and tags in the theme color).
		keys[pos] = { kind: "camera", guid: v.guid, name: v.name, mode: v.mode, theme: v.profile_theme, title: [...titleLines(v.name), ...(v.tags ? [v.tags] : [])].join("\n"), icon, draw: !icon, ...colors };
		used.add(v.guid);
	};

	const iconFor = (v) => layout.icons?.[`${v.name}|${v.tags}`] ?? layout.icons?.[v.name] ?? null;

	for (const p of folder.place ?? []) {
		const v = pool.find((x) => !used.has(x.guid) && x.name === p.name && (p.tags === undefined || x.tags === p.tags));
		if (v) key(p.pos, v, p.icon ?? iconFor(v));
		else console.log(`  stale: ${folder.name} "${p.name}${p.tags ? " " + p.tags : ""}" not in ChasePlane`);
	}

	if (folder.seatMap) {
		const sm = folder.seatMap;
		const re = new RegExp(sm.pattern);
		const seats = pool.filter((v) => !used.has(v.guid) && re.test(v.name) && sm.letterRow[re.exec(v.name)[2]] !== undefined);
		const rowsFrontToBack = [...new Set(seats.map((v) => Number(re.exec(v.name)[1])))].sort((a, b) => a - b);
		for (const v of seats) {
			const [, row, letter] = re.exec(v.name);
			const col = sm.firstColumn + rowsFrontToBack.indexOf(Number(row));
			key(`${col},${sm.letterRow[letter]}`, v, sm.exitRows?.[row] ?? sm.icon);
		}
	}

	// Flashlight and cinematic keep their own glyph colors (white beam), so they are not tinted.
	for (const e of folder.extras ?? []) keys[e.pos] = { kind: e.action, icon: e.icon, glow: "#FFFFFF", text: "#FFFFFF", title: "" };

	if (folder.fill === "sequential") {
		// A2 left to right, row by row, skipping A1 (back) and the extras; ChasePlane's order:
		// theme by theme as the folder lists them (included views last), then ChasePlane's index.
		const rank = (v) => (folder.themes.includes(v.profile_theme) ? folder.themes.indexOf(v.profile_theme) : folder.themes.length);
		const ordered = pool.filter((v) => !used.has(v.guid)).sort((a, b) => rank(a) - rank(b) || a.index - b.index);
		const slots = [];
		for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++) if (!(row === 0 && col === 0) && !keys[`${col},${row}`]) slots.push(`${col},${row}`);
		for (const v of ordered) {
			const pos = slots.shift();
			if (pos) key(pos, v, iconFor(v));
			else console.log(`  no room: ${folder.name} "${v.name} ${v.tags}"`);
		}
	}

	const free = (folder.fillFree ?? []).filter((pos) => !keys[pos]);
	const unplaced = pool.filter((v) => !used.has(v.guid));
	for (const v of unplaced) {
		const pos = free.shift();
		if (pos) key(pos, v, null);
		else console.log(`  no room: ${folder.name} "${v.name} ${v.tags}"`);
	}

	const colors = themeColors(folder.colorTheme);
	plan.folders.push({ name: folder.name, parentKey: folder.parentKey, folderIcon: folder.folderIcon, ...colors, keys });
	const cams = Object.values(keys).filter((k) => k.kind === "camera");
	console.log(`${folder.name}: ${pool.length} views; placed ${cams.length} (${cams.filter((k) => k.draw).length} drawn); filled into free slots ${unplaced.length}`);
}

const placed = new Set(plan.folders.flatMap((f) => Object.values(f.keys).map((k) => k.guid)));
const left = views.filter((v) => !placed.has(v.guid));
console.log(left.length ? `NOT ON ANY PAGE: ${left.map((v) => `${v.name} ${tags(v)} [${v.profile_theme}]`).join(", ")}` : `all ${views.length} views placed`);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "plan.json"), JSON.stringify(plan, null, 1));
console.log(`aircraft: ${plan.aircraft}; wrote ${path.join(OUT, "plan.json")}`);
