import { HeightMessage } from "./types";

export const HEIGHT_REPORTER_ID = "html-preview-height-reporter";

export function getHeightReporterSource(): string {
	return `
(function() {
	var fallbackTimer;
	function reportHeight() {
		var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
		if (h > 0) {
			parent.postMessage({ type: "html-preview-height", height: h }, "*");
		}
	}
	window.addEventListener("load", function() {
		reportHeight();
		if (typeof ResizeObserver === "function") {
			var observer = new ResizeObserver(reportHeight);
			observer.observe(document.body);
			if (document.documentElement !== document.body) {
				observer.observe(document.documentElement);
			}
			window.addEventListener("unload", function() { observer.disconnect(); }, { once: true });
		} else {
			fallbackTimer = window.setInterval(reportHeight, 500);
			window.setTimeout(function() { window.clearInterval(fallbackTimer); }, 10000);
		}
	});
})();
`;
}

export function isHeightMessage(data: unknown): data is HeightMessage {
	if (typeof data !== "object" || data === null) return false;
	const candidate = data as Partial<HeightMessage>;
	return candidate.type === "html-preview-height"
		&& typeof candidate.height === "number"
		&& Number.isFinite(candidate.height);
}

export function registerHeightHandler(
	iframe: HTMLIFrameElement,
	handler: (height: number) => void
): () => void {
	const listener = (event: MessageEvent<unknown>) => {
		if (event.source !== iframe.contentWindow || !isHeightMessage(event.data)) return;
		handler(event.data.height);
	};
	window.addEventListener("message", listener);
	return () => {
		window.removeEventListener("message", listener);
	};
}
