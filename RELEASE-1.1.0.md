# Cozy Read Aloud 1.1.0

- Fix browser timer binding in the local preview of the buffering suggestion, which could interrupt playback with an Illegal invocation error. Add a regression test for browser timer receiver requirements.

- Add a quiet, dismissible buffering suggestion near playback status in the sidebar and document toolbar.
- In Balanced mode only, suggest Continuous listening after a natural between-part wait of five seconds, or two waits of three seconds within the same reading session.
- Exclude startup, explicit navigation, pauses, PDF text extraction time and speech request failures or rate limiting. No mode changes automatically.
- Show at most once per Obsidian app instance. Offer Buffer settings, Don't show again, and Dismiss. The saved preference can be re-enabled in Playback and interface > Advanced options.
- Name the Online playback buffering setting directly in the suggestion and clarify that additional charges may apply when using paid services.
- Keep existing speech settings, audio export and credentials unchanged. No extra synthesis, telemetry or note text is collected by the suggestion.

Continuous listening remains opt-in and may synthesize skipped text that is still billable. The mobile edition is unchanged.
