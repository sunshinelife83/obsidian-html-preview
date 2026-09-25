export type PreviewViewportMode = "desktop" | "responsive";
export type DefaultSizingMode = "adaptive" | "manual" | "auto";

export interface HTMLPreviewConfig {
	defaultSizingMode: DefaultSizingMode;
	shortPageThreshold: number;
	defaultHeight: number;
	defaultViewportMode: PreviewViewportMode;
	defaultZoom: number;
	desktopViewportWidth: number;
	responsiveViewportBreakpoint: number;
}

export const DEFAULT_CONFIG: Readonly<HTMLPreviewConfig> = {
	defaultSizingMode: "adaptive",
	shortPageThreshold: 600,
	defaultHeight: 500,
	defaultViewportMode: "desktop",
	defaultZoom: 1,
	desktopViewportWidth: 800,
	responsiveViewportBreakpoint: 480,
};

export function resolveDefaultSizingMode(savedMode: unknown, legacyAutoHeight: unknown): DefaultSizingMode {
	if (savedMode === "adaptive" || savedMode === "manual" || savedMode === "auto") return savedMode;
	// The old default was true; migrate it to adaptive so existing installs get
	// the new default, while an explicit false keeps its scrolling behavior.
	if (legacyAutoHeight === false) return "manual";
	return DEFAULT_CONFIG.defaultSizingMode;
}

export interface HeightMessage {
	type: "html-preview-height";
	height: number;
}
