---
tags:
  - agent-memory/decisions
  - ndt-suite
aliases:
  - Decision Log
---

# Decision Log

Use this for durable decisions that affect future work. Keep entries short and link to fuller notes when needed.

## 2026-05-07 - Obsidian Memory Layer

Decision: maintain a small agent-facing memory layer in `AGENTS.md` and `docs/agent-memory/`.

Reasoning: future agents should get project orientation from curated notes before searching the whole repository. The notes are a map, not a replacement for reading source code.

Consequences:

- `AGENTS.md` is the first file for agents to read.
- `docs/agent-memory/Project Brief.md` stores stable project context.
- `docs/agent-memory/Module Map.md` stores feature-to-file ownership.
- `docs/agent-memory/Decision Log.md` stores durable decisions.
- Temporary session state belongs in dated handoff notes under `docs/plans/`.

## 2026-05-07 - Memory-First Agent Instructions

Decision: make the memory-first workflow explicit in both Codex and Claude instruction files.

Reasoning: the memory layer only saves context if agents reliably read it before broad repository search. The practice should be part of the agent operating contract, not a one-off prompt.

Consequences:

- Codex-style agents start from `AGENTS.md`.
- Claude agents start from root `CLAUDE.md`, then `.claude/CLAUDE.md` when present locally.
- Both instruction files require agents to read `Project Brief`, `Module Map`, and `Engineering Log` before non-trivial work.
- Agents should update memory or a dated handoff note when a task changes project shape or leaves important unfinished context.

## 2026-05-08 - Companion CSV Exports Use Explicit Thickness Filters

Decision: companion C-scan CSV export paths should not implicitly apply the NDE file's thickness-process `min`/`max` limits. Those limits remain metadata and may be applied only when a user or API request explicitly supplies export filter values.

Reasoning: a May 2026 Judy SO2 data check showed the NDE `RawCScan` contained sub-5 mm readings, while exported CSVs hid them because the batch/API export paths silently applied the file's 6.25-28.0 mm thickness process range and converted lower readings to `ND`.

Consequences:

- Batch export leaves thickness filter fields blank by default and logs detected NDE process limits as guidance.
- The `/cscan-export` API uses only request-provided `thicknessMin`/`thicknessMax`.
- Future OmniPC-match workflows that need process-limit filtering must opt in explicitly.
