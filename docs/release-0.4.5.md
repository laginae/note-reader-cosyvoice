# Note and PDF Voice Reader 0.4.5

- Add Xiaomi MiMo TTS as a separate online engine using `mimo-v2.5-tts`.
- Provide eight official Chinese and English voices; default to Bai Hua (Chinese male).
- Support Obsidian SecretStorage and an outside-vault key-file fallback.
- Reuse progressive note/PDF reading, bounded online prefetch, and scoped WAV audio export.
- Require separate online-processing consent. Xiaomi states that supplied text is not used for training without prior consent; zero data retention is not confirmed. MiMo does not use the OpenRouter ZDR route.
- Explain that MiMo is temporarily free as listed on 2026-09-27, not permanently free.
- Validate JSON/base64 audio responses and keep upstream response bodies out of error messages.

## Getting started

Select **Xiaomi MiMo TTS**, configure a regular MiMo API key, and enable **Allow MiMo online processing**. Merely setting a key does not authorize sending text. Existing engine selections, credentials, and privacy preferences are preserved.

## 中文

- 新增独立的小米 MiMo TTS 在线引擎，提供 8 种官方音色，默认“白桦（中文男声）”。
- 支持钥匙串、笔记/PDF 渐进朗读、有限预合成及分范围 WAV 音频导出。
- 配置密钥后仍须开启“允许 MiMo 在线处理”。未经事先同意不将输入文本用于训练，不等于零数据保留。
- 官方当前为限时免费，价格和额度可能变化；原有引擎和隐私设置保持不变。

## Verification

Build, core tests, plugin export tests, Obsidian loader tests, and 22 module tests passed. The MiMo integration includes mocked API and audio decoding tests; live playback was reported successful by the user, not independently benchmarked.
