import type { PreviewController } from "./HTMLPreviewProcessor";

export class PreviewRegistry {
	private readonly previews = new Set<PreviewController>();

	add(preview: PreviewController): () => void {
		this.previews.add(preview);
		return () => this.previews.delete(preview);
	}

	refreshAll(): void {
		for (const preview of this.previews) preview.refresh();
	}

	disposeAll(): void {
		for (const preview of this.previews) preview.dispose();
		this.previews.clear();
	}
}
