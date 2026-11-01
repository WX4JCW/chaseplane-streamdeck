import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";
import WebSocket from "ws";

/** A saved ChasePlane camera view, as returned by `get_views`. */
export type View = {
	guid: string;
	name: string;
	mode: number;
	/** ChasePlane's own order. */
	index?: number;
	profile_theme?: string;
	/** GUID of the ChasePlane group the view belongs to (see groups.ts). */
	profile_preset?: string;
	/** Aircraft the view belongs to ("PMDG 737-800 SSW HUES SWA"); "%GLOBAL%" for views every aircraft shares. */
	aircraft_readable?: string;
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

/** One AI aircraft from the `ai_traffic` push. */
export type TrafficAircraft = {
	uId: number;
	callsign?: string;
	display_name?: string;
	atc_model?: string;
	atc_airline?: string;
	atc_flight_number?: string;
	atc_id?: string;
	phase?: string;
	distance?: number;
};

type Message = { message: string; request_id?: string; status?: number; error?: string; payload?: any };

const RECONNECT_MS = 3000;
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Connection to ChasePlane's local WebSocket API (port 8652), shared by every action.
 *
 * Events: "connection" (ready changed), "camera" (active camera or cinematic changed),
 * "flashlight" (flashlight changed), "views" (view list reloaded), "traffic" (AI list or tracked aircraft changed).
 */
export class ChasePlaneClient extends EventEmitter {
	private ws: WebSocket | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private readonly pending = new Map<string, { resolve: (payload: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

	ready = false;
	views: View[] = [];
	camera: CameraState | null = null;
	flashlight = false;
	/** AI traffic in ChasePlane's display order (its current Remote filters apply). */
	traffic: TrafficAircraft[] = [];
	/** Aircraft the camera is on, from `camera_runtime_state.ai_traffic_tracking_id`; 0 = none. */
	trackingId = 0;
	private readonly trafficById = new Map<number, TrafficAircraft>();
	private trafficOrder: number[] = [];

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
		ws.on("open", () => ws.send(JSON.stringify({ message: "api_connect", payload: { client_name: "ACMS Camera Deck for ChasePlane" } })));
		ws.on("message", (raw) => {
			// ChasePlane occasionally sends non-JSON text (seen: "CP_PING::"); skip anything that does not parse.
			let msg: Message;
			try {
				msg = JSON.parse(raw.toString()) as Message;
			} catch {
				return;
			}
			this.onMessage(msg);
		});
		ws.on("error", (error) => streamDeck.logger.debug(`ChasePlane socket error: ${error.message}`));
		ws.on("close", () => this.onClose());
	}

	/**
	 * Finds the current view for a saved button. World views (towers, traffic...) get new GUIDs,
	 * so a GUID that is no longer listed falls back to the same name and mode.
	 */
	resolveView(saved: { guid?: string; name?: string; mode?: number }): View | undefined {
		return (
			this.views.find((v) => v.guid === saved.guid) ??
			(saved.name === undefined ? undefined : this.views.find((v) => v.name === saved.name && (saved.mode === undefined || v.mode === saved.mode)))
		);
	}

	/** ChasePlane replies success even for an unknown GUID, so only listed views are sent. */
	setView(guid: string): Promise<void> {
		if (!this.views.some((v) => v.guid === guid)) return Promise.reject(new Error(`view ${guid} is not in get_views`));
		return this.request("set_view_by_guid", { guid });
	}

	toggleFlashlight(): Promise<void> {
		return this.request("cam_flashlight_toggle");
	}

	toggleCinematic(): Promise<void> {
		return this.request("cam_cinematic_toggle");
	}

	/** 0 cockpit, 1 exterior, 2 world; ChasePlane picks the view (verified 2026-10-31: replies mode_name, cam_mode_set follows). */
	setCameraMode(mode: number): Promise<void> {
		return this.request("set_camera_mode", { mode });
	}

	/** Next cinematic shot (ChasePlane Remote command; untested while cinematics were off, 2026-10-31). */
	nextCinematicShot(): Promise<void> {
		return this.request("cam_cinematic_next");
	}

	/** Switches to the World Traffic camera on one AI aircraft (what ChasePlane Remote does on a list click). */
	viewTraffic(id: number): Promise<void> {
		return this.request("cam_go_to_traffic", { simobject_id: id });
	}

	/** Puts the camera back on the user's aircraft (ChasePlane Remote's own return command). */
	trackUserAircraft(): Promise<void> {
		return this.request("user_aircraft_track");
	}

	/** Asks for a full traffic snapshot and live updates. */
	async watchTraffic(on: boolean): Promise<void> {
		if (on) {
			await this.request("request_ai_traffic");
			await this.request("start_ai_traffic_refresh");
		} else {
			await this.request("stop_ai_traffic_refresh");
		}
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
				// After a sim restart the bridge can answer before the aircraft's views are loaded;
				// fetch again once ChasePlane reports them loaded and the list is still empty.
				if (msg.payload?.views_loaded === true && this.views.length === 0) {
					this.refreshViews().catch((error) => streamDeck.logger.warn(`get_views failed: ${error.message}`));
				}
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
			case "camera_runtime_state": {
				const id = Number(msg.payload?.ai_traffic_tracking_id ?? 0);
				if (id !== this.trackingId) {
					this.trackingId = id;
					this.emit("traffic");
				}
				break;
			}
			case "ai_traffic":
				this.onTraffic(msg.payload ?? {});
				break;
			case "view_created":
			case "view_modified":
			case "view_deleted":
				this.refreshViews().catch((error) => streamDeck.logger.warn(`get_views failed: ${error.message}`));
				break;
		}
	}

	/** Applies an `ai_traffic` push: a snapshot replaces the list, otherwise added/updated/removed are merged. */
	private onTraffic(p: { snapshot?: boolean; added?: TrafficAircraft[]; updated?: TrafficAircraft[]; removed?: Array<number | { uId: number }>; order?: number[] }): void {
		if (p.snapshot) this.trafficById.clear();
		for (const a of [...(p.added ?? []), ...(p.updated ?? [])]) {
			if (a && typeof a.uId === "number") this.trafficById.set(a.uId, { ...this.trafficById.get(a.uId), ...a });
		}
		for (const r of p.removed ?? []) this.trafficById.delete(typeof r === "number" ? r : r?.uId);
		if (Array.isArray(p.order)) this.trafficOrder = p.order;
		const ordered = this.trafficOrder.map((id) => this.trafficById.get(id)).filter((a): a is TrafficAircraft => !!a);
		const rest = [...this.trafficById.values()].filter((a) => !this.trafficOrder.includes(a.uId));
		this.traffic = [...ordered, ...rest];
		this.emit("traffic");
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
	// The "|" line-break marker (see view-key.ts) reads as a space in a one-line label.
	const plain = view.name.split("|").map((s) => s.trim()).filter(Boolean).join(" ");
	const name = suffix.length ? `${plain} (${suffix.join(" ")})` : plain;
	return `${MODE_PREFIX[view.mode] ?? view.mode} · ${name}`;
}

export const chasePlane = new ChasePlaneClient("ws://localhost:8652");
