# Mini Outline / 迷你目录

Available for Markdown, text PDFs and local HTML displayed in HTML Reader. External Web viewer pages are not included. It works without starting speech and does not edit notes or PDF bookmarks.

## Controls

- Open from the edge button, reading toolbar's outline icon, or the Toggle mini outline command. Click again, use Close or press Escape to close; outside clicks close an unpinned directory.
- Search includes matching headings and their parents. Choose one, two, three or all hierarchy levels. Pin keeps the directory open while navigating. Long titles wrap; the list scrolls independently.
- A title navigates only. Play reads from the section to the end; the row menu reads that section and its descendants only. These explicit reading actions use the configured engine and its existing consent requirements; online speech may incur charges.
- A side line marks the browsing section. An accented play marker marks the reading section when mapping is reliable. Directory scrolling pauses its automatic tracking; Return to reading resumes tracking and locates the current reading. On desktop, deliberate chapter navigation also pauses enabled document auto-follow.
- Preferences are in Playback settings: Auto / Always show entry / Hide edge entry, left/right, optional mouse hover (off by default), and initial expanded depth. Changing these preferences does not restart synthesis.

## Coexistence and Performance

Auto checks enabled IDs for Floating TOC and several known floating-outline plugins. It hides only Cozy's edge button; command/toolbar access remains. It does not detect geometric overlaps or promise compatibility with every theme or TOC plugin. Use Hide edge entry to retain another plugin's directory, or Always show entry to use both intentionally. Other plugin settings and files are never modified.

No whole-vault scan, startup PDF parsing, OCR loading or additional speech requests are introduced by the directory. Only opening it loads headings. Existing PDF caches and section-reading logic are reused. Closed directories do not track playback; unchanged playback ticks do not rebuild rows. The initial list renders up to 200 visible headings; Show more and following a later chapter extend it. Search, folding, pin and scroll state are memory-only, bounded to 40 document entries and cleared on plugin reload.

PDF headings and exact positions depend on bookmarks, text layout and the viewer; some targets resolve only to a page. Uncertain reading positions are not guessed. Changing a file or view invalidates old targets. A first PDF analysis may be slow for a large file; scanned documents still require the separate optional OCR workflow.

## 中文说明

迷你目录支持 Markdown、文本型 PDF 和 HTML Reader 中的本地 HTML，不包括外部 Web viewer 网页。不需要开始朗读即可使用，也不改写笔记或 PDF 书签。

标题只跳转；播放图标从本节读到结尾；行末菜单只读本节及子节。朗读仍遵循原有引擎授权，在线接口可能计费。搜索会保留匹配标题的父级，支持层级折叠和固定显示。浏览位置用侧边线标记，可靠识别的朗读章节用带播放标记的强调色表示。手动浏览目录后不会强行抢回滚动位置，可用“回到朗读位置”恢复。桌面端主动跳转章节也会暂停已开启的正文自动跟随。

“自动”仅根据已知插件是否启用来隐藏我们自己的边缘入口，不修改 Floating TOC 等插件，也不承诺检测所有主题的遮挡情况。可设为关闭边缘入口，保留另一插件；或始终显示，同时使用两者。目录关闭时不跟踪播放，不在启动时解析 PDF，也不扫描全库。初次展开 PDF 仍可能需要等待。搜索、折叠、固定和滚动状态只放在内存，不写入设置或发送到服务端。

Desktop and mobile use the same directory UI. Browser layout checks are not iPhone/iPad/Android physical-device acceptance; mobile background playback and OCR remain experimental and off by default.
