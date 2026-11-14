# Cozy Read Aloud 1.7.6

## Return to the Reading Position

- Fix a false "source has changed" warning when returning to an unchanged Markdown note after autosave or another modification-time-only update.
- Verify the current editor text against the captured reading source instead of rejecting Markdown solely because the file timestamp changed. Genuine text changes, unavailable mappings, stale sessions and wrong documents remain protected.
- Locate the latest Markdown passage if playback advances while its tab is being revealed. A view without an available source editor is not reported as a confirmed content edit.
- Keep the mini outline's reading marker when Markdown text still matches despite a timestamp change. Do not rewrite the session's captured file revision during normal locating.
- Retain PDF, HTML and Web viewer revision and source-identity checks. No document text, cursor selection or audio position is changed by the validation fix.

## Verification and Updating

- 818 automated tests pass, including new public-example cases for switching away and back, reopening a reused tab, autosave timestamps, genuine edits, passage advancement and mini-outline markers.
- No online synthesis is required for these checks. Private prose, PDFs, credentials, installed settings, diagnostics and backups are not release assets.
- This is a desktop integration fix. The pinned Note Reader Core 0.3.0 dependency is unchanged.
- The optional Windows OCR helper code is unchanged. The release workflow independently rebuilds it, checks both models against an invented public sample, and publishes its checksum and provenance.

Restart Obsidian or reload the plugin to enable the permanent fix. Existing settings and credentials are preserved; reloading ends an active reading session.

## 中文摘要

修复切回正在朗读的笔记时，正文未变却被修改时间变化误判为“原文已变化”的问题。Markdown 定位改为核对编辑器全文与朗读快照，打开笔记期间播放跨段时定位最新段落，并修复迷你目录中同类的朗读标记消失问题。真实正文修改、过期会话及 PDF／HTML／网页校验保护保留。818 项自动测试通过，核心库版本不变，不包含私人正文或密钥。重启或重载插件后启用永久修复；重载会结束当前朗读。
