import { App, PluginSettingTab, Setting } from "obsidian";
import type HTMLPreviewPlugin from "./main";
import {
	MAX_SHORT_PAGE_THRESHOLD, MAX_ZOOM, MIN_SHORT_PAGE_THRESHOLD, MIN_ZOOM, ZOOM_STEP,
} from "./PreviewSizing";
import { DefaultSizingMode, PreviewViewportMode } from "./types";

export class HTMLPreviewSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: HTMLPreviewPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "These defaults apply to blocks without a saved view. Each preview can still be adjusted from its toolbar.",
		});

		new Setting(containerEl)
			.setName("Default height behavior")
			.setDesc("Automatically fit short pages and scroll long pages, or always start in a chosen mode.")
			.addDropdown((dropdown) => dropdown
				.addOption("adaptive", "Fit short pages, scroll long pages")
				.addOption("manual", "Always scroll")
				.addOption("auto", "Always fit content")
				.setValue(this.plugin.settings.defaultSizingMode)
				.onChange(async (value) => {
					this.plugin.settings.defaultSizingMode = value as DefaultSizingMode;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Short page cutoff")
			.setDesc("In adaptive mode, fit pages no taller than this many displayed pixels. Longer pages scroll in a 16:9 viewport.")
			.addSlider((slider) => slider
				.setLimits(MIN_SHORT_PAGE_THRESHOLD, MAX_SHORT_PAGE_THRESHOLD, 50)
				.setDynamicTooltip()
				.setValue(this.plugin.settings.shortPageThreshold)
				.onChange(async (value) => {
					this.plugin.settings.shortPageThreshold = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default viewport")
			.setDesc("Desktop preserves desktop navigation and breakpoints. Responsive uses the full note width.")
			.addDropdown((dropdown) => dropdown
				.addOption("desktop", "Desktop")
				.addOption("responsive", "Responsive")
				.setValue(this.plugin.settings.defaultViewportMode)
				.onChange(async (value) => {
					this.plugin.settings.defaultViewportMode = value as PreviewViewportMode;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Desktop viewport width")
			.setDesc("A smaller width is easier to read; a larger width is closer to a full browser window.")
			.addSlider((slider) => slider
				.setLimits(769, 1440, 32)
				.setDynamicTooltip()
				.setValue(this.plugin.settings.desktopViewportWidth)
				.onChange(async (value) => {
					this.plugin.settings.desktopViewportWidth = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default zoom")
			.setDesc("Adjust the initial visual size. Use the toolbar controls for individual previews.")
			.addSlider((slider) => slider
				.setLimits(MIN_ZOOM, MAX_ZOOM, ZOOM_STEP)
				.setDynamicTooltip()
				.setValue(this.plugin.settings.defaultZoom)
				.onChange(async (value) => {
					this.plugin.settings.defaultZoom = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Resizable preview height")
			.setDesc("Starting height when Always scroll is selected. Adaptive previews use a 16:9 viewport instead.")
			.addSlider((slider) => slider
				.setLimits(200, 1200, 50)
				.setDynamicTooltip()
				.setValue(this.plugin.settings.defaultHeight)
				.onChange(async (value) => {
					this.plugin.settings.defaultHeight = value;
					await this.plugin.saveSettings();
				}));
	}
}
