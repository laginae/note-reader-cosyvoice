# Note and PDF Voice Reader 0.4.10

Includes the two-stage startup introduced in 0.4.9: the first logical segment plays in up to three internal audio parts (sentences reaching 20 characters, then 40 more, then the remainder), while keeping one segment number and combined progress timeline. Default prefetch remains one future audio part. Pause-preserving seeks and playback speed work across these parts.

This follow-up also recognizes the new internal-part filenames during startup cleanup and manual temporary-data cleanup, so files left after an interrupted session can be removed. Legacy cache filenames remain supported, and unrelated files remain excluded.

Regression tests and simulated playback passed, including cache filename ownership, logical progress, seeking, prefetch limits and text conservation. No paid synthesis requests were made. Reload the plugin after updating. Settings and credentials are preserved.
