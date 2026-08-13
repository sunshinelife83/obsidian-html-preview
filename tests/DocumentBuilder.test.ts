import { describe, expect, it } from "vitest";
import { buildPreviewDocument } from "../src/DocumentBuilder";
import { HEIGHT_REPORTER_ID } from "../src/IframeBridge";

function parse(source: string): Document {
	return new DOMParser().parseFromString(source, "text/html");
}

describe("buildPreviewDocument", () => {
	it("normalizes fragments into a complete preview document", () => {
		const document = parse(buildPreviewDocument("<h1>Hello</h1>"));

		expect(document.characterSet).toBe("UTF-8");
		expect(document.querySelector('meta[name="viewport"]')).not.toBeNull();
		expect(document.body.querySelector("h1")?.textContent).toBe("Hello");
		expect(document.getElementById(HEIGHT_REPORTER_ID)).not.toBeNull();
	});

	it("preserves full documents and does not duplicate injected elements", () => {
		const source = `<!doctype html><HTML><HEAD><meta charset="iso-8859-1"><title>Example</title></HEAD><BODY><script>window.value = 1</script></BODY></HTML>`;
		const once = buildPreviewDocument(source);
		const document = parse(buildPreviewDocument(once));

		expect(document.title).toBe("Example");
		expect(document.body.querySelector("script")?.textContent).toContain("window.value");
		expect(document.querySelectorAll("#html-preview-base-styles")).toHaveLength(1);
		expect(document.querySelectorAll(`#${HEIGHT_REPORTER_ID}`)).toHaveLength(1);
		expect(document.querySelectorAll("meta[charset]")).toHaveLength(1);
		expect(document.querySelector("meta[charset]")?.getAttribute("charset")).toBe("utf-8");
	});
});
