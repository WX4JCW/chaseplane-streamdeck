import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";

import { chasePlane, type View } from "../chaseplane/client";
import { type Group, groupLibrary } from "../chaseplane/groups";
import type { Phase } from "../sim/phase";
import { sim } from "../sim/sim";
import { viewsOf, visibleGroups } from "./deck";
import { plainName } from "./view-key";

/**
 * Smart Cam: picks the camera from the flight phase (owner, 2026-11-07, defaults proposed and
 * accepted to start with). Each phase names ChasePlane group themes, so it works on anyone's groups;
 * within the phase it moves to the group's next view every TOUR_MS. CRUISE hands over to
 * ChasePlane's own cinematic shots. Any camera change the owner makes puts it on HOLD until the
 * next phase or a push on the Smart Cam dial.
 *
 * Events: "change" (on/off, hold, phase or target changed).
 */
type Target = { themes: string[] } | { cinematic: true };

const PLAN: Record<Phase, Target> = {
	GATE: { themes: ["OUTSIDE_ORBIT"] },
	"TAXI OUT": { themes: ["OUTSIDE_AIRFRAME"] },
	TAKEOFF: { themes: ["WORLD_RUNWAY"] },
	CLIMB: { themes: ["OUTSIDE_CHASE"] },
	CRUISE: { cinematic: true },
	DESCENT: { themes: ["OUTSIDE_CHASE"] },
	APPROACH: { themes: ["WORLD_TOWER"] },
	LANDING: { themes: ["WORLD_RUNWAY"] },
	"TAXI IN": { themes: ["OUTSIDE_AIRFRAME"] },
	"AT GATE": { themes: ["WORLD_PARKING"] },
};
const TOUR_MS = 20000;

class SmartCam extends EventEmitter {
	enabled = false;
	hold = false;
	/** Groups the current phase tours, and the view last sent. */
	groups: Group[] = [];
	private views: View[] = [];
	private at = -1;
	private sent: string | null = null;
	private cinematicByUs = false;
	private timer: NodeJS.Timeout | null = null;

	constructor() {
		super();
		sim.on("phase", () => this.enabled && this.startPhase());
		sim.on("connection", () => this.emit("change"));
		chasePlane.on("camera", () => this.onCamera());
	}

	/** Push on the dial: off to on, hold to resume, on to off. */
	toggle(): void {
		if (this.enabled && this.hold) return this.startPhase();
		this.enabled = !this.enabled;
		if (this.enabled) this.startPhase();
		else this.stop();
	}

	/** Group name(s) shown on the dial. */
	label(): string {
		const target = sim.phase ? PLAN[sim.phase] : undefined;
		if (target && "cinematic" in target) return "Cinematic";
		return this.groups.map((g) => plainName(g.name)).join(" + ") || "No group";
	}

	private startPhase(): void {
		this.clearTour();
		this.hold = false;
		const phase = sim.phase;
		const target = phase ? PLAN[phase] : undefined;
		if (target && "cinematic" in target) {
			this.groups = [];
			if (!chasePlane.camera?.cinematic_enabled) {
				this.cinematicByUs = true;
				void chasePlane.toggleCinematic().catch((e) => streamDeck.logger.error(`Smart Cam cinematic: ${(e as Error).message}`));
			}
		} else {
			this.endCinematic();
			this.groups = target ? visibleGroups().filter((g) => target.themes.includes(g.theme)) : [];
			this.views = this.groups.flatMap((g) => viewsOf(g.guid));
			this.at = -1;
			this.next();
			if (this.views.length > 1) this.timer = setInterval(() => this.next(), TOUR_MS);
		}
		streamDeck.logger.info(`Smart Cam ${phase}: ${this.label()}`);
		this.emit("change");
	}

	private next(): void {
		if (!this.views.length) return;
		this.at = (this.at + 1) % this.views.length;
		const view = this.views[this.at];
		this.sent = view.guid;
		void chasePlane.setView(view.guid).catch((e) => streamDeck.logger.error(`Smart Cam view: ${(e as Error).message}`));
	}

	/** A camera change Smart Cam did not make means the owner took over. */
	private onCamera(): void {
		if (!this.enabled || this.hold) return;
		const target = sim.phase ? PLAN[sim.phase] : undefined;
		if (!target || "cinematic" in target) return; // cinematic shots change the camera on their own
		const active = chasePlane.activeGuid;
		if (!active || active === this.sent) return;
		this.hold = true;
		this.clearTour();
		this.emit("change");
	}

	private stop(): void {
		this.clearTour();
		this.endCinematic();
		this.hold = false;
		this.groups = [];
		this.emit("change");
	}

	private endCinematic(): void {
		if (this.cinematicByUs && chasePlane.camera?.cinematic_enabled) void chasePlane.toggleCinematic().catch(() => undefined);
		this.cinematicByUs = false;
	}

	private clearTour(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
}

export const smartCam = new SmartCam();
groupLibrary.on("groups", () => smartCam.emit("change"));
