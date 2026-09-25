import { HeightMessage } from "./types";

export const HEIGHT_REPORTER_ID = "html-preview-height-reporter";

export function getHeightReporterSource(): string {
	return `
	(function() {
		var scheduled = false;
		var lastHeight = 0;
		var resizeObserver;
		var mutationObserver;
		var fallbackTimer;
		var watchedImages = typeof WeakSet === "function" ? new WeakSet() : null;
		var observedFonts;
		var delayedTimers = [null, null, null];
		var fullScanTimer;
		var lastFullScanAt = -Infinity;
		var lastDescendantHeight = 0;
		var needsFullScan = true;
		var FULL_SCAN_INTERVAL = 250;

		function readNumber(value) {
			return typeof value === "number" && isFinite(value) ? value : 0;
		}

		function readPixels(value) {
			var parsed = parseFloat(value || "0");
			return isFinite(parsed) ? parsed : 0;
		}

		function documentTop() {
			if (!document.documentElement || typeof document.documentElement.getBoundingClientRect !== "function") return 0;
			return readNumber(document.documentElement.getBoundingClientRect().top);
		}

		function elementRectBottom(element, top) {
			if (!element || typeof element.getBoundingClientRect !== "function") return 0;

			var rect = element.getBoundingClientRect();
			return readNumber(rect.bottom) - top;
		}

		function elementRectHeight(element) {
			if (!element || typeof element.getBoundingClientRect !== "function") return 0;

			var rect = element.getBoundingClientRect();
			return readNumber(rect.height);
		}

		function scrollOverflowHeight(element) {
			if (!element) return 0;

			var scrollHeight = readNumber(element.scrollHeight);
			var clientHeight = readNumber(element.clientHeight);
			return scrollHeight > clientHeight ? scrollHeight : 0;
		}

		function bodyHeight() {
			if (!document.body) return 0;

			var height = Math.max(
				readNumber(document.body.scrollHeight),
				readNumber(document.body.offsetHeight),
				elementRectHeight(document.body),
				elementRectBottom(document.body, documentTop())
			);

			if (typeof window.getComputedStyle === "function") {
				var styles = window.getComputedStyle(document.body);
				height += readPixels(styles.marginTop) + readPixels(styles.marginBottom);
			}

			return height;
		}

		function documentOverflowHeight() {
			return Math.max(
				scrollOverflowHeight(document.scrollingElement),
				scrollOverflowHeight(document.documentElement),
				scrollOverflowHeight(document.body)
			);
		}

		function descendantBottomHeight() {
			if (!document.body || typeof document.body.querySelectorAll !== "function") return 0;

			var top = documentTop();
			var maxBottom = 0;
			var elements = document.body.querySelectorAll("*");

			for (var i = 0; i < elements.length; i++) {
				var element = elements[i];
				if (typeof window.getComputedStyle === "function") {
					var styles = window.getComputedStyle(element);
					if (styles.display === "none") continue;
				}

				maxBottom = Math.max(maxBottom, elementRectBottom(element, top));
			}

			return maxBottom;
		}

		function measureHeight() {
			var regularHeight = Math.max(bodyHeight(), documentOverflowHeight());
			var now = Date.now();
			if (needsFullScan && now - lastFullScanAt >= FULL_SCAN_INTERVAL) {
				lastDescendantHeight = descendantBottomHeight();
				lastFullScanAt = now;
				needsFullScan = false;
			} else if (needsFullScan && !fullScanTimer) {
				fullScanTimer = window.setTimeout(function() {
					fullScanTimer = null;
					scheduleReport();
				}, Math.max(0, FULL_SCAN_INTERVAL - (now - lastFullScanAt)));
			}
			return Math.ceil(Math.max(regularHeight, lastDescendantHeight));
		}

		function reportHeight() {
			scheduled = false;

			var height = measureHeight();
			if (height > 0 && height !== lastHeight) {
				lastHeight = height;
				parent.postMessage({ type: "html-preview-height", height: height }, "*");
			}
		}

		function scheduleReport() {
			needsFullScan = true;
			if (scheduled) return;
			scheduled = true;

			if (typeof window.requestAnimationFrame === "function") {
				window.requestAnimationFrame(reportHeight);
			} else {
				window.setTimeout(reportHeight, 16);
			}
		}

		function scheduleDelayedReports() {
			scheduleReport();
			var delays = [50, 250, 1000];
			for (var i = 0; i < delays.length; i++) {
				if (delayedTimers[i] !== null) continue;
				(function(index) {
					delayedTimers[index] = window.setTimeout(function() {
						delayedTimers[index] = null;
						scheduleReport();
					}, delays[index]);
				})(i);
			}
		}

		function watchImage(image) {
			if (watchedImages && watchedImages.has(image)) return;
			if (watchedImages) watchedImages.add(image);

			if (!image.complete) {
				image.addEventListener("load", scheduleDelayedReports, { once: true });
				image.addEventListener("error", scheduleDelayedReports, { once: true });
			}
		}

		function watchImages(root) {
			if (!root) return;
			if (root.nodeType === 1 && root.tagName === "IMG") watchImage(root);
			if (typeof root.querySelectorAll !== "function") return;

			var images = root.querySelectorAll("img");
			for (var i = 0; i < images.length; i++) {
				watchImage(images[i]);
			}
		}

		function observeLayoutChanges() {
			if (typeof ResizeObserver === "function") {
				resizeObserver = new ResizeObserver(scheduleDelayedReports);
				if (document.body) resizeObserver.observe(document.body);
				if (document.documentElement) resizeObserver.observe(document.documentElement);
			}

			if (typeof MutationObserver === "function" && document.documentElement) {
				mutationObserver = new MutationObserver(function(mutations) {
					for (var i = 0; i < mutations.length; i++) {
						var addedNodes = mutations[i].addedNodes;
						for (var j = 0; j < addedNodes.length; j++) {
							watchImages(addedNodes[j]);
						}
					}
					scheduleDelayedReports();
				});
				mutationObserver.observe(document.documentElement, {
					attributes: true,
					characterData: true,
					childList: true,
					subtree: true
				});
			}

			if (!resizeObserver && !mutationObserver) {
				fallbackTimer = window.setInterval(scheduleReport, 500);
			}
		}

		function observeFonts() {
			observedFonts = document.fonts;
			if (!observedFonts) return;

			if (observedFonts.ready && typeof observedFonts.ready.then === "function") {
				observedFonts.ready.then(scheduleDelayedReports).catch(function() {});
			}

			if (typeof observedFonts.addEventListener === "function") {
				observedFonts.addEventListener("loadingdone", scheduleDelayedReports);
				observedFonts.addEventListener("loadingerror", scheduleDelayedReports);
			}
		}

		function start() {
			watchImages(document);
			observeLayoutChanges();
			observeFonts();
			scheduleDelayedReports();
		}

		function cleanup() {
			window.removeEventListener("resize", scheduleDelayedReports);
			window.clearInterval(fallbackTimer);
			window.clearTimeout(fullScanTimer);
			for (var i = 0; i < delayedTimers.length; i++) window.clearTimeout(delayedTimers[i]);

			if (resizeObserver) resizeObserver.disconnect();
			if (mutationObserver) mutationObserver.disconnect();

			if (observedFonts && typeof observedFonts.removeEventListener === "function") {
				observedFonts.removeEventListener("loadingdone", scheduleDelayedReports);
				observedFonts.removeEventListener("loadingerror", scheduleDelayedReports);
			}
		}

		window.addEventListener("resize", scheduleDelayedReports);
		window.addEventListener("load", function() {
			watchImages(document);
			scheduleDelayedReports();
		});
		window.addEventListener("unload", cleanup, { once: true });

		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", start, { once: true });
		} else {
			start();
		}
	})();
	`;
}

export function isHeightMessage(data: unknown): data is HeightMessage {
	if (typeof data !== "object" || data === null) return false;
	const candidate = data as Partial<HeightMessage>;
	return candidate.type === "html-preview-height"
		&& typeof candidate.height === "number"
		&& Number.isFinite(candidate.height)
		&& candidate.height > 0;
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
