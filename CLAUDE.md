# NDT Suite Claude Instructions

Claude agents working in this repository must use the project memory layer before broad code search.

## Mandatory Memory Workflow

For every non-trivial coding, design, debugging, architecture, documentation, or review task:

1. Read `docs/agent-memory/Project Brief.md`.
2. Read `docs/agent-memory/Module Map.md`.
3. Read `docs/Engineering Log.md`.
4. If the task mentions an existing feature, read the latest relevant note in `docs/plans/`.
5. Use those notes to identify the smallest relevant code/docs area before searching the wider repository.
6. Treat memory notes as orientation, not proof. Verify behavior in source code before editing.
7. If the task changes system shape, feature ownership, recurring constraints, or leaves unfinished context, update the relevant memory or handoff note before finishing.

Skip this workflow only for tiny mechanical requests where reading memory would add no value, such as showing `git status`, answering a direct command output question, or editing a single explicitly named line.

## Memory Files

- `AGENTS.md` - cross-agent repository instructions.
- `docs/Agent Memory.md` - Obsidian index for the memory layer.
- `docs/agent-memory/Project Brief.md` - stable project context.
- `docs/agent-memory/Module Map.md` - feature-to-file map.
- `docs/agent-memory/Decision Log.md` - durable decisions.
- `docs/templates/Agent Task Handoff.md` - session handoff template.

## Claude-Specific Local Rules

If `.claude/CLAUDE.md` exists in this workspace, read it after this file for local Claude Code rules. The `.claude/` folder is currently local/ignored, so this root file is the portable source of truth for the memory-first workflow.
