import { MarkdownRenderChild, Plugin } from "obsidian";
import { createPreview, PreviewController } from "./HTMLPreviewProcessor";
import { PreviewRegistry } from "./PreviewRegistry";
import { PreviewStateStore } from "./PreviewStateStore";
import { HTMLPreviewSettingTab } from "./Settings";
import { clampShortPageThreshold } from "./PreviewSizing";
import { DEFAULT_CONFIG, HTMLPreviewConfig, resolveDefaultSizingMode } from "./types";

class PreviewRenderChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly controller: PreviewController,
		private readonly onDispose: () => void
	) {
		super(containerEl);
	}

	onunload(): void {
		this.controller.dispose();
		this.onDispose();
	}
}

export default class HTMLPreviewPlugin extends Plugin {
	private readonly previews = new PreviewRegistry();
	private previewStates!: PreviewStateStore;
	settings: HTMLPreviewConfig = { ...DEFAULT_CONFIG };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new HTMLPreviewSettingTab(this.app, this));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			this.previewStates.rename(oldPath, file.path);
		}));

		this.registerMarkdownCodeBlockProcessor("html-preview", (source, el, ctx) => {
			const binding = this.previewStates.bind(ctx.sourcePath, source, ctx.getSectionInfo(el)?.lineStart);
			const preview = createPreview(el, source, this.app, this.settings, {
				initialState: binding.initialState,
				onStateChange: binding.onStateChange,
			});
			const unregister = this.previews.add(preview);
			ctx.addChild(new PreviewRenderChild(el, preview, () => {
				unregister();
				binding.release();
			}));
		});

		this.addCommand({
			id: "refresh-all",
			name: "Refresh all previews",
			callback: () => this.previews.refreshAll(),
		});
	}

	saveSettings(): Promise<void> {
		return this.previewStates.saveDebounced();
	}

	onunload(): void {
		this.previews.disposeAll();
		if (this.previewStates) {
			void this.previewStates.flush().catch((error: unknown) =>
				console.error("HTML preview: failed to save state on unload", error)
			);
		}
	}

	private async loadSettings(): Promise<void> {
		const saved = await this.loadData() as (Partial<HTMLPreviewConfig> & {
			autoHeight?: boolean; previewStates?: unknown;
		}) | null;
		this.settings = {
			defaultSizingMode: resolveDefaultSizingMode(saved?.defaultSizingMode, saved?.autoHeight),
			shortPageThreshold: clampShortPageThreshold(saved?.shortPageThreshold ?? DEFAULT_CONFIG.shortPageThreshold),
			defaultHeight: saved?.defaultHeight ?? DEFAULT_CONFIG.defaultHeight,
			defaultViewportMode: saved?.defaultViewportMode ?? DEFAULT_CONFIG.defaultViewportMode,
			defaultZoom: saved?.defaultZoom ?? DEFAULT_CONFIG.defaultZoom,
			desktopViewportWidth: saved?.desktopViewportWidth ?? DEFAULT_CONFIG.desktopViewportWidth,
			responsiveViewportBreakpoint:
				saved?.responsiveViewportBreakpoint ?? DEFAULT_CONFIG.responsiveViewportBreakpoint,
		};
		this.previewStates = new PreviewStateStore(saved?.previewStates, (states) =>
			this.saveData({ ...this.settings, previewStates: states })
		);
	}
}
