import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { chasePlane, viewLabel } from "../chaseplane/client";

type CameraSettings = {
	guid?: string;
};

/**
 * Switches ChasePlane to one saved camera view. State 1 (glow) while that view is the
 * active camera, state 0 otherwise. Only setState is used, so per-button images set in
 * the profile stay in charge.
 */
@action({ UUID: "com.acms.chaseplane.camera" })
export class CameraAction extends SingletonAction<CameraSettings> {
	private readonly settingsById = new Map<string, CameraSettings>();

	constructor() {
		super();
		chasePlane.on("camera", () => this.renderAll());
		chasePlane.on("connection", () => this.renderAll());
		chasePlane.on("views", () => this.sendViews());
	}

	override onWillAppear(ev: WillAppearEvent<CameraSettings>): Promise<void> | void {
		this.settingsById.set(ev.action.id, ev.payload.settings);
		return this.render(ev.action.id);
	}

	override onWillDisappear(ev: WillDisappearEvent<CameraSettings>): void {
		this.settingsById.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<CameraSettings>): Promise<void> | void {
		this.settingsById.set(ev.action.id, ev.payload.settings);
		return this.render(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<CameraSettings>): Promise<void> {
		const { guid } = ev.payload.settings;
		if (!guid) {
			await ev.action.showAlert();
			return;
		}
		try {
			await chasePlane.setView(guid);
		} catch (error) {
			streamDeck.logger.error(`set_view_by_guid ${guid} failed: ${(error as Error).message}`);
			await ev.action.showAlert();
		}
	}

	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, CameraSettings>): void {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getViews") this.sendViews();
	}

	/** Answers the property inspector's `getViews` datasource. */
	private sendViews(): void {
		if (streamDeck.ui.action?.manifestId !== this.manifestId) return;
		const items = chasePlane.views.map((view) => ({ label: viewLabel(view), value: view.guid }));
		void streamDeck.ui.sendToPropertyInspector({ event: "getViews", items });
	}

	private renderAll(): void {
		for (const id of this.settingsById.keys()) void this.render(id);
	}

	private async render(id: string): Promise<void> {
		const target = this.actions.find((a) => a.id === id);
		if (!target?.isKey()) return;
		const guid = this.settingsById.get(id)?.guid;
		const active = !!guid && chasePlane.activeGuid === guid;
		await target.setState(active ? 1 : 0);
	}
}
