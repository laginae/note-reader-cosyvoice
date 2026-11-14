# Cozy Read Aloud 1.7.5

## Formula Speech and Shared Core

- Add **Academic reading > Simple function speech**. Keep `f of x` by default, or choose `f x` for recognized simple functions in concise style. Prose and explicit formula style are unchanged.
- Add an optional range-only interval wording. Endpoint inclusion remains the default; coordinates and unsupported groups are not reinterpreted as ranges.
- Improve negative exponents, escaped numeric percentages, short accented functions, primes and scripted arguments. Preserve `bar`, `underbar`, `hat` and index labels without inventing means, bounds, derivatives or optima.
- Keep complex-formula omissions and explicit skip settings. Unsupported structural commands do not leak fragments such as `Formula. of x`.
- Pin Note Reader Core 0.3.0 at `1085cfa58c835236b3e90043d979a8c193bdf4ba`. Thin desktop/mobile adapters now share the same pure formula implementation and public regression corpus.

## Playback Controls and Starting

- Optional floating controls add 0.25x speed steps without resynthesis. A short coalesced notice reports the actual speed.
- Optionally use secondary mouse clicks on those buttons for ten-percentage-point volume changes. Document context menus and touch long-press behavior are preserved; system speech without live control remains disabled.
- Cancel old playback before waiting on stopped-session disk/PDF cleanup, reject outdated start requests and reuse text preparation when constructing source mappings.
- Include prior preparation in waiting-time diagnostics and record initial cleanup waits separately. Provider/network latency still matters; uninterrupted playback is not guaranteed.

## Verification and Boundaries

- Automated checks cover shared pronunciation, source/highlight mapping, settings, stale starts, playback controls and cleanup. No online synthesis was required.
- The optional Windows OCR helper code is unchanged; the release workflow rebuilds it and checks both models against an invented public sample before publishing its checksum and provenance. OCR remains separately installed and opt-in.
- No private prose, PDFs, credentials, installed settings, diagnostic extracts or local backups are release assets.
- Existing settings are preserved. Restart Obsidian or reload the plugin, then begin a new reading session to replace old prepared audio.

## 中文摘要

新增“简单函数读法”和简洁区间选项，完善负指数、百分号、修饰函数及短下标参数；复杂公式保护与完整模式结构说明保留。悬浮控制可选 ±0.25x 倍速和鼠标右键 ±10% 音量，并共用短提示。改善新旧会话切换和等待统计。桌面与移动版统一使用核心库 0.3.0 的纯公式实现；原有设置及密钥不变，不包含私人正文或资料。更新后需重新开始朗读。
