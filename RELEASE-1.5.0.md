# Cozy Read Aloud 1.5.0

- Add a mini outline for Markdown, PDF and local HTML Reader, available without starting playback: search, hierarchy levels, pin, left/right placement and optional mouse hover.
- Separate navigation from speech: click a title to navigate, Play to read from the section, or use its menu to read only that section and its descendants.
- Distinguish browsing and reading positions; manual directory browsing suspends tracking and Return to reading restores it. Changed files reject stale targets.
- Auto mode hides our edge entry when Floating TOC or another recognized floating-outline plugin is enabled. Toolbar and command access remain; no third-party plugin is changed.
- Reuse existing PDF caches; no whole-vault scan or startup PDF parsing. Directory states stay in memory and playback updates do not recreate unchanged rows.
- Keep the sidebar outline and PDF bookmark editor available.

Validated with automated public fixtures and isolated browser layouts at desktop, phone and tablet sizes. Mobile physical-device acceptance belongs to the separate mobile release and is still pending. No private documents, credentials or recorded reading text are included.

## 中文

新增可独立使用的迷你目录，支持搜索、层级折叠、固定、左右位置与可选悬停。标题只定位；播放图标从本节继续；菜单只读本节。浏览位置与朗读位置分别标记，手动浏览不会被强行拉回。

默认与 Floating TOC 共存，只隐藏我们自己的重复边缘入口，不修改其他插件。启动不扫描笔记库、不解析 PDF；目录状态仅保存在内存。旧侧边栏大纲和 PDF 书签编辑仍可使用。测试仅使用公开示例，不包含私人正文或密钥。
