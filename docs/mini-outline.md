# Mini Outline / 迷你目录

Available for Markdown, text PDFs and local HTML displayed in HTML Reader. External Web viewer pages are not included. It works without starting speech and does not edit notes or PDF bookmarks.

## Controls

- Open from the edge button, reading toolbar's outline icon, or the Toggle mini outline command. Click again, use Close or press Escape to close; outside clicks close an unpinned directory.
- **Open mini outline on startup** is off by default. Enable it once to automatically open and pin the current document outline after the workspace restores, without opening the reading toolbar or starting speech. The edge button is hidden while this option is enabled. Manual dismissal prevents another automatic opening during that plugin session; toolbar/command access remains. If no supported document is active at startup, opening waits until one becomes active. Disabling the option restores the previous edge-button preference without closing the current outline or changing other plugins.
- The desktop mouse icon bar contains Pin, Search, Return to reading (a return arrow), Go to document top/bottom and Options; Close is inside Options. When idle, icons fade out over 150 ms, leaving a subdued pin if the directory is pinned. Hover anywhere inside the directory to reveal all controls. Keyboard focus, an open search field/options group or a section menu keeps them visible. Mouse-click focus alone does not keep the bar visible after leaving. The bar keeps its height so headings do not move. Reduced-motion preferences disable the fade; older engines without the required selectors retain visible controls.
- Touch/mobile and narrow layouts keep their top icons visible, including Close. Document top/bottom buttons are inside Options to avoid crowding; touch devices do not require hover. Search opens on demand and includes matching headings and their parents; hiding it clears the filter. Options also reveals expanded levels (one, two, three or all) and Refresh. Pin keeps the directory open while navigating; unpinning immediately closes it.
- On mouse-first computers that also support touch, touch capability alone does not keep the header visible. Actual touch or pen interaction keeps controls available; returning to mouse input restores idle hiding. This changes only the in-memory display state, without reloading headings, saving preferences or starting speech.
- **Go to document top/bottom** navigates to the actual beginning/end of Markdown, PDF or local HTML, not the first/last heading or the directory's scroll position. It neither starts speech nor changes the selected text. A pinned directory stays open; an unpinned one closes after navigation. On desktop, enabled document auto-follow is paused to prevent pulling the viewport back to the reading position; playback itself continues unchanged. Changed or closed targets cancel pending navigation.
- Titles use interface fonts. **Heading display lines** offers one, two, three or four lines before truncation; two is the default. The full title remains available in the accessible label/hover hint and through **Show full heading** in the row menu, including on touch devices. Changing the line limit preserves manually expanded titles. The list scrolls independently. Common Markdown presentation markers are removed from the directory label only (for example, `$x$` displays as `x`); source text, offsets, reading ranges and PDF/HTML titles are unchanged. This is not a full formula renderer.
- A title navigates only. A single row menu contains **Read from this section**, **Read this section only** (including descendants) and the full-title control. On desktop its icon appears on hover, keyboard focus or the reading row; on touch it remains visible. The menu keeps a fixed-width slot so titles do not reflow on hover. These explicit reading actions use the configured engine and its existing consent requirements; online speech may incur charges.
- **Double-click heading to read** is off by default in Mini outline settings. With it enabled, a desktop mouse single-click navigates immediately and keeps the directory open; double-click starts reading from that heading through the remaining document, not just that section. Click outside to dismiss an unpinned outline. Touch, pen and keyboard navigation do not opt into this gesture; use the section menu instead. It uses the same playback and consent path as **Read from this section**. Closing, switching documents or choosing another heading cancels a pending double-click start.
- Accent text marks the browsing section; a small play marker additionally identifies the reading section when mapping is reliable. Directory scrolling pauses its automatic tracking; Return to reading resumes tracking and locates the current reading. On desktop, deliberate chapter navigation also pauses enabled document auto-follow.
- Playback settings place **Reading shortcuts** before **Mini outline**. The main outline controls are **Open mini outline on startup**, **Mini outline button**, **Outline width** and **Heading display lines**. The button setting is hidden while automatic opening is enabled; its saved choice is retained. **More outline options** starts collapsed and contains left/right placement, initial expanded depth, transparent background, double-click reading and hover opening. Collapsing it does not reset any saved choice. **Mini outline button** offers Auto / Always show / Hide button and controls only the document-edge button. Changing these preferences does not restart synthesis.
- **Outline width** provides a 180-600 pixel slider with a numeric value and a reset icon. Changes update the existing directory immediately without reloading headings or starting playback. Reset retains the responsive defaults: 300 pixels on desktop and 340 on touch screens or narrow windows. The actual width is limited by the document pane; a saved wider value is retained when the pane becomes narrow. Below 240 pixels, desktop top/bottom actions move into Options. Touch controls wrap instead of shrinking their hit targets.
- Desktop mouse layouts hide the scrollbar thumb while idle and reveal it on directory hover or keyboard focus. Color-only hiding preserves scrolling and layout, so headings do not rewrap when the pointer enters. Touch/pen interaction keeps native scrolling feedback available. High-contrast mode and older environments retain their normal scrollbars.
- Transparent background is opt-in for desktop mouse layouts, best used with wide document margins. Text and icons remain opaque; hovering or focusing the directory restores a nearly solid backing. Phones, tablets and narrow windows retain a solid background and larger touch controls. Escape, the outline toggle and the appropriate Close action remain available. When the Editing Toolbar reading icon is off, its action setting is hidden without discarding the saved choice.

