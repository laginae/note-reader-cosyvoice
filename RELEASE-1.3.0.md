# Cozy Read Aloud 1.3.0

- New installations start with system speech and detect available voices after the workspace is ready. Upgrades preserve the existing engine and online permissions.
- Optional device-only reusable audio cache, disabled by default: 24-hour expiration, 64 MiB / 128 parts, separate clear action, no plaintext document or credential records. Audio itself remains sensitive and is not encrypted by the plugin. Normal temporary-file cleanup still applies.
- PDF bookmark-writing code initializes only when needed; startup registration no longer waits for stale temporary files to be removed. First playback still waits for cleanup to prevent file races.
- Expanded shared desktop/mobile synthetic PDF acceptance checks and cache lifecycle tests. Existing playback, source mapping and follow behavior remain covered by regression tests.
- Updated English and Chinese setup/privacy documentation.

See `docs/performance-acceptance-20261029.json` for bounded measurements and remaining acceptance. First uncached online synthesis still takes provider/network time; no zero-wait or universal PDF-accuracy claim.
