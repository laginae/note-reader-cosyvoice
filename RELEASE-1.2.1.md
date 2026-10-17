# Cozy Read Aloud 1.2.1

## Playback stability

- Preserve Pause when an audio source finishes loading; Resume uses the same audio without restarting the segment.
- Synchronize externally paused audio and reconcile its state when returning to the foreground. No automatic segment replay is introduced.
- Show audio waiting state and clear it when playback resumes. Detach media handlers when playback ends or is cancelled.

## PDF selected-text reading

- Retain selected-page geometry and page numbers so selected text can use PDF highlighting and follow controls.
- Clip partial-span highlights to the selection, including after text-layer reconstruction, and reject changed text layers.
- Preserve geometry for a selection containing only one text item.
- If selected-text layout cannot be captured reliably, ask the user to reselect after rendering instead of silently reading an unfiltered text fallback. This does not widen the selection or extract unrelated pages.

## Verification

Automated regression coverage includes delayed source loading, pause/resume, external pause events, stale pause events, waiting recovery, partial-span highlighting and multi-page selection mapping. These checks do not replace real-device background/sleep testing. No private documents or speech-service credentials are included.
