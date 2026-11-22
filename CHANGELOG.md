# Changelog

Changes specific to this Karakeep fork. Upstream versions identify sync points, not fork releases.

## Unreleased

### AI removal

- Remove Interpreter, AI provider/model configuration, prompt/model template variables, and related UI, styles, translations, and tests.
- Remove AI-powered translation tooling; retain manual locale creation.
- Preserve all existing non-AI core functionality: clipping, standard templates, highlighting, reader views, Obsidian export, and Karakeep saving and highlight sync.

### Karakeep

- Match highlights against Karakeep reader content, using quote context to distinguish repeated text. ([2f000cb](https://github.com/VandeeFeng/karakeep-clipper/commit/2f000cb))
- Skip missing or ambiguous highlight matches instead of syncing incorrect ranges.
- Preserve imported highlight IDs and persist successfully synced IDs for retries. ([40db76f](https://github.com/VandeeFeng/karakeep-clipper/commit/40db76f))
- Carry highlight metadata through clipping and reader views.
- Handle partial save failures and empty SDK responses without losing sync state.
- Update `@karakeep/sdk` to `0.35.0` and DOMPurify to `3.4.18`.

### Upstream sync

- Sync Obsidian Web Clipper through `1.8.4`, preserving Karakeep integration. ([a099add](https://github.com/VandeeFeng/karakeep-clipper/commit/a099add))
- Update Defuddle to `0.19.13`.
- Include Android popup and Obsidian handoff fixes, shadow DOM stamp cleanup, and non-blocking provider preset loading.
- Include upstream store release tooling. Safari now requires macOS 12 or later.

## Earlier work

- Sync Obsidian Web Clipper through `1.7.1`. ([0ca9517](https://github.com/VandeeFeng/karakeep-clipper/commit/0ca9517))
- Use the official Karakeep SDK for bookmark saving and highlight sync, retaining Hoarder-compatible settings. ([3c0c044](https://github.com/VandeeFeng/karakeep-clipper/commit/3c0c044))
- Add reader highlight addition/deletion sync. ([ada2044](https://github.com/VandeeFeng/karakeep-clipper/commit/ada2044))
