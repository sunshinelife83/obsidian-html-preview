import { describe, expect, it } from "vitest";
import {
	applyHeight,
	clampHeight,
	MAX_PREVIEW_HEIGHT,
	MIN_PREVIEW_HEIGHT,
} from "../src/PreviewSizing";

describe("preview sizing", () => {
	it("clamps heights to supported bounds", () => {
		expect(clampHeight(0)).toBe(MIN_PREVIEW_HEIGHT);
		expect(clampHeight(320)).toBe(320);
		expect(clampHeight(5000)).toBe(MAX_PREVIEW_HEIGHT);
	});

	it("ignores invalid reported heights", () => {
		const iframe = document.createElement("iframe");
		applyHeight(iframe, 280);
		applyHeight(iframe, Number.NaN);
		applyHeight(iframe, -1);

		expect(iframe.style.height).toBe("280px");
	});
});
