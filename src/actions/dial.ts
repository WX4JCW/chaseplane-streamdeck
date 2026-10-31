import streamDeck, { action, DialAction, DialDownEvent, DialRotateEvent, SingletonAction, TouchTapEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { chasePlane } from "../chaseplane/client";
import { groupLibrary } from "../chaseplane/groups";
import { activeGroupGuid, deckScreen, openGroup, openGroupGuid, viewsOf, visibleGroups } from "./deck";
import { keyStyle, stripImage, type StripLook } from "./key-style";
import { airlineColor, slotLines } from "./traffic-key";
import { plainName } from "./view-key";

/**
 * The + XL's six dials as one action; each dial's job comes from its position (owner, 2026-10-31):
 * 1 Group (turn: groups, the deck keys follow; push: home), 2 View (turn: views of the open group,
 * or the active camera's; push: its first view), 3 Mode (turn or push: cockpit, exterior, world),
 * 4 Cinematic (turn: next shot; push: on/off), 5 Director (Smart Cam, not built yet),
 * 6 Traffic (turn: nearby aircraft; push: back to my aircraft). Its touch strip section shows the
 * same, drawn in the deck's key style.
 */
type Job = "group" | "view" | "mode" | "cinematic" | "director" | "traffic";
const JOBS: Job[] = ["group", "view", "mode", "cinematic", "director", "traffic"];
const MODES = ["Cockpit", "Exterior", "World"];
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
		for (const event of ["views", "camera", "connection", "traffic"]) chasePlane.on(event, () => this.renderAll());
		groupLibrary.on("groups", () => this.renderAll());
		deckScreen.on("screen", () => this.renderAll());
		keyStyle.on("style", () => this.renderAll());
	}

	override async onWillAppear(): Promise<void> {
		if (chasePlane.ready) await chasePlane.watchTraffic(true).catch(() => undefined);
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
					const from = this.pending?.job === "mode" ? this.pending.target : (chasePlane.camera?.mode ?? 0);
					this.settle("mode", wrap(from + step, MODES.length), (m) => chasePlane.setCameraMode(m));
					return;
				}
				case "cinematic":
					await chasePlane.nextCinematicShot();
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
					await chasePlane.setCameraMode(wrap((chasePlane.camera?.mode ?? 0) + 1, MODES.length));
					return;
				case "cinematic":
					await chasePlane.toggleCinematic();
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
				const m = this.pending?.job === "mode" ? this.pending.target : (chasePlane.camera?.mode ?? -1);
				return { theme: "ONBOARD_PIC", caption: "Mode", value: MODES[m] ?? "—", active: m >= 0 };
			}
			case "cinematic": {
				const on = chasePlane.camera?.cinematic_enabled === true;
				return { theme: "WORLD_DEFAULT", caption: "Cinematic", value: on ? "On" : "Off", sub: on ? "turn: next shot" : "push: start", active: on };
			}
			case "director":
				return { caption: "Smart Cam", value: "Not yet", sub: "flight phase first" };
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
