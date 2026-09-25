import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewState, PreviewStateStore, SavedPreviewState } from "../src/PreviewStateStore";

const view = (manualHeight: number): PreviewState => ({
	mode: "manual", manualHeight, manualWidth: 640,
	viewportMode: "responsive", zoom: 1.2,
});

const save = () => vi.fn(async (_states: SavedPreviewState[]) => {});

afterEach(() => vi.useRealTimers());

describe("PreviewStateStore", () => {
	it("remembers adaptive height behavior for a block", async () => {
		const store = new PreviewStateStore(null, save());
		const block = store.bind("note.md", "<p>Short or long</p>", 3);
		block.onStateChange({ ...view(450), mode: "adaptive", manualWidth: null });
		await store.flush();
		const reloaded = new PreviewStateStore(store.serialize(), save());
		expect(reloaded.bind("note.md", "<p>Short or long</p>", 3).initialState).toMatchObject({
			mode: "adaptive", manualWidth: null,
		});
	});

	it("keeps duplicate HTML blocks and different notes independent across reloads", async () => {
		const persist = save();
		const store = new PreviewStateStore(null, persist);
		const first = store.bind("note.md", "<h1>same</h1>", 4);
		const second = store.bind("note.md", "<h1>same</h1>", 19);
		const otherNote = store.bind("other.md", "<h1>same</h1>", 4);
		expect(first.initialState).toBeUndefined();
		expect(second.initialState).toBeUndefined();
		first.onStateChange(view(300));
		second.onStateChange(view(600));
		otherNote.onStateChange(view(900));
		await store.flush();
		expect(persist).toHaveBeenCalledTimes(1);
		first.release();
		second.release();
		otherNote.release();

		const reloaded = new PreviewStateStore(persist.mock.calls[0][0], save());
		expect(reloaded.bind("note.md", "<h1>same</h1>", 4).initialState).toEqual(view(300));
		expect(reloaded.bind("note.md", "<h1>same</h1>", 19).initialState).toEqual(view(600));
		expect(reloaded.bind("other.md", "<h1>same</h1>", 4).initialState).toEqual(view(900));
	});

	it("prefers matching content at the closest line, then the line for edited content", async () => {
		const store = new PreviewStateStore(null, save());
		const a = store.bind("note.md", "block A", 3);
		const b = store.bind("note.md", "block B", 20);
		a.onStateChange(view(320));
		b.onStateChange(view(740));
		a.release();
		b.release();

		// A has moved onto B's old line; content must win over that exact line.
		const movedA = store.bind("note.md", "block A", 20);
		expect(movedA.initialState).toEqual(view(320));
		const movedB = store.bind("note.md", "block B", 35);
		expect(movedB.initialState).toEqual(view(740));
		movedA.release();
		movedB.release();
		const editedA = store.bind("note.md", "block A, edited", 20);
		expect(editedA.initialState).toEqual(view(320));
		editedA.release();
		await store.flush();
		const reloaded = new PreviewStateStore(store.serialize(), save());
		expect(reloaded.bind("note.md", "block A, edited", 20).initialState).toEqual(view(320));
		expect(reloaded.bind("note.md", "block B", 35).initialState).toEqual(view(740));
	});

	it("matches duplicate content to different closest unclaimed blocks after line shifts", () => {
		const store = new PreviewStateStore(null, save());
		const first = store.bind("note.md", "duplicate", 3);
		const second = store.bind("note.md", "duplicate", 23);
		first.onStateChange(view(350));
		second.onStateChange(view(750));
		first.release();
		second.release();

		const shiftedFirst = store.bind("note.md", "duplicate", 6);
		const shiftedSecond = store.bind("note.md", "duplicate", 26);
		expect(shiftedFirst.initialState).toEqual(view(350));
		expect(shiftedSecond.initialState).toEqual(view(750));
		// An unrecognized third block must not borrow a live block's state.
		expect(store.bind("note.md", "duplicate", 40).initialState).toBeUndefined();
	});

	it("does not restore or persist state without a reliable path and section line", async () => {
		const persist = save();
		const store = new PreviewStateStore(null, persist);
		const known = store.bind("note.md", "same", 0);
		known.onStateChange(view(510));
		for (const line of [undefined, -1, NaN, 1.5]) {
			const unknown = store.bind("note.md", "same", line);
			expect(unknown.initialState).toBeUndefined();
			unknown.onStateChange(view(900));
		}
		const noPath = store.bind("", "same", 0);
		noPath.onStateChange(view(900));
		await store.flush();
		expect(store.serialize()).toHaveLength(1);
		expect(persist).toHaveBeenCalledTimes(1);
		expect(store.bind("note.md", "same", 0).initialState).toEqual(view(510));
	});

	it("moves both saved states and active bindings when a note is renamed", async () => {
		const store = new PreviewStateStore(null, save());
		const existing = store.bind("old.md", "saved", 2);
		existing.onStateChange(view(400));
		const pending = store.bind("old.md", "unsaved", 15);
		store.rename("old.md", "renamed.md");
		pending.onStateChange(view(800));
		existing.onStateChange(view(450));
		existing.release();
		pending.release();
		await store.flush();
		const reloaded = new PreviewStateStore(store.serialize(), save());
		expect(reloaded.bind("renamed.md", "saved", 2).initialState).toEqual(view(450));
		expect(reloaded.bind("renamed.md", "unsaved", 15).initialState).toEqual(view(800));
		expect(reloaded.serialize().every((entry) => entry.path === "renamed.md")).toBe(true);
	});

	it("debounces repeated changes and flushes pending state without extra writes", async () => {
		vi.useFakeTimers();
		const persist = save();
		const store = new PreviewStateStore(null, persist, 400);
		const binding = store.bind("note.md", "source", 1);
		binding.onStateChange(view(100));
		await vi.advanceTimersByTimeAsync(350);
		binding.onStateChange(view(200));
		await vi.advanceTimersByTimeAsync(350);
		binding.onStateChange(view(300));
		expect(persist).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).toHaveBeenCalledTimes(1);
		expect(persist.mock.calls[0][0][0].state).toEqual(view(300));
		binding.onStateChange(view(500));
		await store.flush();
		expect(persist).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1000);
		expect(persist).toHaveBeenCalledTimes(2);
	});

	it("debounces settings with preview state and resolves settings saves after persistence", async () => {
		vi.useFakeTimers();
		let setting = 1;
		const writes: { setting: number; states: SavedPreviewState[] }[] = [];
		const store = new PreviewStateStore(null, async (states) => {
			writes.push({ setting, states });
		}, 400);
		const first = store.saveDebounced();
		const binding = store.bind("note.md", "source", 1);
		binding.onStateChange(view(300));
		await vi.advanceTimersByTimeAsync(200);
		setting = 2;
		const second = store.saveDebounced();
		binding.onStateChange(view(700));
		expect(writes).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(400);
		await Promise.all([first, second]);
		expect(writes).toEqual([{ setting: 2, states: store.serialize() }]);
	});

	it("serializes writes so newer settings and state cannot be overwritten by a slow save", async () => {
		let finishFirst!: () => void;
		const firstWrite = new Promise<void>((resolve) => { finishFirst = resolve; });
		let setting = 1;
		const writes: { setting: number; states: SavedPreviewState[] }[] = [];
		const store = new PreviewStateStore(null, async (states) => {
			writes.push({ setting, states });
			if (writes.length === 1) await firstWrite;
		});
		const binding = store.bind("note.md", "source", 1);
		binding.onStateChange(view(300));
		const flushing = store.flush();
		setting = 2;
		binding.onStateChange(view(700));
		store.requestSave(); // a settings change shares the same queue
		const anotherFlush = store.flush();
		finishFirst();
		await Promise.all([flushing, anotherFlush]);
		expect(writes).toHaveLength(2);
		expect(writes[0]).toMatchObject({ setting: 1, states: [{ state: view(300) }] });
		expect(writes[1]).toMatchObject({ setting: 2, states: [{ state: view(700) }] });
	});

	it("keeps pending changes available to retry after a failed save", async () => {
		const persist = vi.fn()
			.mockRejectedValueOnce(new Error("disk unavailable"))
			.mockResolvedValue(undefined);
		const store = new PreviewStateStore(null, persist);
		store.bind("note.md", "source", 1).onStateChange(view(300));
		await expect(store.flush()).rejects.toThrow("disk unavailable");
		await store.flush();
		expect(persist).toHaveBeenCalledTimes(2);
		expect(persist.mock.calls[1][0][0].state).toEqual(view(300));
	});

	it("ignores invalid saved records and rejects invalid state updates", async () => {
		const persist = save();
		const fixture = new PreviewStateStore(null, save());
		const binding = fixture.bind("note.md", "source", 1);
		binding.onStateChange(view(320));
		const valid = fixture.serialize()[0];
		const store = new PreviewStateStore([
			{ ...valid, state: { ...view(1), zoom: Number.POSITIVE_INFINITY } },
			{ ...valid, id: 2, lineStart: -1 },
			{ ...valid, id: 3 },
		], persist);
		expect(store.serialize()).toHaveLength(1);
		const restored = store.bind("note.md", "source", 1);
		expect(restored.initialState).toEqual(view(320));
		restored.onStateChange({ ...view(900), manualHeight: NaN });
		await store.flush();
		expect(persist).not.toHaveBeenCalled();
		expect(store.serialize()[0].state).toEqual(view(320));
	});
});
