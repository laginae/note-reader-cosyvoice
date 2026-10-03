# 0.4.12 - Local HTML reading

- Read aloud vault-local `.html` and `.htm` body text with the existing speech engines and playback controls.
- Integrate with HTML Reader for selected-text reading and reading from the selected position to the end. Range offsets distinguish repeated phrases; unavailable selections produce a notice instead of using a different note.
- Export HTML audio for the entire document, selected text, or remaining text. The same mandatory character/request/path confirmation applies; direct insertion remains Markdown-only.
- Support optional bounded HTML resume anchors and dispose selection listeners when HTML frames close or reload.
- Extract readable HTML locally using a bundled parser without executing scripts or fetching page resources. Filter scripts, styles, frames, navigation, forms and explicitly hidden elements. HTML Reader's own page display and resource policy remain separate.
- Update English/Chinese documentation, command names, export labels and the plugin description to mention HTML.

Static local HTML is supported; MHT/MHTML archives, Web viewer pages, nested frames and script-generated body text are outside this release. No changes to stored API credentials or online consent settings.

Validation: all existing core, export and Obsidian-loader checks pass, plus 51 module tests including HTML extraction, repeated-phrase selection, all three export confirmation scopes, resume, listener cleanup and avoiding full-body parsing on panel progress updates. Tests use synthetic text and make no paid TTS requests.
