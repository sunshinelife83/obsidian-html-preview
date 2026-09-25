import { afterEach, describe, expect, it, vi } from "vitest";
import { getHeightReporterSource, isHeightMessage, registerHeightHandler } from "../src/IframeBridge";

describe("isHeightMessage", () => {
	it("accepts only finite height messages", () => {
		expect(isHeightMessage({ type: "html-preview-height", height: 120 })).toBe(true);
		expect(isHeightMessage({ type: "html-preview-height", height: Number.NaN })).toBe(false);
		expect(isHeightMessage({ type: "html-preview-height", height: 0 })).toBe(false);
		expect(isHeightMessage({ type: "html-preview-height", height: -1 })).toBe(false);
		expect(isHeightMessage({ type: "html-preview-height", height: "120" })).toBe(false);
		expect(isHeightMessage(null)).toBe(false);
	});

	it("reports height after layout-affecting changes", () => {
		const source = getHeightReporterSource();

		expect(source).toContain("ResizeObserver");
		expect(source).toContain("MutationObserver");
		expect(source).toContain("document.fonts");
		expect(source).toContain("querySelectorAll(\"img\")");
		expect(source).toContain("querySelectorAll(\"*\")");
		expect(source).toContain("window.addEventListener(\"resize\"");
		expect(source).not.toContain("window.innerHeight");
	});
});

describe("height reporter runtime", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("coalesces mutation bursts while still tracking out-of-flow height changes", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		let bottom = 300;
		const child = { getBoundingClientRect: () => ({ bottom }) };
		const queryDescendants = vi.fn(() => [child]);
		const body = {
			scrollHeight: 200,
			offsetHeight: 200,
			clientHeight: 200,
			getBoundingClientRect: () => ({ bottom: 200, height: 200 }),
			querySelectorAll: queryDescendants,
		};
		const documentElement = {
			scrollHeight: 200,
			clientHeight: 200,
			getBoundingClientRect: () => ({ top: 0 }),
		};
		const documentMock = {
			body,
			documentElement,
			scrollingElement: documentElement,
			readyState: "complete",
			querySelectorAll: () => [],
		};
		const posted = vi.fn();
		let notifyMutations: (mutations: Array<{ addedNodes: unknown[] }>) => void = () => {};
		class TestResizeObserver {
			observe() {}
			disconnect() {}
		}
		class TestMutationObserver {
			constructor(callback: typeof notifyMutations) {
				notifyMutations = callback;
			}
			observe() {}
			disconnect() {}
		}
		const windowMock = {
			setTimeout: window.setTimeout.bind(window),
			clearTimeout: window.clearTimeout.bind(window),
			setInterval: window.setInterval.bind(window),
			clearInterval: window.clearInterval.bind(window),
			requestAnimationFrame: (callback: () => void) => window.setTimeout(callback, 0),
			getComputedStyle: () => ({ marginTop: "0", marginBottom: "0", display: "block" }),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		};
		const runReporter = new Function(
			"window", "document", "parent", "ResizeObserver", "MutationObserver",
			getHeightReporterSource()
		);
		runReporter(windowMock, documentMock, { postMessage: posted }, TestResizeObserver, TestMutationObserver);
		vi.advanceTimersByTime(0);
		expect(posted).toHaveBeenLastCalledWith({ type: "html-preview-height", height: 300 }, "*");
		expect(queryDescendants).toHaveBeenCalledTimes(1);

		bottom = 450;
		for (let i = 0; i < 100; i++) notifyMutations([{ addedNodes: [] }]);
		vi.advanceTimersByTime(100);
		expect(queryDescendants).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBeLessThanOrEqual(5);

		vi.advanceTimersByTime(151);
		expect(posted).toHaveBeenLastCalledWith({ type: "html-preview-height", height: 450 }, "*");
		expect(queryDescendants).toHaveBeenCalledTimes(2);

		bottom = 100;
		notifyMutations([{ addedNodes: [] }]);
		vi.advanceTimersByTime(251);
		expect(posted).toHaveBeenLastCalledWith({ type: "html-preview-height", height: 200 }, "*");
		expect(queryDescendants).toHaveBeenCalledTimes(3);

		const image = { nodeType: 1, tagName: "IMG", complete: false, addEventListener: vi.fn() };
		notifyMutations([{ addedNodes: [image] }]);
		expect(image.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), { once: true });
		bottom = 500;
		const load = image.addEventListener.mock.calls.find(([type]) => type === "load")?.[1];
		load?.();
		vi.advanceTimersByTime(251);
		expect(posted).toHaveBeenLastCalledWith({ type: "html-preview-height", height: 500 }, "*");
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
