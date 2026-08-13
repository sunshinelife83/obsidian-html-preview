import { MarkdownRenderChild, Plugin } from "obsidian";
import { createPreview, PreviewController } from "./HTMLPreviewProcessor";
import { PreviewRegistry } from "./PreviewRegistry";

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

	onload(): void {
		this.registerMarkdownCodeBlockProcessor("html-preview", (source, el, ctx) => {
			const preview = createPreview(el, source, this.app);
			ctx.addChild(new PreviewRenderChild(el, preview, this.previews.add(preview)));
		});

		this.addCommand({
			id: "refresh-all",
			name: "Refresh all previews",
			callback: () => this.previews.refreshAll(),
		});
	}

	onunload(): void {
		this.previews.disposeAll();
	}
}
