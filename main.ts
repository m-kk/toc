import {
    App,
    Debouncer,
    Editor,
    EventRef,
    MarkdownFileInfo,
    MarkdownView,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    debounce,
    stripHeadingForLink,
} from 'obsidian';
import { DEFAULT_SETTINGS, Heading, TOC_FRONTMATTER_KEY, TOCSettings } from './src/types';
import { IsTOCTitle, findTOCSection, makeIsTOCTitle, removeTOCSection, replaceTOC } from './src/toc-section';
import { generateTOC } from './src/toc-generator';
import { compilePatterns, filterHeadings, validatePattern } from './src/heading-filter';

const DEBOUNCE_DELAY = 2000;

export default class TableOfContentsPlugin extends Plugin {
    settings!: TOCSettings;
    private isGenerating = false;
    private autoUpdateRef: EventRef | null = null;
    private debouncedAutoUpdate!: Debouncer<[Editor, MarkdownView], void>;

    async onload() {
        await this.loadSettings();

        this.debouncedAutoUpdate = debounce(
            (editor: Editor, view: MarkdownView) => {
                this.autoUpdateTOC(editor, view).catch(error => {
                    console.error('Error in TOC auto-update:', error);
                });
            },
            DEBOUNCE_DELAY,
            true
        );

        this.addCommand({
            id: 'generate-toc',
            name: 'Generate table of contents',
            editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
                if (ctx instanceof MarkdownView) {
                    void this.generateTableOfContents(editor, ctx);
                }
            }
        });

