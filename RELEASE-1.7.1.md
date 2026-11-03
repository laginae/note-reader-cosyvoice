# Cozy Read Aloud 1.7.1

- Keep the collapsed mini-outline entry available when switching notes/tabs and returning. It follows the active document without reopening the panel, changing focus or starting speech. Explicit hiding and Floating TOC coexistence are preserved.
- Refresh only the active Markdown/local HTML outline. A collapsed PDF entry reuses an existing valid outline cache; otherwise it stays an icon until explicitly opened. No background-note scan or extra PDF analysis is added.
- Add optional **Show 5-second seek buttons** under **Floating playback controls > More floating control options**, off by default. Back/Forward appears beside Pause on desktop hover/keyboard focus and remains visible on touch. Seeking reuses the current player, preserves pause state, and is disabled when unavailable. The pair yields when space is insufficient; its reserved layout prevents hover from moving Pause.
- Fix paused cross-segment seeking waiting indefinitely for an uncached target. Only the explicitly requested target can prepare while paused; speculative work stays paused and existing concurrency, cooldown and cancellation limits remain in force. Online target preparation can incur the provider's usual charges.
- Re-record the mini-outline walkthrough with transparent background and paced, captioned actions. The bilingual README shows the main toolbar/selection walkthrough first and the mini-outline demonstration beneath it.

Existing voice choices, credentials and other preferences are preserved. No private documents, settings or keys are distributed. Demo content is invented public text with local system speech only.

## 中文摘要

- 修复收起后的章节短线在切换笔记、返回原笔记时消失；不自动展开，不改变播放，继续遵守隐藏入口和 Floating TOC 共存规则。
- 新增默认关闭的前后 5 秒悬浮按钮，与暂停／继续和停止沿用同一播放器；空间不足时隐藏，不支持定位时禁用。
- 修复暂停时跨音频段定位可能一直等待：仅准备用户明确请求的目标，不恢复播放或后台预取；在线目标仍可能按接口规则计费。
- 仅更新当前文档目录，PDF 没有可用缓存时保留图标，不为短线额外解析 PDF 或扫描后台笔记。
- 透明背景迷你目录动图放在原播放工具栏演示下方，保留双击等操作的中英文字幕。无私人正文或密钥发布。
