import { action, SingletonAction } from "@elgato/streamdeck";

import { chasePlane } from "../chaseplane/client";
import { keyImage, keyStyle } from "./key-style";

const GREEN = "#3DDC84";
const RED = "#FF4D4D";

/** The loaded aircraft, from the views ChasePlane serves (shared views say "%GLOBAL%"). */
const aircraft = (): string => chasePlane.views.find((v) => v.aircraft_readable && v.aircraft_readable !== "%GLOBAL%")?.aircraft_readable ?? "";

/** Shows whether the plugin is connected to ChasePlane, and the loaded aircraft. */
@action({ UUID: "com.acms.chaseplane.status" })
export class StatusAction extends SingletonAction {
	constructor() {
		super();
		chasePlane.on("connection", () => this.renderAll());
		chasePlane.on("views", () => this.renderAll());
		keyStyle.on("style", () => this.renderAll());
	}

	override onWillAppear(): void {
		this.renderAll();
	}

	private renderAll(): void {
		const on = chasePlane.ready;
		const image = keyImage({
			caption: "ChasePlane",
			name: on ? "Connected" : "Offline",
			sub: on ? aircraft() : "waiting",
			active: true,
			accent: on ? GREEN : RED,
		});
		for (const a of this.actions) {
			if (!a.isKey()) continue;
			void a.setImage(image);
			void a.setTitle("");
		}
	}
}
