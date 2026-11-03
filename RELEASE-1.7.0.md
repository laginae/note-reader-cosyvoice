# Cozy Read Aloud 1.7.0

## Playback and Outline Controls

- Fix pinned mini outlines disappearing when switching notes or tabs. Keep the outline open with the active document's headings, without scanning background documents or changing focus/playback. Manual close/unpin is respected, and stale asynchronous loads cannot replace the new outline.

- Rename the optional lower-right control to **Floating playback controls**. **More floating control options** starts collapsed; **Show stop reading button** remains on by default. Hiding the group or reopening settings does not change the saved choice. Turning the main switch off hides its options without discarding them.
- Pause/resume works independently of the main toolbar, with an optional Stop button above it. Desktop hover or keyboard focus reveals Stop without moving Pause; touch retains both controls. Stop uses the existing player, remains available during synthesis or a pending pause/resume, and ignores duplicate or stale-session clicks.
- The mini outline has its own pause/resume control, configurable to follow the header's idle hiding or remain visible during reading. Touch keeps controls visible.
- Add Auto / Chapter lines / Outline icon for the collapsed outline. Chapter lines show a bounded chapter overview, not page percentages. Hover opens the unpinned outline; leaving closes it after a short delay. Touch uses a larger tap target. The reading mark changes color only, without a dot, thicker line or layout shift.
- Remove heading-row menu buttons while retaining right-click/keyboard menus and section actions in the top options. Top/bottom actions adapt to available width. Explicit hiding and coexistence with Floating TOC still take priority; other plugins are not changed.

## Concise Formula Speech

- Use neutral pauses for ambiguous short pairs such as `(a,b)` instead of narrating every bracket or assuming an interval. Recognize short intervals only with suitable context, retaining open/closed endpoints and unary signs.
- Short sets and simple multi-argument calls gain concise speech. Supported whole arithmetic groups retain their meaning; unsupported grouping is not flattened. Verbose speech, explicit skip settings and smart-mode complex-formula safeguards remain intact.

Existing preferences are preserved. The floating controls remain opt-in and never start a new reading session. Prepared audio is not rewritten; start a new session to apply changed formula speech. Checks use public invented fixtures only, with no private text, settings or credentials distributed.

## 中文摘要

- 修复固定目录在切换笔记或标签页后消失：保持展开并更新当前文档目录；关闭或取消固定后不再自动展开，不扫描后台文档，旧加载结果不覆盖新目录。

- 主开关改为“悬浮播放控制”；“更多悬浮按钮选项”默认折叠，“显示停止朗读按钮”默认开启。折叠不关闭功能，关闭主开关也不清除原选择。
- 独立暂停／继续与停止控制、迷你目录播放按钮、章节短线收起入口和自适应章节操作一并进入正式版本。短线仅变色，不加粗、不增加小圆点；保留 Floating TOC 共存规则。
- 简洁公式朗读减少不必要的括号播报，但保留运算含义、区间端点区别及复杂公式智能跳过。完整模式不变。
- 不上传私人正文或密钥，不改动笔记。旧偏好保持不变；公式新读法在重新开始朗读后生效。
