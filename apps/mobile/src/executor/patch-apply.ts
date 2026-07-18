/**
 * Dextro SEARCH/REPLACE Patch Applier
 *
 * Applies edits to files using the SEARCH/REPLACE block format, which is more
 * robust than unified diffs because it requires no line number accuracy.
 *
 * The SEARCH block must match the exact content in the file (including whitespace).
 * The REPLACE block substitutes the matched content.
 *
 * Error handling:
 * - 0 matches: returns error, agent must re-read the file first
 * - 2+ matches: returns error, agent must make the search block more unique
 * - Malformed diff: returns parse error
 */

export interface PatchResult {
  applied: boolean;
  newContent?: string;
  reason?: string;
  /** Unified-style diff for UI display */
  displayDiff?: string;
}

const SEARCH_MARKER = '<<<<<<< SEARCH';
const SEPARATOR = '=======';
const REPLACE_MARKER = '>>>>>>> REPLACE';

/**
 * Parse a SEARCH/REPLACE diff block string into its components.
 */
function parseDiffBlock(diff: string): { search: string; replace: string } | null {
  const searchStart = diff.indexOf(SEARCH_MARKER);
  const separator = diff.indexOf(SEPARATOR);
  const replaceEnd = diff.indexOf(REPLACE_MARKER);

  if (searchStart === -1 || separator === -1 || replaceEnd === -1) return null;
  if (searchStart > separator || separator > replaceEnd) return null;

  const search = diff.slice(searchStart + SEARCH_MARKER.length, separator).trim();
  // Don't trim the replace content — trailing newlines matter
  const replace = diff.slice(separator + SEPARATOR.length, replaceEnd);
  // But remove one leading newline if present (artifact of block formatting)
  const normalizedReplace = replace.startsWith('\n') ? replace.slice(1) : replace;

  return { search, replace: normalizedReplace };
}

/**
 * Count non-overlapping occurrences of `needle` in `haystack`.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * Generate a simple display diff (added/removed lines) for UI purposes.
 */
function generateDisplayDiff(search: string, replace: string): string {
  const removed = search.split('\n').map((l) => `- ${l}`).join('\n');
  const added = replace.split('\n').map((l) => `+ ${l}`).join('\n');
  return `${removed}\n${added}`;
}

/**
 * Apply one or more SEARCH/REPLACE blocks to the given file content.
 * Multiple blocks are supported (applied sequentially).
 */
export function applyPatch(fileContent: string, diff: string): PatchResult {
  // Split on SEARCH_MARKER to handle multiple blocks
  const blocks = diff.split(SEARCH_MARKER).slice(1);

  if (blocks.length === 0) {
    return { applied: false, reason: 'No SEARCH/REPLACE block found in the diff.' };
  }

  let currentContent = fileContent;
  const displayDiffs: string[] = [];

  for (const rawBlock of blocks) {
    const block = parseDiffBlock(SEARCH_MARKER + rawBlock);

    if (!block) {
      return {
        applied: false,
        reason: `Malformed SEARCH/REPLACE block. Ensure the format is:\n${SEARCH_MARKER}\n[content]\n${SEPARATOR}\n[replacement]\n${REPLACE_MARKER}`,
      };
    }

    if (!block.search) {
      return { applied: false, reason: 'SEARCH block is empty. Provide content to match.' };
    }

    const matchCount = countOccurrences(currentContent, block.search);

    if (matchCount === 0) {
      // Try trimmed comparison to give a more helpful error
      const searchTrimmed = block.search.trim();
      const contentTrimmed = currentContent.trim();
      const fuzzyMatch = contentTrimmed.includes(searchTrimmed);

      return {
        applied: false,
        reason: fuzzyMatch
          ? `SEARCH block not found (whitespace mismatch). Re-read the file and copy the exact content including indentation.`
          : `SEARCH block not found in file. The content may have changed — re-read the file before patching.`,
      };
    }

    if (matchCount > 1) {
      return {
        applied: false,
        reason: `SEARCH block matches ${matchCount} locations in the file. Make the search block more unique by including more surrounding context.`,
      };
    }

    displayDiffs.push(generateDisplayDiff(block.search, block.replace));
    currentContent = currentContent.replace(block.search, block.replace);
  }

  return {
    applied: true,
    newContent: currentContent,
    displayDiff: displayDiffs.join('\n---\n'),
  };
}
