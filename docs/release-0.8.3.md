# 0.8.3 - Copilot conversation reading

- Read saved Copilot Markdown conversations: latest reply, last two replies, or latest question and answer, with an optional question toggle and local preview.
- Use Read latest reply in the picker or right-click the toolbar chat icon for direct playback of the most recently modified saved conversation's latest AI answer.
- Move chat reading to the end of the sidebar's More actions. Add bilingual labels and tooltips.
- Preserve Obsidian's modal keyboard scope to prevent a stuck chat picker and playback-start failures.
- Guard against duplicate clicks, changed conversations, cancelled operations and active audio exports. Existing speech-engine consent still applies; browsing and preview do not invoke speech APIs.
- Highlight Copilot integration and common two-column PDF paper support in the documentation. Clarify that MiMo's default Bai Hua male voice supports Chinese and English.

Requires saved Copilot Markdown transcripts; unsaved live chat messages are not accessed. Most recently saved does not necessarily mean the conversation currently on screen.

Validation: 211 automated tests passed, plus core, bundle-export and Obsidian-loader checks. No private conversations or live speech API calls were used for testing.
