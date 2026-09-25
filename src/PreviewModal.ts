import { App, Modal, setIcon } from "obsidian";
import { buildPreviewDocument } from "./DocumentBuilder";

/** Browser-like fullscreen view of a single preview document. */
export class HTMLPreviewModal extends Modal {
	constructor(app: App, private readonly source: string) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("html-preview-modal");
		this.contentEl.addClass("html-preview-modal-content");

		const toolbar = this.contentEl.createDiv({ cls: "html-preview-modal-toolbar" });
		toolbar.createSpan({ cls: "html-preview-modal-title", text: "HTML preview" });

		const reloadButton = toolbar.createEl("button", {
			cls: "clickable-icon html-preview-modal-btn",
			attr: { type: "button", title: "Reload preview", "aria-label": "Reload preview" },
		});
		setIcon(reloadButton, "refresh-cw");

		const iframe = this.contentEl.createEl("iframe", {
			cls: "html-preview-modal-iframe",
			attr: {
				sandbox: "allow-scripts allow-forms",
				scrolling: "auto",
				title: "Fullscreen HTML preview",
			},
		});

		const reload = () => {
			iframe.srcdoc = buildPreviewDocument(this.source);
		};
		reloadButton.addEventListener("click", reload);
		reload();
	}

	onClose(): void {
		this.modalEl.removeClass("html-preview-modal");
		this.contentEl.empty();
	}
}
