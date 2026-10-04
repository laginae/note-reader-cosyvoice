# 0.7.0

- Add the native reading toolbar to PDF panes, including ribbon entry preferences and PDF selection scopes.
- Recover omitted bookmark section numbers from uniquely matched source headings, without creating duplicate bookmarks during merging.

- Add local PDF outline analysis with existing-bookmark priority, editable inferred headings and chapter reading actions.
- Add confirmed bookmark saving with keep/merge/replace policies, copy-by-default and optional overwrite with verified backup.
- Refuse bookmark writes for encrypted or signed documents; verify page structure, annotations and new bookmark destinations before saving.

- Add highlight color/strength controls and a dedicated reset, plus configurable ribbon entry (sidebar, toolbar or both).
- Add a persistent collapsible sidebar outline and group secondary actions under More actions.
- Keep reliably mapped source blocks highlighted when an unrelated context-sensitive block cannot be aligned.

- Add a compact reading toolbar to native Markdown panes, preserving their existing rendering, images and embeds.
- Add outline navigation, section-only and read-from-section actions, playback progress, speed, volume and selection scopes.
- Retain the optional extracted document as Focus reading; fix reading from the actual selected occurrence instead of a stale editor selection.
- Add subtle current-segment marks to rendered PDF text layers when page and text matches are reliable. Unsupported or ambiguous layouts remain unmarked.
- Preserve playback when closing either the toolbar or Focus reading. Reading and highlighting reuse the existing queue, without additional speech requests.

## Verification

Build, core/export/loader checks and automated tests cover repeated selections, stale source snapshots, nested outline scopes, progress controls, PDF columns, page crossings and highlight cleanup.

Live Obsidian UI and system Narrator interaction were not tested for this update, at the user's request. No online speech API was called during these checks.

## 使用说明

实时预览增加淡色行级标记，避免文字装饰被渲染组件遮住。PDF 渐进朗读优先在完整句末分段，不再优先按排版换行切割；超出引擎分段上限的长句仍按分句或词边界拆分，不丢弃剩余内容。

原笔记优先使用“朗读工具栏”；“专注朗读”保留为可选正文与讲述人入口。PDF 高亮为淡色段级标记，可在设置中关闭；文字层未显示或无法可靠定位时不高亮，不自动滚页。安装后需自行重载插件或重启 Obsidian。
