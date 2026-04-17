# Lumina Tag System

> A comprehensive guide to organizing your media with tags and note links.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Tag Types](#tag-types)
3. [Adding Tags](#adding-tags)
4. [Removing Tags](#removing-tags)
5. [Searching with Tags](#searching-with-tags)
6. [Note Links Deep Dive](#note-links-deep-dive)
7. [Backlink Scanning](#backlink-scanning)
8. [Tag Indicators](#tag-indicators)
9. [Batch Tag Operations](#batch-tag-operations)
10. [Tag Display in Blocks](#tag-display-in-blocks)
11. [Virtual Search Integration](#virtual-search-integration)
12. [Best Practices](#best-practices)
13. [Workflow Examples](#workflow-examples)

---

## Introduction

Lumina's tag system extends Obsidian's powerful linking model to your media files. You can tag images and videos with the same hashtags and wiki-links you use in your notes, creating a unified, searchable system for all your content.

### Why Tag Media?

- **Find anything** — Search across thousands of files instantly
- **Connect media to notes** — Link images to projects, people, and concepts
- **Build visual context** — See all related media for any topic
- **Create smart galleries** — Lumina blocks filter by tags automatically

---

## Tag Types

### Hashtags

Standard tags prefixed with `#`. Use them for general categorization.

**Characteristics:**
- Begin with `#`
- Can include letters, numbers, hyphens, underscores
- Case-insensitive (`#Photo` = `#photo`)
- Nested tags supported (`#project/alpha`)

**Common Uses:**
- Categories: `#photo`, `#screenshot`, `#video`
- Years: `#2024`, `#2023`
- Status: `#favorite`, `#archive`, `#review`
- Location: `#paris`, `#home`, `#office`

**Examples:**
```text
#vacation
#work-meeting
#project/alpha
#2024/summer
```

### Note Links

Wiki-style links that connect media to your notes. Use them to create bidirectional relationships.

**Characteristics:**
- Wrapped in `[[` and `]]`
- Link to any note in your vault
- Can include paths: `[[Folder/Note]]`
- Create visual backreferences

**Common Uses:**
- People: `[[People/John Smith]]`
- Projects: `[[Projects/Website Redesign]]`
- Events: `[[Events/Team Retreat 2024]]`
- Concepts: `[[Inbox]]`, `[[Reference]]`

**Examples:**
```text
[[Meeting Notes 2024-01-15]]
[[Projects/Acme Corp]]
[[People/Alice]]
[[Travel/Paris Trip]]
```

### When to Use Which

| Scenario | Recommended | Why |
|----------|-------------|-----|
| General category | `#photo` | Simple, quick to add |
| Specific project | `[[Projects/Alpha]]` | Links to project note |
| Person | `[[People/John]]` | Can add to person's page |
| Year or date | `#2024` | Easy filtering |
| Emotion or theme | `#inspiring` | Flexible categorization |
| Location with details | `[[Travel/Paris 2024]]` | Can expand into full note |

---

## Adding Tags

### From Context Menu

1. **Right-click** any media file (in gallery or file explorer)
2. Select **Manage Tags**
3. A modal appears with:
   - Current tags displayed as removable chips
   - Input field for new tags
4. **Type your tag:**
   - For hashtags: type `#` then your tag
   - For note links: type `[[` and wait for suggestions
5. Press **Enter** to add the tag

### From Lightbox

1. **Double-click** to open media in lightbox
2. Click **Manage Tags** button (tag icon)
3. Same interface as context menu

### From File Explorer

1. **Select files** in Obsidian's file explorer
2. Press **Shift+T** (or right-click → Manage Tags)
3. Add tags to all selected files at once

### Auto-Complete for Note Links

When you type `[[`, Lumina shows suggestions from your vault:

- Type to filter suggestions
- Use arrow keys to navigate
- Press Enter to select
- Creates link even if note doesn't exist yet

---

## Removing Tags

### Single File

1. Open **Manage Tags** for the file
2. Click the **×** on any tag chip
3. Tag is removed immediately

### Multiple Files

1. Select multiple files in edit mode
2. Open **Manage Tags**
3. Two sections appear:
   - **Common Tags** — Tags on ALL selected files
   - **Partial Tags** — Tags on SOME selected files
4. Click **×** to remove from all files

### From Note Links

If a tag was added via backlink scanning, removing it in Lumina does not modify the original note. It only removes the tag association in Lumina's index.

---

## Searching with Tags

### Basic Search

Type in the gallery search bar:

| Query | Result |
|-------|--------|
| `#vacation` | Files with the vacation tag |
| `#2024` | Files tagged with 2024 |
| `[[Projects/Alpha]]` | Files linked to that note |

### Boolean Operators

Combine tags with logical operators:

**AND** — Both conditions must match
```text
#vacation AND #photo
#work AND [[Projects/Alpha]]
[[People/John]] AND [[Events/Meeting]]
```

**OR** — Either condition matches
```text
#vacation OR #travel
[[Project A]] OR [[Project B]]
#screenshot OR #photo
```

**NOT** — Exclude matches
```text
#work NOT #archive
[[Projects]] NOT [[Projects/Completed]]
```

**Shorthand NOT** — Use `-` prefix
```text
#work -#archive
#photo -#blurry -#duplicate
```

### Complex Queries

Combine multiple operators:
```text
#2024 AND (#vacation OR #travel) NOT #private
[[Projects]] AND #screenshot NOT #old
```

### Search Behavior

- **Case-insensitive:** `#Photo` matches `#photo`
- **Partial match:** Search text also matches filenames
- **Real-time:** Results update as you type

---

## Note Links Deep Dive

### Creating Bidirectional Connections

When you tag an image with `[[People/John]]`:

1. **In Lumina** — The image appears when searching for John
2. **In John's note** — Add a Lumina block to see John's photos:

```markdown
## Photos of John

```lumina
query: [[People/John]]
layout: masonry
columns: 3
```
```

### Path Handling

Note links can include folder paths:

| Link | Matches |
|------|---------|
| `[[Note]]` | Any note named "Note" |
| `[[Folder/Note]]` | Specific note in folder |
| `[[Projects/Alpha]]` | Projects/Alpha.md |

### Non-Existent Notes

You can link to notes that don't exist yet:

1. Tag image with `[[Future Project]]`
2. Later, create the note
3. Add Lumina block to see tagged media

This supports "lazy" knowledge management—tag now, organize later.

---

## Backlink Scanning

Lumina can automatically discover images embedded in your notes and treat them as tagged.

### How It Works

1. You write a note with an image:
   ```markdown
   # Project Alpha Documentation
   
   Here's the architecture diagram:
   ![[architecture.png]]
   ```

2. Lumina scans your notes for image embeds

3. It automatically tags `architecture.png` with:
   - `[[Project Alpha Documentation]]`

### Behavior

- **Automatic** — Happens on plugin load and when notes change
- **Read-only** — Doesn't modify your notes
- **Additive** — Adds to existing tags
- **Mergeable** — Works with manually added tags

### Finding Orphan Media

Use backlink scanning with a NOT query to find unlinked media:
```text
#photo NOT [[*]]
```

This shows all photos not linked from any note.

---

## Tag Indicators

Visual indicators show which files have tags in the file explorer.

### Appearance

- **Colored dot** next to filename
- **Multiple colors** for multiple tag types
- **Position** — Left or right of filename

### Indicator Colors

| Color | Meaning |
|-------|---------|
| Blue | Has hashtags |
| Purple | Has note links |
| Green | Has both |

### Configuration

1. Go to **Settings** → **Lumina**
2. Find **Tag Indicator** section
3. Configure:
   - Enable/disable indicators
   - Left or right position
   - Click action (search in Lumina or Obsidian)

### Click Action

Clicking the indicator can:
- **Search in Lumina** — Open gallery filtered to that tag
- **Search in Obsidian** — Use Obsidian's search (with Virtual Search enabled)

---

## Batch Tag Operations

### Entering Edit Mode

1. **Ctrl+Click** any file, or
2. Click **Edit Mode** button in toolbar

### Selecting Files

- **Click** — Select single file
- **Shift+Click** — Select range
- **Ctrl+Click** — Add/remove from selection
- **Ctrl+A** — Select all visible files

### Batch Tagging

With files selected:

1. Click **Manage Tags** in the selection toolbar
2. Interface shows:
   - **Add to all** — Type new tags to add
   - **Common tags** — Tags on ALL files (removable)
   - **Partial tags** — Tags on SOME files (shows count)

3. **Adding:** Type tag and press Enter
4. **Removing:** Click × on any tag

### Statistics

The batch interface shows:
```
Selected: 15 files
Common: #vacation, [[Trip 2024]]  
Partial: #beach (8), #sunset (3)
```

---

## Tag Display in Blocks

### Enabling Tags in Blocks

Add `showTags: true` to your Lumina block:

```markdown
```lumina
query: [[Projects/Alpha]]
layout: grid
showTags: true
```
```

### Appearance

- Tags appear below each thumbnail
- Styled as clickable chips
- Truncated if too many

### Clickable Tags

In blocks with `showTags: true`:
- **Click a tag** — Opens new search in Lumina
- **Ctrl+Click** — Opens tag in Obsidian search (if Virtual Search enabled)

### Tag Priority

When display space is limited:
1. Note links shown first
2. Hashtags shown second
3. "..." indicates more tags

---

## Virtual Search Integration

Make tagged media appear in Obsidian's global search.

### Enabling

1. **Settings** → **Lumina**
2. Enable **Virtual Search**

### How It Works

When you search in Obsidian (Ctrl+Shift+F):

1. Obsidian searches notes as usual
2. Lumina intercepts the query
3. Adds matching media files to results
4. Shows them in the search results panel

### Example

Searching for `#vacation` shows:
- Notes containing "#vacation"
- **AND** images/videos tagged with #vacation

### Click Behavior

Configure what happens when clicking a media search result:
- **Open in Obsidian** — Native file handling
- **Open in Lumina** — Opens in lightbox

---

## Best Practices

### Develop a Tag Hierarchy

Create consistent prefixes:
```text
#photo/landscape
#photo/portrait
#photo/screenshot

#project/alpha
#project/beta

#year/2024
#year/2023
```

### Use Note Links for Entities

Things with their own pages deserve note links:
```text
[[People/John Smith]]
[[Companies/Acme Corp]]
[[Projects/Website Redesign]]
[[Events/Quarterly Review]]
```

### Reserve Hashtags for Attributes

Properties that describe media:
```text
#favorite
#archive
#needs-review
#blurry
#duplicate
#reference
```

### Combine Both Systems

The most powerful approach uses both:
```text
#photo #favorite [[People/Sarah]] [[Events/Birthday 2024]]
```

This image is:
- A photo (searchable by type)
- Marked as favorite (quick access)
- Linked to Sarah (appears on her page)
- Linked to the birthday event (event context)

### Periodic Review

Create a review workflow:
1. Tag unreviewed imports with `#inbox`
2. Periodically search for `#inbox`
3. Add proper tags and remove `#inbox`

---

## Workflow Examples

### Project Documentation

**Scenario:** Documenting a software project with screenshots

**Setup:**
```text
Tag screenshots with:
  - [[Projects/MyApp]]
  - #screenshot
  - #version/1.0 or #version/2.0
```

**In project note:**
```markdown
# MyApp Documentation

## Screenshots

```lumina
query: [[Projects/MyApp]] AND #screenshot
layout: grid
columns: 4
sortBy: date-desc
```

### Version 2.0 Updates

```lumina
query: [[Projects/MyApp]] AND #version/2.0
layout: justified
showTags: true
```
```

### Personal Photo Library

**Scenario:** Family photo organization

**Tag Structure:**
```text
#photo/family
#photo/kids
#year/2024
[[People/Mom]]
[[People/Dad]]
[[Events/Christmas 2024]]
[[Places/Beach House]]
```

**Queries:**
```text
# Find all 2024 family photos
#year/2024 AND #photo/family

# Find Mom at Christmas
[[People/Mom]] AND [[Events/Christmas 2024]]

# Find beach vacation photos
[[Places/Beach House]] AND #photo
```

### Research Image Collection

**Scenario:** Academic research with reference images

**Tag Structure:**
```text
#reference
#figure
#diagram
#source/paper
#source/web
[[Papers/Smith 2023]]
[[Topics/Machine Learning]]
```

**Lumina Block for Paper:**
```markdown
# Notes on Smith 2023

## Key Figures

```lumina
query: [[Papers/Smith 2023]] AND #figure
layout: grid
columns: 2
showNames: true
```
```

### Design Asset Management

**Scenario:** UI/UX design project

**Tag Structure:**
```text
#ui/button
#ui/card
#ui/icon
#style/dark
#style/light
#status/approved
#status/draft
[[Projects/App Redesign]]
[[Clients/Acme Corp]]
```

**Smart Galleries:**
```markdown
## Approved Dark Mode Components

```lumina
query: [[Projects/App Redesign]] AND #style/dark AND #status/approved
layout: masonry
columns: 4
```

## All Icons

```lumina
query: #ui/icon AND [[Clients/Acme Corp]]
layout: square
columns: 6
size: 80
```
```

---

## API Reference

### Tag Storage Format

Tags are stored in Lumina's `data.json`:

```json
{
  "tagMap": {
    "images/photo1.jpg": ["#vacation", "#2024", "[[People/John]]"],
    "images/diagram.png": ["#reference", "[[Projects/Alpha]]"],
    "videos/demo.mp4": ["#demo", "[[Products/App]]"]
  }
}
```

### Query Syntax (EBNF)

```ebnf
query     = term { operator term } ;
term      = hashtag | notelink | "(" query ")" ;
operator  = "AND" | "OR" | "NOT" | "-" ;
hashtag   = "#" , identifier { "/" identifier } ;
notelink  = "[[" , path , "]]" ;
path      = identifier { "/" identifier } ;
identifier = letter { letter | digit | "-" | "_" } ;
```

---

## Troubleshooting

### Tags Not Saving

**Symptoms:** Tags disappear after restart

**Causes:**
- Plugin data not persisting
- Write permissions issue

**Solutions:**
- Check `.obsidian/plugins/obsidian-lumina/data.json` exists
- Verify file permissions
- Restart Obsidian

### Search Not Finding Tagged Files

**Symptoms:** Query returns empty

**Causes:**
- Typo in tag name
- Case sensitivity in note link path

**Solutions:**
- Verify exact tag spelling
- Use autocomplete for note links
- Check if file was moved (invalidates tags)

### Indicators Not Showing

**Symptoms:** No colored dots in file explorer

**Causes:**
- Feature disabled
- CSS conflict

**Solutions:**
- Enable in settings
- Try toggling left/right position
- Restart Obsidian

### Virtual Search Not Working

**Symptoms:** Media not appearing in Obsidian search

**Causes:**
- Feature disabled
- Query not matching tags

**Solutions:**
- Enable Virtual Search in settings
- Verify tags exist on files
- Check search query format

---

## Summary

The Lumina tag system provides:

- ✅ **Hashtags** for flexible categorization
- ✅ **Note links** for connecting media to your knowledge base
- ✅ **Boolean search** for powerful filtering
- ✅ **Backlink scanning** for automatic tagging
- ✅ **Visual indicators** in file explorer
- ✅ **Batch operations** for efficient management
- ✅ **Virtual search** for unified discovery
- ✅ **Clickable tags** in Lumina blocks

Start simple with a few hashtags, then gradually adopt note links as you see connections emerge. The tag system grows with your needs.

---

## Related Documentation

- [Main Documentation](DOCUMENTATION.md)
- [README](../README.md)

---

*Happy tagging!* 🏷️
