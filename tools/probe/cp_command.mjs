// P1 check: send one ChasePlane command and print the reply and the pushes that follow for 3 s.
// Usage: node tools/probe/cp_command.mjs <command> ['<json payload>']
import WebSocket from "ws";

const [command, payloadText] = process.argv.slice(2);
const payload = payloadText ? JSON.parse(payloadText) : {};
const ws = new WebSocket("ws://localhost:8652");
const quiet = new Set(["ai_traffic", "sim_state", "CP_PING::"]);

ws.on("open", () => {
	ws.send(JSON.stringify({ message: "api_connect", payload: { client_name: "ACMS Camera Deck probe" } }));
	setTimeout(() => ws.send(JSON.stringify({ message: "api_request", request_id: "probe", command, payload })), 500);
	setTimeout(() => process.exit(0), 3500);
});
ws.on("message", (raw) => {
	let msg;
	try {
		msg = JSON.parse(raw.toString());
	} catch {
		return;
	}
	if (msg.request_id === "probe") return console.log("REPLY", msg.status, msg.error ?? "", JSON.stringify(msg.payload ?? {}).slice(0, process.env.FULL ? undefined : 300));
	if (quiet.has(msg.message)) return;
	console.log("PUSH ", msg.message, JSON.stringify(msg.payload ?? {}).slice(0, process.env.FULL ? undefined : 300));
});
ws.on("error", (e) => {
	console.log("ERROR", e.message);
	process.exit(1);
});
