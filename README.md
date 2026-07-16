# Dextro Monorepo

Welcome to **Dextro**, an agent-focused development environment and terminal execution workspace.

## Repository Structure

- `apps/`
  - `mobile/`: React Native Expo mobile application containing chat and developer configurations.
  - `daemon/`: Background workspace executor and server node.
- `packages/`
  - `core/`: Shared orchestration and command queue logic.
  - `db-schema/`: Core database entities and TypeScript type specifications.

## Development

Runs with Turbo workspaces:
```bash
npm run dev
```
