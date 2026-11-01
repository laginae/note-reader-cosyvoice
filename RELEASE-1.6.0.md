# Cozy Read Aloud 1.6.0

## Mini Outline And Voices

- Mini-outline width now supports 180-600 pixels. Desktop scrollbar thumbs appear on hover or keyboard focus; touch scrolling feedback stays available. Narrow outlines keep secondary navigation in Options.
- New presets prefer female voices where the provider identifies them: MiMo Bing Tang, Edge/Azure Sonia, Fish UK English female, Kokoro Emma, MAI Emily/Harper, ElevenLabs Sarah and Gemini Sulafat. Existing saved voice choices and permissions remain unchanged. System/default and custom voices still depend on the device or service; OpenAI `coral` is not given an unsupported gender label. Male options remain available.

## OpenAI Compatibility

- A settings reminder identifies deprecated models only at OpenAI's official Speech endpoint; other services are not changed.
- Added an optional **OpenAI Realtime (experimental)** BYOK type for `gpt-realtime-2.1-mini`, using separate short-lived sessions, no microphone or tools, and explicit new authorization. It does not silently migrate existing profiles.
- Completed audio is checked against its generated transcript before playback and WAV export. Mismatches or incomplete responses stop reading without automatic retries. The check is conservative for numbers and mixed text; transcript agreement is not independent proof of audible correctness.
- New transport is covered by offline automated tests, not a live OpenAI account test. Real service access, billing and voice quality remain unverified. Prefer a normal TTS engine for accuracy-critical reading. See [setup and limits](docs/openai-realtime.md).

The plugin's network destinations, optional external resources and privacy boundaries are documented in the README. No personal notes, PDFs or credentials are part of this release. The three plugin assets are checked and attested by the release workflow.
