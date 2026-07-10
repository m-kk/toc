export interface TOCSettings {
    tocTitle: string;
    excludeH1: boolean;
    maxDepth: number;
    includeLinks: boolean;
    excludePatterns: string[];
    updateOnSave: boolean;
}

export interface Heading {
    level: number;
    text: string;
}

export const DEFAULT_SETTINGS: TOCSettings = {
    tocTitle: 'Table of Contents',
    excludeH1: true,
    maxDepth: 4,
    includeLinks: true,
    excludePatterns: [],
    updateOnSave: false
};

export const TOC_FRONTMATTER_KEY = 'toc';