        this.addCommand({
            id: 'remove-toc',
            name: 'Remove table of contents',
            editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
                if (ctx instanceof MarkdownView) {
                    void this.removeTableOfContents(ctx);
                }
            }
        });

        this.addRibbonIcon('list', 'Generate table of contents', () => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                void this.generateTableOfContents(activeView.editor, activeView);
            }
        });

        this.addSettingTab(new TOCSettingTab(this.app, this));

        this.setAutoUpdate(this.settings.updateOnSave);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        this.settings.maxDepth = Math.max(1, Math.min(6, this.settings.maxDepth));
        this.settings.tocTitle = this.settings.tocTitle.trim() || DEFAULT_SETTINGS.tocTitle;

        await this.saveData(this.settings);
        this.setAutoUpdate(this.settings.updateOnSave);
    }

    /** Register or unregister the single auto-update listener. Idempotent. */
    private setAutoUpdate(enabled: boolean): void {
        if (enabled && !this.autoUpdateRef) {
            this.autoUpdateRef = this.app.vault.on('modify', (file) => {
                if (this.isGenerating) return;
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.file === file) {
                    this.debouncedAutoUpdate(activeView.editor, activeView);
                }
            });
            this.registerEvent(this.autoUpdateRef);
        } else if (!enabled && this.autoUpdateRef) {
            this.app.vault.offref(this.autoUpdateRef);
            this.autoUpdateRef = null;
        }
    }

    private async autoUpdateTOC(editor: Editor, view: MarkdownView) {
        if (!editor || !view.file) return;

        // Only auto-update notes that were opted in via manual generation.
        const cache = this.app.metadataCache.getFileCache(view.file);
        if (cache?.frontmatter?.[TOC_FRONTMATTER_KEY]) {
            await this.generateTableOfContents(editor, view, true);
        }
    }

    async generateTableOfContents(editor: Editor, view: MarkdownView, isAutoUpdate = false) {
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
            const cache = this.app.metadataCache.getFileCache(file);
            const headings: Heading[] = (cache?.headings ?? []).map(h => ({ level: h.level, text: h.heading }));

            const patterns = compilePatterns(this.settings.excludePatterns, (pattern, error) => {
                console.warn(`Skipping invalid exclude pattern '${pattern}': ${error}`);
            });
            const isTitle = makeIsTOCTitle(this.settings.tocTitle);
            const filtered = filterHeadings(headings, this.settings, patterns, isTitle);

            if (filtered.length === 0 && !isAutoUpdate) {
                new Notice('No headings found in the document');
                return;
            }

            const toc = generateTOC(filtered, this.settings, stripHeadingForLink);

            if (isAutoUpdate) {
                // Editor-based update to avoid the external-modification popup.
                const content = editor.getValue();
                const newContent = replaceTOC(content, toc, isTitle);
                if (newContent !== content) {
                    this.updateEditorContent(editor, content, newContent, isTitle);
                }
            } else {
                await this.app.vault.process(file, (content) => replaceTOC(content, toc, isTitle));
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    frontmatter[TOC_FRONTMATTER_KEY] = { generated: true };
                });
                new Notice('Table of contents updated');
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

    private async removeTableOfContents(view: MarkdownView) {
        if (this.isGenerating || !view.file) return;

        this.isGenerating = true;
        try {
            const file = view.file;
            const isTitle = makeIsTOCTitle(this.settings.tocTitle);
            const cache = this.app.metadataCache.getFileCache(file);
            const hasSection = findTOCSection((await this.app.vault.read(file)).split('\n'), isTitle) !== null;
            const hasMetadata = !!cache?.frontmatter?.[TOC_FRONTMATTER_KEY];

            if (!hasSection && !hasMetadata) {
                new Notice('No table of contents found');
                return;
            }

            if (hasSection) {
                await this.app.vault.process(file, (content) => removeTOCSection(content, isTitle));
            }
            if (hasMetadata) {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    delete frontmatter[TOC_FRONTMATTER_KEY];
                });
            }
            new Notice('Table of contents removed');
        } catch (error) {
            console.error('Error removing TOC:', error);
            new Notice(`Failed to remove table of contents: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.isGenerating = false;
        }
    }

    private updateEditorContent(editor: Editor, originalContent: string, newContent: string, isTitle: IsTOCTitle): void {
        try {
            const cursor = editor.getCursor();
            if (this.replaceTOCSectionInEditor(editor, originalContent, newContent, cursor, isTitle)) {
                return;
            }

            // Fallback (e.g. first insertion): full replacement with cursor restore.
            editor.setValue(newContent);
            const newLastLine = editor.lastLine();
            if (cursor.line <= newLastLine) {
                const lineLength = editor.getLine(cursor.line)?.length || 0;
                editor.setCursor({ line: cursor.line, ch: Math.min(cursor.ch, lineLength) });
            }
        } catch (error) {
            console.error('Error updating editor content:', error);
            editor.setValue(newContent);
        }
    }

    /**
     * Replace only the TOC section in the editor, leaving the rest of the
     * document (and the user's cursor) alone. Returns false when there is no
     * existing section to replace.
     */
    private replaceTOCSectionInEditor(
        editor: Editor,
        originalContent: string,
        newContent: string,
        cursor: { line: number, ch: number },
        isTitle: IsTOCTitle
    ): boolean {
        const originalSection = findTOCSection(originalContent.split('\n'), isTitle);
        const newSection = findTOCSection(newContent.split('\n'), isTitle);
        if (!originalSection || !newSection) return false;

        const originalTOC = originalContent.split('\n')
            .slice(originalSection.start, originalSection.end + 1).join('\n');
        const newTOC = newContent.split('\n')
            .slice(newSection.start, newSection.end + 1).join('\n');

        // Identical section: nothing to do. This is what terminates the
        // auto-update cycle — no edit, no modify event, no re-trigger.
        if (originalTOC === newTOC) return true;

        editor.replaceRange(
            newTOC,
            { line: originalSection.start, ch: 0 },
            { line: originalSection.end, ch: editor.getLine(originalSection.end)?.length || 0 }
        );

        const linesDelta = (newSection.end - newSection.start) - (originalSection.end - originalSection.start);
        if (cursor.line > originalSection.end) {
            editor.setCursor({ line: cursor.line + linesDelta, ch: cursor.ch });
        } else if (cursor.line >= originalSection.start) {
            editor.setCursor({ line: originalSection.start + (newSection.end - newSection.start), ch: 0 });
        }
        return true;
    }
}

class TOCSettingTab extends PluginSettingTab {
    plugin: TableOfContentsPlugin;

    constructor(app: App, plugin: TableOfContentsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Table of contents title')
            .setDesc('The title to display above the table of contents')
            .addText(text => text
                .setPlaceholder('Table of contents')
                .setValue(this.plugin.settings.tocTitle)
                .onChange(async (value) => {
                    this.plugin.settings.tocTitle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exclude level 1 headings')
            .setDesc('Skip level 1 headings when generating the table of contents')
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
            .setDesc('Make table of contents items clickable links to headings')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeLinks)
                .onChange(async (value) => {
                    this.plugin.settings.includeLinks = value;
                    await this.plugin.saveSettings();
                }));

        let patternErrorsEl: HTMLElement;
        new Setting(containerEl)
            .setName('Exclude patterns')
            .setDesc('Ignore headings matching these regular expressions (one per line). Invalid patterns are ignored.')
            .addTextArea(text => {
                text.setValue(this.plugin.settings.excludePatterns.join('\n'))
                    .onChange(async (value) => {
                        const patterns = value.split('\n').map(p => p.trim()).filter(Boolean);
                        const invalid: string[] = [];
                        this.plugin.settings.excludePatterns = patterns.filter(pattern => {
                            const result = validatePattern(pattern);
                            if (!result.isValid) invalid.push(`${pattern} — ${result.error}`);
                            return result.isValid;
                        });
                        patternErrorsEl.setText(invalid.length ? `Invalid (not saved): ${invalid.join('; ')}` : '');
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 3;
            });
        patternErrorsEl = containerEl.createDiv({ cls: 'toc-pattern-errors' });

        new Setting(containerEl)
            .setName('Auto-update table of contents')
            .setDesc('Refresh an existing table of contents automatically whenever the note changes on disk (edits, sync, or other plugins)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.updateOnSave)
                .onChange(async (value) => {
                    this.plugin.settings.updateOnSave = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('p', {
            text: 'Use the command "Generate table of contents" or click the ribbon icon to insert a table of contents after the last level 1 heading (or at the top of the note). ' +
                  'Notes with a generated table of contents are tracked via a "toc" key in their frontmatter.'
        });

        containerEl.createEl('p', {
            text: 'Run the command again to refresh, or use "Remove table of contents" to delete the section and its frontmatter key.',
            cls: 'setting-item-description'
        });
    }
}
