# 0.9.4 - Custom speech APIs and clearer privacy settings

- Added custom speech API (BYOK) profiles for OpenAI-compatible speech endpoints, ElevenLabs and MiniMax. Configure the model, voice ID and SecretStorage reference or external key file separately for each profile.
- Added a short, fixed-text voice preview and MP3 playback/export using the existing online chunk limits and prefetch controls. BYOK requests are not automatically retried after failure.
- BYOK requires explicit, configuration-specific consent covering text transmission, possible charges, training and retention risks. This is not a no-training or ZDR certification. Endpoint changes clear credential references; material configuration changes require renewed consent.
- Default profile names follow the selected API type. Custom names are preserved, with the provider type shown in the profile list.
- Moved common privacy and local-storage information to the top of Privacy and help for every speech engine. BYOK retains its specific risk notice and a shortcut to the common information.
- Simplified privacy-page wording, removed unrelated playback-command text and clarified that restoring this page only disables diagnostic logging.
- Updated English and Chinese documentation.

## Verification

- Build, core, export and Obsidian loader checks passed, together with all 317 module regression tests.
- Mocked API tests cover request formats, MP3 validation, authorization changes, endpoint changes, rejected redirects and disabled automatic retries.
- Settings checks cover profile naming, permission dialogs, privacy navigation and desktop/narrow layouts.
- No live paid speech API calls were made during verification. Actual provider/model availability, voice access, pricing and account policies remain service-dependent.

Google Cloud, AWS Polly, arbitrary request scripts and chat-only OpenAI-compatible APIs are not included. Existing speech engines retain their own privacy controls.
