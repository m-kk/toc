import { Heading, TOCSettings } from './types';

/** Obsidian's stripHeadingForLink, injected so this module stays testable. */
export type StripHeading = (heading: string) => string;

export function generateTOC(headings: Heading[], settings: TOCSettings, strip: StripHeading): string {
    if (headings.length === 0) {
        return [`## ${settings.tocTitle}`, '', '*No headings found*'].join('\n');
    }

    const lines = [`## ${settings.tocTitle}`, ''];
    const minLevel = Math.min(...headings.map(h => h.level));
    const seen = new Set<string>();

    for (const heading of headings) {
        const indent = '  '.repeat(heading.level - minLevel);
        const linkText = strip(heading.text);
        // Obsidian wikilinks cannot address the 2nd+ occurrence of a duplicate
        // heading name, so those entries are rendered as plain text.
        const linkable = settings.includeLinks && !seen.has(linkText);
        seen.add(linkText);
        lines.push(linkable ? `${indent}- [[#${linkText}|${heading.text}]]` : `${indent}- ${heading.text}`);
    }

    return lines.join('\n');
}
