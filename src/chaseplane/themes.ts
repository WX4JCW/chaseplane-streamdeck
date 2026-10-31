import type { View } from "./client";

/**
 * ChasePlane Remote's theme table (hue, saturation), mirrored from its remote-ui.js.
 * Its stylesheet uses 55% lightness for bars and 72% for text; unknown themes use 270, 20%.
 */
const THEMES: Record<string, [number, number]> = {
	ONBOARD_PIC: [190, 79],
	ONBOARD_SYSTEMS: [155, 23],
	ONBOARD_MOUNTED: [94, 100],
	ONBOARD_CABIN: [250, 76],
	ONBOARD_MISC: [15, 21],
	OUTSIDE_AIRFRAME: [94, 100],
	OUTSIDE_CABIN: [250, 76],
	OUTSIDE_CHASE: [8, 98],
	OUTSIDE_ORBIT: [195, 86],
	OUTSIDE_MISC: [15, 21],
	WORLD_DEFAULT: [259, 84],
	WORLD_TOWER: [108, 40],
	WORLD_SPOTTING: [38, 86],
	WORLD_RUNWAY: [62, 73],
	WORLD_PARKING: [312, 88],
	WORLD_TRAFFIC: [195, 86],
	WORLD_MISC: [15, 21],
};
const FALLBACK: [number, number] = [270, 20];

function hsl(h: number, s: number, l: number): string {
	const sat = s / 100;
	const light = l / 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = sat * Math.min(light, 1 - light);
	const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Panel key colors (the deck's key style, owner's pick 2026-10-31): `deep` fills the key, `band`
 * is the caption band, `text` the name, `on` the active ring. Without a theme, neutral grey with
 * green for "on".
 */
export function panelColors(theme?: string): { deep: string; band: string; text: string; on: string } {
	const hs = theme ? THEMES[theme] : undefined;
	// Neutral band light enough for black caption text (owner: dark grey with black was too little contrast).
	if (!hs) return { deep: "#16161A", band: "#A8A8B0", text: "#E1E1E1", on: "#3DDC84" };
	const [h, s] = hs;
	return { deep: hsl(h, s * 0.8, 11), band: hsl(h, s, 52), text: hsl(h, s, 78), on: hsl(h, s, 60) };
}

/**
 * Panel colors from any color ("#9FC3E7" or "hsl(210, 65%, 64%)"), with the same recipe as the themes:
 * used for airline colors on traffic keys. White or grey (no hue) gives the neutral key.
 */
export function panelColorsFor(color: string): { deep: string; band: string; text: string; on: string } {
	let h = 0;
	let s = 0;
	const hslMatch = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%/i.exec(color);
	if (hslMatch) {
		h = Number(hslMatch[1]);
		s = Number(hslMatch[2]);
	} else if (/^#[0-9a-f]{6}$/i.test(color)) {
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		const d = max - min;
		if (d > 0) {
			s = (d / (1 - Math.abs(2 * l - 1))) * 100;
			h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
			if (h < 0) h += 360;
		}
	}
	if (s < 8) return panelColors();
	return { deep: hsl(h, s * 0.8, 11), band: hsl(h, s, 52), text: hsl(h, s, 78), on: hsl(h, s, 60) };
}

/** Glow (55%) and text (72%) colors for a ChasePlane theme. */
export function themeColors(theme?: string): { glow: string; text: string } {
	const [h, s] = (theme && THEMES[theme]) || FALLBACK;
	return { glow: hsl(h, s, 55), text: hsl(h, s, 72) };
}

/** LEFT/RIGHT/FWD/MID/AFT as ChasePlane serves them, shortened for a key ("L FWD"). */
export function viewTags(view: View): string {
	const tags: Array<[keyof View, string]> = [
		["has_left_suffix", "L"],
		["has_right_suffix", "R"],
		["has_fwd_suffix", "FWD"],
		["has_mid_suffix", "MID"],
		["has_aft_suffix", "AFT"],
	];
	return tags
		.filter(([k]) => view[k])
		.map(([, t]) => t)
		.join(" ");
}
