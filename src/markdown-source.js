'use strict';
const { speechPartOffset } = require('./reading-highlights');

function compact(text) { return String(text || '').replace(/\s/g, ''); }
const lineIndexes = new WeakMap();
const literalOffsets = new WeakMap();
function sourceLineStarts(source) {
  let starts = lineIndexes.get(source);
  if (!starts) {
    starts = [0];
    for (let i = 0; i < source.text.length; i++) if (source.text[i] === '\n') starts.push(i + 1);
    lineIndexes.set(source, starts);
  }
  return starts;
}

function markdownReadingHighlight(session, highlight, settings = {}) {
  const chunk = session?.chunks?.[highlight?.index];
  if (typeof chunk !== 'string') return highlight;
  const parts = session.audioParts?.[highlight.index] || [chunk], part = session.currentPartIndex || 0;
  const offset = part < parts.length ? speechPartOffset(chunk, parts, part) : null;
  const cue = settings.readingHighlight === 'sentence' && highlight.sentence;
  const validCue = cue && Number.isInteger(cue.start) && Number.isInteger(cue.end)
    && cue.start >= 0 && cue.end > cue.start && cue.end <= chunk.length;
  const start = validCue ? cue.start : offset, end = validCue ? cue.end : offset === null ? null : offset + parts[part].length;
  if (start === null) return { index: highlight.index };
  const passage = chunk.slice(start, end).trim();
  return { index: highlight.index, passage,
    speechRange: { start: compact(chunk.slice(0, start)).length, end: compact(chunk.slice(0, end)).length },
    sentence: validCue ? { ...cue, text: passage } : null };
}

function sourceBlocks(text) {
  const blocks = [];
  let start = 0, offset = 0, fence = '', math = false, frontmatter = text.startsWith('---\n') || text.startsWith('---\r\n');
  let kind = 'paragraph';
  const flush = end => { if (end > start) blocks.push({ from: start, to: end, text: text.slice(start, end), kind }); start = end; kind = 'paragraph'; };
  for (const line of text.split(/(?<=\n)/)) {
    const trimmed = line.trim();
    if (!fence && !math && !frontmatter && /^(?:[ \t]*(?:[-+*]|\d+[.)])\s+|#{1,6}\s+)/.test(line)) {
      flush(offset); kind = /^\s*(?:[-+*]|\d+[.)])\s+/.test(line) ? 'list' : 'heading';
    } else if (!fence && !math && !frontmatter && kind === 'heading') flush(offset);
    const marker = trimmed.match(/^(`{3,}|~{3,})/);
    if (marker && !frontmatter) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
    }
    if (!fence && trimmed === '$$') math = !math;
    if (frontmatter && offset > 0 && trimmed === '---') frontmatter = false;
    if (!trimmed && !fence && !math && !frontmatter) {
      flush(offset);
      start = offset + line.length;
    }
    offset += line.length;
  }
  flush(offset);
  return blocks;
}

// Match the entire ordered stream, not the first occurrence of a repeated sentence.
// If per-block cleaning differs from full-document cleaning, disable source marking.
function buildMarkdownSource(raw, chunks, clean, options = {}) {
  const text = options.sourceText ?? raw, offset = options.sourceOffset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || text.slice(offset, offset + raw.length) !== raw) return null;
  const blocks = sourceBlocks(raw).map(block => ({ ...block,
    from: block.from + offset, to: block.to + offset, speech: compact(clean(block.text)),
  })).filter(block => block.speech);
  let position = 0;
  for (const block of blocks) {
    block.start = position; position += block.speech.length; block.end = position;
  }
  const speech = blocks.map(block => block.speech).join('');
  const actual = chunks.map(compact).join('');
  const mappingValid = speech === compact(clean(raw)) && speech === actual;
  // A context-sensitive formula/table must not disable unrelated verified blocks.
  // Once alignment diverges, only unique exact matches may resume marking.
  let partialMapping = false;
  if (!mappingValid && actual === compact(clean(raw))) {
    let cursor = 0, diverged = false;
    for (const block of blocks) {
      block.verified = false;
      let found = !diverged && actual.startsWith(block.speech, cursor) ? cursor : -1;
      if (found < 0) {
        diverged = true;
        const unique = actual.indexOf(block.speech);
        if (unique >= cursor && actual.indexOf(block.speech, unique + 1) < 0) found = unique;
      }
      if (found >= 0) {
        block.start = found; block.end = found + block.speech.length;
        block.verified = true; cursor = block.end; partialMapping = true;
      }
    }
  }
  position = 0;
  const ranges = chunks.map(chunk => {
    const start = position; position += compact(chunk).length;
    return { start, end: position };
  });
  return { text, displayText: raw, filePath: options.filePath || '', blocks, ranges, speech, mappingValid, partialMapping };
}

function currentSourceRanges(source, highlight) {
  const chunk = (source?.mappingValid || source?.partialMapping) && source.ranges[highlight?.index];
  if (!chunk) return [];
  let active = chunk;
  if (highlight.speechRange) {
    const { start, end } = highlight.speechRange;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || chunk.start + end > chunk.end) return [];
    active = { start: chunk.start + start, end: chunk.start + end };
  }
  const blocks = source.blocks.filter(block => (source.mappingValid || block.verified) && block.start < active.end && block.end > active.start);
  // Sentence timing is only used for text that survives Markdown cleaning verbatim.
  if (highlight.sentence && blocks.length === 1) {
    const block = blocks[0], sentence = highlight.sentence.text;
    if (sentence) {
      const local = block.text.indexOf(sentence);
      if (local >= 0 && block.text.indexOf(sentence, local + 1) < 0) return [{
        from: block.from + local, to: block.from + local + sentence.length, sentence: true,
      }];
    }
  }
  if (highlight.passage && blocks.length === 1 && typeof blocks[0].text === 'string') {
    const block = blocks[0], local = block.text.indexOf(highlight.passage);
    if (local >= 0 && block.text.indexOf(highlight.passage, local + 1) < 0)
      return [{ from: block.from + local, to: block.from + local + highlight.passage.length, sentence: false,
        partial: active.start > block.start || active.end < block.end }];
  }
  return blocks.map(block => {
    if (highlight.speechRange && typeof block.text === 'string' && compact(block.text) === block.speech) {
      let offsets = literalOffsets.get(block);
      if (!offsets) {
        offsets = [];
        for (let i = 0; i < block.text.length; i++) if (!/\s/.test(block.text[i])) offsets.push(i);
        literalOffsets.set(block, offsets);
      }
      const start = Math.max(0, active.start - block.start), end = Math.min(block.speech.length, active.end - block.start);
      return { from: block.from + offsets[start], to: block.from + offsets[end - 1] + 1,
        sentence: Boolean(highlight.sentence), partial: start > 0 || end < block.speech.length };
    }
    return { from: block.from, to: block.to, sentence: false };
  });
}

// Render text locally without automatically fetching attachments or remote media.
function readingMarkdown(text) {
  return String(text || '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[([^\]]*)\]\([^\n]*?\)/g, '$1')
    .replace(/!\[([^\]]*)\](?:\[[^\]]*\])?/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^(`{3,}|~{3,})([^\r\n]*)$/gm, (line, fence, language) => language.trim() ? `${fence}text` : line);
}

module.exports = { compact, sourceBlocks, buildMarkdownSource, currentSourceRanges, readingMarkdown, sourceLineStarts, markdownReadingHighlight };
