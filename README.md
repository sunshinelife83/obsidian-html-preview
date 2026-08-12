# HTML Preview

HTML Preview is an Obsidian plugin that renders `html-preview` code blocks as interactive webpages directly inside notes.

## Features

- Runs HTML, CSS, and JavaScript in an isolated iframe.
- Automatically follows the rendered document height.
- Supports a manual height mode with pointer-based resizing.
- Refreshes one preview from its toolbar or every open preview from the command palette.
- Opens previews in a larger modal.
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

The preview toolbar provides refresh, fullscreen, copy, and sizing controls. In manual sizing mode, drag the handle below the preview to change its height.

Use **HTML Preview: Refresh all HTML previews** from the command palette to reload every mounted preview.

## Security

Preview code runs with the iframe sandbox permissions `allow-scripts allow-forms`. It does not receive same-origin access to Obsidian, popup permission, or direct access to the vault through this plugin.

HTML can still make external network requests through normal browser APIs. Only run code you understand, especially when opening notes from untrusted sources.

Strict isolation means previews cannot directly access Obsidian APIs, the host document, or local vault resources that require same-origin access.

## Installation

### Community plugins

Once listed in the Obsidian community plugin directory:

1. Open **Settings > Community plugins**.
2. Select **Browse** and search for **HTML Preview**.
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
