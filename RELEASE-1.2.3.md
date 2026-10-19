# Cozy Read Aloud 1.2.3

- With Strip Markdown enabled (the default), omit HTML comments and Obsidian `%% ... %%` comments before speech processing, including multi-line and unfinished comments.
- Read the contents of `==highlighted text==` without its delimiters. Remove task-checkbox markers and standalone horizontal rules; preserve mathematical expressions and literal inline code during this cleanup.
- Omit fenced code blocks using either backticks or tildes, without treating their examples as document comments.
- Use full-note context for editor selections and audio exports, so starting inside a comment does not expose its hidden text.
- Keep source offsets for note highlighting without modifying the note file.

Regression tests use public synthetic text only. No personal notes or credentials are included.
