# Lumina

**High-performance photo & video gallery for Obsidian.** Browse, organize, and manage your media with professional layouts, lightbox preview, slideshow, and seamless integration with your vault.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Layouts](#layouts)
- [Lightbox](#lightbox)
- [Edit Mode](#edit-mode)
- [Slideshow](#slideshow)
- [Filter & Sort](#filter--sort)
- [Timeline Scrubber](#timeline-scrubber)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Touch Support](#touch-support)
- [Supported Formats](#supported-formats)
- [Settings](#settings)
- [Architecture](#architecture)
- [Development](#development)
- [License](#license)

---

## Features

### Core

| Feature | Description |
|---------|-------------|
| **Multiple layouts** | Square grid, justified (masonry-style), panorama (full-height) with square/justified variants |
| **Lightbox** | Full-screen preview with zoom, pan, and navigation |
| **Slideshow** | Auto-advancing slideshow with configurable intervals (5s, 10s, 30s, 60s, 10min) |
| **Edit mode** | Multi-select, bulk actions (add to note, copy links, delete), drag-to-note |
| **Filter** | By folder, media type (photos/videos), full-text search |
| **Sort** | By modification date, creation date, date taken, file extension, name, or size |
| **Timeline scrubber** | Google Photos-style vertical scrubber for quick navigation |

### Performance

| Feature | Description |
|---------|-------------|
| **Web Worker** | Image decoding offloaded to a background thread via `createImageBitmap` |
| **Persistent cache** | IndexedDB cache for thumbnails and decoded images across sessions |
| **Video thumbnails** | Cached video poster frames for fast grid rendering |
| **Preloading** | Aggressive background preload of all visible and upcoming media |

### UX

| Feature | Description |
|---------|-------------|
| **Responsive** | Adapts to narrow panels; consolidated layout buttons, icon-only search, zoom +/- |
| **Toolbar auto-hide** | Toolbar collapses after 10s of inactivity; hover to reveal; pin to disable |
| **Filename tooltips** | Hover filenames 0.5s for full name, date, and size |
| **Internationalization** | English, Français, Deutsch, Español, 中文 |

---

## Installation

### From Obsidian Community Plugins

1. Open **Settings** → **Community plugins**
2. Turn off **Restricted mode** if needed
3. Click **Browse** and search for **Lumina**
4. Install and enable

### Manual

1. Download `main.js`, `manifest.json`, `styles.css`, and `worker.js` from the [Releases](https://github.com/infinition/obsidian-lumina/releases) page
2. Copy into `Vault/.obsidian/plugins/obsidian-lumina/`
3. Reload Obsidian and enable the plugin in **Settings** → **Community plugins**

---

## Quick Start

1. **Open Lumina** via the ribbon icon (image) or command palette (`Open Lumina`)
2. **Filter** by folder (or enable **All Vault**) and toggle **Photos** / **Videos**
3. **Choose layout** — justified (default), square, or panorama
4. **Double-click** any item to open in lightbox; use **Ctrl+Click** for edit mode

---

## Layouts

| Layout | Description |
|--------|-------------|
| **Justified** (default) | Masonry-style rows with variable heights; preserves aspect ratios |
| **Square** | Uniform grid; all thumbnails same size |
| **Panorama** | Full-height rows; click again to toggle square vs justified |

- **Zoom** — Slider or Ctrl+Wheel to resize grid
- **Show filenames** — Toggle captions under thumbnails

---

## Lightbox

Full-screen preview for photos and videos.

| Action | Method |
|--------|--------|
| Open | Double-click or right-click on item |
| Close | Escape, double-click background, or close button |
| Navigate | Left/right arrows, or swipe |
| Zoom | Mouse wheel (lightbox active) |
| Pan | Click and drag |
| Copy link | Copy Link button (wikilink format) |
| Add to note | Add to Note button |
| Delete | Delete button |

**UI auto-hide** — Controls fade after 5s of inactivity; move mouse to reveal.

---

## Edit Mode

| Action | Method |
|--------|--------|
| Enter | Ctrl+Click on any item |
| Exit | Escape or Cancel button |
| Select one | Click |
| Select range | Shift+Click between two items |
| Add/remove | Ctrl+Click to toggle |

### Bulk actions (edit toolbar)

- **Add to Note** — Pick a note and insert wikilinks
- **Copy Links** — Copy wikilinks to clipboard
- **Delete** — Move selection to Obsidian trash

### Drag to note

- Drag selection (or single item) onto an open `.md` file or a folder in the file explorer
- Inserts wikilinks at drop position or moves files to folder

---

## Slideshow

1. Click the **slideshow** icon; each click cycles: 5s → 10s → 30s → 60s → 10min → **OFF**
2. When not OFF, a **5-second countdown** runs before starting
3. Click anywhere to **interrupt**; slideshow stops and resets to OFF
4. **Keyboard** — Left/right arrows to navigate during slideshow

---

## Filter & Sort

### Filter

- **Photos** / **Videos** — Toggle visibility by type
- **Folders** — Limit to specific folders or enable **All Vault**
- **Search** — Filter by filename

### Sort

- Modifications (newest / oldest)
- Taken (creation date)
- Created (newest)
- By extension (.jpg, .png, etc.)
- Name (A–Z)
- Size (largest first)

---

## Timeline Scrubber

- **Show** — Hover over the right 15% of the gallery
- **Use** — Click or drag on the vertical track to jump to a section
- **Labels** — Sections based on sort (e.g. months for date sorts, letters for name, extensions for type)
- **Not in** — Panorama layout or during slideshow

---

## Keyboard Shortcuts

| Context | Shortcut | Action |
|---------|----------|--------|
| Gallery | Arrow keys | Scroll |
| Gallery | Ctrl+Wheel | Zoom |
| Lightbox | Escape | Close |
| Lightbox | Arrow keys | Navigate |
| Edit mode | Escape | Exit |
| Slideshow | Arrow keys | Navigate |

---

## Touch Support

- **Pan** — Swipe to scroll
- **Pinch** — Zoom grid (gallery) or content (lightbox)
- **Tap** — Select (edit mode) / open lightbox (double-tap)
- **Long-press** — Context menu (platform-dependent)

Designed for iOS/iPadOS and Windows touch devices.

---

## Supported Formats

### Images

`jpg`, `jpeg`, `png`, `gif`, `webp`, `svg`, `bmp`, `tiff`, `tif`, `ico`, `avif`, `apng`

- **GIFs** — Animated in both grid and lightbox

### Video

`mp4`, `webm`, `mov`, `avi`, `mkv`, `ogv`, `m4v`

- **Hover preview** — Plays after 0.8s hover (reduces accidental playback)
- **Thumbnails** — First frame cached in IndexedDB

---

## Settings

**Settings** → **Lumina**

| Option | Description |
|--------|-------------|
| **Language** | UI language: English, Français, Deutsch, Español, 中文 |

---

## Architecture

```
obsidian-lumina/
├── main.js              # Plugin entry, view registration
├── main.ts
├── worker.js            # Web Worker for image decoding
├── styles.css           # Global styles
├── manifest.json
├── src/
│   ├── main.ts          # LuminaPlugin
│   ├── view.tsx         # LuminaView (ItemView wrapper)
│   ├── components/
│   │   └── PhotoGallery.tsx   # Main React UI
│   ├── i18n/
│   │   └── locales.ts   # Translations (en, fr, de, es, zh)
│   ├── services/
│   │   └── bridge.ts    # WebOSAPI → Obsidian
│   ├── utils/
│   │   ├── imageLoader.ts    # Load, decode, cache
│   │   └── imageCache.ts    # IndexedDB persistence
│   ├── workers/
│   │   └── imageWorker.ts   # createImageBitmap offload
│   ├── settings.ts      # LuminaSettingTab
│   └── types.ts         # Shared types
```

### Data flow

- **Obsidian** → `LuminaView` mounts React `PhotoGalleryWidget`
- **Bridge** (`WebOSAPI`) provides: `getObsidianApp`, `loadWidgetState`, `saveWidgetState`, `resolveResourcePath`, `getWorkerUrl`, `getLocale`
- **State** — Folder selection, zoom, layout, sort, filters, etc. saved per widget instance via `saveWidgetState`
- **Cache** — IndexedDB for decoded images and video thumbnails; Web Worker for `createImageBitmap`

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/infinition/obsidian-lumina.git
cd obsidian-lumina
npm install
```

### Build

```bash
npm run build
```

Outputs: `main.js`, `worker.js` in project root.

### Dev mode

```bash
npm run dev
```

Watches and rebuilds on change. Symlink or copy build output into a test vault’s `.obsidian/plugins/obsidian-lumina/`.

### Project structure

- **TypeScript** + **React 18**
- **esbuild** for bundling (main + worker)
- **Obsidian** plugin API 0.15+

---

## Browser & Platform

- **Obsidian** min version: 0.15.0
- **Electron** (desktop) and **Web** (Obsidian Mobile) supported
- **IndexedDB** and **Web Workers** required
- **Touch** events handled for pan, pinch-zoom, tap

---

## Troubleshooting

| Issue | Possible cause | Action |
|-------|----------------|--------|
| Gallery empty | No media in selected folders | Enable **All Vault** or add folders |
| Slow loading | Large library, cold cache | First load populates cache; subsequent loads faster |
| Videos not playing | Codec/format | Prefer MP4/H.264 for broad support |
| Worker errors | Path/build | Ensure `worker.js` is next to `main.js` |
| Toolbar hidden | Auto-hide active | Hover top of view or pin via eye icon |

---

## Changelog

See [Releases](https://github.com/infinition/obsidian-lumina/releases) for version history.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT © [Infinition](https://github.com/infinition)
