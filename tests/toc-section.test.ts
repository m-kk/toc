import { describe, it, expect } from 'vitest';
import { makeIsTOCTitle, findTOCSection, removeTOCSection, insertTOC, replaceTOC } from '../src/toc-section';

const isTitle = makeIsTOCTitle('Table of Contents');

describe('makeIsTOCTitle', () => {
    it('matches the configured title case-insensitively', () => {
        const custom = makeIsTOCTitle('My Custom Index');
        expect(custom('my custom index')).toBe(true);
        expect(custom('MY CUSTOM INDEX')).toBe(true);
    });

    it('matches known TOC aliases', () => {
        for (const alias of ['Table of Contents', 'TOC', 'Contents', 'Index', 'Outline']) {
            expect(isTitle(alias)).toBe(true);
        }
    });

    it('rejects ordinary headings', () => {
        expect(isTitle('Shopping list')).toBe(false);
        expect(isTitle('Indexing strategies')).toBe(false);
    });
});

describe('findTOCSection', () => {
    it('finds a TOC heading and its list content', () => {
        const lines = ['# Title', '', '## Table of Contents', '', '- [[#A|A]]', '  - [[#B|B]]', '', '## A'];
        expect(findTOCSection(lines, isTitle)).toEqual({ start: 2, end: 6 });
    });

    it('does not match an H2 that is not a TOC title, even with bullets', () => {
        const lines = ['## Shopping list', '', '- milk', '- eggs'];
        expect(findTOCSection(lines, isTitle)).toBeNull();
    });

    it('does not match a TOC heading inside a code fence', () => {
        const lines = ['```', '## Table of Contents', '- fake', '```', 'text'];
        expect(findTOCSection(lines, isTitle)).toBeNull();
    });

    it('does not scan inside frontmatter', () => {
        const lines = ['---', 'a: 1', '---', '## Table of Contents', '', '- [[#X|X]]'];
        expect(findTOCSection(lines, isTitle)).toEqual({ start: 3, end: 5 });
    });

    it('ends the section before prose', () => {
        const lines = ['## Contents', '', '- [[#A|A]]', '', 'Some prose here'];
        expect(findTOCSection(lines, isTitle)).toEqual({ start: 0, end: 3 });
    });

    it('handles a TOC at end of file', () => {
        const lines = ['# T', '## Table of Contents', '', '- [[#A|A]]'];
        expect(findTOCSection(lines, isTitle)).toEqual({ start: 1, end: 3 });
    });

    it('recognizes the empty-TOC placeholder as section content', () => {
        const lines = ['## Table of Contents', '', '*No headings found*', '', 'prose'];
        expect(findTOCSection(lines, isTitle)).toEqual({ start: 0, end: 3 });
    });
});

describe('removeTOCSection', () => {
    it('removes the TOC section and preceding blank lines', () => {
        const content = ['# Title', '', '## Table of Contents', '', '- [[#A|A]]', '', '## A'].join('\n');
        expect(removeTOCSection(content, isTitle)).toBe(['# Title', '## A'].join('\n'));
    });

    it('leaves content without a TOC untouched', () => {
        const content = ['## Shopping list', '', '- milk', '- eggs'].join('\n');
        expect(removeTOCSection(content, isTitle)).toBe(content);
    });

    it('preserves prose that follows the TOC list', () => {
        const content = ['## Table of Contents', '', '- [[#A|A]]', '', 'Keep this prose', '', '## A'].join('\n');
        expect(removeTOCSection(content, isTitle)).toBe(['Keep this prose', '', '## A'].join('\n'));
    });

    it('removes a custom-titled TOC', () => {
        const custom = makeIsTOCTitle('Overview of Sections');
        const content = ['## Overview of Sections', '', '- [[#A|A]]', '', '## A'].join('\n');
        expect(removeTOCSection(content, custom)).toBe('## A');
    });
});

describe('insertTOC', () => {
    const toc = ['## Table of Contents', '', '- [[#A|A]]'].join('\n');

    it('inserts after the last H1', () => {
        const content = ['# Title', '', '## A', 'body'].join('\n');
        expect(insertTOC(content, toc)).toBe(
            ['# Title', '', '## Table of Contents', '', '- [[#A|A]]', '', '## A', 'body'].join('\n')
        );
    });

    it('inserts after frontmatter when there is no H1', () => {
        const content = ['---', 'a: 1', '---', '## A', 'body'].join('\n');
        expect(insertTOC(content, toc)).toBe(
            ['---', 'a: 1', '---', '', '## Table of Contents', '', '- [[#A|A]]', '', '## A', 'body'].join('\n')
        );
    });

    it('inserts after the last H1 even with frontmatter present', () => {
        const content = ['---', 'a: 1', '---', '# Title', '', '## A'].join('\n');
        expect(insertTOC(content, toc)).toBe(
            ['---', 'a: 1', '---', '# Title', '', '## Table of Contents', '', '- [[#A|A]]', '', '## A'].join('\n')
        );
    });

    it('inserts at the top when there is no frontmatter and no H1', () => {
        const content = ['## A', 'body'].join('\n');
        expect(insertTOC(content, toc)).toBe(
            ['## Table of Contents', '', '- [[#A|A]]', '', '## A', 'body'].join('\n')
        );
    });

    it('ignores an H1 inside a code fence', () => {
        const content = ['```', '# not a heading', '```', '## A'].join('\n');
        expect(insertTOC(content, toc)).toBe(
            ['## Table of Contents', '', '- [[#A|A]]', '', '```', '# not a heading', '```', '## A'].join('\n')
        );
    });

    it('treats unclosed frontmatter as body content', () => {
        const content = ['---', 'a: 1', 'no closing fence'].join('\n');
        expect(insertTOC(content, toc)).toBe(
            ['## Table of Contents', '', '- [[#A|A]]', '', '---', 'a: 1', 'no closing fence'].join('\n')
        );
    });
});

describe('replaceTOC', () => {
    const toc = ['## Table of Contents', '', '- [[#A|A]]'].join('\n');

    it('is idempotent: generating twice yields identical content', () => {
        const original = ['---', 'a: 1', '---', '# Title', '', 'intro', '', '## A', 'body'].join('\n');
        const once = replaceTOC(original, toc, isTitle);
        const twice = replaceTOC(once, toc, isTitle);
        expect(twice).toBe(once);
    });

    it('updates an existing TOC in place', () => {
        const withOldTOC = ['# Title', '', '## Table of Contents', '', '- [[#Old|Old]]', '', '## A'].join('\n');
        expect(replaceTOC(withOldTOC, toc, isTitle)).toBe(
            ['# Title', '', '## Table of Contents', '', '- [[#A|A]]', '', '## A'].join('\n')
        );
    });

    it('replaces a TOC under a previous title when the title setting changed', () => {
        const withAliasTOC = ['# Title', '', '## Contents', '', '- [[#Old|Old]]', '', '## A'].join('\n');
        expect(replaceTOC(withAliasTOC, toc, isTitle)).toBe(
            ['# Title', '', '## Table of Contents', '', '- [[#A|A]]', '', '## A'].join('\n')
        );
    });

    it('never destroys a bullet section under a non-TOC heading', () => {
        const original = ['# Title', '', '## Shopping list', '', '- milk', '- eggs'].join('\n');
        const result = replaceTOC(original, toc, isTitle);
        expect(result).toContain('## Shopping list');
        expect(result).toContain('- milk');
        expect(result).toContain('- eggs');
    });
});
