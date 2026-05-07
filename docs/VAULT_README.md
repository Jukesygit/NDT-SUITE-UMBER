# Obsidian Vault

The `docs/` directory is set up as an [Obsidian](https://obsidian.md) vault.

## Open the vault

1. Install Obsidian.
2. Choose **Open folder as vault** and select the `docs/` directory of this repo.
3. Obsidian will read the shared config from `docs/.obsidian/` and pick up all existing markdown notes.

## What is committed

- `docs/.obsidian/app.json`, `appearance.json`, `core-plugins.json`, `community-plugins.json`, `hotkeys.json`, `graph.json` — shared editor and plugin defaults.
- All markdown notes under `docs/`.

## What is gitignored

Per-user UI state and caches:

- `docs/.obsidian/workspace.json`, `workspace-mobile.json`, `workspaces.json`
- `docs/.obsidian/cache`
- `docs/.obsidian/plugins/*/data.json`
- `docs/.trash/`

If you install community plugins, commit the plugin folder under `docs/.obsidian/plugins/<plugin-id>/` (the `data.json` is gitignored so personal settings stay local).

## Attachments

New attachments are stored under `docs/attachments/` per `app.json`.
