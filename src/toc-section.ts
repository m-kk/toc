// Locating, removing, and inserting the TOC section in note content.
// All positions are derived from the content string itself — never from
// Obsidian's metadata cache, which can be stale relative to a pending write.

const TOC_TITLE_ALIASES = ['table of contents', 'toc', 'contents', 'index', 'outline'];

export type IsTOCTitle = (text: string) => boolean;

export function makeIsTOCTitle(tocTitle: string): IsTOCTitle {
    const titles = new Set([...TOC_TITLE_ALIASES, tocTitle.trim().toLowerCase()]);
    return (text: string) => titles.has(text.trim().toLowerCase());
}

export interface TOCSection {
    /** Line index of the TOC heading. */
    start: number;
    /** Last line of the section, inclusive (list items and surrounding blanks). */
    end: number;
}

const FENCE = /^(```|~~~)/;
const H1 = /^#\s+\S/;
const H2 = /^##\s+(.+?)\s*$/;
const LIST_ITEM = /^\s*-\s/;
const EMPTY_TOC_MARKER = '*No headings found*';

/** Line index of the closing `---`, or -1 if the file has no (closed) frontmatter. */
function frontmatterEnd(lines: string[]): number {
    if (lines[0] !== '---') return -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') return i;
    }
    return -1;
}

/**
 * Find the TOC section: an H2 whose text matches a TOC title, plus the
 * blank/list lines under it. Only the heading text identifies a TOC —
 * an ordinary section that happens to contain bullets never matches.
 */
export function findTOCSection(lines: string[], isTitle: IsTOCTitle): TOCSection | null {
    let inFence = false;
    for (let i = frontmatterEnd(lines) + 1; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (FENCE.test(line.trimStart())) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        const match = line.match(H2);
        if (!match || !isTitle(match[1] ?? '')) continue;

        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
            const next = lines[j] ?? '';
            const trimmed = next.trim();
            if (trimmed !== '' && !LIST_ITEM.test(next) && trimmed !== EMPTY_TOC_MARKER) break;
            end = j;
        }
        return { start: i, end };
    }
    return null;
}

/** Remove the TOC section (and the blank lines directly above it), if present. */
export function removeTOCSection(content: string, isTitle: IsTOCTitle): string {
    const lines = content.split('\n');
    const section = findTOCSection(lines, isTitle);
    if (!section) return content;

    let start = section.start;
    while (start > 0 && (lines[start - 1] ?? '').trim() === '') start--;

    return [...lines.slice(0, start), ...lines.slice(section.end + 1)].join('\n');
}

/**
 * Insert a TOC block after the last H1, else directly after frontmatter,
 * else at the top of the file. Exactly one blank line separates the TOC
 * from its neighbors, which keeps remove→insert round trips idempotent.
 */
export function insertTOC(content: string, toc: string): string {
    const lines = content.split('\n');
    const fmEnd = frontmatterEnd(lines);

    let lastH1 = -1;
    let inFence = false;
    for (let i = fmEnd + 1; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (FENCE.test(line.trimStart())) {
            inFence = !inFence;
            continue;
        }
        if (!inFence && H1.test(line)) lastH1 = i;
    }

    const insertAt = lastH1 >= 0 ? lastH1 + 1 : fmEnd + 1;
    const before = lines.slice(0, insertAt);
    const after = lines.slice(insertAt);
    while (after.length > 0 && (after[0] ?? '').trim() === '') after.shift();

    const parts = before.length > 0 ? [...before, '', ...toc.split('\n')] : toc.split('\n');
    if (after.length > 0) parts.push('', ...after);
    return parts.join('\n');
}

/** Replace (or first insert) the TOC section in one pass. */
export function replaceTOC(content: string, toc: string, isTitle: IsTOCTitle): string {
    return insertTOC(removeTOCSection(content, isTitle), toc);
}
