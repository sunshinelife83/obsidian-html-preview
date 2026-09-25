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
		expect(document.querySelectorAll("#html-preview-storage-shim")).toHaveLength(1);
		expect(document.querySelectorAll(`#${HEIGHT_REPORTER_ID}`)).toHaveLength(1);
		expect(document.querySelectorAll("meta[charset]")).toHaveLength(1);
		expect(document.querySelector("meta[charset]")?.getAttribute("charset")).toBe("utf-8");
	});

	it("injects the storage shim before user scripts", () => {
		const document = parse(buildPreviewDocument(`
			<!doctype html>
			<html>
				<head>
					<script>window.before = window.localStorage</script>
				</head>
				<body>
					<script>window.after = window.sessionStorage</script>
				</body>
			</html>
		`));

		const headScripts = Array.from(document.head.querySelectorAll("script"));
		expect(headScripts[0]?.id).toBe("html-preview-storage-shim");
		expect(headScripts[0]?.textContent).toContain('installStorageFallback("localStorage")');
		expect(headScripts[0]?.textContent).toContain('installStorageFallback("sessionStorage")');
	});

	it("keeps injected styles minimal and non-invasive", () => {
		const document = parse(buildPreviewDocument("<p>Example</p>"));
		const styles = document.getElementById("html-preview-base-styles")?.textContent ?? "";

		expect(styles).toContain(":where(html,body)");
		expect(styles).not.toContain("font-family");
		expect(styles).not.toContain("overflow");
		expect(styles).not.toContain("::-webkit-scrollbar");
		expect(styles).not.toContain("box-sizing");
	});
});
