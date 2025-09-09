# Table of Contents Generator

A modern Obsidian plugin that generates clean, trackable table of contents using frontmatter metadata. Creates invisible TOC markers without cluttering your source view, with advanced configuration options and automatic updates.

<a href="https://www.buymeacoffee.com/mattkk" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## Features

### Core Functionality
- **Invisible Markers**: No visible HTML comments - uses YAML frontmatter exclusively for TOC tracking
- **Smart Positioning**: Intelligent TOC placement at document start or after the last H1 heading
- **Automatic Updates**: Debounced auto-updates when document changes (configurable)
- **Clean Integration**: Works seamlessly with Obsidian's metadata cache system

### Advanced Configuration
- **Heading Depth Control**: Exclude H1 headings and set maximum depth (1-6)
- **Pattern Exclusion**: Regex patterns to exclude specific headings (with ReDoS protection)
- **Link Options**: Toggle clickable TOC links to headings
- **Custom TOC Title**: Personalize your table of contents heading
- **Duplicate Handling**: Smart handling of duplicate heading names

### Developer Features
- **Debug Command**: Built-in TOC marker debugging for troubleshooting
- **TypeScript Support**: Full type safety with comprehensive interfaces
- **Service Architecture**: Clean separation of concerns with dedicated service classes

## Installation

### From Obsidian Community Plugins
1. Open Obsidian Settings → Community Plugins
2. Disable Safe Mode if needed
3. Search for "Table of Contents Generator"
4. Install and enable the plugin

### Manual Installation
1. Download the latest release from GitHub
2. Extract files to `.obsidian/plugins/table-of-contents-generator/`
3. Enable the plugin in Community Plugins settings

## Usage

### Basic Usage
1. Open any note with headings
2. Run command `Generate table of contents` or click the TOC ribbon icon
3. The TOC will be intelligently positioned at document start or after the last H1 heading

### Generated TOC Example
```markdown
---
toc:
  generated: true
  lastUpdate: "2025-01-15T10:30:00Z"
---

## Table of Contents
- [[#Introduction|Introduction]]
  - [[#Getting Started|Getting Started]]
- [[#Advanced Features|Advanced Features]]
  - [[#Configuration Options|Configuration Options]]
```

### Configuration Options

Access settings via Settings → Community Plugins → Table of Contents Generator

#### Content Settings
- **TOC Title**: Customize the heading text (default: "Table of Contents")
- **Include Links**: Toggle clickable navigation links to headings
- **Exclude H1**: Skip document title headings from TOC
- **Maximum Depth**: Limit heading levels (1-6, default: 4)

#### Positioning
- **Smart Positioning**: Automatically places TOC at document start or after the last H1 heading

#### Filtering & Updates
- **Exclude Patterns**: Regex patterns to skip specific headings
- **Auto-Update**: Automatically refresh TOC when document changes
- **ReDoS Protection**: Safe regex validation prevents performance issues

## Commands

- **Generate table of contents**: Insert or refresh the TOC for the active note
- **Debug TOC metadata**: Diagnostic tool to inspect TOC state and troubleshoot issues

## Technical Details

### Frontmatter Metadata
The plugin tracks TOC state using minimal YAML frontmatter:
```yaml
---
toc:
  generated: true      # TOC exists in document
  lastUpdate: "2025-01-15T10:30:00Z"   # ISO timestamp of last update
---
```

### Architecture
- **Performance Optimized**: 75% reduction in regex operations with pre-compiled patterns
- **Security Hardened**: Comprehensive ReDoS protection against 10+ dangerous patterns
- **Service-Oriented Design**: Modular components with centralized TOC detection logic
- **TypeScript**: Full type safety with strict compliance and modern ES2020 features
- **Memory Efficient**: Proper cleanup, surgical updates, and optimized string operations
- **Modern Build System**: esbuild with security-focused dependencies and zero runtime deps

## Feedback

- [Bugs, Issues, & Feature Requests](https://github.com/m-kk/toc/issues)

## Support

If you find this plugin useful, consider a donation! Thank you!

<a href="https://www.buymeacoffee.com/mattkk" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
