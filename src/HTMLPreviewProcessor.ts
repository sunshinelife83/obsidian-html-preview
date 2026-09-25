import { App } from "obsidian";
import { buildPreviewDocument } from "./DocumentBuilder";
import { registerHeightHandler } from "./IframeBridge";
import { HTMLPreviewModal } from "./PreviewModal";
import {
	AUTO_HEIGHT_SAFETY_LIMIT,
	clampAutoHeight,
	clampManualHeight,
	clampPreviewWidth,
	clampZoom,
	fitsShortPage,
	getAspectRatioHeight,
	getDefaultHeight,
	MAX_MANUAL_PREVIEW_HEIGHT,
	MAX_ZOOM,
	MIN_PREVIEW_HEIGHT,
	MIN_PREVIEW_WIDTH,
	MIN_ZOOM,
	ZOOM_STEP,
} from "./PreviewSizing";
import { createToolbar, SizingMode, ToolbarController } from "./Toolbar";
import type { PreviewState } from "./PreviewStateStore";
import { DEFAULT_CONFIG, HTMLPreviewConfig, PreviewViewportMode } from "./types";

export interface PreviewController {
	refresh(): void;
	dispose(): void;
}

type ResizeKind = "height" | "corner";
let nextPreviewId = 0;

function setIframeScrolling(iframe: HTMLIFrameElement, enabled: boolean): void {
	iframe.setAttribute("scrolling", enabled ? "auto" : "no");
	iframe.style.overflow = enabled ? "auto" : "hidden";
}

function getPositivePixelValue(value: number, fallback: number): number {
	if (!Number.isFinite(value) || value <= 0) return fallback;
	return Math.max(1, Math.round(value));
}

