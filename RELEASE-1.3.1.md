# 1.3.1

- Stop the 750 ms HTML/web observer poll when no relevant view is open. Workspace events activate observation immediately, and the compatibility poll remains while HTML/web views exist. Closing the final view and unloading the plugin clear the timer.
- Align the shared core and publish a common, invented PDF regression corpus for desktop/mobile/web consistency.
- Extend seeded playback transition tests covering pause/resume, rapid navigation, stale events and prepared audio ownership.

The observer benchmark is a synthetic lifecycle check: ten simulated idle minutes without relevant views have zero periodic callbacks instead of 800. It is not a measurement of whole-app startup, battery savings or real-vault CPU use. Existing playback and PDF regression checks remain required.

No personal notes, private PDFs or credentials are included. No new paid speech requests were made for this release.
