<p align="center">
  <img src="https://raw.githubusercontent.com/infinition/obsidian-lumina/main/logo.png" alt="Lumina" width="128">
</p>

<h1 align="center">✨ Lumina</h1>

<p align="center">
  <strong>The Ultimate Media Gallery for Obsidian</strong><br>
  <em>Transform your vault into a powerful visual knowledge base</em>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-documentation">Documentation</a> •
  <a href="#-showcase">Showcase</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.0+-purple?style=for-the-badge&logo=obsidian" alt="Obsidian">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Languages-5-blue?style=for-the-badge" alt="Languages">
</p>

---

## 🎯 Why Lumina?

Obsidian excels at connecting ideas through text, but what about your **images, videos, and visual content**? 

Lumina bridges this gap by treating media as **first-class citizens** in your knowledge graph. Tag your screenshots, link photos to project notes, search across thousands of images instantly—all without leaving Obsidian.

### The Problem

- 📁 Media files scattered across folders with no organization
- 🔍 Can't search for images by content or context
- 🔗 No way to connect photos to related notes
- 📝 Manual embedding is tedious and breaks workflow

### The Solution

Lumina provides a **unified media experience** with powerful tagging, instant search, and seamless note integration.

---

## ⚡ Features

### 🖼️ High-Performance Gallery

<table>
<tr>
<td width="50%">

**Lightning Fast**
- IndexedDB caching for instant loads
- Web Worker thumbnail generation
- Virtual scrolling for 10,000+ files
- Smart lazy loading

</td>
<td width="50%">

**Multiple Layouts**
- Grid, Masonry, Justified, Square
- Panorama mode for immersive viewing
- Adjustable zoom (10-100 items/row)
- Auto-hiding toolbar

</td>
</tr>
</table>

### 🏷️ Revolutionary Tag System

The heart of Lumina—organize media with the same power you organize notes.

```
#vacation #2024              → Hashtags like Obsidian
[[Projects/Website]]         → Link to any note
#photo AND [[Paris]]         → Boolean search
```

**Key capabilities:**
- **Hashtags** (`#tag`) — Familiar tagging syntax
- **Note Links** (`[[Note]]`) — Create bidirectional connections
- **Boolean Search** — AND, OR, NOT operators
- **Batch Tagging** — Tag hundreds of files at once
- **Auto-sync** — Tags sync with note frontmatter

📖 **[Full Tag System Documentation](docs/TAG_SYSTEM.md)**

### 📝 Lumina Blocks

Embed dynamic galleries directly in your notes:

````markdown
```lumina
query: #screenshots AND [[Project Alpha]]
layout: masonry
columns: 3
showTags: true
```
````

**Block Features:**
- Visual editor (no code required)
- 10+ customizable options
- Live preview
- Drag-and-drop file reordering

### 🔍 Virtual Search Integration

**Your tagged media appears in Obsidian's global search!**

Search for `#vacation` and see both your notes AND your photos. Media files become discoverable alongside your markdown content.

### 🎬 Advanced Media Viewer

<table>
<tr>
<td width="33%">

**Images**
- Zoom & pan gestures
- EXIF data display
- Fullscreen mode

</td>
<td width="33%">

**Videos**
- Native playback
- Picture-in-Picture
- YouTube embeds

</td>
<td width="33%">

**Actions**
- Quick tagging
- Copy wiki links
- Add to notes

</td>
</tr>
</table>

### 🌍 Internationalization

Full support for 5 languages:
- 🇬🇧 English • 🇫🇷 Français • 🇩🇪 Deutsch • 🇪🇸 Español • 🇨🇳 中文

---

## 📦 Installation

### Option 1: BRAT (Recommended for Beta)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open **Settings** → **BRAT** → **Add beta plugin**
3. Enter: `infinition/obsidian-lumina`
4. Enable **Lumina** in Community Plugins

### Option 2: Manual Installation

1. Download from [Releases](https://github.com/infinition/obsidian-lumina/releases):
   - `main.js`, `manifest.json`, `styles.css`, `worker.js`
2. Create folder: `.obsidian/plugins/obsidian-lumina/`
3. Copy files to folder
4. Reload Obsidian & enable plugin

---

## 🚀 Quick Start

### 1. Open Lumina

Click the **camera icon** in the ribbon, or use `Ctrl+P` → "Open Lumina"

### 2. Browse Your Media

- **Scroll** through your vault's images and videos
- **Zoom** with the slider or `Ctrl+Wheel`
- **Filter** by folder or media type

### 3. Tag Your First File

1. **Right-click** any image
2. Select **Manage Tags**
3. Type `#vacation` and press Enter
4. Link to a note: type `[[` and select a note

### 4. Search

Type in the search bar:
```
#vacation                    → All vacation photos
[[Projects/Alpha]]           → Media linked to a project
#2024 AND #screenshot        → Combined filters
#work NOT #confidential      → Exclusion
```

### 5. Embed in Notes

Add a Lumina block to any note:

````markdown
```lumina
query: #vacation
layout: grid
columns: 4
```
````

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[Full Documentation](docs/DOCUMENTATION.md)** | Complete feature reference with all options |
| **[Tag System Guide](docs/TAG_SYSTEM.md)** | Deep dive into the tagging system |

---

## 🎨 Showcase

### 📷 Research Project

Organize research visuals with automatic connections:

```
Research/
├── Papers/
│   └── AI_Ethics.md           ← Note with research
├── Screenshots/
│   └── chart.png              ← Tagged: #ai [[Papers/AI_Ethics]]
└── Diagrams/
    └── flowchart.jpg          ← Tagged: #ai #diagram
```

In your note:
````markdown
## Visual References

```lumina
query: [[Papers/AI_Ethics]] OR #ai
layout: justified
showTags: true
```
````

**Result:** A live gallery of all visuals connected to your research!

### ✈️ Travel Journal

Tag photos with `#travel #paris #2024` and `[[Trips/Paris 2024]]`. 

Your trip note becomes a rich visual document that updates automatically as you add more photos.

### 🎨 Design System

Organize UI screenshots: `#component #button #dark-mode`

Search across your entire design library in milliseconds.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Click` | Enter edit mode (multi-select) |
| `Shift+T` | Tag selected files in Explorer |
| `←` `→` | Navigate in lightbox |
| `Escape` | Close / exit mode |
| `Ctrl+Wheel` | Zoom gallery |
| `Ctrl+A` | Select all (edit mode) |
| `Double-click` | Open lightbox |

---

## 🛠️ Settings

Access via **Settings** → **Lumina**

| Setting | Description |
|---------|-------------|
| Language | UI language (5 options) |
| Enable Tag System | Toggle tagging features |
| Tag Indicator | Show dot on tagged files in Explorer |
| Virtual Search | Include media in Obsidian search |
| Click Actions | Customize click behavior |

---

## 🤝 Contributing

Contributions are welcome! 

```bash
# Clone
git clone https://github.com/infinition/obsidian-lumina.git

# Install
npm install

# Development
npm run dev

# Build
npm run build
```

---

## 📄 License

MIT © [Infinition](https://github.com/infinition)

---

<p align="center">
  <strong>⭐ Star this repo if Lumina helps organize your visual knowledge!</strong>
</p>

<p align="center">
  <a href="https://github.com/infinition/obsidian-lumina/issues">Report Bug</a> •
  <a href="https://github.com/infinition/obsidian-lumina/discussions">Discussions</a>
</p>
