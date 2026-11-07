import { EventEmitter } from "node:events";

import type { View } from "../chaseplane/client";
import { groupLibrary } from "../chaseplane/groups";
import { panelColors, panelColorsFor, themeColors, viewTags } from "../chaseplane/themes";
import { escape, fit, FONT } from "./traffic-key";
import { nameLines, plainName } from "./view-key";

/**
 * Every drawn key goes through keyImage, so the deck has one look. Two styles while the owner
 * compares them on the device (2026-10-31): A "Edge" (near-black key, the group color as a thin
 * top bar and the caption) and B "Panel" (key tinted in the group color, caption in a solid top
 * band). Both: caption at the top, name in the middle, status line at the bottom, a ring when
 * active. Only flat shapes and text, which Stream Deck draws reliably.
 */
export type KeyLook = {
	/** ChasePlane theme; none gives the neutral grey key. */
	theme?: string;
	/** A color instead of a theme ("#9FC3E7" or "hsl(...)"), such as an airline's on traffic keys. */
	color?: string;
	/** Small text at the top (group, area, or what the key is). */
	caption?: string;
	/** Main text; a "|" breaks the line there. */
	name: string;
	/** Status line at the bottom ("14 VIEWS", "ON"). */
	sub?: string;
	active?: boolean;
	/** Color for the ring and status line, overriding the theme's (red for offline). */
	accent?: string;
};

export type KeyStyle = "A" | "B";
let style: KeyStyle = "B";
/** Emits "style" when the style changes, so every drawn key redraws. */
export const keyStyle = new EventEmitter();
export const currentStyle = (): KeyStyle => style;
export function setKeyStyle(next: KeyStyle): void {
	if (next === style) return;
	style = next;
	keyStyle.emit("style");
}

/** A camera view as a key: its ChasePlane group as the caption, its L/R/FWD/MID/AFT tags below. */
export function viewLook(view: View, active: boolean): KeyLook {
	const group = groupLibrary.byGuid(view.profile_preset)?.name;
	return { theme: view.profile_theme, caption: group ? plainName(group) : undefined, name: view.name, sub: viewTags(view), active };
}

const text = (y: number, base: number, raw: string, fill: string): string => {
	const { value, size } = fit(raw, base);
	return `<text x="72" y="${y}" text-anchor="middle" font-family="${FONT.family}" font-weight="${FONT.weight}" font-size="${size}" fill="${fill}">${escape(value)}</text>`;
};

/**
 * Caption text, shrunk to fit inside the band. Captions are capitals, which run wider than the
 * shared estimate in traffic-key's fit (long group names spilled past the band, owner 2026-10-31),
 * so they are measured at 0.72 of the font size per character, from 15 px down to 10 px, and cut
 * with an ellipsis only below that.
 */
const CAPTION_WIDTH = 124;
const CAPS_GLYPH = 0.72;
function captionText(y: number, raw: string, fill: string): string {
	let value = raw.toUpperCase();
	let size = Math.min(15, Math.floor(CAPTION_WIDTH / (value.length * CAPS_GLYPH)));
	if (size < 10) {
		size = 10;
		const max = Math.floor(CAPTION_WIDTH / (size * CAPS_GLYPH));
		value = `${value.slice(0, max - 1)}…`;
	}
	return `<text x="72" y="${y}" text-anchor="middle" font-family="${FONT.family}" font-weight="${FONT.weight}" font-size="${size}" fill="${fill}">${escape(value)}</text>`;
}

/** The name in one or two lines, centred between the caption area and the status line. */
function nameText(look: KeyLook, top: number, color: string): string {
	const lines = nameLines(look.name, 11);
	const bottom = look.sub ? 26 : 0;
	const mid = top + (144 - top - bottom) / 2;
	const size = lines.length === 1 ? 26 : 22;
	return lines.length === 1
		? text(mid + size * 0.36, size, lines[0], color)
		: text(mid - 4, size, lines[0], color) + text(mid + size + 1, size, lines[1], color);
}

