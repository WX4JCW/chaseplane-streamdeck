// P3 check: does node-simconnect reach MSFS on this PC, beside Datalink Pro's own connection?
// Reads the flight phase values once and prints them. Usage: node tools/probe/simconnect_probe.mjs
import { open, Protocol, SimConnectDataType, SimConnectPeriod } from "node-simconnect";

const VARS = [
	["SIM ON GROUND", "bool"],
	["GROUND VELOCITY", "knots"],
	["PLANE ALT ABOVE GROUND", "feet"],
	["VERTICAL SPEED", "feet per minute"],
	["BRAKE PARKING POSITION", "bool"],
	["GENERAL ENG COMBUSTION:1", "bool"],
	["GENERAL ENG COMBUSTION:2", "bool"],
	["PLANE LATITUDE", "degrees"],
	["PLANE LONGITUDE", "degrees"],
];

const { recvOpen, handle } = await open("ACMS Camera Deck probe", Protocol.KittyHawk);
console.log("connected to", recvOpen.applicationName, recvOpen.applicationVersionMajor);
VARS.forEach(([name, unit]) => handle.addToDataDefinition(0, name, unit, SimConnectDataType.FLOAT64));
handle.requestDataOnSimObject(0, 0, 0, SimConnectPeriod.ONCE);
handle.on("simObjectData", (data) => {
	for (const [name] of VARS) console.log(name.padEnd(26), data.data.readFloat64());
	handle.close();
	process.exit(0);
});
handle.on("exception", (e) => console.log("exception", e));
setTimeout(() => {
	console.log("no data within 10 s");
	process.exit(1);
}, 10000);
