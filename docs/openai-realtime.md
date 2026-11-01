# OpenAI Realtime Reading (Experimental)

This is an optional, default-off BYOK API type, not an automatic replacement for other engines. No microphone permission is requested. Real OpenAI account synthesis has not been tested for this release; mobile CORS, devices and background operation also remain unverified. Prefer a regular TTS engine when exact reading or predictable billing is essential.

## Setup

1. On desktop, add a separate profile under **Custom speech API (BYOK)**; on mobile, note the old configuration before switching its single active BYOK configuration.
2. Select **OpenAI Realtime (experimental)**. The fixed official endpoint is `https://api.openai.com/v1/realtime/client_secrets`; model `gpt-realtime-2.1-mini` is pinned to the adapted protocol. Choose a listed voice; the example uses `coral`, without a fixed gender claim.
3. Re-select an OpenAI API secret. Changing the API type clears the old secret reference and permission, but does not delete the secret. Desktop also supports a key file outside the vault.
4. Read the processing and billing disclosure and authorize this configuration. Test only a short public sentence before private material, for example: "This is a public reading sample."
5. Use the existing play, pause, speed, stop and export controls. Audio is buffered per segment, checked, then returned as mono PCM WAV at 24 kHz. This is not immediate playback of arriving audio deltas. Desktop starts with a 200-character limit (adjustable 50-800); mobile playback uses 200-character parts. Existing playback/cache limits and export confirmations still apply.

## Correctness And Cost

- Each segment gets one short-lived token and one isolated WebSocket session. No previous segment, document name, microphone audio or tools are sent. Only the selected segment is supplied as text. Credentials and tokens are never written to settings, logs or audio exports.
- The session is configured for reading, not answering. A generative voice model is not a deterministic TTS engine. The plugin requires completed audio, a completed transcript and a successful final response before playback. It compares the supplied text with the generated transcript while ignoring case and ordinary punctuation, retaining numbers and math operators. This detects transcript differences but does not independently verify the audible words.
- Missing, repeated or inconsistent protocol events, mismatched transcripts, unsupported audio and excessive output stop the segment without playing it or automatically advancing. Numbers written as digits versus words, abbreviations, and mixed-language text can fail this conservative comparison. Use a regular TTS engine rather than disabling the protection.
- Stop, revoked permission or a changed speech configuration closes in-flight sessions. Pausing may allow already-started synthesis to finish for later playback. Failed requests are not automatically retried; audio already generated may still be billable. Audio-token pricing differs from per-character TTS pricing. Check current [OpenAI pricing](https://developers.openai.com/api/docs/pricing) and your account limits; no savings or latency improvement is promised.
- Mobile uses a bounded HTTPS request that refuses redirects, followed by a short-lived WebSocket token. If CORS or device policies block it, the request fails visibly; there is no developer relay or weaker-privacy fallback. iPhone, iPad and Android require device validation. Mobile background playback remains experimental and off by default.

## Privacy And Migration

API text goes to OpenAI. BYOK does not verify or enforce your organization's no-training or zero-data-retention settings. Realtime ZDR eligibility is not proof that your account has ZDR enabled; review [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Nothing is silently moved from an OpenRouter ZDR configuration to direct OpenAI processing.

OpenAI schedules `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` for shutdown on January 6, 2027. The plugin warns only affected profiles that target the official Speech endpoint; third-party compatible endpoints, MiMo, Edge, Azure and OpenRouter are not reconfigured by this notice. Existing profiles and authorizations remain unchanged. You cannot use the Realtime model through `/v1/audio/speech`.

References: [deprecation schedule](https://developers.openai.com/api/docs/deprecations), [Realtime setup](https://developers.openai.com/api/docs/guides/realtime), [WebSocket authentication](https://developers.openai.com/api/docs/guides/voice-websockets?api=realtime), [session and response events](https://developers.openai.com/api/docs/guides/realtime-conversations).

Automated tests use synthetic responses and public sample sentences only. They cover isolation, credentials, authorization, transcript rejection, completion, cancellation, timeouts, response size and WAV conversion. They do not establish real service availability, audible quality or mobile background reliability.
