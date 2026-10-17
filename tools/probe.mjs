// Live checks against ChasePlane's WebSocket API (see PLAN.md, "Unverified").
// Usage: node tools/probe.mjs idle [seconds]   hold a silent connection, report if/when it drops
//        node tools/probe.mjs switch           switch to another camera and back, log cam_mode_set
//        node tools/probe.mjs toggles          toggle flashlight and cinematic on, then off again
import WebSocket from "ws";

const URL = "ws://localhost:8652";
const [mode = "switch", arg] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const ws = new WebSocket(URL);
const pending = new Map();
const seen = [];
let camera = null;
let sim = null;

ws.on("message", (raw) => {
	const msg = JSON.parse(raw.toString());
	seen.push(msg.message);
	if (msg.message === "api_reply") pending.get(msg.request_id)?.(msg);
	if (msg.message === "cam_mode_set") {
		camera = msg.payload;
		if (mode !== "idle") console.log(stamp(), "cam_mode_set", JSON.stringify({ guid: camera.preset_guid, mode: camera.mode, cinematic: camera.cinematic_enabled }));
	}
	if (msg.message === "sim_state") sim = msg.payload;
});
ws.on("close", (code, reason) => {
	console.log(stamp(), "CLOSED", code, reason.toString());
	process.exit(0);
});
ws.on("error", (e) => console.log(stamp(), "ERROR", e.message));

function request(command, payload = {}) {
	const id = `${command}_${Date.now()}`;
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${command} timed out`)), 5000);
		pending.set(id, (m) => (clearTimeout(timer), resolve(m)));
		ws.send(JSON.stringify({ message: "api_request", request_id: id, command, payload }));
	});
}

await new Promise((r) => ws.once("open", r));
ws.send(JSON.stringify({ message: "api_connect", payload: { client_name: "acms-probe" } }));
await sleep(1500);

if (mode === "idle") {
	const secs = Number(arg ?? 300);
	console.log(stamp(), `holding silent connection for ${secs}s`);
	for (let s = 60; s <= secs; s += 60) {
		await sleep(60000);
		console.log(stamp(), "still open; messages so far:", seen.length, "pings:", seen.filter((m) => m === "ping").length);
	}
	console.log(stamp(), "OPEN after", secs, "s without sending anything");
	ws.close();
}

if (mode === "switch") {
	const start = camera.preset_guid;
	let views = (await request("get_views")).payload;
	while (views && views.payload && views.message) views = views.payload;
	const list = views.views;
	const other = list.find((v) => v.guid !== start && v.mode === camera.mode) ?? list.find((v) => v.guid !== start);
	console.log(stamp(), "start", start, "-> switching to", other.name, other.guid);
	const r1 = await request("set_view_by_guid", { guid: other.guid });
	console.log(stamp(), "reply", r1.status, JSON.stringify(r1.payload));
	await sleep(2000);
	console.log(stamp(), "active now", camera.preset_guid, camera.preset_guid === other.guid ? "(matches target)" : "(NOT target)");
	const r2 = await request("set_view_by_guid", { guid: start });
	console.log(stamp(), "switched back, reply", r2.status);
	await sleep(2000);
	console.log(stamp(), "active now", camera.preset_guid, camera.preset_guid === start ? "(back to start)" : "(NOT start)");
	ws.close();
}

if (mode === "toggles") {
	for (const [command, read] of [
		["cam_flashlight_toggle", () => sim?.flashlight_enabled],
		["cam_cinematic_toggle", () => camera?.cinematic_enabled],
	]) {
		console.log(stamp(), command, "before:", read(), "flashlight_available:", sim?.flashlight_available);
		const a = await request(command);
		await sleep(2000);
		console.log(stamp(), command, "reply", a.status, JSON.stringify(a.payload), "after 1st:", read());
		const b = await request(command);
		await sleep(2000);
		console.log(stamp(), command, "reply", b.status, "after 2nd:", read());
	}
	ws.close();
}
