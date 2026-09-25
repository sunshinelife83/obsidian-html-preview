import { HTMLPreviewConfig } from "./types";

/** Smallest height, in pixels, that a preview viewport can occupy. */
export const MIN_PREVIEW_HEIGHT = 50;
/** Upper bound for heights chosen by dragging the handle or using arrow keys. */
export const MAX_MANUAL_PREVIEW_HEIGHT = 2000;
/** Upper bound for heights reported by the rendered document. */
export const AUTO_HEIGHT_SAFETY_LIMIT = 50000;
/** Smallest width, in pixels, for a manually resized preview. */
export const MIN_PREVIEW_WIDTH = 320;
/** Default adaptive scrolling viewport: 16 units wide by 9 units high. */
export const DEFAULT_PREVIEW_ASPECT_RATIO = 16 / 9;
export const MIN_SHORT_PAGE_THRESHOLD = 200;
export const MAX_SHORT_PAGE_THRESHOLD = 1200;

/** Zoom range shared by the toolbar buttons and the settings slider. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

function clampToRange(height: number, maxHeight: number): number {
	if (!Number.isFinite(height)) return MIN_PREVIEW_HEIGHT;
	return Math.min(Math.max(height, MIN_PREVIEW_HEIGHT), maxHeight);
}

export function clampManualHeight(height: number): number {
	return clampToRange(height, MAX_MANUAL_PREVIEW_HEIGHT);
}

export function clampAutoHeight(height: number): number {
	return clampToRange(height, AUTO_HEIGHT_SAFETY_LIMIT);
}

export function getAspectRatioHeight(width: number): number {
	return clampManualHeight(Math.round(width / DEFAULT_PREVIEW_ASPECT_RATIO));
}

export function clampShortPageThreshold(threshold: number): number {
	if (!Number.isFinite(threshold)) return 600;
	return Math.min(MAX_SHORT_PAGE_THRESHOLD, Math.max(MIN_SHORT_PAGE_THRESHOLD, Math.round(threshold)));
}

export function fitsShortPage(height: number, scale: number, threshold: number): boolean {
	return Number.isFinite(height) && height > 0 && Number.isFinite(scale) && scale > 0
		&& Math.ceil(height * scale) <= clampShortPageThreshold(threshold);
}

export function clampZoom(zoom: number): number {
	if (!Number.isFinite(zoom)) return 1;
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
}

/**
 * Keeps a manual width inside the available note width and above the minimum
 * supported width. Hosts narrower than MIN_PREVIEW_WIDTH keep their own width.
 */
export function clampPreviewWidth(width: number, availableWidth: number): number {
	const maximum = Number.isFinite(availableWidth) && availableWidth > 0
		? availableWidth
		: MIN_PREVIEW_WIDTH;
	const minimum = Math.min(MIN_PREVIEW_WIDTH, maximum);
	const candidate = Number.isFinite(width) ? width : minimum;
	return Math.min(maximum, Math.max(minimum, candidate));
}

export function getDefaultHeight(config: HTMLPreviewConfig): number {
	return clampManualHeight(config.defaultHeight);
}
