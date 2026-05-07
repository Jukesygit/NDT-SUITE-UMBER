---
tags:
  - agent-memory/index
  - ndt-suite
aliases:
  - Agent Memory
---

# Agent Memory

This is the compact context layer for future agents. It should answer "where am I, what matters, and where should I look next?" before an agent spends tokens searching the whole project.

## Agent Read Order

1. [[agent-memory/Project Brief]] - what this product is and how it is built.
2. [[agent-memory/Module Map]] - where the main features live.
3. [[Engineering Log]] - active work and recent handovers.
4. Relevant dated notes in `plans/`.
5. Source files for the specific task.

## Maintenance Rule

When a task changes the shape of the system, update exactly one memory note unless more are genuinely needed:

- Project purpose, stack, cross-cutting constraints: [[agent-memory/Project Brief]]
- Feature locations, ownership, key files: [[agent-memory/Module Map]]
- Durable choices and tradeoffs: [[agent-memory/Decision Log]]
- Temporary session state: `docs/plans/YYYY-MM-DD-topic.md`

The memory should stay concise. If it becomes a dumping ground, agents stop trusting it.