## Coexistence and Performance

Auto checks enabled IDs for Floating TOC and several known floating-outline plugins. It hides only Cozy's edge button; command/toolbar access remains. Use Hide button to retain another plugin's directory, or Always show to use both intentionally. Other plugin settings and files are never modified. Placement accounts for visible document, reading, PDF and Editing Toolbar bars in the current pane, including toolbar insertion, resizing and visibility changes. This is targeted avoidance, not a guarantee for every third-party overlay or theme.

No whole-vault scan, OCR loading or additional speech requests are introduced by the directory. With automatic opening off (the default), startup does not read document text or parse PDFs. When opted in, opening is deferred until workspace restoration and loads only the active supported document, never background tabs or a saved reading source. A currently active PDF may require its first analysis; existing caches are reused. Automatic opening does not navigate or steal keyboard focus, and a failed load waits for manual retry. Closed directories do not track playback; unchanged playback ticks do not rebuild rows. The initial list renders up to 200 visible headings; Show more and following a later chapter extend it. Search, folding, pin and scroll state are memory-only, bounded to 40 document entries and cleared on plugin reload. Only the startup preference is saved, not a document path or its headings.

PDF headings and exact positions depend on bookmarks, text layout and the viewer; some targets resolve only to a page. Uncertain reading positions are not guessed. Changing a file or view invalidates old targets. A first PDF analysis may be slow for a large file; scanned documents still require the separate optional OCR workflow.

## 中文说明

迷你目录支持 Markdown、文本型 PDF 和 HTML Reader 中的本地 HTML，不包括外部 Web viewer 网页。不需要开始朗读即可使用，也不改写笔记或 PDF 书签。

“**启动时打开迷你目录**”默认关闭。开启一次后，每次工作区恢复完成都会为当前文档自动打开并固定目录，不需要先打开朗读工具栏，也不会启动朗读；同时隐藏文档侧边的目录按钮。手动收起后，本次插件运行期间不会再次自动弹出，仍可用工具栏或命令打开。启动时没有支持的活动文档，则等到打开一个支持的文档后执行一次。关闭该设置会恢复原先的侧边按钮选项，不强制关闭已打开的目录，也不改动 Floating TOC 等其他插件。

桌面鼠标布局的顶部包含固定、搜索、回到朗读位置、到文档顶部、到文档底部和目录选项；关闭按钮收进“目录选项”。鼠标移出且未在操作时，顶栏图标在 150 毫秒内淡出，已固定时保留低调的固定图标。鼠标移入整个目录即可显示全部图标；键盘焦点、已展开的搜索框或目录选项、章节菜单都会让图标保持可见。仅由鼠标点击留下的焦点不会阻止隐藏。顶栏保留原高度，标题不会上下跳动；系统要求减少动态效果时取消淡入淡出，旧环境不支持必要选择器时保留常显。

手机、平板、触屏和窄窗口的顶部图标保持常显，包括关闭按钮；“到文档顶部／底部”放在“目录选项”中，避免挤占小屏空间。取消固定会立即收起目录，也可按 Escape、再次点击目录入口，或在未固定时点击目录外部收起。返回按钮使用简单回转箭头。搜索框按需展开，收起时清除筛选；“目录选项”还提供层级选择和刷新。

同时支持鼠标和触屏的电脑，不会仅因系统报告触屏能力而一直显示顶栏。鼠标操作时仍会自动隐藏；实际使用手指或触控笔后保持显示，回到鼠标操作则恢复隐藏规则。此切换只影响内存中的显示状态，不重新读取目录、不保存设置，也不启动朗读。

“**到文档顶部／底部**”定位到 Markdown、PDF 或本地 HTML 正文的真正开头／结尾，不是首末标题或目录列表的首尾；不开始朗读，也不改变原有选区。已固定的目录保持打开，未固定时跳转后收起。桌面端会暂停已开启的正文自动跟随，以免马上被拉回朗读位置，但不暂停语音播放。文档变化或关闭目录会取消尚未完成的跳转。

