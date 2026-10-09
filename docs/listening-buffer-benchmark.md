# Continuous listening: offline baseline

This deterministic simulation exercises the built plugin's playback scheduler with fake synthesis and audio events. It does not call a provider, use credentials, measure real network performance or guarantee uninterrupted playback. Test text is a generic public sample contained in the benchmark script.

## Reproduce

```sh
npm run build
node scripts/benchmark-listening.cjs docs/listening-buffer-benchmark.json
```

Assumptions: 1,408 characters, visible segment caps 200/400/800, synthesis delay of 1,200 ms plus 40 or 80 ms per character, audio at five characters per second, and a virtual clock. The actual scheduler decides requests and prefetch. Audio loading and document parsing are not simulated. Continuous mode retains the existing quick-start policy.

## Results

Total between-part waiting, milliseconds:

| Synthesis ms/character | Playback | Balanced | Continuous |
| --- | --- | --- | --- |
| 40 | 1x | 0 | 0 |
| 40 | 1.75x | 6,983 | 0 |
| 40 | 2x | 8,240 | 0 |
| 80 | 1x | 15,280 | 1,200 |
| 80 | 1.75x | 22,823 | 7,714 |
| 80 | 2x | 28,800 | 9,440 |

Full reads use six requests in Balanced and ten in Continuous, with the same 1,408 submitted characters. Provider cost can still differ because pricing and minimum billing units vary. Startup is unchanged: 2,960 ms or 4,720 ms for the two simulated synthesis speeds. Concurrency never exceeds two.

Jumping to the last segment after the first audio at 1.75x / 40 ms per character gives the same 2,960 ms target wait in both modes. Continuous submits more speculative text before this jump (220 vs 132 total characters). This simulation therefore supports better sequential continuity under its assumptions, not faster startup or every jump. Already-sent requests can still be billed when skipped.

## Boundaries

- Existing users keep Balanced or On demand. Continuous requires explicit selection and a new reading session.
- Continuous targets 12-35 seconds based on recent preparation times and playback speed, capped at three future audio parts / 900 speech characters. It does not synthesize the entire document ahead.
- Audio parts use a soft 220-character sentence-grouping target; provider hard limits still govern requests. Visible segment numbering and export boundaries remain unchanged.
- Pause, navigation, queued cancellation, cache reuse, failed-background suppression and rate-limit backoff are covered separately by regression tests.
- No iPhone, iPad, live speech provider or physical audio output measurement is included. The mobile repository is not changed.

Numeric output is stored in [listening-buffer-benchmark.json](listening-buffer-benchmark.json). For device-local measurements, use the plugin's **Copy playback waiting-time summary** command. It reports bounded timings and counters without note text, filenames or keys.
