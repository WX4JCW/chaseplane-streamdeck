import type { TrafficAircraft } from "../chaseplane/client";

/** Font for the traffic keys. Change here to restyle every slot. */
export const FONT = { family: "Arial, Helvetica, sans-serif", weight: "bold", sizes: [27, 23, 19] };

/**
 * Text colors by airline, keyed by the ATC airline name ChasePlane reports (`atc_airline`),
 * which is the radio callsign: Atlas Air is "Giant", China Airlines is "Dynasty".
 */
const AIRLINE_COLORS: Record<string, string> = {
	// Silver-steel (its polished livery): light blue read the same as United's blue on the deck (owner, 2026-10-31).
	American: "#9AA8B8",
	Delta: "#EF5B67",
	// The blue airlines are kept at least ~15-30 degrees of hue apart so they read apart on the deck.
	United: "#4A5FE0",
	Southwest: "#FFBF27",
	Alaska: "#3BB2A6",
	JetBlue: "#2AA9F0",
	"Spirit Wings": "#F7E400",
	"Frontier Flight": "#3CB371",
	FedEx: "#A776F0",
	UPS: "#C9A06B",
	Giant: "#3FC1D6",
	Cargolux: "#F28C28",
	Dynasty: "#E7A3CC",
	// Envoy flies as American Eagle, so it shares American's silver.
	Envoy: "#9AA8B8",
	// Rose: its light blue was close to JetBlue's sky blue.
	SkyWest: "#E07FB0",
	Brickyard: "#B0BEC5",
	Speedbird: "#E8505B",
	Lufthansa: "#FFC94A",
	Emirates: "#E85D5D",
	Qatari: "#B5537A",
};
const NO_AIRLINE = "#FFFFFF";
/** Matched ignoring capitals: ChasePlane reports "Skywest" where the table says "SkyWest" (2026-10-31). */
const BY_NAME = new Map(Object.entries(AIRLINE_COLORS).map(([name, color]) => [name.toLowerCase(), color]));

/** Known airline color, else a steady color derived from the name, else white for GA. */
export function airlineColor(airline?: string): string {
	if (!airline) return NO_AIRLINE;
	const known = BY_NAME.get(airline.toLowerCase());
	if (known) return known;
	let hash = 0;
	for (const ch of airline.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return `hsl(${hash % 360}, 65%, 64%)`;
}

const PHASES: Record<string, string> = { taxi: "TAXI", takeoff: "T/O", landing: "LDG", cruise: "CRZ" };

/** The three text lines for an aircraft: identity, type, phase and distance. */
export function slotLines(a: TrafficAircraft): [string, string, string] {
	// display_name is often the full model title ("B737-Max8 ..."), too long for a key, so it is not used.
	const identity = a.atc_flight_number
		? `${a.atc_airline ?? ""} ${a.atc_flight_number}`.trim()
		: a.callsign || a.atc_airline || a.atc_id || a.atc_model || String(a.uId);
	const type = a.atc_model ?? "";
	const phase = a.phase ? (PHASES[a.phase] ?? a.phase.toUpperCase()) : "";
	const distance = typeof a.distance === "number" ? a.distance.toFixed(1) : "";
	return [identity, type, [phase, distance].filter(Boolean).join(" ")];
}

export const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Usable text width on the 144 px key, and an average bold glyph width as a share of font size. */
const TEXT_WIDTH = 128;
const GLYPH_WIDTH = 0.62;
const MIN_SIZE = 15;

/** Shrinks the font until the line fits; cuts with an ellipsis only below the minimum size. */
export function fit(value: string, size: number): { value: string; size: number } {
	const fitted = Math.floor(TEXT_WIDTH / (value.length * GLYPH_WIDTH));
	if (fitted >= size) return { value, size };
	if (fitted >= MIN_SIZE) return { value, size: fitted };
	const max = Math.floor(TEXT_WIDTH / (MIN_SIZE * GLYPH_WIDTH));
	return { value: `${value.slice(0, max - 1)}…`, size: MIN_SIZE };
}

/**
 * Draws a 144x144 traffic key as an SVG data URI: black, three centered lines in the airline
 * color, and a glow outline in the same color while the camera is on this aircraft.
 * The glow is stacked strokes rather than an SVG filter, so it does not depend on filter support.
 */
export function slotImage(a: TrafficAircraft, active: boolean): string {
	const color = airlineColor(a.atc_airline);
	const [l1, l2, l3] = slotLines(a);
	const glow = active
		? [
				[16, 0.08],
				[11, 0.14],
				[7, 0.25],
				[3.5, 1],
			]
				.map(([w, o]) => `<rect x="9" y="9" width="126" height="126" rx="22" fill="none" stroke="${color}" stroke-width="${w}" stroke-opacity="${o}"/>`)
				.join("")
		: "";
	const [s1, s2, s3] = FONT.sizes;
	const text = (y: number, base: number, raw: string, opacity: number) => {
		const { value, size } = fit(raw, base);
		return `<text x="72" y="${y}" text-anchor="middle" font-family="${FONT.family}" font-weight="${FONT.weight}" font-size="${size}" fill="${color}" fill-opacity="${opacity}">${escape(value)}</text>`;
	};
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#000000"/>` +
		(active ? `<rect x="9" y="9" width="126" height="126" rx="22" fill="${color}" fill-opacity="0.10"/>` : "") +
		glow +
		text(56, s1, l1, 1) +
		text(86, s2, l2, 0.9) +
		text(114, s3, l3, 0.7) +
		`</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
