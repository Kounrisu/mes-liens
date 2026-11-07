# Library explorer

The `/explore` page combines a searchable library, category/source/collection filters,
cards, a table, and an interactive 3D relationship map. Saved Facebook, Instagram,
X items and YouTube playlists have permanent navigation entries and prominent
dashboard shortcuts. Topics remain separate from platforms.

The map connects bookmarks to their stored categories, sources and keywords.
It uses perspective projection, manual orbit and zoom, without continuous motion
or an additional rendering dependency. Selecting a node opens related links or a
detail panel with descriptions, creators, notes, favorite and edit controls.
Keyboard controls and a parallel list provide alternatives to pointer interaction.
The map samples up to 90 links across categories and reports its coverage; filters,
cards and the table operate on the full matching library.

Design references: [Obsidian Graph view](https://obsidian.md/help/Plugins/Graph%2Bview)
for filtered relationships and navigation; [Raindrop bookmarks](https://help.raindrop.io/bookmarks)
for searchable bookmark organization and alternate views. Existing CSS tokens,
Angular components, French/English labels and system theme are retained.

## Data work

Authenticated browser captures imported 24 YouTube playlists and 175 distinct videos.
Social captures included 179 Facebook, 612 Instagram and 91 X items. These are
loaded-item captures, not a complete account synchronization; existing matching
records were preserved or enriched. The X collector now recognizes the Bookmarks
tab on `/i/history` and rejects the Likes tab.

A server-side audit checked 2,614 existing links. A second missing response was
required before cleanup. Restricted, uncertain and protected-platform results were
retained. 314 confirmed missing records were soft-deleted with concurrent-change
and active-child checks. A database backup and private audit records remain on the
server; bookmark contents and private addresses are not included in this repository.

## Verification

- Production frontend build and translation validation.
- 160 frontend tests passed; 2 pre-existing tests skipped.
- Browser checks with synthetic local data: empty state, 3D rotation, category
  selection, related links, detail inspector, source filter, table and empty search.
- Responsive preview at 390px; no horizontal page overflow in the table view.
- Release procedure checks `/explore` and existing routes, compares deployed files
  with the build, and verifies authentication remains required.

The release is frontend-only. It does not change the database schema or API.
The initial bundle has the existing 500 kB advisory budget warning; the hard build
budget passes and the map page is loaded separately.
