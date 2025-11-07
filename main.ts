import {
    App,
    Editor,
    MarkdownView,
    MarkdownFileInfo,
    Plugin,
    Setting,
    PluginSettingTab,
    Notice,
    TFile,
    MetadataCache,
    stripHeadingForLink,
} from 'obsidian';

// TOC configuration
const TOC_CONFIG = {
    FRONTMATTER_KEY: 'toc',
    TOC_SECTION_IDENTIFIER: '## Table of Contents'
} as const;

const DEBOUNCE_DELAY = 2000;
const DEFAULT_MAX_DEPTH = 4;

// Pre-compiled patterns for performance optimization
const TOC_CONTENT_PATTERNS = [
    /^-\s+\[\[#.*\|.*\]\]$/,         // Obsidian-style links
    /^ {2}-\s+\[\[#.*\|.*\]\]$/,     // Indented Obsidian-style links
    /^-\s+\[.*\]\(#.*\)$/,           // Markdown links
    /^ {2}-\s+\[.*\]\(#.*\)$/,       // Indented markdown links
    /^-\s+[^[].+$/,                  // Plain text TOC items
    /^ {2}-\s+[^[].+$/               // Indented plain text
] as const;

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*\n/;

interface TOCSettings {
    tocTitle: string;
    excludeH1: boolean;
    maxDepth: number;
    includeLinks: boolean;
    excludePatterns: string[];
    updateOnSave: boolean;
}

interface TOCMetadata {
    generated: boolean;
    lastUpdate: string;
}

interface ValidationResult {
    isValid: boolean;
    error?: string;
}

const DEFAULT_SETTINGS: TOCSettings = {
    tocTitle: 'Table of Contents',
    excludeH1: true,
    maxDepth: DEFAULT_MAX_DEPTH,
    includeLinks: true,
    excludePatterns: [],
    updateOnSave: false
};

interface Heading {
    level: number;
    text: string;
    line: number;
}

export default class TableOfContentsPlugin extends Plugin {
    settings!: TOCSettings;
    private updateTimer: number | null = null;
    private isGenerating = false;
    private tocGenerator!: TOCGenerator;
    private headingParser!: HeadingParser;
    private frontmatterManager!: FrontmatterManager;
    private editorExtension!: TOCEditorExtension;

    async onload() {
        await this.loadSettings();
        
        // Initialize services
        this.tocGenerator = new TOCGenerator(this.settings);
        this.headingParser = new HeadingParser();
        this.frontmatterManager = new FrontmatterManager();
        this.editorExtension = new TOCEditorExtension(this.app, this.settings);
        
        // Register editor extension for live preview enhancements
        this.registerEditorExtension(this.editorExtension.getExtension());

        // Add command to generate TOC
        this.addCommand({
            id: 'generate-toc',
            name: 'Generate table of contents',
            editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
                if (ctx instanceof MarkdownView) {
                    void this.generateTableOfContents(editor, ctx);
                }
            }
        });

        // Add debug command to help troubleshoot TOC issues
        this.addCommand({
            id: 'debug-toc-markers',
            name: 'Debug TOC metadata',
            callback: () => {
                this.debugTOCMarkers();
            }
        });

        // Add ribbon icon
        this.addRibbonIcon('list', 'Generate TOC', () => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                void this.generateTableOfContents(activeView.editor, activeView);
            }
        });

        // Add settings tab
        this.addSettingTab(new TOCSettingTab(this.app, this));


        // Register auto-update functionality if enabled
        if (this.settings.updateOnSave) {
            this.registerAutoUpdate();
        }
    }

    onunload() {
        this.cleanupEventHandlers();
    }

    private cleanupEventHandlers() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        
    }








    /**
     * Debug method to help identify where TOC markers are appearing
     */
    private debugTOCMarkers(): void {
        try {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView || !activeView.file) {
                new Notice('No active Markdown view for debugging');
                return;
            }
            
            const content = activeView.editor.getValue();
            const { frontmatter } = this.frontmatterManager.parseFrontmatter(content);
            const tocMetadata = frontmatter[TOC_CONFIG.FRONTMATTER_KEY] as TOCMetadata | undefined;

            console.debug('=== TOC Debug Info ===');
            console.debug('File:', activeView.file.name);
            console.debug('TOC Metadata:', tocMetadata);
            console.debug('Has TOC:', !!tocMetadata);

            if (tocMetadata) {
                console.debug('Last Update:', tocMetadata.lastUpdate);
            }

            new Notice('Debug info logged to console');
        } catch (error) {
            console.error('Error in debug method:', error);
            new Notice('Debug failed - check console for details');
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        // Validate settings before saving
        this.settings.maxDepth = Math.max(1, Math.min(6, this.settings.maxDepth));
        this.settings.tocTitle = this.settings.tocTitle.trim() || DEFAULT_SETTINGS.tocTitle;
        
        await this.saveData(this.settings);
        
        // Update TOC generator with new settings
        if (this.tocGenerator) {
            this.tocGenerator.updateSettings(this.settings);
        }
        
        // Re-register auto-update based on settings
        if (this.settings.updateOnSave) {
            this.registerAutoUpdate();
        } else {
            this.cleanupEventHandlers();
        }
    }

    private registerAutoUpdate() {
        this.cleanupEventHandlers();
        
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.file === file) {
                    this.debouncedAutoUpdate(activeView.editor, activeView);
                }
            })
        );
    }

    private debouncedAutoUpdate = this.debounce(async (editor: Editor, view: MarkdownView) => {
        try {
            await this.autoUpdateTOC(editor, view);
        } catch (error) {
            console.error('Error in auto-update:', error);
        }
    }, DEBOUNCE_DELAY);

    private debounce<T extends unknown[]>(func: (...args: T) => Promise<void>, wait: number) {
        return (...args: T) => {
            if (this.updateTimer) {
                clearTimeout(this.updateTimer);
            }

            this.updateTimer = window.setTimeout(() => {
                func(...args).catch(error => {
                    console.error('Error in debounced function:', error);
                }).finally(() => {
                    this.updateTimer = null;
                });
            }, wait);
        };
    }
    
    private throttle<T extends unknown[]>(func: (...args: T) => void, limit: number) {
        let inThrottle: boolean;
        return (...args: T) => {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                window.setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    private async autoUpdateTOC(editor: Editor, view: MarkdownView) {
        if (!editor || !view || !view.file) return;
        
        const content = editor.getValue();
        
        // Only auto-update if TOC already exists
        const { frontmatter } = this.frontmatterManager.parseFrontmatter(content);
        const hasTOC = frontmatter[TOC_CONFIG.FRONTMATTER_KEY];
        
        if (hasTOC) {
            await this.generateTableOfContents(editor, view, true);
        }
    }

    async generateTableOfContents(editor: Editor, view: MarkdownView, isAutoUpdate = false) {
        // Prevent concurrent generation (race condition protection)
        if (this.isGenerating) {
            if (!isAutoUpdate) {
                new Notice('Table of contents generation already in progress');
            }
            return;
        }
        
        if (!editor || !view || !view.file) {
            if (!isAutoUpdate) {
                new Notice('Unable to generate table of contents: invalid editor or view');
            }
            return;
        }
        
        this.isGenerating = true;
        
        try {
            const file = view.file;
            const content = isAutoUpdate ? editor.getValue() : await this.app.vault.read(file);
            
            if (!content.trim()) {
                if (!isAutoUpdate) {
                    new Notice('Document is empty');
                }
                return;
            }
            
            const headings = this.headingParser.parse(file, content, this.app.metadataCache);
            const filteredHeadings = this.filterHeadings(headings);
            
            if (filteredHeadings.length === 0 && !isAutoUpdate) {
                new Notice('No headings found in the document');
                return;
            }

            const toc = this.createTOC(filteredHeadings);
            const newContent = this.insertOrUpdateTOC(content, toc, file);
            
            if (newContent !== content) {
                if (isAutoUpdate) {
                    // For auto-updates, use editor operations to avoid external modification popup
                    this.updateEditorContent(editor, newContent);
                } else {
                    // For manual updates, use vault.modify
                    await this.app.vault.modify(file, newContent);
                }
                
                if (!isAutoUpdate) {
                    new Notice('Table of contents updated');
                }
            }
        } catch (error) {
            console.error('Error generating TOC:', error);
            if (!isAutoUpdate) {
                new Notice(`Failed to generate table of contents: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            this.isGenerating = false;
        }
    }

    private validateRegexPattern(pattern: string): ValidationResult {
        if (!pattern.trim()) {
            return { isValid: false, error: 'Empty pattern' };
        }
        
        // Basic ReDoS protection: limit pattern complexity
        if (pattern.length > 100) {
            return { isValid: false, error: 'Pattern too long' };
        }
        
        // Enhanced ReDoS protection with comprehensive dangerous patterns
        const dangerousPatterns = [
            /\(\*\+/,             // Nested quantifiers
            /\+\*\+/,             // Multiple quantifiers
            /\{\d+,\}\+/,         // Large quantifier ranges
            /\(\.\*\)\+/,         // Dangerous (.*)+
            /\(\.\+\)\*/,         // Dangerous (.+)*
            /\(\[\^\]\*\)\+/,     // Dangerous ([^]*)+
            /\{\d{3,},\d{3,}\}/,  // Very large quantifier ranges
            /\(\.\*\?\)\+/,       // Dangerous (.*?)+
            /\(\?=.*\(\?=/,       // Nested lookaheads
            /\(\?!.*\(\?!/        // Nested lookbehinds
        ];
        
        if (dangerousPatterns.some(dangerous => dangerous.test(pattern))) {
            return { isValid: false, error: 'Pattern contains potentially dangerous constructs' };
        }
        
        try {
            // Test the regex with timeout simulation
            const regex = new RegExp(pattern, 'i');
            // Test with a complex string that could trigger ReDoS
            const testString = 'a'.repeat(1000);
            const startTime = Date.now();
            regex.test(testString);
            const endTime = Date.now();
            
            if (endTime - startTime > 100) {
                return { isValid: false, error: 'Pattern execution too slow' };
            }
            
            return { isValid: true };
        } catch (e) {
            return { isValid: false, error: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    private isTOCHeading(headingText: string): boolean {
        // Check if the heading text looks like a TOC heading
        const tocLikePatterns = [
            /^table of contents$/i,
            /^toc$/i,
            /^contents$/i,
            /^index$/i,
            /^outline$/i,
            headingText === this.settings.tocTitle // Current TOC title
        ];
        
        return tocLikePatterns.some(pattern => {
            if (typeof pattern === 'boolean') return pattern;
            return pattern.test(headingText);
        });
    }

    private filterHeadings(headings: Heading[]): Heading[] {
        const { excludeH1, maxDepth, excludePatterns } = this.settings;
        
        return headings.filter(heading => {
            // Exclude any H2 heading that looks like a TOC heading to prevent self-inclusion
            // This handles both current and previous TOC titles
            if (heading.level === 2 && this.isTOCHeading(heading.text)) {
                return false;
            }
            
            // Apply level filters
            if ((excludeH1 && heading.level === 1) || heading.level > maxDepth) {
                return false;
            }
            
            // Apply pattern exclusions with validation
            return !excludePatterns.some(pattern => {
                const validation = this.validateRegexPattern(pattern);
                if (!validation.isValid) {
                    console.warn(`Skipping invalid regex pattern '${pattern}': ${validation.error}`);
                    return false;
                }
                
                try {
                    return new RegExp(pattern, 'i').test(heading.text);
                } catch (e) {
                    console.warn(`Error testing regex pattern '${pattern}': ${e instanceof Error ? e.message : String(e)}`);
                    return false;
                }
            });
        });
    }


    private createTOC(headings: Heading[]): string {
        return this.tocGenerator.generate(headings);
    }

    private static isTOCContentLine(line: string): boolean {
        const trimmed = line.trim();
        return TOC_CONTENT_PATTERNS.some(pattern => pattern.test(trimmed));
    }

    private static findTOCSection(lines: string[], startIndex = 0): { start: number, end: number } | null {
        // Look for H2 heading followed by TOC-like content
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i]?.trim() || '';
            if (line.startsWith('## ') && line.length > 3) {
                // Check if next few lines contain TOC content
                let hasTOCContent = false;
                const searchLimit = Math.min(i + 10, lines.length);
                
                for (let j = i + 1; j < searchLimit; j++) {
                    const nextLine = lines[j];
                    if (!nextLine) continue;
                    
                    if (TableOfContentsPlugin.isTOCContentLine(nextLine)) {
                        hasTOCContent = true;
                        break;
                    }
                    
                    // Stop if we hit significant non-TOC content
                    const trimmed = nextLine.trim();
                    if (trimmed.startsWith('#') || (trimmed.length > 0 && !trimmed.startsWith('-') && !trimmed.startsWith(' '))) {
                        break;
                    }
                }
                
                if (hasTOCContent) {
                    // Find end of TOC section
                    let endIndex = i;
                    for (let k = i + 1; k < lines.length; k++) {
                        const line = lines[k];
                        if (line && line.startsWith('#')) {
                            endIndex = k - 1;
                            break;
                        }
                        endIndex = k;
                    }
                    return { start: i, end: endIndex };
                }
            }
        }
        return null;
    }

    private removeTOCFromContent(content: string): string {
        const lines = content.split('\n');
        const tocSection = TableOfContentsPlugin.findTOCSection(lines);
        
        if (!tocSection) return content;
        
        // Remove TOC section and preserve document formatting
        const beforeTOC = lines.slice(0, tocSection.start);
        const afterTOC = lines.slice(tocSection.end + 1);
        
        return [...beforeTOC, ...afterTOC].join('\n');
    }
    
    private insertTOCAtOptimalPosition(content: string, toc: string, file: TFile, originalContent: string): string {
        const lines = content.split('\n');
        
        // Use Obsidian's metadata cache to get actual H1 headings (not code blocks)
        const cache = this.app.metadataCache.getFileCache(file);
        const h1Headings = cache?.headings?.filter(h => h.level === 1) || [];
        
        // If no H1s exist, insert at position 0
        if (h1Headings.length === 0) {
            return ['', toc, '', ...lines].join('\n');
        }
        
        // Calculate frontmatter offset efficiently
        const frontmatterMatch = FRONTMATTER_PATTERN.exec(originalContent);
        const frontmatterOffset = frontmatterMatch ? (frontmatterMatch[0] || '').split('\n').length - 1 : 0;
        
        // Find the last H1 heading line and adjust for frontmatter offset
        const lastH1LineInOriginal = Math.max(...h1Headings.map(h => h.position.start.line));
        const lastH1LineInContent = lastH1LineInOriginal - frontmatterOffset;
        
        // Insert TOC after the H1 heading
        const beforeLastH1 = lines.slice(0, lastH1LineInContent + 1);
        const afterLastH1 = lines.slice(lastH1LineInContent + 1);
        
        return [...beforeLastH1, '', toc, '', ...afterLastH1].join('\n');
    }
    
    private insertTOCAtPosition0(content: string, toc: string): string {
        const lines = content.split('\n');
        return ['', toc, '', ...lines].join('\n');
    }
    

    private insertOrUpdateTOC(content: string, toc: string, file: TFile): string {
        const { frontmatter, contentWithoutFrontmatter } = this.frontmatterManager.parseFrontmatter(content);
        
        // Update frontmatter with TOC metadata
        const tocMetadata: TOCMetadata = {
            generated: true,
            lastUpdate: new Date().toISOString()
        };
        
        frontmatter[TOC_CONFIG.FRONTMATTER_KEY] = tocMetadata;
        
        // Remove existing TOC if present
        const contentWithoutTOC = this.removeTOCFromContent(contentWithoutFrontmatter);
        
        // Insert new TOC at optimal position (position 0 or after last H1)
        const contentWithNewTOC = this.insertTOCAtOptimalPosition(contentWithoutTOC, toc, file, content);
        
        // Rebuild content with updated frontmatter
        return this.frontmatterManager.buildContentWithFrontmatter(frontmatter, contentWithNewTOC);
    }

    private updateEditorContent(editor: Editor, newContent: string): void {
        try {
            const originalContent = editor.getValue();
            const cursor = editor.getCursor();
            
            // For auto-updates, use surgical replacement instead of full document replacement
            if (originalContent !== newContent) {
                const tocReplacement = this.performSurgicalTOCReplacement(editor, originalContent, newContent, cursor);
                
                if (!tocReplacement.success) {
                    // Fallback to full replacement if surgical approach fails
                    editor.setValue(newContent);
                    
                    // Try to restore cursor at the same line if it still exists
                    const newLastLine = editor.lastLine();
                    if (cursor.line <= newLastLine) {
                        const lineLength = editor.getLine(cursor.line)?.length || 0;
                        const targetCh = Math.min(cursor.ch, lineLength);
                        editor.setCursor({ line: cursor.line, ch: targetCh });
                    }
                }
            }
        } catch (error) {
            console.error('Error updating editor content:', error);
            // Fallback: simple setValue without cursor restoration
            editor.setValue(newContent);
        }
    }

    private performSurgicalTOCReplacement(
        editor: Editor, 
        originalContent: string, 
        newContent: string, 
        cursor: { line: number, ch: number }
    ): { success: boolean } {
        try {
            // Find TOC boundaries in both versions
            const originalTOC = this.findTOCBoundariesInContent(originalContent);
            const newTOC = this.findTOCBoundariesInContent(newContent);
            
            if (originalTOC && newTOC) {
                // Extract the new TOC section
                const newTOCLines = newContent.split('\n').slice(newTOC.startLine, newTOC.endLine + 1);
                const newTOCContent = newTOCLines.join('\n');
                
                // Replace only the TOC section in the editor
                const originalStartLine = originalTOC.startLine;
                const originalEndLine = originalTOC.endLine;
                
                editor.replaceRange(
                    newTOCContent,
                    { line: originalStartLine, ch: 0 },
                    { line: originalEndLine, ch: editor.getLine(originalEndLine)?.length || 0 }
                );
                
                // Adjust cursor position based on TOC size change
                const linesDelta = (newTOC.endLine - newTOC.startLine) - (originalTOC.endLine - originalTOC.startLine);
                
                if (cursor.line > originalEndLine) {
                    // Cursor is after TOC section - adjust for TOC size change
                    editor.setCursor({ line: cursor.line + linesDelta, ch: cursor.ch });
                } else if (cursor.line >= originalStartLine && cursor.line <= originalEndLine) {
                    // Cursor was within TOC section - move to end of new TOC
                    const newTOCEndLine = originalStartLine + (newTOC.endLine - newTOC.startLine);
                    editor.setCursor({ line: newTOCEndLine, ch: 0 });
                }
                // If cursor is before TOC section (cursor.line < originalStartLine), no adjustment needed
                
                return { success: true };
            }
            
            return { success: false };
        } catch (error) {
            console.error('Error in surgical TOC replacement:', error);
            return { success: false };
        }
    }

    private findTOCBoundariesInContent(content: string): { startLine: number, endLine: number } | null {
        const lines = content.split('\n');
        const tocSection = TableOfContentsPlugin.findTOCSection(lines);
        
        return tocSection ? { startLine: tocSection.start, endLine: tocSection.end } : null;
    }

    private calculateTOCLineOffset(originalContent: string, newContent: string): number {
        const originalLines = originalContent.split('\n');
        const newLines = newContent.split('\n');
        
        // Find TOC sections in both versions
        const originalTOCEnd = this.findTOCEnd(originalLines);
        const newTOCEnd = this.findTOCEnd(newLines);
        
        // The offset is the difference in where content after TOC starts
        return newTOCEnd - originalTOCEnd;
    }
    
    private findTOCEnd(lines: string[]): number {
        // Skip frontmatter first
        let index = 0;
        if (lines.length > 0 && lines[0] === '---') {
            index = 1;
            while (index < lines.length && lines[index] !== '---') {
                index++;
            }
            if (index < lines.length && lines[index] === '---') {
                index++; // Skip closing ---
            }
        }
        
        // Use optimized TOC detection
        const tocSection = TableOfContentsPlugin.findTOCSection(lines, index);
        
        return tocSection ? tocSection.end + 1 : index;
    }
    
    private findContentStart(lines: string[]): number {
        let index = 0;
        
        // Skip frontmatter
        if (lines.length > 0 && lines[0] === '---') {
            index = 1;
            while (index < lines.length && lines[index] !== '---') {
                index++;
            }
            if (index < lines.length && lines[index] === '---') {
                index++; // Skip closing ---
            }
        }
        
        // Skip empty lines after frontmatter
        while (index < lines.length && lines[index]?.trim() === '') {
            index++;
        }
        
        // Skip TOC if present
        if (index < lines.length && lines[index]?.startsWith(`## ${this.settings.tocTitle}`)) {
            // Skip TOC section
            index++; // Skip TOC title
            while (index < lines.length) {
                const line = lines[index];
                if (!line) {
                    index++;
                    continue;
                }
                if (line.trim() === '' || line.startsWith('- ') || line.startsWith('  - ') || line === '*No headings found*') {
                    index++;
                } else if (line.startsWith('#')) {
                    // Found next heading, this is where content starts
                    break;
                } else {
                    // Found non-TOC content
                    break;
                }
            }
        }
        
        return index;
    }
}

// Settings tab
class TOCSettingTab extends PluginSettingTab {
    plugin: TableOfContentsPlugin;

    constructor(app: App, plugin: TableOfContentsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Table of contents').setHeading();

        new Setting(containerEl)
            .setName('Table of contents title')
            .setDesc('The title to display above the Table of Contents')
            .addText(text => text
                .setPlaceholder('Table of Contents')
                .setValue(this.plugin.settings.tocTitle)
                .onChange(async (value) => {
                    this.plugin.settings.tocTitle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exclude H1 headings')
            .setDesc('Skip level 1 headings when generating the Table of Contents')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.excludeH1)
                .onChange(async (value) => {
                    this.plugin.settings.excludeH1 = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum heading depth')
            .setDesc('Only include headings up to this level (1-6)')
            .addSlider(slider => slider
                .setLimits(1, 6, 1)
                .setValue(this.plugin.settings.maxDepth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxDepth = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include links')
            .setDesc('Make Table of Contents items clickable links to headings')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeLinks)
                .onChange(async (value) => {
                    this.plugin.settings.includeLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exclude patterns')
            .setDesc('Ignore headings matching these regular expressions (one per line)')
            .addTextArea(text => {
                text.setValue(this.plugin.settings.excludePatterns.join('\n'))
                    .onChange(async (value) => {
                        this.plugin.settings.excludePatterns = value
                            .split('\n')
                            .map(p => p.trim())
                            .filter(Boolean);
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 3;
            });

        new Setting(containerEl)
            .setName('Auto-update Table of Contents')
            .setDesc('Automatically update existing Table of Contents when the document changes')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.updateOnSave)
                .onChange(async (value) => {
                    this.plugin.settings.updateOnSave = value;
                    await this.plugin.saveSettings();
                }));




        // Usage information
        new Setting(containerEl).setName('Usage').setHeading();
        containerEl.createEl('p', { 
            text: 'Use the command "Generate table of contents" or click the ribbon icon to insert a table of contents at the optimal position (top of document or after the last H1 heading). ' +
                  'The table of contents is tracked using frontmatter metadata for clean, invisible state management.'
        });
        
        containerEl.createEl('p', {
            text: 'To manually update an existing table of contents, simply run the command again. ' +
                  'With auto-update enabled, the table of contents will refresh automatically as you edit.',
            cls: 'setting-item-description'
        });
    }
}

// Service classes for better separation of concerns

class TOCGenerator {
    constructor(private settings: TOCSettings) {}
    
    generate(headings: Heading[]): string {
        if (headings.length === 0) {
            return this.createEmptyTOC();
        }
        
        const lines: string[] = [`## ${this.settings.tocTitle}`, ''];
        
        // Find minimum heading level for proper indentation
        const minLevel = Math.min(...headings.map((h: Heading) => h.level));
        
        // Track heading counts for duplicate handling (fixed: use space instead of dash)
        const headingCounts = new Map<string, number>();
        
        for (const heading of headings) {
            const indent = '  '.repeat(heading.level - minLevel);
            const linkText = stripHeadingForLink(heading.text);
            
            // Handle duplicate headings - Obsidian format uses space, not dash
            const count = headingCounts.get(linkText) || 0;
            headingCounts.set(linkText, count + 1);
            
            const uniqueLinkText = count > 0 ? `${linkText} ${count}` : linkText;
            
            let listItem = `${indent}- `;
            if (this.settings.includeLinks) {
                listItem += `[[#${uniqueLinkText}|${heading.text}]]`;
            } else {
                listItem += heading.text;
            }
            
            lines.push(listItem);
        }
        
        return lines.join('\n');
    }
    
    private createEmptyTOC(): string {
        return [
            `## ${this.settings.tocTitle}`,
            '',
            '*No headings found*'
        ].join('\n');
    }
    
    updateSettings(settings: TOCSettings): void {
        this.settings = settings;
    }
}


class HeadingParser {
    parse(file: TFile, content: string, metadataCache: MetadataCache): Heading[] {
        try {
            const cache = metadataCache.getFileCache(file);
            if (!cache?.headings) return [];

            // Return all headings - TOC exclusion will be handled by content parsing
            return cache.headings.map((h) => ({
                level: h.level,
                text: h.heading,
                line: h.position.start.line
            }));
        } catch (error) {
            console.error('Error parsing headings:', error);
            return [];
        }
    }
}

// New service classes for enhanced functionality

class FrontmatterManager {
    parseFrontmatter(content: string): { frontmatter: Record<string, unknown>, contentWithoutFrontmatter: string } {
        const frontmatterMatch = FRONTMATTER_PATTERN.exec(content);
        
        if (!frontmatterMatch) {
            return { frontmatter: {}, contentWithoutFrontmatter: content };
        }
        
        const frontmatterText = frontmatterMatch[1];
        const matchLength = frontmatterMatch[0]?.length || 0;
        const contentWithoutFrontmatter = content.substring(matchLength);
        
        try {
            // Simple YAML parser for basic key-value pairs
            const frontmatter: Record<string, unknown> = {};
            const lines = (frontmatterText || '').split('\n');
            
            for (const line of lines) {
                const colonIndex = line.indexOf(':');
                if (colonIndex > 0) {
                    const key = line.substring(0, colonIndex).trim();
                    const value = line.substring(colonIndex + 1).trim();
                    
                    // Basic value parsing
                    if (value === 'true') frontmatter[key] = true;
                    else if (value === 'false') frontmatter[key] = false;
                    else if (/^\d+$/.test(value)) frontmatter[key] = parseInt(value);
                    else if (value.startsWith('"') && value.endsWith('"')) {
                        frontmatter[key] = value.slice(1, -1);
                    } else if (value.startsWith('{') || value.startsWith('[')) {
                        try {
                            frontmatter[key] = JSON.parse(value);
                        } catch {
                            frontmatter[key] = value;
                        }
                    } else {
                        frontmatter[key] = value;
                    }
                }
            }
            
            return { frontmatter, contentWithoutFrontmatter };
        } catch (error) {
            console.error('Error parsing frontmatter:', error);
            return { frontmatter: {}, contentWithoutFrontmatter: content };
        }
    }
    
    buildContentWithFrontmatter(frontmatter: Record<string, unknown>, content: string): string {
        if (Object.keys(frontmatter).length === 0) {
            return content;
        }
        
        const frontmatterLines = ['---'];
        
        for (const [key, value] of Object.entries(frontmatter)) {
            if (typeof value === 'object' && value !== null) {
                frontmatterLines.push(`${key}: ${JSON.stringify(value)}`);
            } else if (typeof value === 'string' && (value.includes(':') || value.includes(' '))) {
                frontmatterLines.push(`${key}: "${value}"`);
            } else {
                frontmatterLines.push(`${key}: ${String(value)}`);
            }
        }
        
        frontmatterLines.push('---', '');
        
        return frontmatterLines.join('\n') + content;
    }
}

class TOCEditorExtension {
    constructor(private app: App, private settings: TOCSettings) {}
    
    getExtension() {
        // For now, return an empty extension array
        // In a full implementation, this would include CodeMirror 6 decorations
        // to hide TOC markers in live preview mode
        return [];
    }
    
    updateSettings(settings: TOCSettings): void {
        this.settings = settings;
    }
}
