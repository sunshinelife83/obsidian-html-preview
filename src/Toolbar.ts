import { Notice, setIcon } from "obsidian";

export type SizingMode = "auto" | "manual";

export interface ToolbarController {
	setSizingMode(mode: SizingMode): void;
	dispose(): void;
}

interface ToolbarCallbacks {
	onRefresh(): void;
	onFullscreen(): void;
	onSizingModeChange(mode: SizingMode): void;
	getSource(): string;
}

function createButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: () => void,
	disposers: Array<() => void>
): HTMLButtonElement {
	const button = parent.createEl("button", {
		cls: "clickable-icon html-preview-toolbar-btn",
		attr: { "aria-label": label, title: label, type: "button" },
	});
	setIcon(button, icon);
	button.addEventListener("click", onClick);
	disposers.push(() => button.removeEventListener("click", onClick));
	return button;
}

export function createToolbar(
	parentEl: HTMLElement,
	initialMode: SizingMode,
	callbacks: ToolbarCallbacks
): ToolbarController {
	const toolbar = parentEl.createDiv({ cls: "html-preview-toolbar" });
	const buttons = toolbar.createDiv({ cls: "html-preview-toolbar-btns" });
	const disposers: Array<() => void> = [];

	createButton(buttons, "refresh-cw", "Refresh preview", callbacks.onRefresh, disposers);
	createButton(buttons, "maximize-2", "Fullscreen preview", callbacks.onFullscreen, disposers);

	let feedbackTimer: number | undefined;
	const copyButton = createButton(buttons, "copy", "Copy HTML source", () => {
		void navigator.clipboard.writeText(callbacks.getSource()).then(() => {
			copyButton.addClass("html-preview-copied");
			window.clearTimeout(feedbackTimer);
			feedbackTimer = window.setTimeout(() => {
				copyButton.removeClass("html-preview-copied");
			}, 1200);
		}).catch(() => {
			new Notice("Could not copy HTML source");
		});
	}, disposers);

	let mode = initialMode;
	const sizeButton = createButton(buttons, "scan", "Auto sizing (click for manual)", () => {
		callbacks.onSizingModeChange(mode === "auto" ? "manual" : "auto");
	}, disposers);

	const setSizingMode = (nextMode: SizingMode) => {
		mode = nextMode;
		const auto = mode === "auto";
		const label = auto
			? "Auto sizing (click for manual)"
			: "Manual sizing (click for auto)";
		sizeButton.empty();
		setIcon(sizeButton, auto ? "scan" : "move-vertical");
		sizeButton.setAttribute("aria-label", label);
		sizeButton.title = label;
	};

	setSizingMode(initialMode);

	return {
		setSizingMode,
		dispose: () => {
			window.clearTimeout(feedbackTimer);
			for (const dispose of disposers) dispose();
		},
	};
}
