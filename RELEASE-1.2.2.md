# Cozy Read Aloud 1.2.2

Includes the playback stability and PDF selected-text improvements from 1.2.1:

- Pause during audio loading is preserved, and Resume continues the same audio.
- External pauses and return-to-foreground state are synchronized without automatic segment replay.
- PDF selected-text reading retains page geometry, clips highlights to selected characters, and supports single-span and multi-page selections.
- Unreliable PDF selection layout prompts reselection instead of silently bypassing layout-based formula processing.

This follow-up also restores the playing status label after audio buffering ends. All 454 automated tests pass, including a regression assertion for that label. Real-device sleep/background behavior still needs device testing. No private documents or credentials are included.
