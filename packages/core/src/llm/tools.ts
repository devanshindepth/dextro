import type { SecurityTier, ToolDefinition } from 'core-types';

/**
 * Dextro Agent Tool Registry
 *
 * 17 tools spanning 3 trust tiers:
 *   auto    — always silent (read-only, fully reversible)
 *   confirm — one tap required; auto-approved in 'standard' security preset
 *   gate    — always requires explicit user tap; no preset bypasses this
 *
 * SEARCH/REPLACE blocks are used for patch_file instead of unified diffs,
 * since LLMs frequently produce wrong line numbers in unified diff format.
 */

export interface AgentTool extends ToolDefinition {
  tier: SecurityTier;
}

export const AGENT_TOOLS: AgentTool[] = [
  // ── AUTO TIER ────────────────────────────────────────────────────────────────

  {
    name: 'list_directory',
    tier: 'auto',
    description:
      'Lists all files and folders in a given directory path. Returns a flat list of entries with type (file/directory) and size.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The directory path to list, relative to the project root. Use "." for the root itself.',
        },
      },
      required: ['path'],
    },
  },

  {
    name: 'read_file',
    tier: 'auto',
    description:
      'Reads the full contents of a file. For large files (>500 lines), prefer using search_files or find_symbol first to locate specific sections.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read, relative to the project root.',
        },
        start_line: {
          type: 'number',
          description:
            'Optional. 1-indexed line to start reading from. Omit to read from the beginning.',
        },
        end_line: {
          type: 'number',
          description:
            'Optional. 1-indexed line to stop reading at (inclusive). Omit to read to the end of the file.',
        },
      },
      required: ['path'],
    },
  },

  {
    name: 'search_files',
    tier: 'auto',
    description:
      'Recursively searches files in the project for a regex pattern. Returns file path, line number, and matching line content. Capped at 100 results.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for (e.g., "useState\\(", "TODO:", "import.*from").',
        },
        path: {
          type: 'string',
          description: 'Directory to search within, relative to project root. Defaults to "." (whole project).',
          default: '.',
        },
        file_pattern: {
          type: 'string',
          description:
            'Optional glob-style file extension filter. e.g., "*.ts" to only search TypeScript files.',
        },
        case_sensitive: {
          type: 'string',
          enum: ['true', 'false'],
          description: 'Whether the search is case-sensitive. Defaults to false.',
          default: 'false',
        },
      },
      required: ['pattern'],
    },
  },

  {
    name: 'find_symbol',
    tier: 'auto',
    description:
      'Searches for a function, class, type, interface, or variable declaration by name across the project. Returns the file path and line number of each declaration found.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol name to find (e.g., "calculateTotal", "UserService", "AppState").',
        },
        path: {
          type: 'string',
          description: 'Directory to search within, relative to project root. Defaults to ".".',
          default: '.',
        },
      },
      required: ['symbol'],
    },
  },

  {
    name: 'git_status',
    tier: 'auto',
    description:
      'Shows the working tree status: which files are modified, added, deleted, or untracked.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'git_diff',
    tier: 'auto',
    description:
      'Shows the diff of uncommitted changes. Optionally scoped to a specific file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional. A specific file path to diff, relative to the project root. Omit to diff all changes.',
        },
      },
    },
  },

  {
    name: 'git_log',
    tier: 'auto',
    description: 'Shows the commit history for the current branch.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of commits to return. Defaults to 20.',
          default: 20,
        },
      },
    },
  },

  {
    name: 'git_branch',
    tier: 'auto',
    description:
      'Lists all local branches and identifies the currently active branch.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ── CONFIRM TIER ─────────────────────────────────────────────────────────────

  {
    name: 'write_file',
    tier: 'confirm',
    description:
      'Writes content to a file, creating it if it does not exist and overwriting it entirely if it does. For editing existing files, prefer patch_file to avoid rewriting unchanged sections.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to write to, relative to the project root.',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
  },

  {
    name: 'patch_file',
    tier: 'confirm',
    description: `Edits an existing file using a SEARCH/REPLACE block. The SEARCH block must match the exact content in the file (including whitespace and indentation). The REPLACE block will substitute it.

Format your input as:
<<<<<<< SEARCH
[exact content to find — must be unique in the file]
=======
[replacement content]
>>>>>>> REPLACE

Rules:
- The SEARCH block must match exactly one location in the file.
- If the SEARCH block matches 0 or 2+ locations, the tool fails and you must re-read the file first.
- Do NOT use this for new files — use write_file instead.`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to patch, relative to the project root.',
        },
        diff: {
          type: 'string',
          description:
            'The SEARCH/REPLACE block as described in the tool description.',
        },
      },
      required: ['path', 'diff'],
    },
  },

  {
    name: 'create_directory',
    tier: 'confirm',
    description: 'Creates a directory (and any missing parent directories).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to create, relative to the project root.',
        },
      },
      required: ['path'],
    },
  },

  {
    name: 'delete_file',
    tier: 'confirm',
    description:
      'Deletes a file. This is recoverable via git if the file was tracked. Use with caution on untracked files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to delete, relative to the project root.',
        },
      },
      required: ['path'],
    },
  },

  {
    name: 'move_file',
    tier: 'confirm',
    description: 'Moves or renames a file.',
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'The source file path, relative to the project root.',
        },
        to: {
          type: 'string',
          description: 'The destination file path, relative to the project root.',
        },
      },
      required: ['from', 'to'],
    },
  },

  {
    name: 'git_commit',
    tier: 'confirm',
    description:
      'Stages all current changes and creates a local git commit. This is a local, reversible action.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The commit message describing the changes.',
        },
      },
      required: ['message'],
    },
  },

  {
    name: 'git_checkout',
    tier: 'confirm',
    description:
      'Switches to an existing branch, creates and switches to a new branch, or restores a specific file to its last committed state.',
    parameters: {
      type: 'object',
      properties: {
        branch: {
          type: 'string',
          description: 'The branch name to switch to or create.',
        },
        create: {
          type: 'string',
          enum: ['true', 'false'],
          description: 'Set to "true" to create the branch if it does not exist.',
          default: 'false',
        },
        file: {
          type: 'string',
          description:
            'Optional. If set, restores only this specific file (relative path) instead of switching branches.',
        },
      },
      required: ['branch'],
    },
  },

  // ── GATE TIER ────────────────────────────────────────────────────────────────

  {
    name: 'run_command',
    tier: 'gate',
    description:
      'Executes a shell command in the project directory via Termux. Use for building, testing, installing dependencies, running scripts, etc. The command runs in the shared project directory visible to both the agent and Termux. Always prefer specific tools (git_commit, write_file, etc.) over shell commands when possible.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'The shell command to execute (e.g., "npm install", "npx tsc --noEmit", "python manage.py migrate").',
        },
        cwd: {
          type: 'string',
          description:
            'Working directory relative to the project root. Defaults to "." (project root).',
          default: '.',
        },
        timeout_seconds: {
          type: 'number',
          description:
            'Maximum seconds to wait for the command. Defaults to 60. Use higher values for slow operations like dependency installation.',
          default: 60,
        },
      },
      required: ['command'],
    },
  },

  {
    name: 'git_push',
    tier: 'gate',
    description:
      'Pushes all local commits to the remote repository. This is an externally visible, hard-to-undo action that may trigger CI pipelines. Always commit first.',
    parameters: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'The name of the remote to push to. Defaults to "origin".',
          default: 'origin',
        },
        branch: {
          type: 'string',
          description:
            'The branch to push. Defaults to the current branch.',
        },
      },
    },
  },

  {
    name: 'read_url',
    tier: 'gate',
    description:
      'Fetches the text content of a URL. Use for reading documentation, npm package READMEs, API references, or GitHub files. Returns plain text stripped of HTML, capped at 16,000 characters.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch. Must be an https:// URL.',
        },
        description: {
          type: 'string',
          description:
            'Brief explanation of why you are fetching this URL (shown to the user for transparency).',
        },
      },
      required: ['url', 'description'],
    },
  },
];

/** Returns the tool definition as a provider-agnostic ToolDefinition (no tier) */
export function getToolDefinitions(): import('core-types').ToolDefinition[] {
  return AGENT_TOOLS.map(({ tier: _tier, ...def }) => def);
}

/** Look up the tier for a given tool name */
export function getToolTier(name: string): SecurityTier {
  return AGENT_TOOLS.find((t) => t.name === name)?.tier ?? 'gate';
}
