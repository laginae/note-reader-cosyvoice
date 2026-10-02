# Note and PDF Voice Reader 0.4.11

Adds Microsoft MAI-Voice-2.1-Flash as an OpenRouter model choice, with UK English male Harry as its default voice. Ten curated voices cover Mandarin Chinese, UK English and US English, with male and female options. Custom full voice IDs remain available.

The model and preset IDs were checked against OpenRouter's public speech + ZDR model directory on 2026-10-02. Every synthesis request continues to require ZDR and deny provider data collection. Existing model selections and credentials are preserved.

Updates English and Chinese model descriptions and documentation. Regression tests verify voice coverage, model-specific suffixes, custom voice preservation and enforced privacy routing. No paid synthesis requests were made during these tests.

Adds localized custom-voice help in settings, with model-page and model-specific voice-catalog links and instructions for complete MAI voice IDs.
