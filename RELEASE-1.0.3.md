# Cozy Read Aloud 1.0.3

- The desktop sidebar now displays a searchable, hierarchical document outline for Markdown, local HTML and text PDFs.
- Expand or collapse all headings. Use outline focus view to give the directory the remaining sidebar space while keeping playback controls visible.
- Click a heading to navigate without restarting speech. Its play button reads from that section; the section menu can read only that section.
- Expansion, search and scroll state are kept for up to 20 documents in memory only. Manual browsing suspends automatic following; toggle Follow reading to resume it.
- Current-section markers use reliable source mappings. Ambiguous PDF positions and HTML without a current highlight may have no marker rather than an incorrect one.
- PDF loading is local and cancellable when switching files. Existing PDF bookmark editing remains available. Inferred outlines may be incomplete; scanned PDFs need OCR.

No speech-engine defaults or saved credentials are changed. Mobile is unchanged.
