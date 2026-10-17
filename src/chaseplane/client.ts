import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";
import WebSocket from "ws";

/** A saved ChasePlane camera view, as returned by `get_views`. */
export type View = {
	guid: string;
	name: string;
	mode: number;
	has_left_suffix?: boolean;
	has_right_suffix?: boolean;
	has_fwd_suffix?: boolean;
	has_mid_suffix?: boolean;
	has_aft_suffix?: boolean;
};

/** Payload of the `cam_mode_set` push. */
type CameraState = {
	mode: number;
	preset_guid: string | null;
	cinematic_enabled: boolean;
};

type Message = { message: string; request_id?: string; status?: number; error?: string; payload?: any };

const RECONNECT_MS = 3000;
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Connection to ChasePlane's local WebSocket API (port 8652), shared by every action.
 *
 * Events: "connection" (ready changed), "camera" (active camera or cinematic changed),
 * "flashlight" (flashlight changed), "views" (view list reloaded).
 */
export class ChasePlaneClient extends EventEmitter {
	private ws: WebSocket | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private readonly pending = new Map<string, { resolve: (payload: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

	ready = false;
	views: View[] = [];
	camera: CameraState | null = null;
	flashlight = false;

	constructor(private readonly url: string) {
		super();
	}

	get activeGuid(): string | null {
		return this.ready ? (this.camera?.preset_guid ?? null) : null;
	}

	start(): void {
		if (this.ws) return;
		const ws = new WebSocket(this.url);
		this.ws = ws;
		ws.on("open", () => ws.send(JSON.stringify({ message: "api_connect", payload: { client_name: "ACMS ChasePlane Cameras" } })));
		ws.on("message", (raw) => this.onMessage(JSON.parse(raw.toString()) as Message));
		ws.on("error", (error) => streamDeck.logger.debug(`ChasePlane socket error: ${error.message}`));
		ws.on("close", () => this.onClose());
	}

	setView(guid: string): Promise<void> {
		return this.request("set_view_by_guid", { guid });
	}

	toggleFlashlight(): Promise<void> {
		return this.request("cam_flashlight_toggle");
	}

	toggleCinematic(): Promise<void> {
		return this.request("cam_cinematic_toggle");
	}

	async refreshViews(): Promise<void> {
		const reply = await this.request<{ views: View[] }>("get_views");
		this.views = reply.views ?? [];
		this.emit("views");
	}

	request<T = any>(command: string, payload: object = {}): Promise<T> {
		const ws = this.ws;
		if (!this.ready || !ws) return Promise.reject(new Error("ChasePlane is not connected"));
		const id = `${command}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${command} timed out`));
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(id, { resolve, reject, timer });
			ws.send(JSON.stringify({ message: "api_request", request_id: id, command, payload }));
		});
	}

	private onMessage(msg: Message): void {
		switch (msg.message) {
			case "initialized":
				this.ready = true;
				this.emit("connection");
				this.refreshViews().catch((error) => streamDeck.logger.warn(`get_views failed: ${error.message}`));
				break;
			case "api_reply":
				this.onReply(msg);
				break;
			case "cam_mode_set":
				this.camera = msg.payload as CameraState;
				this.emit("camera");
				break;
			case "sim_state": {
				const on = msg.payload?.flashlight_enabled === true;
				if (on !== this.flashlight) {
					this.flashlight = on;
					this.emit("flashlight");
				}
				break;
			}
			case "view_created":
			case "view_modified":
			case "view_deleted":
				this.refreshViews().catch((error) => streamDeck.logger.warn(`get_views failed: ${error.message}`));
				break;
		}
	}

	private onReply(msg: Message): void {
		const entry = msg.request_id ? this.pending.get(msg.request_id) : undefined;
		if (!entry) return;
		this.pending.delete(msg.request_id!);
		clearTimeout(entry.timer);
		if (msg.status !== 200) {
			entry.reject(new Error(`${msg.error ?? "request failed"} (${msg.status})`));
			return;
		}
		// Replies can arrive wrapped in one or more {message, payload} envelopes (get_views does).
		let payload = msg.payload;
		for (let i = 0; i < 4 && payload && typeof payload === "object" && "payload" in payload && "message" in payload; i++) {
			payload = payload.payload;
		}
		entry.resolve(payload);
	}

	private onClose(): void {
		this.ws = null;
		const wasReady = this.ready;
		this.ready = false;
		for (const { reject, timer } of this.pending.values()) {
			clearTimeout(timer);
			reject(new Error("ChasePlane connection closed"));
		}
		this.pending.clear();
		if (wasReady) this.emit("connection");
		this.reconnectTimer ??= setTimeout(() => {
			this.reconnectTimer = null;
			this.start();
		}, RECONNECT_MS);
	}
}

const MODE_PREFIX: Record<number, string> = { 0: "INT", 1: "EXT", 2: "WORLD" };

/** Dropdown label: mode, name, and the LEFT/RIGHT/FWD/MID/AFT tags ChasePlane Remote shows. */
export function viewLabel(view: View): string {
	const suffix = [
		view.has_left_suffix && "LEFT",
		view.has_right_suffix && "RIGHT",
		view.has_fwd_suffix && "FWD",
		view.has_mid_suffix && "MID",
		view.has_aft_suffix && "AFT",
	].filter(Boolean);
	const name = suffix.length ? `${view.name} (${suffix.join(" ")})` : view.name;
	return `${MODE_PREFIX[view.mode] ?? view.mode} · ${name}`;
}

export const chasePlane = new ChasePlaneClient("ws://localhost:8652");
