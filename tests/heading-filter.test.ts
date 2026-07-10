import { describe, it, expect, vi } from 'vitest';
import { validatePattern, compilePatterns, filterHeadings } from '../src/heading-filter';
import { makeIsTOCTitle } from '../src/toc-section';
import { DEFAULT_SETTINGS } from '../src/types';
import type { Heading } from '../src/types';

const isTitle = makeIsTOCTitle('Table of Contents');
const settings = { ...DEFAULT_SETTINGS };

const h = (level: number, text: string): Heading => ({ level, text });

describe('validatePattern', () => {
    it('accepts a valid pattern', () => {
        expect(validatePattern('^Draft').isValid).toBe(true);
    });

    it('rejects an empty pattern', () => {
        expect(validatePattern('  ').isValid).toBe(false);
    });

    it('rejects an overlong pattern', () => {
        expect(validatePattern('a'.repeat(101)).isValid).toBe(false);
    });

    it('rejects a syntactically invalid pattern with the error message', () => {
        const result = validatePattern('[unclosed');
        expect(result.isValid).toBe(false);
        expect(result.error).toBeTruthy();
    });
});

describe('compilePatterns', () => {
    it('compiles valid patterns case-insensitively', () => {
        const compiled = compilePatterns(['^draft']);
        expect(compiled).toHaveLength(1);
        expect(compiled[0]!.test('Draft notes')).toBe(true);
    });

    it('skips invalid patterns and reports them', () => {
        const onInvalid = vi.fn();
        const compiled = compilePatterns(['[bad', '^good$'], onInvalid);
        expect(compiled).toHaveLength(1);
        expect(onInvalid).toHaveBeenCalledWith('[bad', expect.any(String));
    });
});

describe('filterHeadings', () => {
    it('excludes H1 when configured', () => {
        const result = filterHeadings([h(1, 'Title'), h(2, 'Section')], { ...settings, excludeH1: true }, [], isTitle);
        expect(result).toEqual([h(2, 'Section')]);
    });

    it('keeps H1 when not excluded', () => {
        const result = filterHeadings([h(1, 'Title')], { ...settings, excludeH1: false }, [], isTitle);
        expect(result).toEqual([h(1, 'Title')]);
    });

    it('enforces max depth', () => {
        const result = filterHeadings([h(2, 'A'), h(5, 'Deep')], { ...settings, maxDepth: 4 }, [], isTitle);
        expect(result).toEqual([h(2, 'A')]);
    });

    it('excludes H2s matching a TOC title (self-exclusion)', () => {
        const result = filterHeadings([h(2, 'Table of Contents'), h(2, 'TOC'), h(2, 'Real')], settings, [], isTitle);
        expect(result).toEqual([h(2, 'Real')]);
    });

    it('does not self-exclude non-H2 headings with TOC-like names', () => {
        const result = filterHeadings([h(3, 'Index')], settings, [], isTitle);
        expect(result).toEqual([h(3, 'Index')]);
    });

    it('applies exclude patterns', () => {
        const compiled = compilePatterns(['^draft']);
        const result = filterHeadings([h(2, 'Draft: ideas'), h(2, 'Final')], settings, compiled, isTitle);
        expect(result).toEqual([h(2, 'Final')]);
    });
});
