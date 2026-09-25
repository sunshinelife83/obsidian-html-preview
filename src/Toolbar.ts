import { Notice, setIcon } from "obsidian";
import { PreviewViewportMode } from "./types";

export type SizingMode = "auto" | "manual";

export interface ToolbarController {
	setSizingMode(mode: SizingMode): void;
	setViewportMode(mode: PreviewViewportMode): void;
	setZoom(zoom: number, atMinimum: boolean, atMaximum: boolean): void;
	setStatus(status: string): void;
	dispose(): void;
}

interface ToolbarCallbacks {
	onRefresh(): void;
	onFullscreen(): void;
	onSizingModeChange(mode: SizingMode): void;
	onViewportModeChange(mode: PreviewViewportMode): void;
	onZoomChange(direction: -1 | 0 | 1): void;
	getSource(): string;
}

function createButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: (this: void) => void,
	disposers: Array<() => void>,
	className = ""
): HTMLButtonElement {
	const button = parent.createEl("button", {
		cls: `clickable-icon html-preview-toolbar-btn ${className}`.trim(),
		attr: { "aria-label": label, title: label, type: "button" },
	});
	setIcon(button, icon);
	button.addEventListener("click", onClick);
	disposers.push(() => button.removeEventListener("click", onClick));
	return button;
}

function setButtonAppearance(button: HTMLButtonElement, icon: string, label: string): void {
	button.empty();
	setIcon(button, icon);
	button.setAttribute("aria-label", label);
	button.title = label;
}

export function createToolbar(
	parentEl: HTMLElement,
	initialMode: SizingMode,
	initialViewportMode: PreviewViewportMode,
	initialZoom: number,
	callbacks: ToolbarCallbacks
): ToolbarController {
	const toolbar = parentEl.createDiv({ cls: "html-preview-toolbar" });
	const status = toolbar.createDiv({
		cls: "html-preview-toolbar-status",
		attr: { "aria-live": "polite" },
	});
	const buttons = toolbar.createDiv({ cls: "html-preview-toolbar-btns" });
	const disposers: Array<() => void> = [];

	const viewGroup = buttons.createDiv({ cls: "html-preview-toolbar-group" });
	let viewportMode = initialViewportMode;
	const viewportButton = createButton(viewGroup, "monitor", "Use responsive note-width viewport", () => {
		callbacks.onViewportModeChange(viewportMode === "desktop" ? "responsive" : "desktop");
	}, disposers);

	const zoomOutButton = createButton(
		viewGroup,
		"minus",
		"Zoom out",
		() => callbacks.onZoomChange(-1),
		disposers
	);
	const zoomButton = viewGroup.createEl("button", {
		cls: "html-preview-zoom-value",
		attr: {
			"aria-label": "Reset preview zoom to 100%",
			title: "Reset preview zoom to 100%",
			type: "button",
		},
	});
	const resetZoom = () => callbacks.onZoomChange(0);
	zoomButton.addEventListener("click", resetZoom);
	disposers.push(() => zoomButton.removeEventListener("click", resetZoom));
	const zoomInButton = createButton(
		viewGroup,
		"plus",
		"Zoom in",
		() => callbacks.onZoomChange(1),
		disposers
	);

	const actionGroup = buttons.createDiv({ cls: "html-preview-toolbar-group" });
	let mode = initialMode;
	const sizeButton = createButton(actionGroup, "scan", "Fit the full content height", () => {
		callbacks.onSizingModeChange(mode === "auto" ? "manual" : "auto");
	}, disposers);

	createButton(actionGroup, "refresh-cw", "Reload preview", () => callbacks.onRefresh(), disposers);
	createButton(actionGroup, "maximize-2", "Open fullscreen preview", () => callbacks.onFullscreen(), disposers);

	let feedbackTimer: number | undefined;
	const copyButton = createButton(actionGroup, "copy", "Copy HTML source", () => {
		void navigator.clipboard.writeText(callbacks.getSource()).then(() => {
			copyButton.addClass("html-preview-copied");
			setButtonAppearance(copyButton, "check", "HTML copied");
			window.clearTimeout(feedbackTimer);
			feedbackTimer = window.setTimeout(() => {
				copyButton.removeClass("html-preview-copied");
				setButtonAppearance(copyButton, "copy", "Copy HTML source");
			}, 1200);
		}).catch(() => {
			new Notice("Could not copy HTML source");
		});
	}, disposers);

	const setSizingMode = (nextMode: SizingMode) => {
		mode = nextMode;
		const auto = mode === "auto";
		const label = auto
			? "Fit height is on. Click for a resizable scroll area"
			: "Resizable height is on. Click to fit the full content";
		setButtonAppearance(sizeButton, auto ? "scan" : "move-vertical", label);
		sizeButton.toggleClass("is-active", !auto);
		sizeButton.setAttribute("aria-pressed", String(!auto));
	};

	const setViewportMode = (nextMode: PreviewViewportMode) => {
		viewportMode = nextMode;
		const desktop = viewportMode === "desktop";
		const label = desktop
			? "Desktop viewport is on. Click for responsive note width"
			: "Responsive note width is on. Click for desktop viewport";
		setButtonAppearance(viewportButton, desktop ? "monitor" : "smartphone", label);
		viewportButton.toggleClass("is-active", desktop);
		viewportButton.setAttribute("aria-pressed", String(desktop));
	};

	const setZoom = (zoom: number, atMinimum: boolean, atMaximum: boolean) => {
		zoomButton.setText(`${Math.round(zoom * 100)}%`);
		zoomOutButton.disabled = atMinimum;
		zoomInButton.disabled = atMaximum;
	};

	setSizingMode(initialMode);
	setViewportMode(initialViewportMode);
	setZoom(initialZoom, false, false);

	return {
		setSizingMode,
		setViewportMode,
		setZoom,
		setStatus: (nextStatus: string) => status.setText(nextStatus),
		dispose: () => {
			window.clearTimeout(feedbackTimer);
			for (const dispose of disposers) dispose();
		},
	};
}
