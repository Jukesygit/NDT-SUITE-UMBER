# Agent Instructions

This repository has an Obsidian-backed memory layer. Read this file first, then use the linked notes to scope your search before touching code.

## Mandatory Memory Workflow

For every non-trivial coding, design, debugging, architecture, documentation, or review task:

1. Read the memory notes listed below before broad repository search.
2. Use the memory notes to identify the smallest relevant code/docs area.
3. Inspect source files only after the likely area is known.
4. Treat memory notes as orientation, not proof. Verify behavior in code before editing.
5. If the task changes system shape, feature ownership, recurring constraints, or leaves unfinished context, update the relevant memory or handoff note before finishing.

Skip this workflow only for tiny mechanical requests where reading memory would add no value, such as showing `git status`, answering a direct command output question, or editing a single explicitly named line.

## Read First

1. `docs/agent-memory/Project Brief.md` - product, stack, architecture, and recurring constraints.
2. `docs/agent-memory/Module Map.md` - where major features live.
3. `docs/Engineering Log.md` - active work areas and recent handovers.
4. The latest relevant note in `docs/plans/` if the task mentions a feature already planned or handed over.

## Working Rules

- Start from the memory notes, then inspect only the code paths relevant to the task.
- Treat the memory as a map, not as proof. Verify implementation details in code before editing.
- Do not overwrite unrelated user changes. This repo often has ongoing UI work in progress.
- Keep edits scoped to the requested behavior and the local patterns around it.
- Prefer existing React, React Query, Supabase, and CSS patterns over introducing new abstractions.
- For frontend changes, check responsive layout and avoid adding marketing-style UI to operational screens.

## Keeping Memory Fresh

Update the memory layer when work changes the project shape:

- Durable project facts: `docs/agent-memory/Project Brief.md`
- Feature ownership and file locations: `docs/agent-memory/Module Map.md`
- Architecture or product decisions: `docs/agent-memory/Decision Log.md`
- Session handoff or unfinished work: create a dated note in `docs/plans/` from `docs/templates/Agent Task Handoff.md`

Do not put noisy implementation minutiae in the memory layer. Keep it short enough that future agents will actually read it.

## Validation Commands

Use the narrowest validation that fits the change:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

If a command cannot be run, say why in the handoff.
