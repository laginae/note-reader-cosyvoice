# 0.9.6 - ElevenLabs options and local pronunciations

- Add four ElevenLabs OpenRouter model presets and six voice presets without changing existing defaults.
- Show experimental continuity settings only for the four documented models. Off by default; adjacent context is bounded to the current reading range and 160 characters per side. Other models receive no ElevenLabs context options.
- Keep mandatory OpenRouter ZDR and data-collection denial. Never fall back to weaker privacy settings or use provider request history.
- Add optional local term pronunciation rules under Academic settings for all engines. Preserve source text and source positions, bound expanded requests, and apply rules to audio export.
- Synthesize ElevenLabs audio at normal speed and use player speed controls; correct desktop estimates accordingly.
- Include the previously prepared interval-formula fixes: common lower/upper bounds use "to" in concise mode, and simple adjacent subscript variables retain multiplication.
- Update English and Chinese documentation.

## Validation boundary

Automated request, settings, playback, source-preservation and export tests use public fixtures and mock audio. No paid synthesis or new iPhone/iPad listening test was performed. Continuity is experimental; improved prosody is not guaranteed. No cloud dictionary is uploaded. The plugin requires ZDR routing, but cannot independently audit provider practices.

## 使用提示

在 OpenRouter 中选择受支持的 ElevenLabs 模型后，展开高级选项，可开启默认关闭的分段衔接实验功能。本地术语读法位于“学术阅读”，例如每行填写 `BESS = B E S S`。术语规则适用于各语音引擎和音频导出，不修改笔记原文；在线引擎仍会收到替换后的文本。
