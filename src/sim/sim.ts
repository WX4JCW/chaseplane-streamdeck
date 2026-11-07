import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";
import { open, Protocol, SimConnectDataType, SimConnectPeriod, type SimConnectConnection } from "node-simconnect";

import { type Phase, PhaseTracker, type Snapshot } from "./phase";

const RETRY_MS = 5000;
const POLL_MS = 500;
const DEF = 1;
const REQ = 1;

/** The values Smart Cam reads, in the order they come back. */
const VARS: [string, string][] = [
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

/**
 * Read-only SimConnect link to MSFS for the flight phase. Retries until the sim is up and again
 * after it closes; nothing is ever written to the sim.
 *
 * Events: "connection" (connected changed), "phase" (flight phase changed).
 */
export class SimLink extends EventEmitter {
	connected = false;
	private handle: SimConnectConnection | null = null;
	private poll: NodeJS.Timeout | null = null;
	private retry: NodeJS.Timeout | null = null;
	readonly tracker = new PhaseTracker((phase) => {
		streamDeck.logger.info(`flight phase: ${phase}`);
		this.emit("phase", phase);
	});

	get phase(): Phase | null {
		return this.tracker.phase;
	}

	start(): void {
		void this.connect();
	}

	private async connect(): Promise<void> {
		this.retry = null;
		try {
			const { handle } = await open("ACMS Camera Deck", Protocol.KittyHawk);
			this.handle = handle;
			VARS.forEach(([name, unit]) => handle.addToDataDefinition(DEF, name, unit, SimConnectDataType.FLOAT64));
			handle.on("simObjectData", (data) => {
				if (data.requestID !== REQ) return;
				const [onGround, groundSpeed, agl, verticalSpeed, brake, eng1, eng2, lat, lon] = VARS.map(() => data.data.readFloat64());
				const s: Snapshot = {
					onGround: onGround > 0.5,
					groundSpeed,
					agl,
					verticalSpeed,
					parkingBrake: brake > 0.5,
					engine1: eng1 > 0.5,
					engine2: eng2 > 0.5,
					lat,
					lon,
				};
				this.tracker.update(s);
			});
			handle.on("quit", () => this.lost("sim quit"));
			handle.on("close", () => this.lost("connection closed"));
			handle.on("error", (e) => this.lost(e.message));
			this.poll = setInterval(() => handle.requestDataOnSimObject(REQ, DEF, 0, SimConnectPeriod.ONCE), POLL_MS);
			this.setConnected(true);
		} catch {
			this.schedule();
		}
	}

	private lost(reason: string): void {
		if (!this.handle) return;
		streamDeck.logger.info(`SimConnect lost: ${reason}`);
		if (this.poll) clearInterval(this.poll);
		this.poll = null;
		try {
			this.handle.close();
		} catch {
			// already closed
		}
		this.handle = null;
		this.tracker.reset();
		this.setConnected(false);
		this.schedule();
	}

	private schedule(): void {
		if (!this.retry) this.retry = setTimeout(() => void this.connect(), RETRY_MS);
	}

	private setConnected(value: boolean): void {
		if (this.connected === value) return;
		this.connected = value;
		this.emit("connection", value);
	}
}

export const sim = new SimLink();
