# 0.9.9 - Playback scheduling and pause reliability

- Reuse in-flight and ready audio within the reading session. Prioritize the latest queued seek target.
- Prepare the next audio part earlier, with at most two online synthesis operations. Existing prefetch settings still apply; local and Edge helper processes remain serial.
- Fix a reproduced pause/resume boundary that could restart an already-ended audio part. Ignore stale playback callbacks after pause, stop, or navigation.
- Add an on-demand command to copy numeric playback waiting-time statistics. No automatic upload, note text, credentials, or file paths are included.
- Cached preparation references are cleared with the session; existing temporary-file cleanup remains in effect.

Validation: 349 desktop module tests plus core, export, and loader checks passed. Small real-account MiMo and OpenRouter MAI-Voice-2.1 Flash probes each completed eight requests, including concurrency of two, without observed rate-limit errors. This is not a guarantee for every provider or network. Cold-start synthesis and uncached seeks can still take time. End-to-end validation of the originally reported repeat-loop symptom remains ongoing.
