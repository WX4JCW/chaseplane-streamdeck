import streamDeck, { action, KeyAction, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { EventEmitter } from "node:events";

import { chasePlane, type TrafficAircraft, type View } from "../chaseplane/client";
import { AREAS, type Group, groupLibrary } from "../chaseplane/groups";
import { keyImage, keyStyle, viewLook } from "./key-style";
import { slotLines } from "./traffic-key";
import { plainName } from "./view-key";

/**
 * A page of Deck Keys works like an app. Home: one row per area (onboard, outside, world), the
 * area's name in column 1, then its groups in ChasePlane's order; a group shows only while it has
 * views on the loaded aircraft. Group: A1 goes home, the other Deck Keys show the group's views in
 * ChasePlane's order, with the last two keys paging when the views do not fit. Everything is
 * drawn live from ChasePlane's views and group files; other actions on the page stay as they are.
 */
type Screen = { kind: "home" } | { kind: "group"; guid: string; page: number };
let screen: Screen = { kind: "home" };

/** Emits "screen" when the deck opens a group or goes home, so the keys and the dials follow. */
export const deckScreen = new EventEmitter();
/** The group open on the deck, if any. */
export const openGroupGuid = (): string | undefined => (screen.kind === "group" ? screen.guid : undefined);
/** Opens a group on the deck, or goes home without one. */
export function openGroup(guid?: string): void {
	screen = guid ? { kind: "group", guid, page: 0 } : { kind: "home" };
	deckScreen.emit("screen");
}

type Pos = { column: number; row: number };
type Role =
	| { kind: "none" }
	| { kind: "area"; label: string }
	| { kind: "group"; group: Group; count: number }
	| { kind: "home" }
	| { kind: "view"; view: View }
	| { kind: "aircraft"; aircraft: TrafficAircraft }
	| { kind: "page"; step: -1 | 1; label: string };

const TRAFFIC_THEME = "WORLD_TRAFFIC";
/** Whether the deck has a traffic group open, so the live aircraft list is needed. */
const trafficOpen = (): boolean => screen.kind === "group" && groupLibrary.byGuid(screen.guid)?.theme === TRAFFIC_THEME;

export const viewsOf = (guid: string): View[] =>
	chasePlane.views.filter((v) => v.profile_preset === guid).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

export const activeGroupGuid = (): string | undefined => chasePlane.views.find((v) => v.guid === chasePlane.activeGuid)?.profile_preset;

/** Groups the home screen shows: onboard, outside, world, each in ChasePlane's order, only those with views. */
export const visibleGroups = (): Group[] => AREAS.flatMap((area) => groupLibrary.inArea(area).filter((g) => viewsOf(g.guid).length > 0));

const BLANK = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><rect width="144" height="144" fill="#000000"/></svg>`).toString("base64")}`;

/** A seat view: the name ends in a row number and a seat letter ("1A", "SEAT 14F", "SEAT / 7A"). */
const SEAT = /(\d+)\s*([A-Z])$/;
const MIN_SEATS = 4;
const MAX_LETTERS = 3;
const SEAT_COLUMNS = 8;

/**
 * Lays out a group of passenger seats like a cabin seen from above: one deck row per seat letter
 * (A over F), seat rows front to back from column 2; the group's other views fill the free keys
 * after. ChasePlane's order alternates 1A, 1F, 6A..., which wrapped seats across the deck rows
 * (owner, 2026-10-31: "on the passenger views the rows got jumbled"). Returns false, leaving `out`
 * alone, when the group has too few seats or they do not fit.
 */
function seatMap(
	views: View[],
	slots: Array<{ id: string; pos: Pos }>,
	at: (column: number, row: number) => { id: string; pos: Pos } | undefined,
	out: Map<string, Role>,
): boolean {
	const seats = views.flatMap((v) => {
		const m = SEAT.exec(plainName(v.name));
		return m ? [{ view: v, row: Number(m[1]), letter: m[2] }] : [];
	});
	if (seats.length < MIN_SEATS) return false;
	const letters = [...new Set(seats.map((s) => s.letter))].sort();
	const rows = [...new Set(seats.map((s) => s.row))].sort((a, b) => a - b);
	if (letters.length > MAX_LETTERS || rows.length > SEAT_COLUMNS) return false;
	const placed = new Map<string, Role>();
	for (const s of seats) {
		const key = at(1 + rows.indexOf(s.row), 1 + letters.indexOf(s.letter));
		if (!key) return false;
		placed.set(key.id, { kind: "view", view: s.view });
	}
	const rest = views.filter((v) => !seats.some((s) => s.view === v));
	const free = slots.filter((k) => !placed.has(k.id));
	if (rest.length > free.length) return false;
	for (const [id, role] of placed) out.set(id, role);
	rest.forEach((v, i) => out.set(free[i].id, { kind: "view", view: v }));
	return true;
}

/** Works out every Deck Key's job from its position, for the current screen. */
function roles(keys: Array<{ id: string; pos: Pos }>): Map<string, Role> {
	const out = new Map<string, Role>();
	const at = (column: number, row: number) => keys.find((k) => k.pos.column === column && k.pos.row === row);
	for (const k of keys) out.set(k.id, { kind: "none" });

	if (screen.kind === "group") {
		const views = viewsOf(screen.guid);
		if (views.length === 0) screen = { kind: "home" };
	}

	if (screen.kind === "home") {
		AREAS.forEach((area, row) => {
			const label = at(0, row);
			if (label) out.set(label.id, { kind: "area", label: area.toUpperCase() });
			const groups = groupLibrary.inArea(area).filter((g) => viewsOf(g.guid).length > 0);
			const slots = keys.filter((k) => k.pos.row === row && k.pos.column > 0).sort((a, b) => a.pos.column - b.pos.column);
			slots.forEach((k, i) => {
				const g = groups[i];
				if (g) out.set(k.id, { kind: "group", group: g, count: viewsOf(g.guid).length });
			});
		});
		return out;
	}

	const home = at(0, 0);
	if (home) out.set(home.id, { kind: "home" });
	const slots = keys.filter((k) => k !== home).sort((a, b) => a.pos.row - b.pos.row || a.pos.column - b.pos.column);
	const views = viewsOf(screen.guid);
	if (seatMap(views, slots, at, out)) {
		screen.page = 0;
		return out;
	}
	// A traffic group (ChasePlane's World Traffic camera) lists the live AI aircraft after its views,
	// the same list the Traffic dial steps through (owner, 2026-10-31: the dial populated, the page did not).
	const items: Role[] = views.map((v): Role => ({ kind: "view", view: v }));
	if (groupLibrary.byGuid(screen.guid)?.theme === TRAFFIC_THEME) for (const a of chasePlane.traffic) items.push({ kind: "aircraft", aircraft: a });
	let size = slots.length;
	if (items.length > slots.length && slots.length > 2) {
		size = slots.length - 2;
		const pages = Math.ceil(items.length / size);
		screen.page = Math.min(Math.max(0, screen.page), pages - 1);
		out.set(slots[size].id, { kind: "page", step: -1, label: `◀ ${screen.page + 1}/${pages}` });
		out.set(slots[size + 1].id, { kind: "page", step: 1, label: `${screen.page + 1}/${pages} ▶` });
	} else screen.page = 0;
	items.slice(screen.page * size, screen.page * size + size).forEach((role, i) => out.set(slots[i].id, role));
	return out;
}

@action({ UUID: "com.acms.chaseplane.deck" })
export class DeckAction extends SingletonAction {
	private current = new Map<string, Role>();
	private drawn = new Map<string, string>();

	constructor() {
		super();
		for (const event of ["views", "camera", "connection"]) chasePlane.on(event, () => this.renderAll());
		// The aircraft list only matters while a traffic group is open.
		chasePlane.on("traffic", () => trafficOpen() && this.renderAll());
		chasePlane.on("connection", () => this.watchTrafficIfOpen());
		groupLibrary.on("groups", () => this.renderAll());
		keyStyle.on("style", () => this.renderAll());
		deckScreen.on("screen", () => {
			this.watchTrafficIfOpen();
			this.renderAll();
		});
	}

	/** Asks ChasePlane for the live AI list while a traffic group is open (the Traffic dial may already have). */
	private watchTrafficIfOpen(): void {
		if (trafficOpen() && chasePlane.ready) void chasePlane.watchTraffic(true).catch((e) => streamDeck.logger.warn(`traffic watch failed: ${e.message}`));
	}

	override onWillAppear(): void {
		this.renderAll();
	}

	override onWillDisappear(): void {
		this.drawn.clear();
		this.renderAll();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const role = this.current.get(ev.action.id);
		switch (role?.kind) {
			case "group":
				openGroup(role.group.guid);
				return;
			case "home":
				openGroup();
				return;
			case "page":
				if (screen.kind === "group") screen.page += role.step;
				break;
			case "view":
				try {
					await chasePlane.setView(role.view.guid);
				} catch (error) {
					streamDeck.logger.error(`deck view ${role.view.guid} failed: ${(error as Error).message}`);
					await ev.action.showAlert();
				}
				return;
			case "aircraft":
				try {
					await chasePlane.viewTraffic(role.aircraft.uId);
				} catch (error) {
					streamDeck.logger.error(`deck traffic ${role.aircraft.uId} failed: ${(error as Error).message}`);
					await ev.action.showAlert();
				}
				return;
			default:
				return;
		}
		this.renderAll();
	}

	private renderAll(): void {
		const keys: Array<{ id: string; pos: Pos; action: KeyAction<JsonObject> }> = [];
		for (const a of this.actions) if (a.isKey() && a.coordinates) keys.push({ id: a.id, pos: a.coordinates, action: a });
		this.current = roles(keys);
		const activeGroup = activeGroupGuid();
		for (const k of keys) {
			const role = this.current.get(k.id) ?? { kind: "none" };
			let image: string;
			switch (role.kind) {
				case "area":
					image = keyImage({ name: role.label, caption: "AREA" });
					break;
				case "group":
					image = keyImage({
						theme: role.group.theme,
						caption: role.group.area,
						name: role.group.name,
						sub: role.count === 1 ? "1 view" : `${role.count} views`,
						active: role.group.guid === activeGroup,
					});
					break;
				case "home":
					image = keyImage({ name: "Home", caption: screen.kind === "group" ? groupLibrary.byGuid(screen.guid)?.name : undefined });
					break;
				case "page":
					image = keyImage({ name: role.label, caption: "PAGE" });
					break;
				case "view":
					image = keyImage(viewLook(role.view, role.view.guid === chasePlane.activeGuid));
					break;
				case "aircraft": {
					const [identity, type, phase] = slotLines(role.aircraft);
					image = keyImage({ theme: TRAFFIC_THEME, caption: phase || "Traffic", name: identity, sub: type, active: chasePlane.trackingId === role.aircraft.uId });
					break;
				}
				default:
					image = BLANK;
			}
			if (this.drawn.get(k.id) === image) continue;
			this.drawn.set(k.id, image);
			void k.action.setImage(image);
			void k.action.setTitle("");
		}
	}
}
