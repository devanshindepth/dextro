export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Lists all files and folders in a given directory path.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to list, relative to the project root (e.g., "." or "src/components").'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Reads the contents of a file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to read, relative to the project root (e.g., "package.json").'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Writes content to a file, overwriting it entirely.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to write to, relative to the project root.'
          },
          content: {
            type: 'string',
            description: 'The full string content to write to the file.'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stages all local changes and creates a local git commit. This is a safe, reversible local action.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The commit message describing the changes.'
          }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Pushes all local commits to the remote repository. This is an externally visible action and may trigger CI.',
      parameters: {
        type: 'object',
        properties: {
          remote: {
            type: 'string',
            description: 'The name of the remote to push to (defaults to "origin").',
            default: 'origin'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Proposes a shell command to execute in the native terminal environment.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (e.g., "npm run build").'
          },
          cwd: {
            type: 'string',
            description: 'The working directory to execute the command in, relative to the project root (e.g., ".").'
          }
        },
        required: ['command', 'cwd']
      }
    }
  }
];
