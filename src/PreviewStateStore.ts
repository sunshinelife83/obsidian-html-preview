export interface PreviewState {
	mode: "auto" | "manual" | "adaptive";
	manualHeight: number;
	manualWidth: number | null;
	viewportMode: "desktop" | "responsive";
	zoom: number;
}

export interface SavedPreviewState {
	id: number;
	path: string;
	lineStart: number;
	sourceHash: string;
	state: PreviewState;
}

export interface PreviewStateBinding {
	initialState?: PreviewState;
	onStateChange(state: PreviewState): void;
	release(): void;
}

type ActiveBinding = {
	path: string;
	lineStart: number;
	sourceHash: string;
	record?: SavedPreviewState;
};

function isValidState(value: unknown): value is PreviewState {
	if (!value || typeof value !== "object") return false;
	const state = value as Partial<PreviewState>;
	return (state.mode === "auto" || state.mode === "manual" || state.mode === "adaptive")
		&& typeof state.manualHeight === "number" && Number.isFinite(state.manualHeight) && state.manualHeight > 0
		&& (state.manualWidth === null || (typeof state.manualWidth === "number"
			&& Number.isFinite(state.manualWidth) && state.manualWidth > 0))
		&& (state.viewportMode === "desktop" || state.viewportMode === "responsive")
		&& typeof state.zoom === "number" && Number.isFinite(state.zoom) && state.zoom > 0;
}

function isValidLine(line: unknown): line is number {
	return typeof line === "number" && Number.isSafeInteger(line) && line >= 0;
}

function hashSource(source: string): string {
	// Include the length to make collisions between short, similar blocks less likely.
	let hash = 2166136261;
	for (let i = 0; i < source.length; i++) {
		hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
	}
	return `${source.length.toString(36)}:${(hash >>> 0).toString(36)}`;
}

export class PreviewStateStore {
	private readonly records: SavedPreviewState[] = [];
	private readonly active = new Set<ActiveBinding>();
	private nextId = 1;
	private revision = 0;
	private savedRevision = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private saving: Promise<void> | null = null;
	private waiting: Array<{
		revision: number;
		resolve: () => void;
		reject: (error: unknown) => void;
	}> = [];

	constructor(
		stored: unknown,
		private readonly save: (states: SavedPreviewState[]) => Promise<void>,
		private readonly debounceMs = 400
	) {
		if (!Array.isArray(stored)) return;
		const ids = new Set<number>();
		for (const item of stored) {
			if (!item || typeof item !== "object") continue;
			const record = item as Partial<SavedPreviewState>;
			if (!isValidLine(record.id) || record.id === 0 || ids.has(record.id)
				|| typeof record.path !== "string" || !record.path
				|| !isValidLine(record.lineStart) || typeof record.sourceHash !== "string"
				|| !record.sourceHash || !isValidState(record.state)) continue;
			ids.add(record.id);
			this.records.push({
				id: record.id,
				path: record.path,
				lineStart: record.lineStart,
				sourceHash: record.sourceHash,
				state: { ...record.state },
			});
			this.nextId = Math.max(this.nextId, record.id + 1);
		}
	}

	serialize(): SavedPreviewState[] {
		return this.records.map((record) => ({ ...record, state: { ...record.state } }));
	}

	bind(path: string, source: string, lineStart: number | undefined): PreviewStateBinding {
		if (!path || !isValidLine(lineStart)) {
			return { onStateChange: () => {}, release: () => {} };
		}

		const sourceHash = hashSource(source);
		const claimed = new Set([...this.active]
			.filter((binding) => binding.lineStart !== lineStart && binding.record)
			.map((binding) => binding.record!.id));
		const available = this.records.filter((record) => record.path === path && !claimed.has(record.id));
		const closest = (records: SavedPreviewState[]) => records.sort((a, b) =>
			Math.abs(a.lineStart - lineStart) - Math.abs(b.lineStart - lineStart) || a.id - b.id
		)[0];
		// Content wins over a reused line; the line is a fallback for an edited block.
		let record = closest(available.filter((entry) => entry.sourceHash === sourceHash))
			?? available.find((entry) => entry.lineStart === lineStart);
		const binding: ActiveBinding = { path, lineStart, sourceHash, record };
		this.active.add(binding);
		const initialState = record ? { ...record.state } : undefined;

		if (record && (record.lineStart !== lineStart || record.sourceHash !== sourceHash)) {
			record.lineStart = lineStart;
			record.sourceHash = sourceHash;
			this.requestSave();
		}

		return {
			initialState,
			onStateChange: (state) => {
				if (!this.active.has(binding) || !isValidState(state)) return;
				if (!record) {
					record = {
						id: this.nextId++, path: binding.path, lineStart, sourceHash,
						state: { ...state },
					};
					binding.record = record;
					this.records.push(record);
				} else {
					if (Object.keys(state).every((key) => state[key as keyof PreviewState] === record.state[key as keyof PreviewState])) return;
					record.state = { ...state };
				}
				this.requestSave();
			},
			release: () => { this.active.delete(binding); },
		};
	}

	rename(oldPath: string, newPath: string): void {
		if (!oldPath || !newPath || oldPath === newPath) return;
		let changed = false;
		for (const record of this.records) {
			if (record.path !== oldPath) continue;
			record.path = newPath;
			changed = true;
		}
		for (const binding of this.active) {
			if (binding.path === oldPath) binding.path = newPath;
		}
		if (changed) this.requestSave();
	}

	requestSave(): void {
		this.revision++;
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush().catch((error: unknown) => console.error("HTML preview: failed to save state", error));
		}, this.debounceMs);
	}

	saveDebounced(): Promise<void> {
		this.requestSave();
		return new Promise((resolve, reject) => {
			this.waiting.push({ revision: this.revision, resolve, reject });
		});
	}

	flush(): Promise<void> {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		if (!this.saving && this.revision > this.savedRevision) {
			this.saving = this.writePending().finally(() => { this.saving = null; });
		}
		return this.saving ?? Promise.resolve();
	}

	private async writePending(): Promise<void> {
		// Never overlap saveData calls: later settings/state must not be overwritten
		// by an older write finishing last.
		while (this.savedRevision < this.revision) {
			const revision = this.revision;
			try {
				await this.save(this.serialize());
			} catch (error) {
				for (const waiter of this.waiting.splice(0)) waiter.reject(error);
				throw error;
			}
			this.savedRevision = revision;
			this.waiting = this.waiting.filter((waiter) => {
				if (waiter.revision > revision) return true;
				waiter.resolve();
				return false;
			});
		}
	}
}
