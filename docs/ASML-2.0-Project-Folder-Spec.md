# ASML 2.0 Project Folder — Format Specification

> **Status:** Normative description of the directory project format as
> shipped (directory format v1.0, storage inversion 2026-08-19). This layout
> is the **durable contract**: it is what survives any change of app shell
> (Electron → Tauri → native), and it is the format the desktop app now
> creates by default for new projects. The implementation of record is
> `packages/core/src/persistence/DirectoryFormat.ts`; where this document
> and that file disagree, the file is right and this document has a bug.

## 1. Design intent

A project folder is a set of **ordinary files a person can read, diff,
sync, and version**. Three properties are load-bearing:

1. **One beat per file.** A story edit shows up in git as
   `clusters/_unclustered/dialogTree_beat_talk.json changed`, not as line
   4,812 of a monolith. Beat filenames carry the type for human scanning.
2. **Deterministic serialization.** Stable key ordering everywhere
   (`deterministicStringify`), so re-saving without editing produces zero
   diff. This is what makes version control *useful* rather than merely
   possible.
3. **No app-private state.** Everything in the folder is derivable,
   portable content. Caches, window state, and undo history stay out.

## 2. Layout

```
<Project Name>/
  .asaps/
    format.json            ← marker + version: {"type":"directory","version":"1.0"}
  project.json             ← project metadata (name, id, dates, firstBeatId, _format)
  settings.json            ← project settings + globalSettings
  theme.json               ← themeId + overrides (present when themed)
  environment.json         ← props/nodes
  characters/
    _index.json            ← character id list (ordering)
    <characterId>.json     ← one character each (variants, counters, frames…)
  clusters/
    _index.json            ← cluster list + ordering
    _unclustered/          ← beats not in any cluster
      <type>_<beatId>.json ← ONE BEAT PER FILE
    <cluster-slug>/
      cluster.json         ← cluster metadata
      <type>_<beatId>.json
  assets/
    _manifest.json         ← asset id → {filename, type, folder, …}
    backgrounds/ sounds/ videos/ fonts/ other/
      <assetId>_<name>.<ext>   ← payload
  translations/            ← optional
    <lang>.strings.json
  .gitattributes .gitignore .p4ignore   ← VCS onboarding (written once)
```

## 3. Identity and naming rules

- **The folder is the unit.** An app opens the folder; `.asaps/format.json`
  is the recognition marker. Files inside are addressed relative to it.
- **`project.json` carries identity** (`id`, `name`); the folder name is a
  human affordance and may diverge (rename races, sync). Tools must trust
  `project.json`, not the folder name.
- Beat filenames are `<type>_<beatId>.json`. The beat id inside the file is
  authoritative; the filename is for humans and stable ordering.

## 4. Write discipline

- **Atomic writes.** Every file is written as a sibling temp
  (`*.asaps-tmp-*`) and renamed over the target. Sync daemons and readers
  only ever observe the old file or the complete new one. Temp names are
  excluded from change-watching.
- **Granular saves.** A beat edit rewrites that beat's file (and touched
  indexes), not the whole tree.
- **External changes** are watched; the app warns when files change under
  it and states which copy wins on save. Two machines editing the same
  synced folder simultaneously resolve at the sync layer — the format makes
  that safe (no partial files), not conflict-free.

## 5. Relationship to the other ASML 2.0 carriers

| Carrier | Shape | Role |
|---|---|---|
| **Project folder** (this spec) | decomposed, one beat per file | the working format on desktop; git-able, shell-proof |
| `.asaps` zip | single `project.json` (monolithic) + asset folders | interchange/backup snapshot; import always instantiates |
| `.asapst` | same zip + `projectType: "template"` flag | distributable master; import always copies, flag decides (not extension) |
| Browser library (IndexedDB) | app-managed rows | web build's working store; export to zip is its backup path |

Conversions: zip → folder (open/import), folder → zip (Export Project),
library → folder (Move library to disk / automatic adoption of new
projects). ASML 1.0 (XML) remains import-only legacy and is not part of
this contract.

## 6. Versioning

`.asaps/format.json` `version` is the layout version (currently `1.0`).
Additive changes (new optional files) don't bump it; a change that breaks an
older reader does, and readers must refuse layouts newer than they know
rather than guess. Every JSON file also carries `_format` with the same
version for standalone-file forensics.
