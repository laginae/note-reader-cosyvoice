# Note and PDF Voice Reader 0.4.9

- Keep the original logical chunk limits, including the default online 200,400,800 sequence. Split only the first reading chunk internally into up to three audio parts: complete sentences reaching 20 non-whitespace characters, then 40 more, then the remaining text.
- Show one segment number and a combined timeline across those audio parts. Unknown durations are estimated until measured.
- Support seeking across internal parts with the segment slider and repeated five-second controls, preserving pause state, volume and playback speed. Previous/next segment buttons still navigate logical chunks.
- Apply the configured prefetch count to audio parts, with one future part by default. Revisited audio is reused within the reading session. Export chunking is unchanged.

The startup optimization applies to notes, selections and progressively parsed PDFs. Sentence boundaries are preserved, so short documents or a long first sentence may need fewer than three parts. It can add up to two requests; provider latency and synthesis time determine the actual startup improvement.

Validated with the regression suite and simulated audio playback, including pause-preserving seeks, repeated seek requests, early stopping, cache reuse, PDF page metadata and text conservation. No paid speech requests were made for validation. Reload the plugin after updating; settings and credentials are preserved.
