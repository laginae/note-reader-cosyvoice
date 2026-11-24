# Cozy Read Aloud 1.8.2

- Control playback in the PDF itself, even with the toolbar closed: Space pauses or resumes; Left and Right seek backward or forward five seconds. Seeking while paused does not resume playback. Stop reading or switch files to restore normal navigation. Search fields, forms and modified shortcuts keep their usual behavior.
- Starting from the PDF context menu no longer opens the right sidebar. Opening the reading toolbar gives it keyboard focus; its playback timelines also accept the five-second shortcuts.
- When MiMo, OpenRouter or Azure takes at least eight seconds to prepare the current audio, the player shows the elapsed time and what it is waiting for. After at least 15 seconds without request progress, you can confirm a retry of just that audio part. The provider may still charge for the original request. Rate limits are respected.
- Local wait diagnostics report timings and attempt counts, not document text or credentials. Existing preferences and the optional OCR helper are unchanged.

## 中文

- 在正在朗读的 PDF 正文中，空格暂停或继续，左、右方向键后退或前进 5 秒，不需要打开工具栏。暂停时跳转不会恢复播放；停止朗读或切换文件后，按键恢复原有用途。搜索、表单和组合键不受影响。
- 从 PDF 右键菜单开始朗读不再弹出右侧栏。打开播放工具栏后可直接用方向键，播放进度条也支持按 5 秒跳转。
- 使用 MiMo、OpenRouter 或 Azure 时，当前音频等待满 8 秒会显示等待阶段和用时。请求至少 15 秒没有进展时，可确认只重试当前音频，不必从头开始。重试不会绕过限流，服务方仍可能对原请求计费。
