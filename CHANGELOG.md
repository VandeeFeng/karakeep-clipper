# Changelog

Changes specific to this Karakeep fork. Upstream versions identify sync points, not fork releases.

## Unreleased

### Karakeep

- Match highlights against Karakeep reader content, using quote context to distinguish repeated text.
- Skip missing or ambiguous highlight matches instead of syncing incorrect ranges.
- Preserve imported highlight IDs and persist successfully synced IDs for retries.
- Carry highlight metadata through clipping and reader views.
- Handle partial save failures and empty SDK responses without losing sync state.
- Update `@karakeep/sdk` to `0.35.0` and DOMPurify to `3.4.18`.

### Upstream sync

- Sync Obsidian Web Clipper through `1.8.4` ([50f67c5](https://github.com/obsidianmd/obsidian-clipper/commit/50f67c5)), preserving Karakeep integration.
- Update Defuddle to `0.19.13`.
- Include Android popup and Obsidian handoff fixes, shadow DOM stamp cleanup, and non-blocking provider preset loading.
- Include upstream store release tooling. Safari now requires macOS 12 or later.

## Earlier work

- Sync Obsidian Web Clipper through `1.7.1` ([6d56d61](https://github.com/obsidianmd/obsidian-clipper/commit/6d56d618b00bd970aa738d6a7a61edee27783e81)).
- Add bookmark saving and highlight addition/deletion sync through the official Karakeep SDK, using Hoarder-compatible settings.
