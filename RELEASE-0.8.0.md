# 0.8.0 - Reading toolbars, highlights and PDF outlines

## Highlights

- Native reading toolbars for Markdown, PDF, HTML Reader and Obsidian Web viewer, with playback speed, volume, progress and selection scopes.
- Optional HTML/web paragraph highlighting, without changing page text or making extra speech requests. Following is off by default; ambiguous matches are not highlighted.
- Improved Markdown/live-preview and two-column PDF highlighting, configurable color and strength, and optional Focus reading.
- Local PDF outlines with source numbering, editable headings/levels, navigation and section reading.
- Local HTML outlines from semantic headings and conservatively detected consecutive section numbering, with navigation and section reading.
- Reuse unchanged PDF outlines and edits in a bounded memory-only cache instead of rescanning every time. No outline text is saved to settings.
- Select all / Deselect all bookmark entries, a draggable outline title bar, keyboard movement and a Center button.
- Confirmed PDF bookmark export: copy by default, optional overwrite with verified backup, and keep/merge/replace policies. Encrypted or signed PDFs are refused.
- Installed Windows/macOS system voices, without a cloud fallback. Narrator-only Natural / Natural HD voices cannot be directly synthesized by the plugin.
- Remove overlapping native/Obsidian button tooltips while retaining accessible names and pause/resume keyboard hints.
- Update the toolbar reading button tooltip immediately when the selected scope or language changes.

## Privacy and Compatibility

Local parsing, outline analysis and highlighting do not call speech APIs. Online speech still requires explicit consent; OpenRouter requests continue to enforce ZDR routing. Existing settings and credentials are preserved.

External Web viewer outlines are not included. HTML inferred headings need review. Page highlights require a supported text-highlight API and a reliable text match; dynamic pages, repeated text and inaccessible frames may remain unmarked. macOS system speech still needs real-device validation.

After updating, reload the plugin or restart Obsidian. The outline cache is cleared on reload; saving reviewed headings as PDF bookmarks is the persistent option.

## 中文摘要

新增笔记、PDF、HTML、网页朗读工具栏和网页段落高亮；改进笔记及双栏 PDF 标记。PDF 大纲支持编号、编辑、章节朗读、内存缓存、全选/全不选、拖动窗口和居中。书签默认另存副本，覆盖需确认并备份。新增已安装系统音色支持，修复按钮提示重叠。更新后请重载插件或重启 Obsidian。
