import { describe, expect, it, vi } from "vitest";
import type { PreviewController } from "../src/HTMLPreviewProcessor";
import { PreviewRegistry } from "../src/PreviewRegistry";

function createController(): PreviewController {
	return {
		refresh: vi.fn(),
		dispose: vi.fn(),
	};
}

describe("PreviewRegistry", () => {
	it("refreshes only registered previews", () => {
		const registry = new PreviewRegistry();
		const active = createController();
		const removed = createController();
		registry.add(active);
		const unregister = registry.add(removed);
		unregister();

		registry.refreshAll();

		expect(active.refresh).toHaveBeenCalledOnce();
		expect(removed.refresh).not.toHaveBeenCalled();
	});

	it("disposes all previews and clears the registry", () => {
		const registry = new PreviewRegistry();
		const preview = createController();
		registry.add(preview);

		registry.disposeAll();
		registry.refreshAll();

		expect(preview.dispose).toHaveBeenCalledOnce();
		expect(preview.refresh).not.toHaveBeenCalled();
	});
});
