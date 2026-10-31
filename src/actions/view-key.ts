/**
 * Line-break markers the owner types into a name in ChasePlane: " / " (a slash with spaces, which
 * ChasePlane keeps; "F/O" without spaces stays whole) or "|". ChasePlane drops "|" when it loads its
 * view files (2026-10-31: "GOPRO|CAPT 1" came back "GOPROCAPT 1"), so "|" only lasts until then.
 */
const BREAK = /\s+\/\s+|\s*\|\s*/;

/** A name for single-line places (dropdown, logs): a break marker becomes a space. */
export const plainName = (name: string): string =>
	name
		.split(BREAK)
		.map((s) => s.trim())
		.filter(Boolean)
		.join(" ");

/**
 * Splits a name into at most two lines: at the first break marker when it has one, otherwise at a
 * space, balancing their length, when longer than `max`.
 */
export function nameLines(name: string, max = 9): string[] {
	const parts = name.split(BREAK);
	if (parts.length > 1) return [parts[0].trim(), plainName(parts.slice(1).join(" "))].filter(Boolean);
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
