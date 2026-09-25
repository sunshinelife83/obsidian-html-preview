import { HEIGHT_REPORTER_ID, getHeightReporterSource } from "./IframeBridge";

const PREVIEW_STYLE_ID = "html-preview-base-styles";
const STORAGE_SHIM_ID = "html-preview-storage-shim";

const PREVIEW_STYLES = `
:where(html,body){background:transparent}
`;

const STORAGE_SHIM_SOURCE = `
(() => {
	function createStorage() {
		let store = Object.create(null);

		return {
			get length() {
				return Object.keys(store).length;
			},
			clear() {
				store = Object.create(null);
			},
			getItem(key) {
				const normalizedKey = String(key);
				return Object.prototype.hasOwnProperty.call(store, normalizedKey)
					? store[normalizedKey]
					: null;
			},
			key(index) {
				const keys = Object.keys(store);
				return keys[index] || null;
			},
			removeItem(key) {
				delete store[String(key)];
			},
			setItem(key, value) {
				store[String(key)] = String(value);
			},
		};
	}

	function installStorageFallback(name) {
		try {
			const storage = window[name];
			const probeKey = "__html_preview_storage_probe__";
			storage.setItem(probeKey, "1");
			storage.removeItem(probeKey);
			return;
		} catch {
			const shim = createStorage();
			try {
				Object.defineProperty(window, name, {
					value: shim,
					configurable: true,
					enumerable: true,
					writable: false,
				});
			} catch {
				try {
					window[name] = shim;
				} catch {
					/* Ignore browsers that block redefining storage properties. */
				}
			}
		}
	}

	installStorageFallback("localStorage");
	installStorageFallback("sessionStorage");
})();
`;

const PREVIEW_STYLE_MARKUP = `<style id="${PREVIEW_STYLE_ID}">${PREVIEW_STYLES}</style>`;
const STORAGE_SHIM_MARKUP = `<script id="${STORAGE_SHIM_ID}">${STORAGE_SHIM_SOURCE}</script>`;
const HEIGHT_REPORTER_MARKUP = `<script id="${HEIGHT_REPORTER_ID}">${getHeightReporterSource()}</script>`;

function getTrustedMarkupNodes(parent: Element, markup: string): Array<ChildNode> {
	const tagName = parent.tagName.toLowerCase();
	const parsed = new DOMParser().parseFromString(
		tagName === "head" ? `<head>${markup}</head>` : `<body>${markup}</body>`,
		"text/html"
	);
	const fragment = tagName === "head" ? parsed.head : parsed.body;
	return Array.from(fragment.childNodes);
}

function appendTrustedMarkup(parent: Element, markup: string): void {
	parent.append(...getTrustedMarkupNodes(parent, markup));
}

function insertTrustedMarkupBefore(parent: Element, markup: string, referenceNode: ChildNode | null): void {
	for (const node of getTrustedMarkupNodes(parent, markup)) {
		parent.insertBefore(node, referenceNode);
	}
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

	removeElementsById(parsedDocument, STORAGE_SHIM_ID);
	const firstHeadScript = parsedDocument.head.querySelector("script");
	if (firstHeadScript) {
		insertTrustedMarkupBefore(parsedDocument.head, STORAGE_SHIM_MARKUP, firstHeadScript);
	} else {
		appendTrustedMarkup(parsedDocument.head, STORAGE_SHIM_MARKUP);
	}

	removeElementsById(parsedDocument, PREVIEW_STYLE_ID);
	appendTrustedMarkup(parsedDocument.head, PREVIEW_STYLE_MARKUP);

	removeElementsById(parsedDocument, HEIGHT_REPORTER_ID);
	appendTrustedMarkup(parsedDocument.body, HEIGHT_REPORTER_MARKUP);

	return `<!doctype html>\n${parsedDocument.documentElement.outerHTML}`;
}
