import { App, Modal } from "obsidian";
import { buildPreviewDocument } from "./DocumentBuilder";
import { registerHeightHandler } from "./IframeBridge";
import { applyHeight, clampHeight, getDefaultHeight } from "./PreviewSizing";
import { createToolbar, SizingMode, ToolbarController } from "./Toolbar";
import { DEFAULT_CONFIG, HTMLPreviewConfig } from "./types";

export interface PreviewController {
	refresh(): void;
	dispose(): void;
}

export function createPreview(
	parentEl: HTMLElement,
	source: string,
	app: App,
	config: Readonly<HTMLPreviewConfig> = DEFAULT_CONFIG
): PreviewController {
	const wrapper = parentEl.createDiv({ cls: "html-preview-container" });
	let mode: SizingMode = config.autoHeight ? "auto" : "manual";
	let manualHeight = getDefaultHeight(config);
	let lastReportedHeight = 0;
	let disposed = false;
	let iframe: HTMLIFrameElement;

	const setSizingMode = (nextMode: SizingMode) => {
		mode = nextMode;
		wrapper.dataset.sizing = mode;
		toolbar.setSizingMode(mode);
		if (mode === "manual") {
			manualHeight = clampHeight(iframe.offsetHeight || manualHeight);
			applyHeight(iframe, manualHeight);
		} else if (lastReportedHeight > 0) {
			applyHeight(iframe, lastReportedHeight);
		}
	};

	const refresh = () => {
		if (disposed) return;
		iframe.srcdoc = buildPreviewDocument(source);
		if (mode === "manual") applyHeight(iframe, manualHeight);
	};

	const toolbar: ToolbarController = createToolbar(wrapper, mode, {
		onRefresh: refresh,
		onFullscreen: () => new HTMLPreviewModal(app, source).open(),
		onSizingModeChange: setSizingMode,
		getSource: () => source,
	});

	iframe = wrapper.createEl("iframe", {
		cls: "html-preview-iframe",
		attr: {
			sandbox: "allow-scripts allow-forms",
			loading: "lazy",
			title: "HTML preview",
		},
	});

	const resizeHandle = wrapper.createDiv({
		cls: "html-preview-resize-handle",
		attr: { "aria-hidden": "true" },
	});

	setSizingMode(mode);

	const unregisterHeightHandler = registerHeightHandler(iframe, (height) => {
		lastReportedHeight = clampHeight(height);
		if (mode === "auto") applyHeight(iframe, lastReportedHeight);
	});

	let activePointerId: number | null = null;
	let startY = 0;
	let startHeight = 0;

	const stopResize = () => {
		activePointerId = null;
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", stopResize);
		window.removeEventListener("pointercancel", stopResize);
	};

	const onPointerMove = (event: PointerEvent) => {
		if (activePointerId !== event.pointerId) return;
		manualHeight = clampHeight(startHeight + event.clientY - startY);
		applyHeight(iframe, manualHeight);
	};

	const onPointerDown = (event: PointerEvent) => {
		if (mode !== "manual" || activePointerId !== null) return;
		event.preventDefault();
		activePointerId = event.pointerId;
		startY = event.clientY;
		startHeight = iframe.offsetHeight;
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", stopResize);
		window.addEventListener("pointercancel", stopResize);
	};

	resizeHandle.addEventListener("pointerdown", onPointerDown);
	refresh();

	return {
		refresh,
		dispose: () => {
			if (disposed) return;
			disposed = true;
			stopResize();
			resizeHandle.removeEventListener("pointerdown", onPointerDown);
			unregisterHeightHandler();
			toolbar.dispose();
		},
	};
}

class HTMLPreviewModal extends Modal {
	private readonly html: string;
	private cleanup?: () => void;

	constructor(app: App, html: string) {
		super(app);
		this.html = html;
	}

	onOpen(): void {
		this.contentEl.addClass("html-preview-modal-content");
		const iframe = this.contentEl.createEl("iframe", {
			cls: "html-preview-modal-iframe",
			attr: {
				sandbox: "allow-scripts allow-forms",
				title: "Fullscreen HTML preview",
			},
		});
		iframe.srcdoc = buildPreviewDocument(this.html);
		this.cleanup = registerHeightHandler(iframe, (height) => {
			const maxHeight = Math.max(window.innerHeight - 80, 100);
			iframe.style.height = `${Math.min(clampHeight(height), maxHeight)}px`;
		});
	}

	onClose(): void {
		this.cleanup?.();
		this.cleanup = undefined;
		this.contentEl.empty();
	}
}
