# HTML Preview

HTML Preview is an Obsidian plugin that renders `html-preview` code blocks as interactive webpages directly inside notes.

## Features

- Runs HTML, CSS, and JavaScript in an isolated iframe.
- Fits short pages automatically; longer pages start in a 16:9 scrolling viewport.
- Supports reliable pointer resizing across the iframe, keyboard controls, and click-to-step buttons.
- Supports readable desktop and responsive note-width viewport modes.
- Provides true per-preview zoom from 50% to 200%.
- Remembers each block's size, fit mode, viewport, and zoom across note rerenders and restarts.
- Refreshes one preview from its toolbar or every open preview from the command palette.
- Opens previews in a browser-like fullscreen modal with a reload control.
- Copies the original HTML source to the clipboard.
- Works on desktop and mobile versions of Obsidian.

## Usage

Create a fenced code block with the language `html-preview`:

````markdown
```html-preview
<!doctype html>
<html>
<head>
  <style>
    button {
      padding: 0.5rem 1rem;
    }
  </style>
</head>
<body>
  <button onclick="this.textContent = 'Clicked'">Click me</button>
</body>
</html>
```
````

The preview toolbar shows the active viewport, zoom, and height mode, followed by controls for viewport, zoom, sizing, reload, fullscreen, and copy. New previews start with an 800 px desktop canvas and a 16:9 scrolling area based on the available note width. Once the page reports its height, content at or below **600 displayed pixels** expands to fit without scrolling; longer pages remain scrollable. If page content or zoom changes, this adaptive choice updates automatically.

Switch to **Responsive** for the note-width layout. Zoom can be adjusted from 50% to 200%; enlarged previews scroll horizontally instead of reporting a fake zoom level. In manual sizing mode, drag the center grip for height or the bottom-right corner for width and height. Both controls also support the arrow keys (hold Shift for larger steps). The H and W minus/plus buttons adjust height and width by 50 px without dragging; the width plus button restores full width when it reaches the note edge. Double-click the center grip to return to automatic height, or click the corner to restore full width. Mouse resizing tracks the edge of the centered preview and can cross over the iframe. The toolbar wraps to fit narrow note panes, and plugin controls respect reduced-motion preferences.

Change the short-page cutoff or choose **Always scroll** / **Always fit content** under **Settings → HTML-Preview**. The resizable-height setting applies to Always scroll; adaptive previews use 16:9. An older saved scrolling default stays scrolling; the old fit-by-default behavior migrates to adaptive, while explicit per-block choices remain unchanged. Clicking the height toggle or manually resizing a preview overrides adaptive height behavior for that block. Changes to an individual preview's height, width, fit mode, viewport, and zoom are saved in the plugin's `data.json`, not in the note. Saved sizes follow a note rename. Block matching uses the note path, HTML content, and code-block position; after moving or reordering identical blocks, matching may be ambiguous. When Obsidian cannot provide the code block's section position, the preview uses defaults instead of applying another block's saved size. Website theme controls remain inside the rendered webpage, where their original scripts and styles can manage them.

Use **HTML Preview: Refresh all previews** from the command palette to reload every mounted preview.

## Security

Preview code runs with the iframe sandbox permissions `allow-scripts allow-forms`. It does not receive same-origin access to Obsidian, popup permission, or direct access to the vault through this plugin.

HTML can still make external network requests through normal browser APIs. Only run code you understand, especially when opening notes from untrusted sources.

Strict isolation means previews cannot directly access Obsidian APIs, the host document, or local vault resources that require same-origin access.

To reduce breakage for sandboxed apps, the preview injects an in-memory `localStorage` / `sessionStorage` fallback when the browser blocks those APIs inside the iframe. That fallback is isolated to the preview and does not persist like normal browser storage.

## Installation

### Community plugins

Once listed in the Obsidian community plugin directory:

1. Open **Settings > Community plugins**.
2. Select **Browse** and search for **HTML-Preview**.
3. Install and enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release.
2. Create `<vault>/.obsidian/plugins/html-preview/`.
3. Place the three downloaded files in that directory.
4. Reload Obsidian and enable **HTML Preview** under **Community plugins**.

## Development

Requirements:

- Node.js 20 or newer
- npm

Install dependencies and run the full quality gate:

```bash
npm ci
npm run check
```

Useful commands:

```bash
npm run dev       # rebuild on source changes
npm run typecheck # TypeScript validation
npm test          # regression tests
npm run build     # production main.js
```

The production plugin consists of `main.js`, `manifest.json`, and `styles.css`. Source files and tests are included in this repository for review and maintenance.

## Releasing

1. Update the version with `npm version patch`, `npm version minor`, or `npm version major`.
2. Push the resulting commit and version tag.
3. The release workflow verifies the project and creates a draft GitHub release containing the required plugin files.
4. Review the generated draft and publish it.

Git tags must use the exact version number without a `v` prefix, for example `1.0.1`.

## License

[MIT](LICENSE)
