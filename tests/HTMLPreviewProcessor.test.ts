import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { createPreview } from "../src/HTMLPreviewProcessor";
import { DEFAULT_CONFIG } from "../src/types";
import type { PreviewState } from "../src/PreviewStateStore";

vi.mock("../src/DocumentBuilder", () => ({ buildPreviewDocument: () => "<p>Preview</p>" }));
const heightBridge = vi.hoisted(() => ({ report: undefined as ((height: number) => void) | undefined }));
vi.mock("../src/IframeBridge", () => ({ registerHeightHandler: (_: HTMLIFrameElement, callback: (height: number) => void) => {
	heightBridge.report = callback;
	return () => { heightBridge.report = undefined; };
} }));
vi.mock("../src/PreviewModal", () => ({ HTMLPreviewModal: class {} }));
vi.mock("../src/Toolbar", () => ({
	createToolbar: () => ({
		setSizingMode: () => {},
		setViewportMode: () => {},
		setZoom: () => {},
		setStatus: () => {},
		dispose: () => {},
	}),
}));

const helpers = ["createEl", "createDiv", "createSpan", "setText", "toggleClass"];

beforeAll(() => {
	Object.defineProperties(HTMLElement.prototype, {
		createEl: { configurable: true, value: function (tag: string, options: {
			cls?: string; text?: string; attr?: Record<string, string>;
		} = {}) {
			const child = document.createElement(tag);
			if (options.cls) child.className = options.cls;
			if (options.text) child.textContent = options.text;
			for (const [key, value] of Object.entries(options.attr ?? {})) child.setAttribute(key, value);
			this.appendChild(child);
			return child;
		} },
		createDiv: { configurable: true, value: function (options?: object) { return this.createEl("div", options); } },
		createSpan: { configurable: true, value: function (options?: object) { return this.createEl("span", options); } },
		setText: { configurable: true, value: function (value: string) { this.textContent = value; } },
		toggleClass: { configurable: true, value: function (name: string, enabled: boolean) { this.classList.toggle(name, enabled); } },
	});
});

afterAll(() => {
	for (const helper of helpers) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[helper];
});

