---
tags:
  - vault/setup
  - ndt-suite/docs
aliases:
  - Obsidian Setup
---

# Obsidian Setup

This project can be opened in Obsidian in two ways.

## Recommended Vaults

1. Open the project root when you want README, product notes, design notes, docs, dev-docs, and code-path references in one place. Start at `VAULT.md`.
2. Open `docs` when you want a quieter documentation-only vault. Start at [[Home]].

## Shared Settings

- Stable settings live in `.obsidian` and `docs/.obsidian`.
- Personal layout files, cache folders, downloaded plugins, and trash folders are ignored by Git.
- Templates live in `templates/`.
- Daily notes live in `journal/daily`.
- New scratch notes should go to [[inbox/README|Inbox]] before they become durable docs.

## Naming Conventions

- Use dated plan files: `YYYY-MM-DD-topic.md`.
- Keep durable decision notes short and title them around the decision.
- Link to source paths with inline code when the note is about implementation details.
- Prefer wiki links for vault notes and Markdown links only when pointing outside the vault.

## Suggested Workflow

- Start the day from [[Engineering Log]].
- Capture quick context in a daily note.
- Promote useful discoveries to existing docs or a dated plan.
- End major work with a handover note that records changed files, validation, and next steps.
