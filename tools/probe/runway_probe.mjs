import WebSocket from "ws";
const ws = new WebSocket("ws://localhost:8652");
let id = 0, pos = null, runways = [];
const req = (command, payload = {}) => new Promise((res) => { const rid = "r" + ++id; pending[rid] = res; ws.send(JSON.stringify({ message: "api_request", request_id: rid, command, payload })); });
const pending = {};
const D = ["", "L", "R", "C", "W", "A", "B"];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
ws.on("message", (raw) => { let m; try { m = JSON.parse(raw); } catch { return; }
  if (m.request_id && pending[m.request_id]) { pending[m.request_id](m); delete pending[m.request_id]; return; }
  if (m.message === "camera_runtime_state") pos = m.payload.camera_position;
  if (m.message === "airport_changed" && m.payload.data?.runways) runways = m.payload.data.runways; });
ws.on("open", async () => {
  ws.send(JSON.stringify({ message: "api_connect", payload: { client_name: "probe" } }));
  await wait(1500);
  runways.forEach((r, i) => console.log(i, `${r.primary_number}${D[r.primary_designator]}/${r.secondary_number}${D[r.secondary_designator]}`));
  const show = (label) => console.log(label.padEnd(34), pos ? `lon ${pos.x.toFixed(4)} lat ${pos.z.toFixed(4)} hdg ${pos.yaw.toFixed(0)}` : "?");
  let r = await req("cam_go_to_nearest", { kind: "runway" }); await wait(1500); show("nearest runway " + r.status);
  r = await req("cam_go_to_airport_index", { kind: "runway", index: 0, end: 0 }); await wait(1500); show("airport_index rwy0 end0 " + r.status);
  r = await req("cam_go_to_nearest", { kind: "runway" }); await wait(1500); show("nearest runway again " + r.status);
  r = await req("cam_go_to_airport_index", { kind: "runway", index: 0, end: 1 }); await wait(1500); show("airport_index rwy0 end1 " + r.status);
  process.exit(0);
});
