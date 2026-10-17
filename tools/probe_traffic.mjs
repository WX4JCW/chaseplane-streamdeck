// Live check: what each traffic camera command does (see PLAN.md, traffic page).
// Usage: node tools/probe_traffic.mjs
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:8652");
const pending = new Map();
let camera = null;
let runtime = null;
let traffic = null;
const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

ws.on("message", (raw) => {
	const m = JSON.parse(raw);
	if (m.message === "api_reply") pending.get(m.request_id)?.(m);
	if (m.message === "cam_mode_set") camera = m.payload;
	if (m.message === "camera_runtime_state") runtime = m.payload;
	if (m.message === "ai_traffic" && m.payload.snapshot) traffic = m.payload;
});
const req = (command, payload = {}) =>
	new Promise((res) => {
		const id = command + Date.now();
		pending.set(id, res);
		ws.send(JSON.stringify({ message: "api_request", request_id: id, command, payload }));
	});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () =>
	JSON.stringify({ mode: camera?.mode, guid: camera?.preset_guid?.slice(0, 8), preview: camera?.preview_name, look_at: camera?.look_at, tracking: runtime?.ai_traffic_tracking_id });

await new Promise((r) => ws.once("open", r));
ws.send(JSON.stringify({ message: "api_connect", payload: { client_name: "acms-probe" } }));
await sleep(1500);
await req("request_ai_traffic");
await sleep(2000);

const start = camera.preset_guid;
const list = traffic.added;
console.log(ts(), "traffic order:", traffic.order.join(","));
for (const a of list) console.log("   ", a.uId, a.callsign, a.atc_type, a.atc_model, JSON.stringify(Object.keys(a).filter((k) => /id|distance|phase|kind/i.test(k))));
const pick = list.find((a) => a.atc_type !== "ApronLife") ?? list[0];
console.log(ts(), "start", state(), "| test aircraft", pick.uId, pick.callsign);

for (const [command, payload] of [
	["cam_go_to_traffic", { simobject_id: pick.uId }],
	["ai_traffic_view", { id: pick.uId }],
	["ai_traffic_track", { id: pick.uId }],
]) {
	const r = await req(command, payload);
	await sleep(4000);
	console.log(ts(), command, r.status, JSON.stringify(r.payload).slice(0, 160), "->", state());
	await req("user_aircraft_track");
	await req("set_view_by_guid", { guid: start });
	await sleep(1500);
}
console.log(ts(), "restored", state(), camera.preset_guid === start ? "(start view)" : "(NOT start view)");
ws.close();
setTimeout(() => process.exit(0), 200);
