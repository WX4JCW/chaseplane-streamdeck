import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";

import { chasePlane } from "../chaseplane/client";

/** Shared shape of a ChasePlane on/off toggle: state 1 (glow) while on. */
abstract class ToggleAction extends SingletonAction {
	protected abstract readonly command: string;
	protected abstract isOn(): boolean;
	protected abstract toggle(): Promise<void>;

	protected constructor(event: "camera" | "flashlight") {
		super();
		chasePlane.on(event, () => this.renderAll());
		chasePlane.on("connection", () => this.renderAll());
	}

	override onWillAppear(ev: WillAppearEvent): Promise<void> | void {
		if (ev.action.isKey()) return ev.action.setState(this.state());
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await this.toggle();
		} catch (error) {
			streamDeck.logger.error(`${this.command} failed: ${(error as Error).message}`);
			await ev.action.showAlert();
		}
	}

	private state(): 0 | 1 {
		return chasePlane.ready && this.isOn() ? 1 : 0;
	}

	private renderAll(): void {
		const state = this.state();
		for (const a of this.actions) if (a.isKey()) void a.setState(state);
	}
}

@action({ UUID: "com.acms.chaseplane.flashlight" })
export class FlashlightAction extends ToggleAction {
	protected readonly command = "cam_flashlight_toggle";

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
