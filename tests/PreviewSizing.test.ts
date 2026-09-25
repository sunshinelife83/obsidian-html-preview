import { describe, expect, it } from "vitest";
import {
	AUTO_HEIGHT_SAFETY_LIMIT,
	clampAutoHeight,
	clampManualHeight,
	clampPreviewWidth,
	clampShortPageThreshold,
	clampZoom,
	fitsShortPage,
	getAspectRatioHeight,
	getDefaultHeight,
	MAX_MANUAL_PREVIEW_HEIGHT,
	MAX_ZOOM,
	MIN_PREVIEW_HEIGHT,
	MIN_PREVIEW_WIDTH,
	MIN_ZOOM,
} from "../src/PreviewSizing";
import { DEFAULT_CONFIG, resolveDefaultSizingMode } from "../src/types";

describe("preview sizing", () => {
	it("clamps manual heights to a conservative resizable range", () => {
		expect(clampManualHeight(0)).toBe(MIN_PREVIEW_HEIGHT);
		expect(clampManualHeight(320)).toBe(320);
		expect(clampManualHeight(5000)).toBe(MAX_MANUAL_PREVIEW_HEIGHT);
	});

	it("allows auto heights to follow long content up to the safety limit", () => {
		expect(clampAutoHeight(0)).toBe(MIN_PREVIEW_HEIGHT);
		expect(clampAutoHeight(5000)).toBe(5000);
		expect(clampAutoHeight(100000)).toBe(AUTO_HEIGHT_SAFETY_LIMIT);
	});

	it("clamps zoom to the supported toolbar range", () => {
		expect(clampZoom(Number.NaN)).toBe(1);
		expect(clampZoom(0.1)).toBe(MIN_ZOOM);
		expect(clampZoom(5)).toBe(MAX_ZOOM);
		expect(clampZoom(1.234)).toBe(1.23);
	});

	it("keeps manual widths inside the available note width", () => {
		expect(clampPreviewWidth(200, 900)).toBe(MIN_PREVIEW_WIDTH);
		expect(clampPreviewWidth(640, 900)).toBe(640);
		expect(clampPreviewWidth(1200, 900)).toBe(900);
		expect(clampPreviewWidth(Number.NaN, 900)).toBe(MIN_PREVIEW_WIDTH);
	});

	it("never exceeds hosts that are narrower than the minimum preview width", () => {
		expect(clampPreviewWidth(500, 200)).toBe(200);
		expect(clampPreviewWidth(Number.NaN, 0)).toBe(MIN_PREVIEW_WIDTH);
	});

	it("derives a 16:9 scrolling viewport from the visible note width", () => {
		expect(getAspectRatioHeight(800)).toBe(450);
		expect(getAspectRatioHeight(320)).toBe(180);
		expect(getAspectRatioHeight(5000)).toBe(MAX_MANUAL_PREVIEW_HEIGHT);
	});

	it("fits short pages according to displayed height and a bounded cutoff", () => {
		expect(clampShortPageThreshold(100)).toBe(200);
		expect(clampShortPageThreshold(2000)).toBe(1200);
		expect(fitsShortPage(600, 1, 600)).toBe(true);
		expect(fitsShortPage(601, 1, 600)).toBe(false);
		expect(fitsShortPage(400, 1.5, 600)).toBe(true);
		expect(fitsShortPage(401, 1.5, 600)).toBe(false);
	});

	it("migrates the old fit default to adaptive while keeping a scrolling choice", () => {
		expect(resolveDefaultSizingMode(undefined, undefined)).toBe("adaptive");
		expect(resolveDefaultSizingMode(undefined, true)).toBe("adaptive");
		expect(resolveDefaultSizingMode(undefined, false)).toBe("manual");
		expect(resolveDefaultSizingMode("adaptive", true)).toBe("adaptive");
	});

	it("derives the starting manual height from the saved settings", () => {
		expect(getDefaultHeight({ ...DEFAULT_CONFIG, defaultHeight: 300 })).toBe(300);
		expect(getDefaultHeight({ ...DEFAULT_CONFIG, defaultHeight: 9999 })).toBe(MAX_MANUAL_PREVIEW_HEIGHT);
	});
});