describe("manual preview resizing", () => {
	it("supports click-to-step sizing and keyboard resizing with accessible controls", () => {
		const parent = document.createElement("div");
		Object.defineProperty(parent, "clientWidth", { value: 900 });
		const controller = createPreview(parent, "<p>Preview</p>", {} as App, {
			...DEFAULT_CONFIG, defaultSizingMode: "manual", defaultHeight: 500,
		});
		const wrapper = parent.querySelector<HTMLElement>(".html-preview-container")!;
		vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
			width: Number.parseInt(wrapper.style.width, 10) || 900,
			height: 500,
		} as DOMRect));
		const viewport = parent.querySelector<HTMLElement>(".html-preview-viewport")!;
		const heightGrip = parent.querySelector<HTMLElement>(".html-preview-resize-handle")!;
		const corner = parent.querySelector<HTMLElement>(".html-preview-corner-handle")!;
		const button = (label: string) => parent.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

		expect(heightGrip.getAttribute("aria-controls")).toBe(viewport.id);
		expect(corner.getAttribute("role")).toBe("button");
		expect(corner.parentElement).not.toBe(heightGrip);
		button("Decrease preview height by 50 pixels").click();
		expect(viewport.style.height).toBe("450px");
		expect(heightGrip.getAttribute("aria-valuenow")).toBe("450");
		button("Decrease preview width by 50 pixels").click();
		expect(wrapper.style.width).toBe("850px");
		button("Increase preview width by 50 pixels").click();
		expect(wrapper.style.width).toBe("");
		expect(button("Increase preview width by 50 pixels").disabled).toBe(true);

		heightGrip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(viewport.style.height).toBe("460px");
		corner.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
		expect(wrapper.style.width).toBe("890px");
		corner.click();
		expect(wrapper.style.width).toBe("");
		button("Decrease preview width by 50 pixels").click();
		corner.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(wrapper.style.width).toBe("");
		for (let i = 0; i < 12; i++) button("Decrease preview height by 50 pixels").click();
		expect(viewport.style.height).toBe("50px");
		expect(button("Decrease preview height by 50 pixels").disabled).toBe(true);
		controller.dispose();
	});

	it("tracks the pointer over an iframe, follows the centered edge, and saves on release", () => {
		const parent = document.createElement("div");
		Object.defineProperty(parent, "clientWidth", { value: 900 });
		const saved: PreviewState[] = [];
		const controller = createPreview(parent, "<p>Preview</p>", {} as App,
			{ ...DEFAULT_CONFIG, defaultSizingMode: "manual" },
			{ onStateChange: (state) => saved.push(state) }
		);
		const wrapper = parent.querySelector<HTMLElement>(".html-preview-container")!;
		const corner = parent.querySelector<HTMLElement>(".html-preview-corner-handle")!;
		const viewport = parent.querySelector<HTMLElement>(".html-preview-viewport")!;
		vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
			width: Number.parseInt(wrapper.style.width, 10) || 900,
		} as DOMRect));
		const capture = vi.fn();
		const release = vi.fn();
		corner.setPointerCapture = capture;
		corner.hasPointerCapture = () => true;
		corner.releasePointerCapture = release;
		const pointer = (type: string, x: number, y: number, pointerId = 7) => {
			const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 });
			Object.defineProperty(event, "pointerId", { value: pointerId });
			return event as PointerEvent;
		};
		corner.dispatchEvent(pointer("pointerdown", 800, 400));
		expect(capture).toHaveBeenCalledWith(7);
		window.dispatchEvent(pointer("pointermove", 700, 500));
		expect(wrapper.style.width).toBe("700px");
		expect(viewport.style.height).toBe("600px");
		expect(saved).toHaveLength(0);
		window.dispatchEvent(pointer("pointerup", 700, 500, 8));
		expect(wrapper.dataset.resizing).toBe("corner");
		window.dispatchEvent(pointer("pointerup", 700, 500));
		expect(wrapper.dataset.resizing).toBeUndefined();
		expect(release).toHaveBeenCalledWith(7);
		expect(saved).toMatchObject([{ manualWidth: 700, manualHeight: 600, mode: "manual" }]);

		corner.dispatchEvent(pointer("pointerdown", 700, 500));
		window.dispatchEvent(pointer("pointermove", 810, 500));
		expect(wrapper.style.width).toBe("");
		window.dispatchEvent(pointer("pointerup", 810, 500));
		expect(saved[1].manualWidth).toBeNull();
		controller.dispose();
	});

	it("restores the saved size, viewport and zoom before showing a block", () => {
		const parent = document.createElement("div");
		let parentWidth = 500;
		Object.defineProperty(parent, "clientWidth", { get: () => parentWidth });
		const restored: PreviewState = {
			mode: "manual", manualHeight: 740, manualWidth: 630,
			viewportMode: "responsive", zoom: 1.4,
		};
		const saved = vi.fn();
		const controller = createPreview(parent, "HTML", {} as App, DEFAULT_CONFIG, {
			initialState: restored, onStateChange: saved,
		});
		const wrapper = parent.querySelector<HTMLElement>(".html-preview-container")!;
		expect(wrapper.style.width).toBe("500px");
		parentWidth = 900;
		window.dispatchEvent(new Event("resize"));
		expect(wrapper.style.width).toBe("630px");
		expect(parent.querySelector<HTMLElement>(".html-preview-viewport")!.style.height).toBe("740px");
		expect(parent.querySelector<HTMLElement>(".html-preview-iframe")!.style.transform).toBe("scale(1.4)");
		expect(saved).not.toHaveBeenCalled();
		controller.dispose();
	});

	it("uses a 16:9 scrolling viewport for long pages and fits only short pages", () => {
		const parent = document.createElement("div");
		Object.defineProperty(parent, "clientWidth", { value: 800 });
		const saved = vi.fn();
		const controller = createPreview(parent, "HTML", {} as App, DEFAULT_CONFIG,
			{ onStateChange: saved });
		const wrapper = parent.querySelector<HTMLElement>(".html-preview-container")!;
		const viewport = parent.querySelector<HTMLElement>(".html-preview-viewport")!;
		const iframe = parent.querySelector<HTMLIFrameElement>(".html-preview-iframe")!;

		expect(wrapper.dataset.sizing).toBe("manual");
		expect(viewport.style.height).toBe("450px");
		expect(iframe.getAttribute("scrolling")).toBe("auto");
		heightBridge.report?.(600);
		expect(wrapper.dataset.sizing).toBe("auto");
		expect(viewport.style.height).toBe("600px");
		expect(iframe.getAttribute("scrolling")).toBe("no");
		heightBridge.report?.(601);
		expect(wrapper.dataset.sizing).toBe("manual");
		expect(viewport.style.height).toBe("450px");
		expect(saved).not.toHaveBeenCalled();

		parent.querySelector<HTMLButtonElement>('button[aria-label="Increase preview height by 50 pixels"]')!.click();
		expect(viewport.style.height).toBe("500px");
		expect(saved).toHaveBeenCalledWith(expect.objectContaining({ mode: "manual", manualHeight: 500 }));
		heightBridge.report?.(300);
		expect(wrapper.dataset.sizing).toBe("manual");
		controller.dispose();
	});

	it("keeps a 16:9 scrolling height when the preview width changes", () => {
		const parent = document.createElement("div");
		Object.defineProperty(parent, "clientWidth", { value: 800 });
		const saved = vi.fn();
		const controller = createPreview(parent, "HTML", {} as App, DEFAULT_CONFIG,
			{ onStateChange: saved });
		const wrapper = parent.querySelector<HTMLElement>(".html-preview-container")!;
		const viewport = parent.querySelector<HTMLElement>(".html-preview-viewport")!;
		Object.defineProperty(viewport, "clientWidth", {
			get: () => Number.parseInt(wrapper.style.width, 10) || 800,
		});
		heightBridge.report?.(1000);
		parent.querySelector<HTMLButtonElement>('button[aria-label="Decrease preview width by 50 pixels"]')!.click();
		expect(wrapper.style.width).toBe("750px");
		expect(viewport.style.height).toBe("422px");
		expect(saved).toHaveBeenCalledWith(expect.objectContaining({ mode: "adaptive", manualWidth: 750 }));
		controller.dispose();
	});

	it("restores adaptive behavior after a block rerender and accounts for zoom", () => {
		const parent = document.createElement("div");
		Object.defineProperty(parent, "clientWidth", { value: 800 });
		const controller = createPreview(parent, "HTML", {} as App, DEFAULT_CONFIG, {
			initialState: {
				mode: "adaptive", manualHeight: 450, manualWidth: null,
				viewportMode: "responsive", zoom: 1.5,
			},
		});
		const wrapper = parent.querySelector<HTMLElement>(".html-preview-container")!;
		const viewport = parent.querySelector<HTMLElement>(".html-preview-viewport")!;
		heightBridge.report?.(400);
		expect(wrapper.dataset.sizing).toBe("auto");
		expect(viewport.style.height).toBe("600px");
		heightBridge.report?.(401);
		expect(wrapper.dataset.sizing).toBe("manual");
		expect(viewport.style.height).toBe("450px");
		controller.dispose();
	});
});