export function createPreview(
	parentEl: HTMLElement,
	source: string,
	app: App,
	config: Readonly<HTMLPreviewConfig> = DEFAULT_CONFIG,
	options?: { initialState?: PreviewState; onStateChange?: (state: PreviewState) => void }
): PreviewController {
	const wrapper = parentEl.createDiv({ cls: "html-preview-container" });
	const restored = options?.initialState;
	let sizingPreference = restored?.mode ?? config.defaultSizingMode;
	let mode: SizingMode = sizingPreference === "auto" ? "auto" : "manual";
	let viewportMode: PreviewViewportMode = restored?.viewportMode ?? config.defaultViewportMode;
	let zoom = clampZoom(restored?.zoom ?? config.defaultZoom);
	let manualHeight = clampManualHeight(restored?.manualHeight ?? getDefaultHeight(config));
	let manualWidth: number | null = restored?.manualWidth ?? null;
	let initialized = false;
	const saveState = () => {
		if (!initialized) return;
		options?.onStateChange?.({ mode: sizingPreference, viewportMode, zoom, manualHeight, manualWidth });
	};
	let lastReportedHeight = 0;
	let currentScale = 1;
	let currentRawWidth = config.desktopViewportWidth;
	let disposed = false;
	let activePointerId: number | null = null;
	let activeResizeKind: ResizeKind | null = null;
	let cornerDragged = false;
	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let dragHandle: HTMLElement | null = null;
	let dragChanged = false;
	let startHeight = 0;
	let lastLayoutWidth = 0;
	let iframe: HTMLIFrameElement;
	let viewportEl: HTMLElement;
	let stageEl: HTMLElement;
	let resizeHandle: HTMLElement;
	let cornerHandle: HTMLElement;
	let heightMinusButton: HTMLButtonElement;
	let heightPlusButton: HTMLButtonElement;
	let widthMinusButton: HTMLButtonElement;
	let widthPlusButton: HTMLButtonElement;
	let resizeLabel: HTMLElement;
	let toolbar: ToolbarController;
	const sizeButtonDisposers: Array<() => void> = [];

	const getAvailableWidth = () => getPositivePixelValue(
		viewportEl.clientWidth || wrapper.clientWidth || parentEl.clientWidth,
		config.desktopViewportWidth
	);

	const getMaximumWrapperWidth = () => getPositivePixelValue(
		parentEl.clientWidth || parentEl.parentElement?.clientWidth || wrapper.clientWidth,
		wrapper.clientWidth || config.desktopViewportWidth
	);

	const getEffectiveViewportMode = (availableWidth = getAvailableWidth()): PreviewViewportMode => {
		if (viewportMode === "desktop" && availableWidth <= config.responsiveViewportBreakpoint) {
			return "responsive";
		}
		return viewportMode;
	};

	const getRawViewportWidth = (availableWidth: number, effectiveMode: PreviewViewportMode) => {
		if (effectiveMode === "responsive") return availableWidth;
		return Math.max(config.desktopViewportWidth, availableWidth);
	};

	const getScaledHeight = (rawHeight: number) => Math.max(
		MIN_PREVIEW_HEIGHT,
		Math.ceil(rawHeight * currentScale)
	);

	const updateStatus = () => {
		const effectiveMode = getEffectiveViewportMode();
		const viewportLabel = effectiveMode === "desktop"
			? `Desktop ${currentRawWidth}px`
			: `Responsive ${currentRawWidth}px`;
		const heightLabel = sizingPreference === "adaptive"
			? (mode === "auto" ? "Fit short page" : `16:9 scroll · ${Math.round(manualHeight)}px high`)
			: (mode === "auto" ? "Fit height" : `${Math.round(manualHeight)}px high`);
		toolbar.setStatus(`${viewportLabel} · ${Math.round(zoom * 100)}% · ${heightLabel}`);
	};

	const updateResizeHandle = () => {
		const roundedHeight = Math.round(manualHeight);
		const visibleWidth = manualWidth === null ? null : clampPreviewWidth(manualWidth, getMaximumWrapperWidth());
		const widthLabel = visibleWidth === null ? "Full width" : `${Math.round(visibleWidth)}px wide`;
		resizeLabel.setText(`Height ${roundedHeight}px · ${widthLabel}`);
		resizeHandle.setAttribute("aria-valuenow", String(roundedHeight));
		resizeHandle.setAttribute("aria-valuetext", `${roundedHeight} pixels`);
		heightMinusButton.disabled = manualHeight <= MIN_PREVIEW_HEIGHT;
		heightPlusButton.disabled = manualHeight >= MAX_MANUAL_PREVIEW_HEIGHT;
		const width = visibleWidth ?? getMaximumWrapperWidth();
		widthMinusButton.disabled = width <= Math.min(MIN_PREVIEW_WIDTH, getMaximumWrapperWidth());
		widthPlusButton.disabled = visibleWidth === null || width >= getMaximumWrapperWidth();
		cornerHandle.setAttribute("aria-label", `Reset preview to full width; drag or use arrow keys to resize. ${widthLabel}, ${roundedHeight}px high`);
	};

	const applyStageWidth = (availableWidth: number) => {
		const renderedWidth = Math.max(1, Math.ceil(currentRawWidth * currentScale));
		stageEl.style.width = `${renderedWidth}px`;
		stageEl.toggleClass("is-centered", renderedWidth < availableWidth);
	};

	const syncAutoScrolling = () => {
		setIframeScrolling(iframe, lastReportedHeight > AUTO_HEIGHT_SAFETY_LIMIT);
	};

	const applyManualSizing = () => {
		manualHeight = clampManualHeight(manualHeight);
		iframe.style.height = `${manualHeight / currentScale}px`;
		stageEl.style.height = `${manualHeight}px`;
		viewportEl.style.height = `${manualHeight}px`;
		updateResizeHandle();
		updateStatus();
	};

	const applyAutoSizing = (height: number) => {
		const rawHeight = clampAutoHeight(height);
		const renderedHeight = getScaledHeight(rawHeight);
		syncAutoScrolling();
		iframe.style.height = `${rawHeight}px`;
		stageEl.style.height = `${renderedHeight}px`;
		viewportEl.style.height = `${renderedHeight}px`;
		updateStatus();
	};

	const applyViewportLayout = () => {
		const availableWidth = getAvailableWidth();
		const effectiveViewportMode = getEffectiveViewportMode(availableWidth);
		currentRawWidth = getRawViewportWidth(availableWidth, effectiveViewportMode);
		const fitScale = Math.min(availableWidth / currentRawWidth, 1);
		currentScale = fitScale * zoom;

		iframe.style.width = `${currentRawWidth}px`;
		iframe.style.transform = Math.abs(currentScale - 1) < 0.001 ? "" : `scale(${currentScale})`;
		applyStageWidth(availableWidth);

		if (sizingPreference === "adaptive") {
			if (lastReportedHeight > 0 && fitsShortPage(lastReportedHeight, currentScale, config.shortPageThreshold)) {
				if (mode !== "auto") setSizingMode("auto");
				else applyAutoSizing(lastReportedHeight);
			} else {
				manualHeight = getAspectRatioHeight(availableWidth);
				if (mode !== "manual") setSizingMode("manual");
				else applyManualSizing();
			}
		} else if (mode === "manual") {
			applyManualSizing();
		} else if (lastReportedHeight > 0) {
			applyAutoSizing(lastReportedHeight);
		} else {
			updateStatus();
		}
	};

	const applyWrapperWidth = () => {
		if (manualWidth === null) {
			wrapper.style.width = "";
			wrapper.style.marginInline = "";
			return;
		}
		wrapper.style.width = `${Math.round(clampPreviewWidth(manualWidth, getMaximumWrapperWidth()))}px`;
		wrapper.style.marginInline = "auto";
	};

	const setSizingMode = (nextMode: SizingMode) => {
		const previousMode = mode;
		mode = nextMode;
		wrapper.dataset.sizing = mode;
		toolbar.setSizingMode(mode);

		if (mode === "manual") {
			if (previousMode === "auto" && sizingPreference !== "adaptive") {
				const visibleHeight = viewportEl.getBoundingClientRect().height || viewportEl.clientHeight;
				manualHeight = clampManualHeight(visibleHeight || manualHeight);
			}
			setIframeScrolling(iframe, true);
			applyManualSizing();
		} else {
			syncAutoScrolling();
			if (lastReportedHeight > 0) applyAutoSizing(lastReportedHeight);
			else updateStatus();
		}
	};

	const chooseSizingMode = (nextMode: SizingMode) => {
		sizingPreference = nextMode;
		setSizingMode(nextMode);
		saveState();
	};

	const setViewportMode = (nextMode: PreviewViewportMode) => {
		viewportMode = nextMode;
		toolbar.setViewportMode(viewportMode);
		applyViewportLayout();
		saveState();
	};

	const setZoom = (direction: -1 | 0 | 1) => {
		zoom = direction === 0 ? 1 : clampZoom(zoom + direction * ZOOM_STEP);
		toolbar.setZoom(zoom, zoom <= MIN_ZOOM, zoom >= MAX_ZOOM);
		applyViewportLayout();
		saveState();
	};

	const refresh = () => {
		if (disposed) return;
		iframe.srcdoc = buildPreviewDocument(source);
		if (sizingPreference === "adaptive") {
			lastReportedHeight = 0;
			applyViewportLayout();
			return;
		}
		if (mode === "manual") {
			setIframeScrolling(iframe, true);
			applyManualSizing();
		} else {
			syncAutoScrolling();
		}
	};

	const onWindowBlur = () => stopResize();
	const stopResize = (event?: PointerEvent) => {
		if (event && activePointerId !== event.pointerId) return;
		const pointerId = activePointerId;
		activePointerId = null;
		activeResizeKind = null;
		delete wrapper.dataset.resizing;
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", stopResize);
		window.removeEventListener("pointercancel", stopResize);
		window.removeEventListener("blur", onWindowBlur);
		dragHandle?.removeEventListener("lostpointercapture", stopResize);
		if (pointerId !== null && dragHandle?.hasPointerCapture?.(pointerId)) {
			dragHandle.releasePointerCapture(pointerId);
		}
		dragHandle = null;
		if (dragChanged) saveState();
		dragChanged = false;
	};

	const onPointerMove = (event: PointerEvent) => {
		if (activePointerId !== event.pointerId || activeResizeKind === null) return;
		const deltaX = event.clientX - startX;
		const deltaY = event.clientY - startY;
		if (!deltaX && !deltaY) return;
		dragChanged = true;
		if (Math.abs(deltaY) > (activeResizeKind === "corner" ? 3 : 0)) sizingPreference = "manual";
		if (activeResizeKind === "corner" && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
			cornerDragged = true;
		}
		manualHeight = clampManualHeight(startHeight + deltaY);
		if (activeResizeKind === "corner") {
			// The shell is centered: each side moves by half the width change.
			const width = startWidth + 2 * deltaX;
			manualWidth = width >= getMaximumWrapperWidth() ? null : width;
			applyWrapperWidth();
			applyViewportLayout();
		} else {
			applyManualSizing();
		}
	};

	const beginResize = (event: PointerEvent, kind: ResizeKind) => {
		if (mode !== "manual" || activePointerId !== null || event.button !== 0) return;
		event.preventDefault();
		activePointerId = event.pointerId;
		activeResizeKind = kind;
		cornerDragged = false;
		startX = event.clientX;
		startY = event.clientY;
		startWidth = wrapper.getBoundingClientRect().width || getMaximumWrapperWidth();
		startHeight = manualHeight;
		dragChanged = false;
		dragHandle = event.currentTarget as HTMLElement;
		wrapper.dataset.resizing = kind;
		// Capture the pointer and keep it out of the embedded document while dragging.
		dragHandle.addEventListener("lostpointercapture", stopResize);
		dragHandle.setPointerCapture?.(event.pointerId);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", stopResize);
		window.addEventListener("pointercancel", stopResize);
		window.addEventListener("blur", onWindowBlur);
	};

	const onHeightPointerDown = (event: PointerEvent) => beginResize(event, "height");
	const onCornerPointerDown = (event: PointerEvent) => {
		event.stopPropagation();
		beginResize(event, "corner");
	};

	const onResizeKeyDown = (event: KeyboardEvent) => {
		if (mode !== "manual") return;
		const step = event.shiftKey ? 50 : 10;
		if (event.key === "ArrowUp") manualHeight -= step;
		else if (event.key === "ArrowDown") manualHeight += step;
		else if (event.key === "Home") manualHeight = MIN_PREVIEW_HEIGHT;
		else if (event.key === "End") manualHeight = MAX_MANUAL_PREVIEW_HEIGHT;
		else return;
		event.preventDefault();
		sizingPreference = "manual";
		applyManualSizing();
		saveState();
	};

	const onCornerKeyDown = (event: KeyboardEvent) => {
		if (mode !== "manual") return;
		event.stopPropagation();
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			resetWidth();
			return;
		}
		const step = event.shiftKey ? 50 : 10;
		const currentWidth = manualWidth === null
			? getMaximumWrapperWidth()
			: clampPreviewWidth(manualWidth, getMaximumWrapperWidth());
		if (event.key === "ArrowLeft") manualWidth = currentWidth - step;
		else if (event.key === "ArrowRight") manualWidth = currentWidth + step >= getMaximumWrapperWidth() ? null : currentWidth + step;
		else if (event.key === "ArrowUp") { manualHeight -= step; sizingPreference = "manual"; }
		else if (event.key === "ArrowDown") { manualHeight += step; sizingPreference = "manual"; }
		else if (event.key === "Home") manualWidth = MIN_PREVIEW_WIDTH;
		else if (event.key === "End") manualWidth = null;
		else return;
		event.preventDefault();
		applyWrapperWidth();
		applyViewportLayout();
		saveState();
	};

	const resetWidth = () => {
		manualWidth = null;
		applyWrapperWidth();
		applyViewportLayout();
		updateResizeHandle();
		saveState();
	};
	const onCornerClick = () => {
		if (cornerDragged) {
			cornerDragged = false;
			return;
		}
		resetWidth();
	};
	const onCornerDoubleClick = (event: MouseEvent) => {
		event.stopPropagation();
		resetWidth();
	};
	const onResizeDoubleClick = () => chooseSizingMode("auto");

	const onHostResize = () => {
		if (disposed) return;
		if (manualWidth !== null) applyWrapperWidth();
		updateResizeHandle();
		const width = getAvailableWidth();
		if (width === lastLayoutWidth) return;
		lastLayoutWidth = width;
		applyViewportLayout();
	};

	toolbar = createToolbar(wrapper, mode, viewportMode, zoom, {
		onRefresh: refresh,
		onFullscreen: () => new HTMLPreviewModal(app, source).open(),
		onSizingModeChange: chooseSizingMode,
		onViewportModeChange: setViewportMode,
		onZoomChange: setZoom,
		getSource: () => source,
	});

	viewportEl = wrapper.createDiv({ cls: "html-preview-viewport" });
	viewportEl.id = `html-preview-viewport-${++nextPreviewId}`;
	stageEl = viewportEl.createDiv({ cls: "html-preview-stage" });
	iframe = stageEl.createEl("iframe", {
		cls: "html-preview-iframe",
		attr: {
			sandbox: "allow-scripts allow-forms",
			loading: "lazy",
			scrolling: mode === "manual" ? "auto" : "no",
			title: "HTML preview",
		},
	});

	const resizeBar = wrapper.createDiv({ cls: "html-preview-resize-bar" });
	resizeHandle = resizeBar.createDiv({
		cls: "html-preview-resize-handle",
		attr: {
			role: "separator",
			tabindex: "0",
			"aria-label": "Preview height; drag or use arrow keys to resize",
			"aria-controls": viewportEl.id,
			"aria-orientation": "horizontal",
			"aria-valuemin": String(MIN_PREVIEW_HEIGHT),
			"aria-valuemax": String(MAX_MANUAL_PREVIEW_HEIGHT),
		},
	});
	resizeHandle.createSpan({ cls: "html-preview-height-grip", attr: { "aria-hidden": "true" } });
	resizeLabel = resizeHandle.createSpan({ cls: "html-preview-resize-label", attr: { "aria-hidden": "true" } });
	const sizeControls = resizeBar.createDiv({ cls: "html-preview-size-controls" });
	sizeControls.createSpan({ cls: "html-preview-size-axis", text: "H", attr: { "aria-hidden": "true" } });
	const createSizeButton = (label: string, symbol: string, onClick: () => void) => {
		const button = sizeControls.createEl("button", {
			cls: "html-preview-size-btn",
			text: symbol,
			attr: { type: "button", "aria-label": label, title: label, "aria-controls": viewportEl.id },
		});
		button.addEventListener("click", onClick);
		sizeButtonDisposers.push(() => button.removeEventListener("click", onClick));
		return button;
	};
	heightMinusButton = createSizeButton("Decrease preview height by 50 pixels", "−", () => {
		manualHeight -= 50;
		sizingPreference = "manual";
		applyManualSizing();
		saveState();
	});
	heightPlusButton = createSizeButton("Increase preview height by 50 pixels", "+", () => {
		manualHeight += 50;
		sizingPreference = "manual";
		applyManualSizing();
		saveState();
	});
	sizeControls.createSpan({ cls: "html-preview-size-axis", text: "W", attr: { "aria-hidden": "true" } });
	widthMinusButton = createSizeButton("Decrease preview width by 50 pixels", "−", () => {
		manualWidth = (manualWidth === null
			? getMaximumWrapperWidth()
			: clampPreviewWidth(manualWidth, getMaximumWrapperWidth())) - 50;
		applyWrapperWidth();
		applyViewportLayout();
		saveState();
	});
	widthPlusButton = createSizeButton("Increase preview width by 50 pixels", "+", () => {
		const width = clampPreviewWidth(manualWidth ?? getMaximumWrapperWidth(), getMaximumWrapperWidth()) + 50;
		manualWidth = width >= getMaximumWrapperWidth() ? null : width;
		applyWrapperWidth();
		applyViewportLayout();
		saveState();
	});
	cornerHandle = resizeBar.createDiv({
		cls: "html-preview-corner-handle",
		attr: {
			role: "button", tabindex: "0", "aria-controls": viewportEl.id,
			title: "Drag or use arrow keys to resize; click for full width",
		},
	});

	applyWrapperWidth();
	setViewportMode(viewportMode);
	setSizingMode(mode);
	toolbar.setZoom(zoom, zoom <= MIN_ZOOM, zoom >= MAX_ZOOM);
	updateResizeHandle();
	initialized = true;

	const unregisterHeightHandler = registerHeightHandler(iframe, (height) => {
		lastReportedHeight = height;
		if (sizingPreference === "adaptive") applyViewportLayout();
		else if (mode === "auto") applyAutoSizing(height);
	});

	const resizeObserver = typeof ResizeObserver === "function"
		? new ResizeObserver(onHostResize)
		: null;
	resizeObserver?.observe(viewportEl);
	resizeObserver?.observe(parentEl);
	window.addEventListener("resize", onHostResize);
	resizeHandle.addEventListener("pointerdown", onHeightPointerDown);
	resizeHandle.addEventListener("keydown", onResizeKeyDown);
	resizeHandle.addEventListener("dblclick", onResizeDoubleClick);
	cornerHandle.addEventListener("pointerdown", onCornerPointerDown);
	cornerHandle.addEventListener("keydown", onCornerKeyDown);
	cornerHandle.addEventListener("click", onCornerClick);
	cornerHandle.addEventListener("dblclick", onCornerDoubleClick);
	refresh();

	return {
		refresh,
		dispose: () => {
			if (disposed) return;
			disposed = true;
			stopResize();
			resizeObserver?.disconnect();
			window.removeEventListener("resize", onHostResize);
			resizeHandle.removeEventListener("pointerdown", onHeightPointerDown);
			resizeHandle.removeEventListener("keydown", onResizeKeyDown);
			resizeHandle.removeEventListener("dblclick", onResizeDoubleClick);
			cornerHandle.removeEventListener("pointerdown", onCornerPointerDown);
			cornerHandle.removeEventListener("keydown", onCornerKeyDown);
			cornerHandle.removeEventListener("click", onCornerClick);
			cornerHandle.removeEventListener("dblclick", onCornerDoubleClick);
			unregisterHeightHandler();
			for (const disposeButton of sizeButtonDisposers) disposeButton();
			toolbar.dispose();
		},
	};
}
