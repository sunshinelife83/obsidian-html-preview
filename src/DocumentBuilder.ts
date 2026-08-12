import { HEIGHT_REPORTER_ID, getHeightReporterSource } from "./IframeBridge";

const PREVIEW_STYLE_ID = "html-preview-base-styles";

const PREVIEW_STYLES = `
*,*::before,*::after{box-sizing:border-box}
html,body{overflow-x:hidden;scrollbar-width:none;-ms-overflow-style:none}
body{margin:0;padding:8px;font-family:var(--font-text,sans-serif);background:transparent;color:var(--text-normal,#ccc)}
a{color:var(--text-accent,#7c5cbf)}
::-webkit-scrollbar{width:0;height:0}
`;

export function buildPreviewDocument(source: string): string {
	const document = new DOMParser().parseFromString(source, "text/html");

	const existingCharset = document.head.querySelector("meta[charset]");
	if (existingCharset) {
		existingCharset.setAttribute("charset", "utf-8");
	} else {
		const charset = document.createElement("meta");
		charset.setAttribute("charset", "utf-8");
		document.head.prepend(charset);
	}

	if (!document.head.querySelector('meta[name="viewport" i]')) {
		const viewport = document.createElement("meta");
		viewport.name = "viewport";
		viewport.content = "width=device-width, initial-scale=1.0";
		document.head.append(viewport);
	}

	document.getElementById(PREVIEW_STYLE_ID)?.remove();
	const style = document.createElement("style");
	style.id = PREVIEW_STYLE_ID;
	style.textContent = PREVIEW_STYLES;
	document.head.append(style);

	document.getElementById(HEIGHT_REPORTER_ID)?.remove();
	const reporter = document.createElement("script");
	reporter.id = HEIGHT_REPORTER_ID;
	reporter.textContent = getHeightReporterSource();
	document.body.append(reporter);

	return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