标题使用界面字体，“标题显示行数”可选一、二、三或四行，默认两行，超出后省略。悬停提示和无障碍标签保留完整标题；触屏也可通过行末菜单“展开完整标题”查看。更改行数不会收起已手动展开的标题。目录标签清理常见 Markdown 格式标记，例如 `$x$` 显示为 `x`；不改原文、定位偏移、朗读范围或 PDF/HTML 标题，也不加载完整公式渲染器。

点击标题只跳转；每行仅保留一个菜单，包含“从本节朗读”“只朗读本节”和完整标题选项。桌面端在悬停、键盘聚焦或当前朗读行显示菜单图标，触屏始终可见；菜单固定占位，不会因悬停导致标题重新换行。朗读仍遵循原有引擎授权，在线接口可能计费。搜索会保留匹配标题的父级，支持层级折叠和固定显示。浏览位置用文字强调色表示，可靠识别的朗读章节另加小播放标记。手动浏览目录后不会强行抢回滚动位置，可用“回到朗读位置”恢复。桌面端主动跳转章节也会暂停已开启的正文自动跟随。

“迷你目录”设置中可开启“**双击标题开始朗读**”，默认关闭。开启后，鼠标单击标题立即定位并保留目录，双击从该标题继续朗读到文档结尾，而非只读本节；未固定时点击目录外即可收起。触屏、触控笔及键盘不启用双击朗读，请使用章节菜单。此操作沿用“从本节朗读”的播放和授权流程；关闭目录、切换文档或选择其他标题会取消尚未开始的双击播放。

播放设置中，“朗读快捷入口”位于“迷你目录”上方。迷你目录主区保留“启动时打开迷你目录、迷你目录按钮、目录宽度、标题显示行数”；开启自动打开后隐藏按钮设置，但保留原选择。默认折叠的“更多目录选项”包含目录位置、默认展开层级、透明背景、双击标题开始朗读和鼠标悬停展开目录，收起分组不清除原选择。“迷你目录按钮”提供自动、始终显示、隐藏按钮三个选项；只控制文档侧边的按钮。自动模式下，启用 Floating TOC 等浮动目录插件时隐藏此按钮；仍可通过朗读工具栏或命令打开迷你目录，不影响其他插件。侧边按钮会避让当前窗格的文档标题栏、朗读栏、PDF 工具栏和 Editing Toolbar，并响应其出现、尺寸及显隐变化；不承诺识别所有第三方覆盖层。

透明背景默认关闭，可在桌面端留白较宽时开启；操作目录时增强底色，文字和图标不透明。手机、平板和窄窗口仍使用实色背景及较大的点击区域。“鼠标悬停展开目录”放在“更多目录选项”中，默认关闭。关闭 Editing Toolbar 朗读图标会隐藏其默认动作设置，但保留原选择。

“**目录宽度**”提供 180–600 像素滑块、数值显示及恢复默认图标。调整立即应用到现有目录，不重新读取标题或启动朗读。恢复默认后，桌面使用 300 像素，触屏或窄窗口使用 340 像素；实际宽度始终受当前文档窗格限制。分屏或缩窄窗口不会覆盖已保存的宽度。目录窄于 240 像素时，桌面顶部／底部按钮移入目录选项；触屏按钮换行排列，不缩小点击区域。

桌面鼠标布局中，空闲时隐藏滚动条滑块，鼠标移入目录或通过键盘聚焦后显示。只改变颜色，不改变滚动区域或占用宽度，标题不会因显隐重新换行，滚轮仍可正常使用。触屏和触控笔保留原生滚动反馈；高对比度模式及较旧环境不强制隐藏滚动条。

目录关闭时不跟踪播放，也不扫描全库或加载 OCR。自动打开默认关闭，此时启动不读取文档或解析 PDF；开启后仅在工作区恢复完成时读取当前活动文档的目录，不解析后台标签页或此前朗读的其他文档。当前为 PDF 时，首次目录分析仍可能需要等待，后续复用已有缓存。自动打开不跳转正文、不抢键盘焦点，失败后等待手动重试。工具栏布局监听不读取正文，不在每次播放进度更新时重新定位。搜索、折叠、固定和滚动状态只放在内存；自动打开仅保存开关，不保存文档路径或标题，也不向语音服务发送内容。

Desktop and mobile use the same directory UI. Browser layout checks are not iPhone/iPad/Android physical-device acceptance; mobile background playback and OCR remain experimental and off by default.
