import streamDeck, { action, DialAction, DialDownEvent, DialRotateEvent, SingletonAction, TouchTapEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { chasePlane } from "../chaseplane/client";
import { groupLibrary } from "../chaseplane/groups";
import { activeGroupGuid, deckScreen, openGroup, openGroupGuid, viewsOf, visibleGroups } from "./deck";
import { sim } from "../sim/sim";
import { keyStyle, stripImage, type StripLook } from "./key-style";
import { director } from "./director";
import { airlineColor, slotLines } from "./traffic-key";
import { plainName } from "./view-key";

/**
 * The + XL's six dials as one action; each dial's job comes from its position (owner, 2026-10-31):
 * 1 Group (turn: groups, the deck keys follow; push: home), 2 View (turn: views of the open group,
 * or the active camera's; push: its first view), 3 Mode (turn: cockpit, exterior, world, then the
 * nearest tower and runway, every runway end, nearest parking and spotting; push: release a look-at lock),
 * 4 Cinematic (turn: next shot; push: on/off), 5 Director (turn: Smart Cam or Auto Tour, or the tour's
 * speed while touring; push: start, stop, or resume from hold),
 * 6 Traffic (turn: nearby aircraft; push: back to my aircraft). Its touch strip section shows the
 * same, drawn in the deck's key style.
 */
type Job = "group" | "view" | "mode" | "cinematic" | "director" | "traffic";
const JOBS: Job[] = ["group", "view", "mode", "cinematic", "director", "traffic"];
/** One stop on the Mode dial: what the strip shows and what it sends. */
type Stop = { key: string; caption: string; value: string; send: () => Promise<void> };

/**
 * The Mode dial's stops (owner, 2026-11-07): ChasePlane's three camera modes, the nearest tower and
 * runway, then every runway end at the airport in number order, then the nearest parking and spotting.
 */
function stops(): Stop[] {
	const mode = (m: number, value: string): Stop => ({ key: `mode${m}`, caption: "Mode", value, send: () => chasePlane.setCameraMode(m) });
	const nearest = (kind: "tower" | "runway" | "parking" | "spotting", value: string): Stop => ({
		key: kind,
		caption: "Nearest",
		value,
		send: () => chasePlane.goToNearest(kind),
	});
	const ends = [...chasePlane.runwayEnds]
		.sort((a, b) => parseInt(a.name) - parseInt(b.name) || a.name.localeCompare(b.name))
		.map((r): Stop => ({ key: `rwy:${r.name}`, caption: `Runway · ${chasePlane.airport}`, value: r.name, send: () => chasePlane.goToRunway(r.index, r.end) }));
	return [mode(0, "Cockpit"), mode(1, "Exterior"), mode(2, "World"), nearest("tower", "Tower"), nearest("runway", "Runway"), ...ends, nearest("parking", "Parking"), nearest("spotting", "Spotting")];
}

/**
 * The world stop last sent: ChasePlane reports tower, runway, parking and spotting only as world mode
 * (2), so it is remembered with the camera it landed on, and forgotten when the camera moves elsewhere.
 */
let sentStop: string | null = null;
let stopPreset: string | null = null;
chasePlane.on("camera", () => {
	if (!sentStop) return;
	const preset = chasePlane.camera?.preset_guid ?? null;
	if (chasePlane.camera?.mode !== 2) sentStop = null;
	else if (stopPreset === null) stopPreset = preset;
	else if (preset !== stopPreset) sentStop = null;
});
const currentStop = (list: Stop[]): number => {
	const mode = chasePlane.camera?.mode ?? -1;
	if (mode === 2 && sentStop) {
		const at = list.findIndex((st) => st.key === sentStop);
		if (at >= 0) return at;
	}
	return list.findIndex((st) => st.key === `mode${mode}`);
};
/** Turning fast sends one camera switch when the dial settles, not one per tick. */
const SETTLE_MS = 180;

/** The group the View dial steps through: the one open on the deck, else the active camera's. */
const viewGroupGuid = (): string | undefined => openGroupGuid() ?? activeGroupGuid();
const wrap = (i: number, n: number): number => ((i % n) + n) % n;

let trafficIndex = -1;

@action({ UUID: "com.acms.chaseplane.dial" })
export class DeckDialAction extends SingletonAction {
	private pending: { job: Job; target: number; timer: NodeJS.Timeout } | null = null;

	constructor() {
		super();
		for (const event of ["views", "camera", "connection", "traffic", "airport"]) chasePlane.on(event, () => this.renderAll());
		groupLibrary.on("groups", () => this.renderAll());
		deckScreen.on("screen", () => this.renderAll());
		keyStyle.on("style", () => this.renderAll());
		director.on("change", () => this.renderAll());
		// ChasePlane forgets the traffic subscription when it restarts; ask again for the Traffic dial.
		chasePlane.on("connection", () => chasePlane.ready && void chasePlane.watchTraffic(true, "dial").catch(() => undefined));
		sim.on("phase", () => this.renderAll());
	}

	override async onWillAppear(): Promise<void> {
		if (chasePlane.ready) await chasePlane.watchTraffic(true, "dial").catch(() => undefined);
		this.renderAll();
	}

	override async onDialRotate(ev: DialRotateEvent): Promise<void> {
		const job = this.jobOf(ev.action);
		const step = ev.payload.ticks;
		try {
			switch (job) {
				case "group": {
					const groups = visibleGroups();
					if (!groups.length) return;
					const at = groups.findIndex((g) => g.guid === openGroupGuid());
					openGroup(groups[wrap(at < 0 ? (step > 0 ? -1 : 0) + step : at + step, groups.length)].guid);
					return;
				}
				case "view": {
					const guid = viewGroupGuid();
					const views = guid ? viewsOf(guid) : [];
					if (!views.length) return;
					const from = this.pending?.job === "view" ? this.pending.target : views.findIndex((v) => v.guid === chasePlane.activeGuid);
					this.settle("view", wrap((from < 0 ? -1 : from) + step, views.length), (i) => chasePlane.setView(views[i].guid));
					return;
				}
				case "mode": {
					const list = stops();
					const from = this.pending?.job === "mode" ? this.pending.target : Math.max(currentStop(list), 0);
					this.settle("mode", wrap(from + step, list.length), (i) => {
						const stop = list[i];
						sentStop = stop.key.startsWith("mode") ? null : stop.key;
						stopPreset = null;
						return stop.send();
					});
					return;
				}
				case "cinematic":
					await chasePlane.nextCinematicShot();
					return;
				case "director":
					director.turn(step);
					return;
				case "traffic": {
					const list = chasePlane.traffic;
					if (!list.length) return;
					const at = list.findIndex((a) => a.uId === chasePlane.trackingId);
					trafficIndex = wrap((at >= 0 ? at : trafficIndex) + step, list.length);
					this.settle("traffic", trafficIndex, (i) => chasePlane.viewTraffic(list[i].uId));
					this.renderAll();
					return;
				}
			}
		} catch (error) {
			streamDeck.logger.error(`dial ${job} failed: ${(error as Error).message}`);
			await ev.action.showAlert();
		}
	}

	override onDialDown(ev: DialDownEvent): Promise<void> {
		return this.press(ev.action);
	}

	override onTouchTap(ev: TouchTapEvent): Promise<void> {
		return this.press(ev.action);
	}

	private async press(target: DialAction<JsonObject>): Promise<void> {
		const job = this.jobOf(target);
		try {
			switch (job) {
				case "group":
					openGroup();
					return;
				case "view": {
					const guid = viewGroupGuid();
					const first = guid ? viewsOf(guid)[0] : undefined;
					if (first) await chasePlane.setView(first.guid);
					return;
				}
				case "mode":
					await chasePlane.releaseLookAt();
					return;
				case "cinematic":
					await chasePlane.toggleCinematic();
					return;
				case "director":
					director.push();
					return;
				case "traffic":
					await chasePlane.trackUserAircraft();
					return;
			}
		} catch (error) {
			streamDeck.logger.error(`dial ${job} push failed: ${(error as Error).message}`);
			await target.showAlert();
		}
	}

	/** Shows `target` straight away and sends it once the dial stops turning. */
	private settle(job: Job, target: number, send: (target: number) => Promise<void>): void {
		if (this.pending) clearTimeout(this.pending.timer);
		const timer = setTimeout(() => {
			this.pending = null;
			send(target).catch((error) => streamDeck.logger.error(`dial ${job} failed: ${(error as Error).message}`));
		}, SETTLE_MS);
		this.pending = { job, target, timer };
		this.renderAll();
	}

	private jobOf(target: { coordinates?: { column: number } }): Job | undefined {
		return JOBS[target.coordinates?.column ?? -1];
	}

	private look(job: Job | undefined): StripLook {
		if (!chasePlane.ready) return { caption: "ChasePlane", value: "Offline", accent: "#FF4D4D", active: true };
		switch (job) {
			case "group": {
				const guid = openGroupGuid();
				const group = guid ? groupLibrary.byGuid(guid) : undefined;
				if (!group) return { caption: "Group", value: "Home", sub: `${visibleGroups().length} groups` };
				const n = viewsOf(group.guid).length;
				return { theme: group.theme, caption: `Group · ${group.area}`, value: group.name, sub: n === 1 ? "1 view" : `${n} views` };
			}
			case "view": {
				const guid = viewGroupGuid();
				const views = guid ? viewsOf(guid) : [];
				const at = this.pending?.job === "view" ? this.pending.target : views.findIndex((v) => v.guid === chasePlane.activeGuid);
				const view = views[at];
				const group = guid ? groupLibrary.byGuid(guid)?.name : undefined;
				if (!view) return { caption: group ? plainName(group) : "View", value: "—", sub: views.length ? `${views.length} views` : "" };
				return { theme: view.profile_theme, caption: group ? plainName(group) : "View", value: view.name, sub: `${at + 1}/${views.length}`, active: true };
			}
			case "mode": {
				const list = stops();
				const stop = list[this.pending?.job === "mode" ? this.pending.target : currentStop(list)];
				return { theme: "ONBOARD_PIC", caption: stop?.caption ?? "Mode", value: stop?.value ?? "—", sub: "push: free look-at", active: !!stop };
			}
			case "cinematic": {
				const on = chasePlane.camera?.cinematic_enabled === true;
				return { theme: "WORLD_DEFAULT", caption: "Cinematic", value: on ? "On" : "Off", sub: on ? "turn: next shot" : "push: start", active: on };
			}
			case "director":
				if (!director.running) {
					const name = director.mode === "smart" ? "Smart Cam" : "Auto Tour";
					const why = director.mode === "smart" && !sim.connected ? "no sim · " : "";
					return { caption: "Director", value: name, sub: `${why}push: start` };
				}
				return {
					theme: director.groups[0]?.theme ?? "WORLD_DEFAULT",
					caption: director.mode === "smart" ? `Smart Cam · ${sim.phase ?? (sim.connected ? "…" : "no sim")}` : `Auto Tour · ${director.interval} s`,
					value: director.hold ? "Hold" : director.label(),
					sub: director.hold ? "push: resume" : director.mode === "tour" ? "turn: speed" : "push: stop",
					active: !director.hold,
				};
			case "traffic": {
				const list = chasePlane.traffic;
				const at = this.pending?.job === "traffic" ? this.pending.target : list.findIndex((a) => a.uId === chasePlane.trackingId);
				const a = list[at];
				if (!a) return { theme: "WORLD_TRAFFIC", caption: "Traffic", value: list.length ? "My aircraft" : "None", sub: list.length ? `${list.length} nearby` : "" };
				const [identity, type, phase] = slotLines(a);
				return { color: airlineColor(a.atc_airline), caption: `Traffic ${at + 1}/${list.length}`, value: identity, sub: [type, phase].filter(Boolean).join(" · "), active: true };
			}
			default:
				return { caption: "Dial", value: "—" };
		}
	}

	private renderAll(): void {
		for (const a of this.actions) {
			if (!a.isDial()) continue;
			void a.setFeedback({ canvas: stripImage(this.look(this.jobOf(a))) });
		}
	}
}
