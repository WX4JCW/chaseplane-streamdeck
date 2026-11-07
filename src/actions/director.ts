import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";

import { chasePlane, type View } from "../chaseplane/client";
import { type Group, groupLibrary } from "../chaseplane/groups";
import type { Phase } from "../sim/phase";
import { sim } from "../sim/sim";
import { activeGroupGuid, openGroupGuid, viewsOf, visibleGroups } from "./deck";
import { plainName } from "./view-key";

/**
 * The camera director on dial 5, two ways (owner, 2026-11-07):
 * - Smart Cam picks the camera from the flight phase. Each phase names ChasePlane group themes, so it
 *   works on anyone's groups; within the phase it moves to the group's next view every 20 s. CRUISE
 *   hands over to ChasePlane's own cinematic shots.
 * - Auto Tour moves through the group open on the deck (else the active camera's group) on a timer the
 *   owner sets with the dial; opening another group makes the tour follow it.
 * Any camera change the owner makes puts either on HOLD until a push on the dial (Smart Cam also
 * resumes at the next phase).
 *
 * Events: "change" (mode, running, hold, phase, group or interval changed).
 */
export type DirectorMode = "smart" | "tour";
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
const SMART_TOUR_S = 20;
/** Auto Tour intervals the dial steps through, in seconds. */
export const TOUR_INTERVALS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
/**
 * After the director switches, whatever camera ChasePlane reports within this window is taken as the
 * one it chose: world views (tower, runway, parking) come back under a new GUID (review, 2026-11-07).
 */
const OWN_SWITCH_MS = 3000;

class Director extends EventEmitter {
	/** The mode the dial shows; turning picks it while stopped. */
	mode: DirectorMode = "smart";
	running = false;
	hold = false;
	/** Seconds between Auto Tour switches. */
	interval = 15;
	/** Groups being toured. */
	groups: Group[] = [];
	private views: View[] = [];
	private at = -1;
	private sent: string | null = null;
	private sentAt = 0;
	private cinematicByUs = false;
	private timer: NodeJS.Timeout | null = null;

	constructor() {
		super();
		sim.on("phase", () => this.running && this.mode === "smart" && this.start());
		sim.on("connection", (connected: boolean) => {
			// Without the sim there is no phase: Smart Cam stops switching and waits; the first phase
			// after the sim returns starts it again (review, 2026-11-07).
			if (!connected && this.running && this.mode === "smart") {
				this.clearTimer();
				this.endCinematic();
				this.groups = [];
				this.views = [];
			}
			this.emit("change");
		});
		chasePlane.on("camera", () => this.onCamera());
	}

	/** Turn while stopped: switch between Smart Cam and Auto Tour. Turn during Auto Tour: change its interval. */
	turn(step: number): void {
		if (this.running && this.mode === "tour") {
			const at = TOUR_INTERVALS.indexOf(this.interval);
			this.interval = TOUR_INTERVALS[Math.min(Math.max(at + Math.sign(step), 0), TOUR_INTERVALS.length - 1)];
			if (!this.hold) this.restartTimer();
		} else if (!this.running) {
			this.mode = this.mode === "smart" ? "tour" : "smart";
		} else return;
		this.emit("change");
	}

	/** Push: start, resume from hold, or stop. */
	push(): void {
		if (this.running && !this.hold) return this.stop();
		this.running = true;
		this.start();
	}

	/** What is being toured, for the dial. */
	label(): string {
		if (this.mode === "smart") {
			const target = sim.phase ? PLAN[sim.phase] : undefined;
			if (target && "cinematic" in target) return "Cinematic";
		}
		return this.groups.map((g) => plainName(g.name)).join(" + ") || "No group";
	}

	private start(): void {
		this.clearTimer();
		this.hold = false;
		if (this.mode === "smart") this.startSmart();
		else this.startTour();
		this.emit("change");
	}

	private startSmart(): void {
		const phase = sim.phase;
		const target = phase ? PLAN[phase] : undefined;
		if (target && "cinematic" in target) {
			this.groups = [];
			this.views = [];
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
			if (this.views.length > 1) this.timer = setInterval(() => this.next(), SMART_TOUR_S * 1000);
		}
		streamDeck.logger.info(`Smart Cam ${phase}: ${this.label()}`);
	}

	private startTour(): void {
		this.endCinematic();
		this.at = -1;
		this.tourStep();
		this.restartTimer();
		streamDeck.logger.info(`Auto Tour: ${this.label()} every ${this.interval} s`);
	}

	/** One Auto Tour step: re-read the group, so opening another group on the deck moves the tour there. */
	private tourStep(): void {
		const guid = openGroupGuid() ?? activeGroupGuid();
		const group = guid ? groupLibrary.byGuid(guid) : undefined;
		if (group?.guid !== this.groups[0]?.guid) {
			this.groups = group ? [group] : [];
			this.views = group ? viewsOf(group.guid) : [];
			const current = this.views.findIndex((v) => v.guid === chasePlane.activeGuid);
			this.at = current;
			this.emit("change");
		}
		this.next();
	}

	private restartTimer(): void {
		this.clearTimer();
		if (this.mode === "tour") this.timer = setInterval(() => this.tourStep(), this.interval * 1000);
	}

	private next(): void {
		if (!this.views.length) return;
		this.at = (this.at + 1) % this.views.length;
		const view = this.views[this.at];
		this.sent = view.guid;
		this.sentAt = Date.now();
		void chasePlane.setView(view.guid).catch((e) => streamDeck.logger.error(`Director view: ${(e as Error).message}`));
	}

	/** A camera change the director did not make means the owner took over. */
	private onCamera(): void {
		if (!this.running || this.hold) return;
		if (this.mode === "smart") {
			const target = sim.phase ? PLAN[sim.phase] : undefined;
			if (!target || "cinematic" in target) return; // cinematic shots change the camera on their own
		}
		const active = chasePlane.activeGuid;
		if (!active || active === this.sent) return;
		if (Date.now() - this.sentAt < OWN_SWITCH_MS) {
			this.sent = active;
			return;
		}
		this.hold = true;
		this.clearTimer();
		this.emit("change");
	}

	private stop(): void {
		this.running = false;
		this.hold = false;
		this.clearTimer();
		this.endCinematic();
		this.groups = [];
		this.emit("change");
	}

	private endCinematic(): void {
		if (this.cinematicByUs && chasePlane.camera?.cinematic_enabled) void chasePlane.toggleCinematic().catch(() => undefined);
		this.cinematicByUs = false;
	}

	private clearTimer(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
}

export const director = new Director();
groupLibrary.on("groups", () => director.emit("change"));
