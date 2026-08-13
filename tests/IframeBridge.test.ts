import { afterEach, describe, expect, it, vi } from "vitest";
import { isHeightMessage, registerHeightHandler } from "../src/IframeBridge";

describe("isHeightMessage", () => {
	it("accepts only finite height messages", () => {
		expect(isHeightMessage({ type: "html-preview-height", height: 120 })).toBe(true);
		expect(isHeightMessage({ type: "html-preview-height", height: Number.NaN })).toBe(false);
		expect(isHeightMessage({ type: "html-preview-height", height: "120" })).toBe(false);
		expect(isHeightMessage(null)).toBe(false);
	});
});

describe("registerHeightHandler", () => {
	afterEach(() => vi.restoreAllMocks());

	it("accepts messages only from the registered iframe", () => {
		const iframe = document.createElement("iframe");
		document.body.append(iframe);
		const handler = vi.fn();
		const unregister = registerHeightHandler(iframe, handler);

		window.dispatchEvent(new MessageEvent("message", {
			source: window,
			data: { type: "html-preview-height", height: 100 },
		}));
		window.dispatchEvent(new MessageEvent("message", {
			source: iframe.contentWindow,
			data: { type: "html-preview-height", height: 240 },
		}));

		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith(240);
		unregister();
		iframe.remove();
	});
});
