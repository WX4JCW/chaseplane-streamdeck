import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";
import { existsSync, readdirSync, readFileSync, watch } from "node:fs";
import { join } from "node:path";

/** One ChasePlane group (camera profile), from its file in ChasePlane's `work\group` folder. */
export type Group = {
	guid: string;
	area: Area;
	name: string;
	/** ChasePlane's order within the area. */
	index: number;
	theme: string;
};

export type Area = "onboard" | "outside" | "world";
export const AREAS: Area[] = ["onboard", "outside", "world"];

/** ChasePlane keeps its groups here; the API does not report them. Read only, never written. */
const ROOT = join(process.env.APPDATA ?? "", "Microsoft Flight Simulator 2024", "WASM", "MSFS2024", "p42-util-chaseplane", "work", "group");
const DEBOUNCE_MS = 500;

/**
 * ChasePlane's groups, read from its group files and reread when they change, so new,
 * renamed and reordered groups show without a restart. Event: "groups" (list reloaded).
 */
class GroupLibrary extends EventEmitter {
	groups: Group[] = [];
	private timer: NodeJS.Timeout | null = null;

	start(): void {
		this.load();
		if (!existsSync(ROOT)) return;
		try {
			watch(ROOT, { recursive: true }, () => {
				if (this.timer) clearTimeout(this.timer);
				this.timer = setTimeout(() => this.load(), DEBOUNCE_MS);
			});
		} catch (error) {
			streamDeck.logger.warn(`cannot watch ${ROOT}: ${(error as Error).message}`);
		}
	}

	/** Groups of one area in ChasePlane's order. */
	inArea(area: Area): Group[] {
		return this.groups.filter((g) => g.area === area).sort((a, b) => a.index - b.index);
	}

	byGuid(guid?: string): Group | undefined {
		return this.groups.find((g) => g.guid === guid);
	}

	private load(): void {
		const groups: Group[] = [];
		for (const area of AREAS) {
			const dir = join(ROOT, area);
			if (!existsSync(dir)) continue;
			for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
				try {
					const j = JSON.parse(readFileSync(join(dir, file), "utf8"));
					groups.push({ guid: j.guid, area, name: j.name ?? "", index: Number(j.index ?? 0), theme: j.theme ?? "" });
				} catch {
					// ChasePlane may be writing the file; the watcher reloads once it is done.
				}
			}
		}
		this.groups = groups;
		this.emit("groups");
	}
}

export const groupLibrary = new GroupLibrary();
