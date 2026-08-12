export interface HTMLPreviewConfig {
	autoHeight: boolean;
	defaultHeight: number;
}

export const DEFAULT_CONFIG: Readonly<HTMLPreviewConfig> = {
	autoHeight: true,
	defaultHeight: 300,
};

export interface HeightMessage {
	type: "html-preview-height";
	height: number;
}
