import { HEIGHT_REPORTER_ID, getHeightReporterSource } from "./IframeBridge";

const PREVIEW_STYLE_ID = "html-preview-base-styles";

const PREVIEW_STYLES = `
*,*::before,*::after{box-sizing:border-box}
html,body{overflow-x:hidden}
body{margin:0;padding:8px;font-family:var(--font-text,sans-serif);background:transparent;color:var(--text-normal,#ccc)}
a{color:var(--text-accent,#7c5cbf)}
::-webkit-scrollbar{display:none;width:0;height:0}
`;

const PREVIEW_STYLE_MARKUP = `<style id="${PREVIEW_STYLE_ID}">${PREVIEW_STYLES}</style>`;
const HEIGHT_REPORTER_MARKUP = `<script id="${HEIGHT_REPORTER_ID}">${getHeightReporterSource()}</script>`;

function appendTrustedMarkup(parent: Element, markup: string): void {
	const tagName = parent.tagName.toLowerCase();
	const parsed = new DOMParser().parseFromString(
		tagName === "head" ? `<head>${markup}</head>` : `<body>${markup}</body>`,
		"text/html"
	);
	const fragment = tagName === "head" ? parsed.head : parsed.body;
	parent.append(...Array.from(fragment.childNodes));
}

function removeElementsById(document: Document, id: string): void {
	for (const element of Array.from(document.querySelectorAll(`#${id}`))) element.remove();
}

export function buildPreviewDocument(source: string): string {
	const parsedDocument = new DOMParser().parseFromString(source, "text/html");

	const existingCharset = parsedDocument.head.querySelector("meta[charset]");
	if (existingCharset) {
		existingCharset.setAttribute("charset", "utf-8");
	} else {
		appendTrustedMarkup(parsedDocument.head, '<meta charset="utf-8">');
	}

	if (!parsedDocument.head.querySelector('meta[name="viewport" i]')) {
		appendTrustedMarkup(
			parsedDocument.head,
			'<meta name="viewport" content="width=device-width, initial-scale=1.0">'
		);
	}

	removeElementsById(parsedDocument, PREVIEW_STYLE_ID);
	appendTrustedMarkup(parsedDocument.head, PREVIEW_STYLE_MARKUP);

	removeElementsById(parsedDocument, HEIGHT_REPORTER_ID);
	appendTrustedMarkup(parsedDocument.body, HEIGHT_REPORTER_MARKUP);

	return `<!doctype html>\n${parsedDocument.documentElement.outerHTML}`;
}
