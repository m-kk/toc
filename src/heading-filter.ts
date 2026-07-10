import { Heading, TOCSettings } from './types';
import { IsTOCTitle } from './toc-section';

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

const MAX_PATTERN_LENGTH = 100;

export function validatePattern(pattern: string): ValidationResult {
    if (!pattern.trim()) {
        return { isValid: false, error: 'Empty pattern' };
    }
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { isValid: false, error: `Pattern longer than ${MAX_PATTERN_LENGTH} characters` };
    }
    try {
        new RegExp(pattern, 'i');
        return { isValid: true };
    } catch (e) {
        return { isValid: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export function compilePatterns(
    patterns: string[],
    onInvalid?: (pattern: string, error: string) => void
): RegExp[] {
    const compiled: RegExp[] = [];
    for (const pattern of patterns) {
        const result = validatePattern(pattern);
        if (!result.isValid) {
            onInvalid?.(pattern, result.error ?? 'invalid pattern');
            continue;
        }
        compiled.push(new RegExp(pattern, 'i'));
    }
    return compiled;
}

export function filterHeadings(
    headings: Heading[],
    settings: TOCSettings,
    patterns: RegExp[],
    isTOCTitle: IsTOCTitle
): Heading[] {
    return headings.filter(heading => {
        // Never list a TOC heading inside the TOC itself.
        if (heading.level === 2 && isTOCTitle(heading.text)) return false;
        if (settings.excludeH1 && heading.level === 1) return false;
        if (heading.level > settings.maxDepth) return false;
        return !patterns.some(pattern => pattern.test(heading.text));
    });
}
