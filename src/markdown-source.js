'use strict';

function compact(text) { return String(text || '').replace(/\s/g, ''); }

function sourceBlocks(text) {
  const blocks = [];
  let start = 0, offset = 0, fence = '', math = false, frontmatter = text.startsWith('---\n') || text.startsWith('---\r\n');
  for (const line of text.split(/(?<=\n)/)) {
    const trimmed = line.trim();
    const marker = trimmed.match(/^(`{3,}|~{3,})/);
    if (marker && !frontmatter) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
    }
    if (!fence && trimmed === '$$') math = !math;
    if (frontmatter && offset > 0 && trimmed === '---') frontmatter = false;
    if (!trimmed && !fence && !math && !frontmatter) {
      if (offset > start) blocks.push({ from: start, to: offset, text: text.slice(start, offset) });
      start = offset + line.length;
    }
    offset += line.length;
  }
  if (offset > start) blocks.push({ from: start, to: offset, text: text.slice(start, offset) });
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
  const blocks = source.blocks.filter(block => (source.mappingValid || block.verified) && block.start < chunk.end && block.end > chunk.start);
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
  return blocks.map(block => ({ from: block.from, to: block.to, sentence: false }));
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

module.exports = { compact, sourceBlocks, buildMarkdownSource, currentSourceRanges, readingMarkdown };
