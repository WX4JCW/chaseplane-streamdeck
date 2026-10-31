import { readFileSync } from "node:fs";

import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";

// TEMPORARY: checks which SVG features Stream Deck's setImage renderer supports, for live glyph
// tinting (PLAN.md, Open, M6). Remove once the results are recorded.

const COLOR = "#E0457B";
const svg = (body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144">` +
	`<rect width="144" height="144" fill="#000000"/>${body}</svg>`;

const glyph = (): string => {
	const png = readFileSync("imgs/actions/camera/key@2x.png").toString("base64");
	return `data:image/png;base64,${png}`;
};

/** The glyph fills little of its 144 px image, so it is drawn 1.6x larger, centred. */
const SCALE = 1.6;
const SIZE = 144 * SCALE;
const POS = (144 - SIZE) / 2;
const image = (href: string, extra = "") =>
	`<image x="${POS}" y="${POS}" width="${SIZE}" height="${SIZE}" href="${href}" xlink:href="${href}"${extra}/>`;

const variants: Array<{ label: string; body: (href: string) => string }> = [
	{ label: "1 shapes", body: () => `<circle cx="72" cy="62" r="46" fill="${COLOR}"/>` },
	{ label: "2 image", body: (href) => image(href) },
	{
		label: "3 mask",
		body: (href) =>
			`<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="144" height="144">${image(href)}</mask></defs>` +
			`<rect width="144" height="144" fill="${COLOR}" mask="url(#m)"/>`,
	},
	{
		label: "4 filter",
		body: (href) =>
			`<defs><filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="144" height="144"><feColorMatrix type="matrix" values="` +
			`0 0 0 0 0.878  0 0 0 0 0.271  0 0 0 0 0.482  1.2 1.2 1.2 0 0"/></filter></defs>` +
			image(href, ` filter="url(#f)"`),
	},
	{
		// SVG's own animation (SMIL): does Stream Deck play it, or show only the first frame?
		label: "5 svg anim",
		body: (href) =>
			image(href) +
			`<rect x="9" y="9" width="126" height="126" rx="22" fill="none" stroke="${COLOR}" stroke-width="6">` +
			`<animate attributeName="stroke-opacity" values="0.15;1;0.15" dur="1.6s" repeatCount="indefinite"/></rect>`,
	},
	{
		// The plugin redraws the glow on a timer (see PULSE_FPS); this body is one frame.
		label: "6 timer",
		body: (href) => pulseFrame(href, 1),
	},
	// Glow built only from what Stream Deck draws (blur and gradients draw nothing), still frames.
	{ label: "7 soft edge", body: (href) => softEdge(1) + image(href) },
	{ label: "8 tint", body: (href) => tint(1) + image(href) },
	{ label: "9 halo", body: (href) => halo(href, 1) + image(href) },
];

/** Stacked outlines, wide and faint to narrow and bright, read as a soft light around the edge. */
function softEdge(opacity: number): string {
	const out: string[] = [];
	for (let i = 0; i < 12; i++) {
		const width = 30 - i * 2.4;
		out.push(`<rect x="10" y="10" width="124" height="124" rx="22" fill="none" stroke="${COLOR}" stroke-width="${width.toFixed(1)}" stroke-opacity="${(0.06 * opacity).toFixed(3)}"/>`);
	}
	out.push(`<rect x="10" y="10" width="124" height="124" rx="22" fill="none" stroke="${COLOR}" stroke-width="2" stroke-opacity="${(0.9 * opacity).toFixed(3)}"/>`);
	return out.join("");
}

/** Concentric faint rounded squares, densest in the middle, in place of a radial gradient. */
function tint(opacity: number): string {
	const out: string[] = [];
	for (let i = 0; i < 6; i++) {
		const inset = 10 + i * 9;
		out.push(`<rect x="${inset}" y="${inset}" width="${144 - inset * 2}" height="${144 - inset * 2}" rx="${22 - i * 2}" fill="${COLOR}" fill-opacity="${(0.035 * opacity).toFixed(3)}"/>`);
	}
	return out.join("");
}

/** The glyph recolored (color filter, which draws) and repeated around a ring, in place of a blurred halo. */
function halo(href: string, opacity: number): string {
	const out = [
		`<defs><filter id="tintglyph" filterUnits="userSpaceOnUse" x="0" y="0" width="144" height="144">` +
			`<feColorMatrix type="matrix" values="0 0 0 0 0.878  0 0 0 0 0.271  0 0 0 0 0.482  1.2 1.2 1.2 0 0"/></filter></defs>`,
	];
	for (const r of [3, 6]) {
		for (let k = 0; k < 8; k++) {
			const a = (k / 8) * 2 * Math.PI;
			const dx = (r * Math.cos(a)).toFixed(1);
			const dy = (r * Math.sin(a)).toFixed(1);
			out.push(`<g transform="translate(${dx} ${dy})" opacity="${((r === 3 ? 0.18 : 0.09) * opacity).toFixed(3)}">${image(href, ` filter="url(#tintglyph)"`)}</g>`);
		}
	}
	return out.join("");
}

/** Frames per second for the timer pulse, and one 3 s breath (1.6 s read as too fast on the deck). */
const PULSE_FPS = 10;
const PULSE_PERIOD_MS = 3000;
/**
 * One frame of a soft glow at `opacity` (0..1): a blurred light around the edge, a faint tint over
 * the key, and a blurred halo of the glyph in the glow color behind the glyph itself.
 */
function pulseFrame(href: string, opacity: number): string {
	return tint(opacity) + softEdge(opacity) + halo(href, opacity) + image(href);
}

/** Shows one SVG variant; each press moves to the next. The title names the variant. */
@action({ UUID: "com.acms.chaseplane.svg-test" })
export class SvgTestAction extends SingletonAction {
	private index = 0;

	override onWillAppear(ev: WillAppearEvent): Promise<void> | void {
		if (ev.action.isKey()) return this.show(ev.action);
	}

	override onKeyDown(ev: KeyDownEvent): Promise<void> {
		this.index = (this.index + 1) % variants.length;
		return this.show(ev.action);
	}

	private pulse: NodeJS.Timeout | null = null;

	private async show(target: { setImage(image: string): Promise<void>; setTitle(title: string): Promise<void> }): Promise<void> {
		const v = variants[this.index];
		if (this.pulse) clearInterval(this.pulse);
		this.pulse = null;
		if (v.label === "6 timer") {
			const href = glyph();
			const start = Date.now();
			this.pulse = setInterval(() => {
				const t = ((Date.now() - start) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
				const opacity = 0.15 + 0.85 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t));
				void target.setImage(`data:image/svg+xml;base64,${Buffer.from(svg(pulseFrame(href, opacity))).toString("base64")}`);
			}, 1000 / PULSE_FPS);
		}
		try {
			const image = svg(v.body(glyph()));
			await target.setImage(`data:image/svg+xml;base64,${Buffer.from(image).toString("base64")}`);
			await target.setTitle(v.label);
		} catch (error) {
			streamDeck.logger.error(`svg test ${v.label} failed: ${(error as Error).message}`);
			await target.setTitle(`${v.label}\nerror`);
		}
	}
}
