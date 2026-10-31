import { action, SingletonAction } from "@elgato/streamdeck";

import { currentStyle, keyImage, keyStyle, setKeyStyle } from "./key-style";

/**
 * TEMPORARY: switches every drawn key between style A (Edge) and B (Panel) so the owner can
 * compare them on the device (2026-10-31). Remove once a style is chosen.
 */
@action({ UUID: "com.acms.chaseplane.key-style" })
export class KeyStyleAction extends SingletonAction {
	constructor() {
		super();
		keyStyle.on("style", () => this.renderAll());
	}

	override onWillAppear(): void {
		this.renderAll();
	}

	override onKeyDown(): void {
		setKeyStyle(currentStyle() === "A" ? "B" : "A");
	}

	private renderAll(): void {
		const image = keyImage({ caption: "Key style", name: currentStyle() === "A" ? "A|Edge" : "B|Panel", sub: "press to switch" });
		for (const a of this.actions) {
			if (!a.isKey()) continue;
			void a.setImage(image);
			void a.setTitle("");
		}
	}
}
