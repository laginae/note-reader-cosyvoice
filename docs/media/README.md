# Quick Tour

[Watch the 53-second video with sound](cozy-quick-tour.mp4) · [Silent preview](../images/cozy-quick-tour.gif) · [Back to the main README](../../README.md)

## What You See

A real recording of Cozy Read Aloud 1.1.1 in Obsidian 1.14.4 on Windows, made on October 12, 2026 in a separate sample vault:

1. Open the reading toolbar, open More controls, expand the reading-scope menu, and choose Selection only.
2. Slowly drag to select a public example passage, then hold the selection in view.
3. Read the selection and follow the highlighted passage.
4. Pause, then resume the same audio.
5. Click More controls again to fold the extra controls away.
6. Open the outline, expand its heading menu, and choose Keep your place to locate that section.
7. Click the pane-header reading icon again to hide the playback bar.

The demonstration is in Markdown Reading view. Both native dropdowns show their complete option lists and the selected item before closing. PDF, HTML, web and saved Copilot reading are supported features described in the main README, not additional workflows demonstrated in this clip.

## Voice and Timing

- Service: **OpenRouter**.
- Model: **ElevenLabs Multilingual v2** (`elevenlabs/eleven-multilingual-v2`).
- Voice: **Sarah** (`sarah`), normal synthesis speed and **1x** playback.
- Original audio generation: the plugin requested ZDR routing and denied provider data collection. Only the public sample passage was sent.
- This revised recording reuses those audio parts locally. A temporary, sample-only replay adapter in the isolated demo process replaces new synthesis requests; no account credentials or additional paid requests are used. Playback, pause, highlighting and navigation use the plugin's real controls. This is a UI walkthrough, not a cold-start or latency test.
- Mouse movements and text selection are deliberately paced, with pauses before clicks and after visible changes. A standard arrow overlay shows the pointer; a small, translucent pale-yellow cue appears only on pointer-down and fades within 650 milliseconds. There is no persistent tracking circle.
- The page recorder cannot capture Windows-native popup menus. Actual dropdown captures from the isolated demo window are composited at their measured positions, showing the open and selected states for about two seconds each. Menu-capture setup waits are removed. Menu labels and plugin behavior are not recreated or changed.
- The video uses the original returned audio parts, aligned with observed playback and pause events. It adds explanatory captions, with no replacement voice, background music or playback speed-up.
- Highlighting here is passage-based, not word-synchronized. Theme, layout, voice and network conditions affect the experience.

[Official model information and current pricing](https://openrouter.ai/elevenlabs/eleven-multilingual-v2). This is an example configuration, not a required service or an endorsement by the provider.

## Spoken Passage

> Select a passage, then let your notes speak. Keep the original page in view as you listen. Pause whenever you need a moment to think.

The rest of the sample note contains only these additional public sections:

**Keep your place**

Follow the highlighted text without losing your place. Move between sections with the document outline, or save audio for later.

**More than notes**

Listen to text PDFs, HTML files, web pages, and saved Copilot conversations. Optional academic reading settings simplify formulas and reduce citation clutter.

## Selection and Context Menu Demos

Recorded on October 23, 2026 with **Cozy Read Aloud 1.2.8** in a separate public sample vault on Obsidian desktop for Windows. Both recordings use Markdown Live Preview and actual local system speech (Microsoft Zira Desktop), not an online service or prerecorded playback adapter.

- [Editing Toolbar demo](../images/editing-toolbar-demo.gif), approximately 21 seconds: slowly select the public opening passage, click the speaker icon, and follow the actual reading highlight. **Editing Toolbar 4.1.9** is enabled in its selection-following layout; Cozy Read Aloud's floating reading icon is enabled with its default selection-only action.
- [Right-click menu demo](../images/context-menu-demo.gif), approximately 37 seconds: open the selection's context menu, choose **Read selected text**, then place the cursor in the next paragraph and choose **Read aloud from here**. Editing Toolbar is disabled for this recording, demonstrating that the context-menu actions work independently.

Both GIFs are silent, looping previews at 960 pixels wide and 10 frames per second. The complete real menu opening and selection are captured. Mouse motion is deliberately paced; a small pale-yellow click cue and short English captions are recording overlays. The interface, menu labels, selection and playback highlights are not reconstructed. Playback was verified before recording each result; timing is not a synthesis-speed benchmark. The public paragraphs are listed above, with the final sample section shortened to: "Listen to notes, PDFs, HTML files and web pages. Choose the reading method that works for you."

No private vault settings, account credentials, PDFs, manuscript prose or diagnostic captures are used in these two recordings. No online speech requests were made. Temporary recording profiles and raw frames stay outside the repository.

## Brand Mark

The warm cat, headphones and open-book mark was generated with the built-in image-generation tool, then resized to 384 pixels for delivery. The README displays it at 88 pixels. It is a new project illustration, not an Obsidian or voice-provider logo.

<details>
<summary>Image-generation prompt</summary>

Use case: logo-brand. Create one original small mascot mark for Cozy Read Aloud, a text-to-speech reading plugin. A calm friendly warm ginger cat wearing simple over-ear headphones and holding a small open white book beneath its face. Compact bust only: ears, round head, tiny paws embracing book, no body or tail. Relaxed closed eyes, subtle contented smile; welcoming and mature, not babyish. Clear chunky silhouette, very few details, flat cartoon illustration with crisp dark charcoal contours, warm apricot fur, coral headphones, white book pages with 2 simple charcoal reading lines. The cat, headphones and readable open-book silhouette must all be recognizable when reduced to 64px. No scene, no badge or outer circle, no coffee, no other props, no letters, words, watermark, background or shadow. Square centered composition with small even margins, genuinely transparent background. Avoid excessive fur texture, ornate linework, photorealism, 3D rendering, glossy gradients or resemblance to existing mascots.

</details>

## File Formats

- `cozy-quick-tour.mp4`: H.264 video and AAC audio, approximately 53 seconds.
- `../images/cozy-quick-tour.gif`: smaller, silent looping preview of the same recording.
- `cozy-quick-tour-poster.png`: still frame for a non-animated preview.
- `../images/cozy-cat.png`: transparent PNG brand mark.
- `../images/editing-toolbar-demo.gif`: silent selection-to-speech walkthrough using Editing Toolbar.
- `../images/context-menu-demo.gif`: silent right-click selection and read-from-here walkthrough.

Only final public media belongs here. Vault configuration, credentials, account details, temporary audio, recording profiles and private documents are not included.
