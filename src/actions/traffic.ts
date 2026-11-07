import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";

import { chasePlane } from "../chaseplane/client";
import { keyImage, keyStyle } from "./key-style";
import { slotImage } from "./traffic-key";

type SlotSettings = { slot?: number };
type PageSettings = { direction?: number };

const EMPTY_IMAGE = "imgs/actions/traffic-slot/empty";

/**
 * Shared paging for the traffic slots. Page size is the highest slot number on screen,
 * so a page of 27 slots shows aircraft 1-27, 28-54, ...
 */
const paging = {
	page: 0,
	slots: new Map<string, number>(),
	get size(): number {
		return Math.max(1, ...this.slots.values());
	},
	get pages(): number {
		return Math.max(1, Math.ceil(chasePlane.traffic.length / this.size));
	},
	clamp(): void {
		this.page = Math.min(Math.max(0, this.page), this.pages - 1);
	},
};

const listeners = new Set<() => void>();
const redraw = (): void => {
	paging.clamp();
	for (const fn of listeners) fn();
};
chasePlane.on("traffic", redraw);
chasePlane.on("connection", () => {
	if (chasePlane.ready && paging.slots.size) void chasePlane.watchTraffic(true, "slots").catch(() => undefined);
	redraw();
});

/**
 * One position in the live traffic list. Shows the aircraft's callsign and type, switches
 * the camera to it on press, and glows while the camera is on that aircraft.
 */
@action({ UUID: "com.acms.chaseplane.traffic-slot" })
export class TrafficSlotAction extends SingletonAction<SlotSettings> {
	constructor() {
		super();
		listeners.add(() => this.renderAll());
	}

	override async onWillAppear(ev: WillAppearEvent<SlotSettings>): Promise<void> {
		const first = paging.slots.size === 0;
		paging.slots.set(ev.action.id, ev.payload.settings.slot ?? 1);
		if (first && chasePlane.ready) await chasePlane.watchTraffic(true, "slots").catch((e) => streamDeck.logger.warn(`traffic watch failed: ${e.message}`));
		redraw();
	}

	override async onWillDisappear(ev: WillDisappearEvent<SlotSettings>): Promise<void> {
		paging.slots.delete(ev.action.id);
		if (paging.slots.size === 0 && chasePlane.ready) await chasePlane.watchTraffic(false, "slots").catch(() => undefined);
	}

	override async onKeyDown(ev: KeyDownEvent<SlotSettings>): Promise<void> {
		const aircraft = this.aircraftFor(ev.action.id);
		if (!aircraft) {
			await ev.action.showAlert();
			return;
		}
		try {
			await chasePlane.viewTraffic(aircraft.uId);
		} catch (error) {
			streamDeck.logger.error(`cam_go_to_traffic ${aircraft.uId} failed: ${(error as Error).message}`);
			await ev.action.showAlert();
		}
	}

	private aircraftFor(id: string) {
		const slot = paging.slots.get(id);
		return slot ? chasePlane.traffic[paging.page * paging.size + slot - 1] : undefined;
	}

	private renderAll(): void {
		for (const a of this.actions) {
			if (!a.isKey()) continue;
			const aircraft = this.aircraftFor(a.id);
			if (aircraft) {
				// The key is drawn by the plugin (text in the airline color, glow when viewed), so state stays 0.
				void a.setState(0);
				void a.setImage(slotImage(aircraft, chasePlane.trackingId === aircraft.uId), { state: 0 });
				void a.setTitle("");
			} else {
				void a.setState(0);
				void a.setImage(EMPTY_IMAGE, { state: 0 });
				void a.setTitle("");
			}
		}
	}
}

/** Returns the camera to the user's aircraft. */
@action({ UUID: "com.acms.chaseplane.my-aircraft" })
export class MyAircraftAction extends SingletonAction {
	constructor() {
		super();
		keyStyle.on("style", () => this.renderAll());
	}

	override onWillAppear(): void {
		this.renderAll();
	}

	private renderAll(): void {
		const image = keyImage({ caption: "Camera", color: "hsl(140, 60%)", name: "My Aircraft" });
		for (const a of this.actions) if (a.isKey()) void a.setImage(image);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await chasePlane.trackUserAircraft();
		} catch (error) {
			streamDeck.logger.error(`user_aircraft_track failed: ${(error as Error).message}`);
			await ev.action.showAlert();
		}
	}
}

/** Previous (-1) or next (+1) page of traffic slots; the title shows the current page. */
@action({ UUID: "com.acms.chaseplane.traffic-page" })
export class TrafficPageAction extends SingletonAction<PageSettings> {
	constructor() {
		super();
		listeners.add(() => void this.renderAll());
	}

	override onWillAppear(): void {
		void this.renderAll();
	}

	override async onKeyDown(ev: KeyDownEvent<PageSettings>): Promise<void> {
		const next = paging.page + (ev.payload.settings.direction ?? 1);
		if (next < 0 || next >= paging.pages) {
			await ev.action.showAlert();
			return;
		}
		paging.page = next;
		redraw();
	}

	private async renderAll(): Promise<void> {
		const label = `${paging.page + 1}/${paging.pages}`;
		for (const a of this.actions) {
			if (!a.isKey()) continue;
			const { direction = 1 } = await a.getSettings();
			void a.setImage(`imgs/actions/traffic-page/${direction < 0 ? "prev" : "next"}`);
			void a.setTitle(label);
		}
	}
}
