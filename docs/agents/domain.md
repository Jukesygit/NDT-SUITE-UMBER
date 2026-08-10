# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

This repo is **single-context**:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Note: this repo also has an Obsidian-backed memory layer (`docs/agent-memory/`, `docs/Engineering Log.md`, `docs/plans/`) that the Mandatory Memory Workflow in `CLAUDE.md` requires reading first. The two are complementary: the memory layer is orientation (what/where/recent history); `CONTEXT.md` + `docs/adr/` are the ubiquitous-language glossary and durable architectural decisions the Pocock skills maintain. Durable decisions currently live in `docs/agent-memory/Decision Log.md`; ADRs created by `/domain-modeling` go in `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
