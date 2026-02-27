# Lumina Documentation

> Complete reference guide for the Lumina media gallery plugin for Obsidian.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Gallery Interface](#gallery-interface)
4. [Tag System](#tag-system)
5. [Lumina Blocks](#lumina-blocks)
6. [Block Editor](#block-editor)
7. [Layouts](#layouts)
8. [Lightbox Viewer](#lightbox-viewer)
9. [Picture-in-Picture](#picture-in-picture)
10. [Edit Mode](#edit-mode)
11. [Slideshow](#slideshow)
12. [Virtual Search](#virtual-search)
13. [Settings](#settings)
14. [Keyboard Shortcuts](#keyboard-shortcuts)
15. [Troubleshooting](#troubleshooting)

---

## Overview

Lumina is a high-performance media gallery plugin that transforms how you interact with images, videos, and visual content in Obsidian. It provides:

- **Fast browsing** of thousands of media files with caching
- **Powerful tagging** with hashtags and note links
- **Embedded galleries** in your markdown notes
- **Full integration** with Obsidian's ecosystem

### Supported File Types

| Category | Extensions |
|----------|------------|
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg` |
| Videos | `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv` |
| Documents | `.pdf` (thumbnail preview) |

### System Requirements

- Obsidian 1.0.0 or higher
- Modern browser engine (Chromium-based recommended)

---

## Installation

### Via BRAT (Recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) is the recommended installation method for beta plugins.

1. Install and enable the BRAT plugin
2. Open **Settings** → **BRAT** → **Add Beta Plugin**
3. Enter the repository: `infinition/obsidian-lumina`
4. Click **Add Plugin**
5. Go to **Settings** → **Community Plugins**
6. Enable **Lumina**

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/infinition/obsidian-lumina/releases)
2. Extract the following files:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `worker.js`
3. Create folder: `YourVault/.obsidian/plugins/obsidian-lumina/`
4. Copy all files into this folder
5. Restart Obsidian
6. Enable the plugin in **Settings** → **Community Plugins**

---

## Gallery Interface

### Opening Lumina

There are two ways to open the Lumina gallery:

1. **Ribbon Icon** — Click the camera icon in the left sidebar
2. **Command Palette** — Press `Ctrl+P` and search "Open Lumina"

### Toolbar Components

The toolbar appears at the top of the gallery and contains:

| Component | Description |
|-----------|-------------|
| **Search Bar** | Filter media by name, tags, or note links |
| **Sort Dropdown** | Change sort order (date, name, size, etc.) |
| **Type Filter** | Show only photos, videos, or all |
| **Folder Filter** | Restrict to specific folders |
| **Filename Toggle** | Show/hide filenames under thumbnails |
| **Edit Mode** | Enable multi-select for batch operations |
| **Zoom Slider** | Adjust thumbnail size |
| **Pin Button** | Prevent toolbar auto-hide |
| **Slideshow** | Start automatic playback |
| **Help** | Show keyboard shortcuts |
| **Fullscreen** | Toggle fullscreen mode |

### Toolbar Auto-Hide

By default, the toolbar hides after 10 seconds of inactivity:

- **Hover** at the top of the gallery to reveal it
- **Click the pin icon** to keep it always visible

### Timeline Scrubber

A timeline scrubber appears when hovering the right edge of the gallery:

- **Click** to jump to a section
- **Drag** for smooth scrolling
- Labels show date, letter, or file type depending on sort order

---

## Tag System

The tag system is Lumina's most powerful feature, allowing you to organize media files with the same flexibility as Obsidian notes.

> 📖 **For comprehensive tag documentation, see [TAG_SYSTEM.md](TAG_SYSTEM.md)**

### Quick Overview

Lumina supports two types of tags:

**Hashtags** — Standard tags prefixed with `#`
```
#vacation
#2024
#screenshot
```

**Note Links** — Wiki-style links to connect media to notes
```
[[Projects/Website]]
[[People/John]]
[[Trips/Paris 2024]]
```

### Adding Tags

1. **Right-click** any media file
2. Select **Manage Tags**
3. Type your tag and press Enter
4. For note links, type `[[` to see suggestions

### Searching with Tags

Use the search bar with boolean operators:

```
#vacation                    → Files tagged with #vacation
[[Projects/Alpha]]           → Files linked to the note
#2024 AND #photo             → Must have both tags
#work OR #project            → Either tag
#screenshot NOT #old         → Exclude a tag
-#private                    → Shorthand for NOT
```

---

## Lumina Blocks

Lumina Blocks let you embed dynamic media galleries directly in your markdown notes.

### Basic Syntax

````markdown
```lumina
query: #vacation
layout: grid
columns: 4
```
````

### All Options

| Option | Type | Values | Default | Description |
|--------|------|--------|---------|-------------|
| `query` | string | Tags, links, operators | `""` | Filter expression |
| `layout` | enum | `grid`, `masonry`, `justified`, `square`, `inline` | `grid` | Display layout |
| `columns` | number | 1-10 | 4 | Number of columns |
| `size` | number | 50-500 | 150 | Thumbnail size in pixels |
| `maxItems` | number | 1-1000 | 50 | Maximum files to show |
| `showNames` | boolean | `true`/`false` | `false` | Display filenames |
| `showTags` | boolean | `true`/`false` | `false` | Display tags |
| `sortBy` | enum | `date-desc`, `date-asc`, `name`, `random` | `date-desc` | Sort order |
| `type` | enum | `all`, `photo`, `video`, `gif` | `all` | Media type filter |
| `video` | enum | `mixed`, `separate` | `mixed` | Video display mode |
| `folder` | string | Path | `""` | Restrict to folder |
| `align` | enum | `left`, `center`, `right` | `left` | Block alignment |

### Example Blocks

**Centered Photo Gallery**

````markdown
```lumina
query: #photos AND [[2024]]
layout: justified
columns: 3
align: center
showTags: true
```
````

**Random Favorites**

````markdown
```lumina
query: #favorite
sortBy: random
maxItems: 10
layout: masonry
columns: 4
```
````

**Inline Thumbnails**

````markdown
Here are the reference images:

```lumina
query: [[Projects/Design]]
layout: inline
size: 80
maxItems: 5
```

As shown above, the design follows...
````

**Project Screenshots with Videos Separate**

````markdown
```lumina
query: #screenshot AND [[Project Alpha]]
video: separate
layout: grid
columns: 5
showNames: true
```
````

---

## Block Editor

Lumina provides a visual editor for blocks—no code required!

### Opening the Editor

1. **Hover** over any Lumina block in your note
2. The editor panel appears above the gallery
3. Make changes visually
4. Click **Save** to update the code

### Editor Sections

**Query Builder**
- Add tags and note links as tokens
- Choose operators (AND/OR/NOT) between tokens
- Autocomplete suggestions for existing tags and notes

**Layout Options**
- Click layout icons to switch styles
- Adjust columns with slider
- Set thumbnail size

**Display Settings**
- Toggle filenames and tags
- Set maximum items
- Choose media type filter
- Select sort order

**Alignment**
- Left, center, or right align the block

### Drag-and-Drop Reordering

Within a Lumina block, you can reorder files:

1. **Hover** over a file to see the drag handle
2. **Drag** to a new position
3. The order is saved automatically

---

## Layouts

Lumina offers five layout modes:

### Grid

Regular grid with uniform cell sizes. Best for:
- Consistent visual appearance
- Quick scanning
- Mixed media types

### Masonry

Pinterest-style layout preserving aspect ratios. Best for:
- Varied image dimensions
- Photography portfolios
- Natural flow

### Justified

Rows with equal height, variable widths. Best for:
- Google Photos-like experience
- Compact display
- Professional galleries

### Square

Uniform squares with cropped previews. Best for:
- Profile pictures
- Icon collections
- Thumbnail grids

### Inline

Horizontal flow within text. Best for:
- Small previews
- Inline references
- Compact embedding

---

## Lightbox Viewer

Double-click any media to open the fullscreen lightbox.

### Controls

| Action | Method |
|--------|--------|
| **Close** | Press `Escape`, double-click background, or click ✕ |
| **Navigate** | Arrow keys `←` `→` or swipe |
| **Zoom** | `Ctrl+Scroll` or pinch gesture |
| **Pan** | Click and drag when zoomed |

### Information Panel

The lightbox displays:
- Filename and path
- File size and dimensions
- Creation/modification date
- Associated tags (clickable)

### Actions

- **Copy Link** — Copy wiki link to clipboard
- **Add to Note** — Insert link into a note
- **Open File** — Open in default application
- **Manage Tags** — Add or remove tags
- **Delete** — Move to trash

---

## Picture-in-Picture

Watch videos in a floating window while working.

### Enabling PIP

1. Open a video in the lightbox
2. Click the **PIP button** (overlapping rectangles icon)
3. The video detaches to a floating window

### PIP Features

- **Movable** — Drag anywhere on screen
- **Resizable** — Adjust window size
- **Persistent** — Continues playing while you work
- **Close** — Click PIP again or close the window

### Compatibility

PIP requires browser/Electron support. Works with:
- Local video files (MP4, WebM, etc.)
- YouTube embeds (in supported browsers)

---

## Edit Mode

Edit mode enables batch operations on multiple files.

### Entering Edit Mode

- **Ctrl+Click** any thumbnail, or
- Click the **Edit Mode** button in the toolbar

### Selection

| Action | Method |
|--------|--------|
| Select one | Click |
| Select range | Shift+Click between two files |
| Toggle selection | Ctrl+Click |
| Select all | Ctrl+A |
| Deselect all | Escape |

### Batch Actions

When files are selected, a toolbar appears with:

**Manage Tags**
- Add tags to all selected files
- Remove tags from all selected files
- View common tags across selection

**Add to Note**
- Search for a target note
- Insert wiki links for all selected files

**Copy Links**
- Copy `![[filename]]` links to clipboard
- Ready to paste into any note

**Delete**
- Move selected files to Obsidian's trash
- Confirmation required

### Drag and Drop

Drag selected files to:
- **An open note** — Insert wiki links at drop position
- **File explorer** — Move files to a folder

---

## Slideshow

Automatic playback through your media.

### Starting Slideshow

Click the slideshow button to cycle through intervals:
```
5s → 10s → 30s → 60s → 10min → OFF
```

### During Slideshow

- **5-second countdown** before starting
- **Arrow keys** — Manual navigation
- **Click anywhere** — Stop slideshow
- **Escape** — Stop slideshow

---

## Virtual Search

Lumina integrates with Obsidian's global search to make tagged media discoverable.

### How It Works

When enabled, searching in Obsidian (Ctrl+Shift+F) will also find:
- Media files with matching tags
- Files linked to matching notes

### Enabling Virtual Search

1. Go to **Settings** → **Lumina**
2. Enable **Virtual Search**
3. Optionally configure click behavior:
   - **Open in Obsidian** — Native file handling
   - **Open in Lumina** — Lightbox viewer

### Search Examples

In Obsidian's global search:
```
#vacation          → Notes AND media with this tag
[[Project Alpha]]  → Notes AND media linked to this note
```

---

## Settings

Access via **Settings** → **Lumina**

### General Settings

| Setting | Description |
|---------|-------------|
| **Language** | Interface language (EN, FR, DE, ES, ZH) |
| **Enable Tag System** | Toggle all tagging features |

### Tag Settings

| Setting | Description |
|---------|-------------|
| **Tag Indicator** | Show colored dot on tagged files in Explorer |
| **Indicator Position** | Left or right of filename |
| **Tag Click Action** | Search in Lumina or Obsidian |

### Search Integration

| Setting | Description |
|---------|-------------|
| **Enable Virtual Search** | Include media in Obsidian search |
| **Click Action** | Open results in Obsidian or Lumina |

### Gallery Settings

| Setting | Description |
|---------|-------------|
| **Block Click Action** | Preview fullscreen or open file |

---

## Keyboard Shortcuts

### Gallery

| Shortcut | Action |
|----------|--------|
| `↑` `↓` `←` `→` | Scroll gallery |
| `Ctrl+Wheel` | Zoom in/out |
| `Ctrl+Click` | Enter edit mode |
| `Ctrl+V` | Paste YouTube URL |
| `Escape` | Exit edit mode |

### Lightbox

| Shortcut | Action |
|----------|--------|
| `←` `→` | Previous/next media |
| `Escape` | Close lightbox |
| `Ctrl+Wheel` | Zoom content |

### Edit Mode

| Shortcut | Action |
|----------|--------|
| `Click` | Select file |
| `Shift+Click` | Select range |
| `Ctrl+Click` | Toggle selection |
| `Ctrl+A` | Select all |
| `Escape` | Exit edit mode |

### File Explorer

| Shortcut | Action |
|----------|--------|
| `Shift+T` | Open tag manager for selected files |

---

## Troubleshooting

### Gallery Shows No Media

**Causes:**
- No media files in selected folders
- Filters excluding all files

**Solutions:**
- Enable "Entire vault" in folder filter
- Check type filters (Photos/Videos enabled)
- Clear search query

### Slow Loading

**Causes:**
- Large library on first load
- Cache not populated

**Solutions:**
- First load builds cache, subsequent loads are faster
- Reduce zoom level to show fewer thumbnails
- Wait for indexing to complete

### Videos Won't Play

**Causes:**
- Unsupported codec
- Corrupted file

**Solutions:**
- Convert to MP4/H.264 format
- Test file in external player

### Tags Not Appearing

**Causes:**
- Tag system disabled
- Indicator hidden

**Solutions:**
- Enable tag system in settings
- Check indicator position setting
- Try toggling left/right position

### Blocks Not Rendering

**Causes:**
- Invalid YAML syntax
- Typo in options

**Solutions:**
- Check for proper indentation
- Use the visual editor to generate code
- Verify option names match documentation

### Worker Errors

**Causes:**
- Missing worker.js file
- File permissions issue

**Solutions:**
- Ensure `worker.js` is in plugin folder
- Reinstall plugin
- Check file permissions

---

## Technical Details

### Architecture

```
obsidian-lumina/
├── main.js              # Compiled plugin entry
├── worker.js            # Web Worker for thumbnails
├── styles.css           # Global styles
├── manifest.json        # Plugin metadata
└── src/
    ├── main.ts          # Plugin initialization
    ├── view.tsx         # React view wrapper
    ├── settings.ts      # Settings tab
    ├── components/      # React components
    ├── services/        # Business logic
    └── i18n/            # Translations
```

### Performance

- **IndexedDB** — Persistent thumbnail cache
- **Web Workers** — Off-thread image processing
- **Virtual Scrolling** — Only renders visible items
- **Lazy Loading** — Thumbnails load on demand

### Data Storage

Tags are stored in the plugin's `data.json` file:
```json
{
  "tagMap": {
    "path/to/image.jpg": ["#tag1", "[[Note]]"],
    ...
  }
}
```

---

## Changelog

### v1.1.0 (February 2026)

- ✨ Complete tag system (#hashtags and [[links]])
- ✨ Lumina blocks with visual editor
- ✨ Picture-in-Picture for videos
- ✨ Virtual search integration
- ✨ Drag-and-drop reordering in blocks
- ✨ Block alignment options
- ✨ Clickable tags in blocks
- ✨ Video separate mode
- ✨ Inline layout
- ✨ Backlink scanning
- ✨ File explorer tag indicators
- 🌍 5 complete languages
- ⚡ Performance improvements

### v1.0.0

- Initial release
- High-performance gallery
- Lightbox viewer
- Slideshow mode
- Edit mode with batch actions
- YouTube embed support

---

## Support

- **Issues:** [GitHub Issues](https://github.com/infinition/obsidian-lumina/issues)
- **Discussions:** [GitHub Discussions](https://github.com/infinition/obsidian-lumina/discussions)

---

## License

MIT © [Infinition](https://github.com/infinition)
