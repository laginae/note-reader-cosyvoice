# Cozy Read Aloud 1.7.4

## Docked Outline and Reader

- Open **Outline and reader** from the ribbon or command palette. The native Obsidian pane initially opens on the left, can be moved to another dock, and retains its layout.
- Browse Markdown, PDF and local HTML Reader headings in a full-height outline with search, folding, heading-depth presets and one-to-four-line titles. Click to navigate without changing playback; use the context menu to read a section or continue from it. Double-click reading is optional and off by default.
- Keep reading controls collapsed until needed. Pause/resume and stop remain accessible during a reading session; expanded controls include section reading, five-second seeking and playback speed.
- Follow the current document when switching tabs without interrupting audio. Browsing and reading positions have separate indicators. Fold, search and scroll state remain in memory for up to 20 documents; document content is not added to saved view preferences.
- Register the pane lazily, skip document parsing while it is hidden, and reuse the existing outline cache and playback paths. Mini outline and Floating TOC preferences are unchanged.

## Interface and PDF Fixes

- Use compact, left-aligned headings and indentation instead of centered rows with a wide level-label gutter. H1/H2 labels are hidden by default and can be enabled at the right edge.
- Replace separate expand/collapse icons with one **Heading depth** menu. Move refresh into **Outline options**, keep reading controls left-aligned, and fit narrow panes without horizontal overflow.
- Use Obsidian's bundled PDF character maps in the original reading sidebar too, and clean up PDF loading tasks when the document wrapper has no destroy method.

## Verification and Limits

- Passed 742 automated module tests plus the core, export and Obsidian-loader suites. Coverage includes document switching, stale loading and actions, hidden-pane behavior, keyboard navigation, persisted UI preferences, long outlines and shared PDF/HTML reading paths.
- Checked the interface with public example text in light/dark themes and narrow layouts. PDF outline recognition remains heuristic, and the docked pane uses the same recognition limits as the existing outline.
- This is a desktop-edition update. No new speech provider or OCR dependency is introduced, and no online speech synthesis was needed for these changes.
- No private document text, PDFs, credentials, installed settings, diagnostic extracts or local backups are included in the release.

After updating, reload the plugin or restart Obsidian, then run **Open outline and reader**. Existing settings and credentials are unchanged.

## 中文摘要

新增“目录与朗读”停靠侧栏：首次在左侧打开，可拖动到其他停靠位置；支持 Markdown、PDF 和本地 HTML Reader 的目录浏览、搜索、折叠、章节起读及暂停／继续。单击只定位，双击起读可选且默认关闭；切换文档不会打断原有播放。界面改为紧凑的左对齐标题，默认隐藏 H1/H2 标签，展开层级收进一个菜单，刷新放入目录选项。隐藏时不解析文档，复用已有目录缓存和播放逻辑，不改变迷你目录或 Floating TOC 设置。同时修复原有侧栏的 PDF 字体映射资源和加载清理。更新后重启 Obsidian，执行“打开目录与朗读”即可使用；本次仅更新桌面版，不包含私人正文、PDF 或密钥。
