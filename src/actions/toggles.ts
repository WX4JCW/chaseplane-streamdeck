import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { chasePlane } from "../chaseplane/client";
import { keyImage, keyStyle } from "./key-style";

/** Shared shape of a ChasePlane on/off toggle, drawn in the deck's key style; the ring shows "on". */
abstract class ToggleAction extends SingletonAction {
	protected abstract readonly command: string;
	protected abstract readonly label: string;
	/** Its own color, so the key is easy to find (owner, 2026-11-01). */
	protected abstract readonly color: string;
	protected abstract isOn(): boolean;
	protected abstract toggle(): Promise<void>;

	protected constructor(event: "camera" | "flashlight") {
		super();
		chasePlane.on(event, () => this.renderAll());
		chasePlane.on("connection", () => this.renderAll());
		keyStyle.on("style", () => this.renderAll());
	}

	override onWillAppear(): void {
		this.renderAll();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await this.toggle();
		} catch (error) {
			streamDeck.logger.error(`${this.command} failed: ${(error as Error).message}`);
			await ev.action.showAlert();
		}
	}

	private renderAll(): void {
		const on = chasePlane.ready && this.isOn();
		const image = keyImage({ caption: "ChasePlane", color: this.color, name: this.label, sub: chasePlane.ready ? (on ? "on" : "off") : "", active: on });
		for (const a of this.actions) {
			if (!a.isKey()) continue;
			// Drawn key: the image shows on/off, so state stays 0 and the title stays empty.
			void a.setState(0);
			void a.setImage(image, { state: 0 });
			void a.setTitle("");
		}
	}
}

@action({ UUID: "com.acms.chaseplane.flashlight" })
export class FlashlightAction extends ToggleAction {
	protected readonly command = "cam_flashlight_toggle";
	protected readonly label = "Flashlight";
	protected readonly color = "hsl(52, 90%)";

	constructor() {
		super("flashlight");
	}

	protected isOn(): boolean {
		return chasePlane.flashlight;
	}

	protected toggle(): Promise<void> {
		return chasePlane.toggleFlashlight();
	}
}

@action({ UUID: "com.acms.chaseplane.cinematic" })
export class CinematicAction extends ToggleAction {
	protected readonly command = "cam_cinematic_toggle";
	protected readonly label = "Cinematic";
	protected readonly color = "hsl(8, 80%)";

	constructor() {
		super("camera");
	}

	protected isOn(): boolean {
		return chasePlane.camera?.cinematic_enabled === true;
	}

	protected toggle(): Promise<void> {
		return chasePlane.toggleCinematic();
	}
}
