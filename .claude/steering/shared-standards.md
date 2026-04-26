---
inclusion: always
---

# LASKI Finances — Shared Standards

## Language

- All code, comments, variable names, field names, and API responses MUST be in English
- Commit messages in English
- When refactoring existing Portuguese code, rename fields to their English equivalents (see `project-overview.md` for the mapping)

## TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- Use `NodeNext` module resolution
- Prefer `const` over `let`, never use `var`
- Use explicit return types on exported functions

## Dependency Management

- All dependencies MUST use exact versions (no `^` or `~`) in `package.json`
- `package-lock.json` MUST be committed — never gitignored
- Always use `npm ci` (not `npm install`) from the **project root** — never from individual workspace folders
  - Exception: `front/` — Amplify Hosting runs `npm ci` inside `front/` during its build
- Version upgrades are dedicated tasks — never a side-effect of other work
- When upgrading a dependency, update ALL workspaces that reference it in the same commit
