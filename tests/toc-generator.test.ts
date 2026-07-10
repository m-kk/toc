import { describe, it, expect } from 'vitest';
import { generateTOC } from '../src/toc-generator';
import { DEFAULT_SETTINGS } from '../src/types';
import type { Heading } from '../src/types';

// Stand-in for Obsidian's stripHeadingForLink: drop link-hostile characters.
const strip = (s: string) => s.replace(/[[\]#|]/g, '').trim();

const settings = { ...DEFAULT_SETTINGS };

const h = (level: number, text: string): Heading => ({ level, text });

describe('generateTOC', () => {
    it('generates a linked, nested list', () => {
        const result = generateTOC([h(2, 'Alpha'), h(3, 'Beta'), h(2, 'Gamma')], settings, strip);
        expect(result).toBe(
            ['## Table of Contents', '', '- [[#Alpha|Alpha]]', '  - [[#Beta|Beta]]', '- [[#Gamma|Gamma]]'].join('\n')
        );
    });

    it('indents relative to the minimum heading level present', () => {
        const result = generateTOC([h(3, 'Deep'), h(4, 'Deeper')], settings, strip);
        expect(result).toBe(
            ['## Table of Contents', '', '- [[#Deep|Deep]]', '  - [[#Deeper|Deeper]]'].join('\n')
        );
    });

    it('uses the configured title', () => {
        const result = generateTOC([h(2, 'A')], { ...settings, tocTitle: 'Contents' }, strip);
        expect(result.startsWith('## Contents')).toBe(true);
    });

    it('emits plain text when links are disabled', () => {
        const result = generateTOC([h(2, 'Alpha')], { ...settings, includeLinks: false }, strip);
        expect(result).toBe(['## Table of Contents', '', '- Alpha'].join('\n'));
    });

    it('links via the stripped heading text', () => {
        const result = generateTOC([h(2, 'What [is] #this?')], settings, strip);
        expect(result).toContain('- [[#What is this?|What [is] #this?]]');
    });

    it('renders duplicate headings beyond the first as plain text', () => {
        const result = generateTOC([h(2, 'Setup'), h(2, 'Usage'), h(2, 'Setup')], settings, strip);
        expect(result).toBe(
            ['## Table of Contents', '', '- [[#Setup|Setup]]', '- [[#Usage|Usage]]', '- Setup'].join('\n')
        );
    });

    it('produces a placeholder for zero headings', () => {
        expect(generateTOC([], settings, strip)).toBe(
            ['## Table of Contents', '', '*No headings found*'].join('\n')
        );
    });
});
