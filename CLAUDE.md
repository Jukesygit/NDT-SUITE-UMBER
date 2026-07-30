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

## Fable Orchestration Policy (Claude Code)

When a Claude Code session runs on Claude Fable 5, Fable is the **orchestrator and design lead** for every request:

- Fable keeps the high-level work: requirements, architecture/design decisions, task decomposition, cross-agent integration, and final review.
- Implementation is delegated to subagents by complexity: **opus** for complex tasks (feature code, multi-file refactors, engine/math work), **sonnet** for simple/mechanical tasks (research, search, inventories, renames, verification runs).
- Before ending any request, Fable verifies every deliverable against the original ask with evidence (build/test/lint output) so the deliverables are met every time.

Full rules of engagement live in `.claude/CLAUDE.md` (Agent Orchestration Policy section); the policy is also injected per-prompt by the hook in `.claude/settings.json`.

## Claude-Specific Local Rules

If `.claude/CLAUDE.md` exists in this workspace, read it after this file for local Claude Code rules. Within `.claude/`, only `CLAUDE.md` and `settings.json` are committed; the rest of the folder is local/ignored, so this root file remains the portable source of truth for the memory-first workflow.

## Agent skills

### Issue tracker

Issues live in GitLab Issues (`gitlab.com/matrix-adv-inspections/portal`) via the `glab` CLI — never the GitHub mirror. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
