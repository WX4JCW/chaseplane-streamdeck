import { escape, fit, FONT } from "./traffic-key";

/** Splits a view name into at most two lines at a space, balancing their length, when longer than `max`. */
export function nameLines(name: string, max = 9): string[] {
	const words = name.split(/\s+/).filter(Boolean);
	if (words.length < 2 || name.length <= max) return [name];
	let best = [name];
	let bestDiff = Infinity;
	for (let i = 1; i < words.length; i++) {
		const a = words.slice(0, i).join(" ");
		const b = words.slice(i).join(" ");
		const diff = Math.abs(a.length - b.length);
		if (diff < bestDiff) [best, bestDiff] = [[a, b], diff];
	}
	return best;
}

/**
 * Draws a camera key for a view without a glyph: the view name (one or two lines) and its
 * LEFT/RIGHT tags in the theme's text color, with a glow outline in the theme's glow color
 * while it is the active camera. Returned as an SVG data URI for setImage.
 */
export function viewImage(name: string, tags: string, colors: { glow: string; text: string }, active: boolean): string {
	const glow = active
		? [
				[16, 0.08],
				[11, 0.14],
				[7, 0.25],
				[3.5, 1],
			]
				.map(([w, o]) => `<rect x="9" y="9" width="126" height="126" rx="22" fill="none" stroke="${colors.glow}" stroke-width="${w}" stroke-opacity="${o}"/>`)
				.join("")
		: "";
	const lines = nameLines(name);
	const text = (y: number, base: number, raw: string, opacity: number) => {
		const { value, size } = fit(raw, base);
		return `<text x="72" y="${y}" text-anchor="middle" font-family="${FONT.family}" font-weight="${FONT.weight}" font-size="${size}" fill="${colors.text}" fill-opacity="${opacity}">${escape(value)}</text>`;
	};
	const body =
		lines.length === 1
			? text(tags ? 72 : 82, 28, lines[0], 1)
			: text(tags ? 58 : 66, 25, lines[0], 1) + text(tags ? 88 : 96, 25, lines[1], 1);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#000000"/>` +
		(active ? `<rect x="9" y="9" width="126" height="126" rx="22" fill="${colors.glow}" fill-opacity="0.10"/>` : "") +
		glow +
		body +
		(tags ? text(118, 19, tags, 0.75) : "") +
		`</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
