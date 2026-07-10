# Table of Contents Generator

An Obsidian plugin that generates a table of contents from your note's headings — no visible HTML markers, tracked through a small YAML frontmatter key instead.

## Why This Plugin?

- **No visible markers**: unlike plugins that insert HTML comments (`<!-- TOC -->`) into your source view, the TOC section is identified by its heading and tracked via frontmatter
- **Safe updates**: the TOC section is only ever matched by its heading title (your configured title or common ones like "Contents"), so regenerating never touches other sections of your note
- **Idempotent**: regenerating an unchanged note produces byte-identical content — safe to combine with sync and auto-formatting plugins
- **Wikilink navigation**: entries are `[[#Heading|Heading]]` links that work in preview and live preview

<a href="https://www.buymeacoffee.com/mattkk" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## Features

- **Positioning**: the TOC is inserted after the last H1 heading, or directly after frontmatter (or at the top) when there is no H1
- **Auto-update**: optionally refresh an existing TOC automatically as the note changes (debounced, only for notes that already have one)
- **Heading depth control**: exclude H1 headings and cap depth (1–6)
- **Pattern exclusion**: skip headings matching regular expressions (validated in settings)
- **Link options**: clickable wikilink entries or plain text
- **Custom title**: personalize the TOC heading
- **Removal command**: cleanly delete the TOC section and its frontmatter key

## Installation

### From Obsidian Community Plugins
1. Open Obsidian Settings → Community Plugins
2. Search for "Table of Contents Generator"
3. Install and enable the plugin

### Manual Installation
1. Download the latest release from GitHub
2. Extract files to `.obsidian/plugins/table-of-contents-generator/`
3. Enable the plugin in Community Plugins settings

## Usage

1. Open any note with headings
2. Run the command `Generate table of contents` or click the ribbon icon
3. Run it again at any time to refresh, or enable auto-update in settings

### Generated TOC Example
```markdown
---
toc:
  generated: true
---
# My Note

## Table of Contents

- [[#Introduction|Introduction]]
  - [[#Getting Started|Getting Started]]
- [[#Advanced Features|Advanced Features]]

## Introduction
...
```

Duplicate heading names are listed, but only the first occurrence is linked — Obsidian wikilinks cannot address later occurrences of the same heading text.

## Settings

- **Table of contents title** (default: "Table of Contents")
- **Exclude level 1 headings** (default: on)
- **Maximum heading depth** (1–6, default: 4)
- **Include links** (default: on)
- **Exclude patterns**: one regex per line; invalid patterns are flagged and not saved
- **Auto-update table of contents**: refresh an existing TOC whenever the note changes on disk (default: off)

## Commands

- **Generate table of contents**: insert or refresh the TOC in the active note
- **Remove table of contents**: delete the TOC section and its `toc` frontmatter key

## Technical Details

The plugin marks TOC-managed notes with a minimal frontmatter key, written via Obsidian's `processFrontMatter` API (your other frontmatter is never rewritten by hand):

```yaml
---
toc:
  generated: true
---
```

The TOC section itself is located by matching an H2 against your configured title or the common aliases "Table of Contents", "TOC", "Contents", "Index", and "Outline" — headings inside code fences are ignored. Requires Obsidian 1.7.2+.

### Development

```bash
npm install
npm run dev     # watch build
npm test        # vitest unit tests
npm run build   # typecheck + production build
```

Core logic lives in `src/` as pure, unit-tested functions (`toc-section.ts`, `toc-generator.ts`, `heading-filter.ts`); `main.ts` contains only Obsidian wiring.

## Feedback

- [Bugs, Issues, & Feature Requests](https://github.com/m-kk/toc/issues)

## Support

If you find this plugin useful, consider a donation! Thank you!

<a href="https://www.buymeacoffee.com/mattkk" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
