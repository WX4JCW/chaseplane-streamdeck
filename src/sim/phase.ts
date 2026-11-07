/**
 * Flight phase from a few sim values, for Smart Cam. Our own port of Datalink Pro's OOOI rules
 * (`datalink/oooi.py`: same thresholds and holds for OUT, ON and IN, so the deck and Datalink agree),
 * plus camera-only phases Datalink has no use for: takeoff roll, climb, cruise, descent, approach.
 * No flight plan here: it starts from what the aircraft is doing and loops back to GATE after IN.
 */

export type Phase = "GATE" | "TAXI OUT" | "TAKEOFF" | "CLIMB" | "CRUISE" | "DESCENT" | "APPROACH" | "LANDING" | "TAXI IN" | "AT GATE";
export const PHASES: Phase[] = ["GATE", "TAXI OUT", "TAKEOFF", "CLIMB", "CRUISE", "DESCENT", "APPROACH", "LANDING", "TAXI IN", "AT GATE"];

export type Snapshot = {
	onGround: boolean;
	groundSpeed: number; // kt
	agl: number; // ft
	verticalSpeed: number; // ft/min
	parkingBrake: boolean;
	engine1: boolean;
	engine2: boolean;
	lat: number;
	lon: number;
};

// Datalink Pro's thresholds.
const GSPD_OUT_MIN = 2; // kt, OUT by speed
const DISP_OUT_MIN_M = 12; // m moved from where it was parked, OUT for slow pushbacks
const GSPD_ON_MAX = 30; // kt, ON
const GSPD_IN_MAX = 1; // kt, IN
const AGL_AIRBORNE = 1500; // ft, OFF to airborne
const IN_MISS_TOLERANCE = 2; // polls the IN condition may drop out (engine and speed flicker on shutdown)

// Camera-only phases.
const GSPD_ROLL = 40; // kt on the runway: takeoff roll
const VS_CLIMB = 500; // ft/min
const VS_DESCENT = -500; // ft/min
const AGL_APPROACH = 2500; // ft

/** How long a condition must hold before the phase changes, in seconds. */
const HOLD: Partial<Record<Phase, number>> = {
	"TAXI OUT": 15, // Datalink OUT
	TAKEOFF: 2,
	CLIMB: 20, // climb, cruise and descent held so a level-off does not flicker
	CRUISE: 20,
	DESCENT: 20,
	APPROACH: 5,
	LANDING: 2,
	"TAXI IN": 20, // Datalink ON
	"AT GATE": 30, // Datalink IN
};

function metres(a: Snapshot, lat: number, lon: number): number {
	const r = 6371000;
	const dLat = ((a.lat - lat) * Math.PI) / 180;
	const dLon = ((a.lon - lon) * Math.PI) / 180;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((a.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
	return 2 * r * Math.asin(Math.sqrt(h));
}

export class PhaseTracker {
	phase: Phase | null = null;
	private pending: { target: Phase; since: number; misses: number } | null = null;
	private parkedAt: { lat: number; lon: number } | null = null;

	constructor(private readonly onChange: (phase: Phase) => void) {}

	reset(): void {
		this.phase = null;
		this.pending = null;
		this.parkedAt = null;
	}

	/** Feed one sample (about twice a second). */
	update(s: Snapshot, now = Date.now()): void {
		if (this.phase === null) return this.set(this.startPhase(s), s);
		const next = this.candidate(this.phase, s);
		if (!next) {
			if (this.pending?.target === "AT GATE" && ++this.pending.misses <= IN_MISS_TOLERANCE) return;
			this.pending = null;
			return;
		}
		if (this.pending?.target !== next) this.pending = { target: next, since: now, misses: 0 };
		this.pending.misses = 0;
		if (now - this.pending.since >= (HOLD[next] ?? 0) * 1000) this.set(next, s);
	}

	private startPhase(s: Snapshot): Phase {
		if (s.onGround) return s.groundSpeed < GSPD_OUT_MIN ? "GATE" : "TAXI OUT"; // stopped counts as parked, as Datalink starts
		return this.airborne(s);
	}

	private airborne(s: Snapshot): Phase {
		if (s.verticalSpeed < VS_DESCENT && s.agl < AGL_APPROACH) return "APPROACH";
		if (s.verticalSpeed > VS_CLIMB) return "CLIMB";
		if (s.verticalSpeed < VS_DESCENT) return "DESCENT";
		return "CRUISE";
	}

	/** The phase the current sample points to, if it differs from the current one. */
	private candidate(phase: Phase, s: Snapshot): Phase | null {
		switch (phase) {
			case "GATE":
			case "AT GATE": {
				if (s.parkingBrake) return null;
				const moved = this.parkedAt && !(s.lat === 0 && s.lon === 0) ? metres(s, this.parkedAt.lat, this.parkedAt.lon) >= DISP_OUT_MIN_M : false;
				return moved || s.groundSpeed > GSPD_OUT_MIN ? "TAXI OUT" : null;
			}
			case "TAXI OUT":
				return (s.onGround && s.groundSpeed > GSPD_ROLL) || !s.onGround ? "TAKEOFF" : null;
			case "TAKEOFF":
				if (!s.onGround && s.agl > AGL_AIRBORNE) return "CLIMB";
				if (s.onGround && s.groundSpeed < GSPD_ON_MAX) return "TAXI OUT"; // rejected takeoff
				return null;
			case "CLIMB":
			case "CRUISE":
			case "DESCENT":
			case "APPROACH": {
				if (s.onGround) return "LANDING";
				const next = this.airborne(s);
				return next === phase ? null : next;
			}
			case "LANDING":
				if (!s.onGround) return s.agl > 200 ? "CLIMB" : null; // go-around
				return s.groundSpeed < GSPD_ON_MAX ? "TAXI IN" : null;
			case "TAXI IN":
				// Datalink also wants the parking brake; it is left out here because some add-ons (the iFly MAX 8)
				// never report it through the sim (BRAKE PARKING POSITION stays 0, 2026-11-07).
				return s.groundSpeed < GSPD_IN_MAX && !s.engine1 && !s.engine2 ? "AT GATE" : null;
		}
	}

	private set(phase: Phase, s: Snapshot): void {
		this.pending = null;
		if (phase === "GATE" || phase === "AT GATE") this.parkedAt = { lat: s.lat, lon: s.lon };
		if (phase === this.phase) return;
		this.phase = phase;
		this.onChange(phase);
	}
}
