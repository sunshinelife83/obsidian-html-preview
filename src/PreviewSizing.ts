import { HTMLPreviewConfig } from "./types";

export const MIN_PREVIEW_HEIGHT = 50;
export const MAX_PREVIEW_HEIGHT = 2000;

export function clampHeight(height: number): number {
	return Math.min(Math.max(height, MIN_PREVIEW_HEIGHT), MAX_PREVIEW_HEIGHT);
}

export function applyHeight(iframe: HTMLIFrameElement, height: number): void {
	if (!Number.isFinite(height) || height <= 0) return;
	iframe.style.height = `${clampHeight(height)}px`;
}

export function getDefaultHeight(config: HTMLPreviewConfig): number {
	return clampHeight(config.defaultHeight);
}
