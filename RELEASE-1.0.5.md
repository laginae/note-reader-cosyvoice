# Cozy Read Aloud 1.0.5

- Add optional Continuous listening under Playback and interface > Online playback buffering. Existing users keep their current buffering choice.
- Group continuous-playback audio by sentences around a soft 220-character target, preserving visible segment numbers and provider hard limits.
- Adapt the buffer horizon to playback speed and recent synthesis times, targeting 12-35 seconds with at most three future parts and 900 speech characters. HTTP synthesis remains limited to two concurrent operations; Edge remains serial.
- Suppress repeated failed speculative preparation; reduce concurrency and delay queued work after HTTP 429 responses.
- Clarify that 200,400,800 are sequential character caps, not three presets. On-demand mode and audio export remain unchanged.
- Simplify buffering descriptions and place technical limits in a collapsed explanation. Balanced normally synthesizes whole segments, not individual sentences; quick start and provider limits can create smaller audio parts.
- Add offline scheduler regression tests and a reproducible synthetic benchmark. These are not live provider latency measurements or a guarantee of uninterrupted playback.

Continuous listening can increase request counts and synthesize text that is skipped later. It is opt-in and takes effect on the next reading session. The mobile edition is unchanged.