/** Mixes `color` into the key's near-black at `amount` (0..1); flat fills stand in for transparency effects. */
function mix(color: string, amount: number, base = "#0C0C0E"): string {
	const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const [a, b] = [rgb(color), rgb(base)];
	return `#${a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

function styleA(look: KeyLook): string {
	const neutral = !look.theme;
	const { glow, text: themeText } = themeColors(look.theme);
	const bar = neutral ? "#5A5A60" : glow;
	const captionColor = neutral ? "#AAAAAA" : themeText;
	const on = look.accent ?? (neutral ? "#3DDC84" : glow);
	return (
		`<rect width="144" height="144" rx="18" fill="${look.active ? mix(on, 0.16) : "#0C0C0E"}"/>` +
		`<rect x="14" y="10" width="116" height="6" rx="3" fill="${bar}"/>` +
		(look.active ? `<rect x="2" y="2" width="140" height="140" rx="17" fill="none" stroke="${on}" stroke-width="4"/>` : "") +
		(look.caption ? captionText(36, look.caption, captionColor) : "") +
		nameText(look, look.caption ? 40 : 18, "#F0F0F0") +
		(look.sub ? text(130, 16, look.sub.toUpperCase(), look.active ? on : "#969696") : "")
	);
}

/** Caption text on every band: white, with the bands kept dark enough for it (owner, 2026-11-07). */
const INK = "#FFFFFF";

function styleB(look: KeyLook): string {
	const c = look.color ? panelColorsFor(look.color) : panelColors(look.theme);
	const on = look.accent ?? c.on;
	const band = 30;
	return (
		`<rect width="144" height="144" rx="18" fill="${c.deep}"/>` +
		(look.caption
			? `<rect width="144" height="${band}" rx="18" fill="${c.band}"/><rect y="16" width="144" height="${band - 16}" fill="${c.band}"/>` +
				captionText(21, look.caption, INK)
			: "") +
		(look.active ? `<rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${on}" stroke-width="5"/>` : "") +
		nameText(look, look.caption ? band : 0, look.active ? "#FFFFFF" : c.text) +
		(look.sub ? text(130, 16, look.sub.toUpperCase(), look.active ? on : c.text) : "")
	);
}

/** One dial's section of the touch strip (200 x 100), in the Panel style: caption band, value, status line. */
export type StripLook = { theme?: string; color?: string; caption: string; value: string; sub?: string; active?: boolean; accent?: string };

export function stripImage(look: StripLook): string {
	const c = look.color ? panelColorsFor(look.color) : panelColors(look.theme);
	const on = look.accent ?? c.on;
	const band = 24;
	const line = (y: number, base: number, raw: string, fill: string, width: number) => {
		let size = base;
		const value = raw.toUpperCase();
		while (size > 12 && value.length * size * CAPS_GLYPH > width) size--;
		const shown = value.length * size * CAPS_GLYPH > width ? `${value.slice(0, Math.floor(width / (size * CAPS_GLYPH)) - 1)}…` : value;
		return `<text x="100" y="${y}" text-anchor="middle" font-family="${FONT.family}" font-weight="${FONT.weight}" font-size="${size}" fill="${fill}">${escape(shown)}</text>`;
	};
	const lines = nameLines(look.value, 14);
	const valueSvg =
		lines.length === 1
			? line(look.sub ? 62 : 68, 24, lines[0], look.active ? "#FFFFFF" : c.text, 184)
			: line(50, 19, lines[0], look.active ? "#FFFFFF" : c.text, 184) + line(70, 19, lines[1], look.active ? "#FFFFFF" : c.text, 184);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">` +
		`<rect width="200" height="100" fill="#000000"/>` +
		`<rect x="2" y="2" width="196" height="96" rx="14" fill="${c.deep}"/>` +
		`<rect x="2" y="2" width="196" height="${band}" rx="14" fill="${c.band}"/><rect x="2" y="14" width="196" height="${band - 12}" fill="${c.band}"/>` +
		line(19, 14, look.caption, INK, 180) +
		(look.active ? `<rect x="4" y="4" width="192" height="92" rx="12" fill="none" stroke="${on}" stroke-width="3"/>` : "") +
		valueSvg +
		(look.sub ? line(90, 13, look.sub, look.active ? on : c.text, 184) : "") +
		`</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function keyImage(look: KeyLook): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#000000"/>` +
		(style === "A" ? styleA(look) : styleB(look)) +
		`</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
