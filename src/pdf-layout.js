'use strict';

function normalizeLineBreaks(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function isCjkCharacter(character) {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(String(character || ''));
}

function shouldJoinPdfTextTokens(currentLine, token) {
  const previous = currentLine.slice(-1);
  const next = token.charAt(0);
  if (!previous || !next) {
    return true;
  }
  if (/[([{\u3008-\u3010\u3014\uff08]/.test(previous)) {
    return true;
  }
  if (/[),.;:!?%\]}\u3001\u3002\u3009-\u3011\u3015\uff01\uff09\uff0c\uff0e\uff1a\uff1b\uff1f]/.test(next)) {
    return true;
  }
  return isCjkCharacter(previous) && isCjkCharacter(next);
}

function joinTokens(tokens) {
  let line = '';
  for (const token of tokens) {
    const value = String(token || '').replace(/[ \t]+/g, ' ').trim();
    if (!value) {
      continue;
    }
    line = line && !shouldJoinPdfTextTokens(line, value)
      ? `${line} ${value}`
      : `${line}${value}`;
  }
  return line.trim();
}

function cleanupExtractedText(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/([A-Za-z])-\n(?=[a-z])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTextInItemOrder(items) {
  const lines = [];
  let currentLine = '';
  const flushLine = () => {
    const line = currentLine.trim();
    if (line) {
      lines.push(line);
    }
    currentLine = '';
  };

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.str !== 'string') {
      continue;
    }
    const parts = normalizeLineBreaks(item.str).split('\n');
    parts.forEach((part, index) => {
      const token = part.replace(/[ \t]+/g, ' ').trim();
      if (token) {
        currentLine = currentLine && !shouldJoinPdfTextTokens(currentLine, token)
          ? `${currentLine} ${token}`
          : `${currentLine}${token}`;
      }
      if (index < parts.length - 1) {
        flushLine();
      }
    });
    if (item.hasEOL) {
      flushLine();
    }
  }
  flushLine();
  return cleanupExtractedText(lines);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizePositionedItem(item) {
  if (!item || typeof item.str !== 'string' || !item.str.trim()) {
    return null;
  }
  const transform = Array.isArray(item.transform) || ArrayBuffer.isView(item.transform)
    ? item.transform
    : null;
  const rawX = typeof item.x !== 'undefined' ? item.x : (transform ? transform[4] : undefined);
  const rawY = typeof item.y !== 'undefined' ? item.y : (transform ? transform[5] : undefined);
  if (rawX === null || rawY === null || typeof rawX === 'undefined' || typeof rawY === 'undefined') {
    return null;
  }
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const transformHeight = transform ? Math.max(Math.abs(Number(transform[1]) || 0), Math.abs(Number(transform[3]) || 0)) : 0;
  const height = Math.max(1, Math.abs(Number(item.height) || 0), transformHeight);
  const width = Math.max(0, Math.abs(Number(item.width) || 0));
  return { height, str: item.str, width, x, y };
}

function groupItemsIntoLines(items, requestedPageWidth = 0) {
  const positioned = (Array.isArray(items) ? items : [])
    .map(normalizePositionedItem)
    .filter(Boolean);
  if (positioned.length < 2) {
    return [];
  }
  const tolerance = Math.max(2, median(positioned.map((item) => item.height)) * 0.5);
  const pageWidth = Number.isFinite(Number(requestedPageWidth)) && Number(requestedPageWidth) > 0
    ? Number(requestedPageWidth)
    : Math.max(...positioned.map((item) => item.x + item.width), 1);
  positioned.sort((left, right) => (right.y - left.y) || (left.x - right.x));
  const baselines = [];

  for (const item of positioned) {
    let line = baselines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (!line) {
      line = { items: [], y: item.y };
      baselines.push(line);
    }
    line.items.push(item);
    line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
  }

  const lineClusters = [];
  for (const baseline of baselines) {
    baseline.items.sort((left, right) => left.x - right.x);
    let cluster = [];
    for (const item of baseline.items) {
      const previous = cluster[cluster.length - 1];
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const crossesMidpoint = previous
        && previous.x + previous.width < pageWidth * 0.48
        && item.x > pageWidth * 0.52;
      if (previous && crossesMidpoint && gap > Math.max(24, pageWidth * 0.06)) {
        lineClusters.push({ items: cluster, y: baseline.y });
        cluster = [];
      }
      cluster.push(item);
    }
    if (cluster.length) {
      lineClusters.push({ items: cluster, y: baseline.y });
    }
  }

  return lineClusters
    .map((line) => {
      const xMin = Math.min(...line.items.map((item) => item.x));
      const xMax = Math.max(...line.items.map((item) => item.x + item.width));
      return {
        text: joinTokens(line.items.map((item) => item.str)),
        xMax,
        xMin,
        y: line.y,
      };
    })
    .filter((line) => line.text)
    .sort((left, right) => (right.y - left.y) || (left.xMin - right.xMin));
}

function classifyLine(line, pageWidth) {
  const midpoint = pageWidth / 2;
  const gutter = pageWidth * 0.035;
  const lineWidth = Math.max(0, line.xMax - line.xMin);
  if (lineWidth >= pageWidth * 0.58 || (line.xMin < midpoint - gutter && line.xMax > midpoint + gutter)) {
    return 'full';
  }
  if (line.xMax <= midpoint + gutter && (line.xMin + line.xMax) / 2 < midpoint) {
    return 'left';
  }
  if (line.xMin >= midpoint - gutter && (line.xMin + line.xMax) / 2 >= midpoint) {
    return 'right';
  }
  return 'full';
}

function hasTwoColumnLayout(lines, pageWidth) {
  const left = lines.filter((line) => classifyLine(line, pageWidth) === 'left');
  const right = lines.filter((line) => classifyLine(line, pageWidth) === 'right');
  if (left.length < 2 || right.length < 2) {
    return false;
  }
  const leftTop = Math.max(...left.map((line) => line.y));
  const leftBottom = Math.min(...left.map((line) => line.y));
  const rightTop = Math.max(...right.map((line) => line.y));
  const rightBottom = Math.min(...right.map((line) => line.y));
  return Math.min(leftTop, rightTop) > Math.max(leftBottom, rightBottom);
}

function orderTwoColumnLines(lines, pageWidth) {
  const output = [];
  let band = [];
  const flushBand = () => {
    if (!band.length) {
      return;
    }
    const left = band
      .filter((line) => classifyLine(line, pageWidth) === 'left')
      .sort((a, b) => b.y - a.y);
    const right = band
      .filter((line) => classifyLine(line, pageWidth) === 'right')
      .sort((a, b) => b.y - a.y);
    output.push(...left, ...right);
    band = [];
  };

  for (const line of lines) {
    if (classifyLine(line, pageWidth) === 'full') {
      flushBand();
      output.push(line);
    } else {
      band.push(line);
    }
  }
  flushBand();
  return output;
}

function extractTextFromPdfItems(items, options = {}) {
  const textItems = (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.str === 'string' && item.str.trim());
  const positionedCount = textItems
    .filter((item) => normalizePositionedItem(item)).length;
  if (positionedCount < Math.max(2, Math.ceil(textItems.length * 0.7))) {
    return extractTextInItemOrder(items);
  }

  const viewportWidth = Number(options.viewport && options.viewport.width);
  const positionedItems = textItems
    .map(normalizePositionedItem)
    .filter(Boolean);
  const requestedPageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : Math.max(...positionedItems.map((item) => item.x + item.width), 1);
  const lines = groupItemsIntoLines(items, requestedPageWidth);
  if (!lines.length) {
    return extractTextInItemOrder(items);
  }
  const pageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : Math.max(...lines.map((line) => line.xMax), 1);
  const ordered = hasTwoColumnLayout(lines, pageWidth)
    ? orderTwoColumnLines(lines, pageWidth)
    : lines;
  return cleanupExtractedText(ordered.map((line) => line.text));
}

module.exports = {
  extractTextFromPdfItems,
  extractTextInItemOrder,
  groupItemsIntoLines,
  hasTwoColumnLayout,
  orderTwoColumnLines,
};
