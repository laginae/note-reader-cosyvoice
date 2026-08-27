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

function getHorizontalMetrics(entries, requestedPageWidth = 0) {
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const xMin = Number(typeof entry.xMin !== 'undefined' ? entry.xMin : entry.x);
      const xMax = Number(typeof entry.xMax !== 'undefined'
        ? entry.xMax
        : Number(entry.x) + Math.max(0, Number(entry.width) || 0));
      return Number.isFinite(xMin) && Number.isFinite(xMax) && xMax >= xMin
        ? { xMax, xMin }
        : null;
    })
    .filter(Boolean);
  const pageWidth = Number.isFinite(Number(requestedPageWidth)) && Number(requestedPageWidth) > 0
    ? Number(requestedPageWidth)
    : 0;
  if (!normalized.length) {
    const fallbackWidth = Math.max(1, pageWidth);
    return {
      contentWidth: fallbackWidth,
      midpoint: fallbackWidth / 2,
    };
  }
  const contentLeft = Math.min(...normalized.map((entry) => entry.xMin));
  const contentRight = Math.max(...normalized.map((entry) => entry.xMax));
  const contentWidth = Math.max(1, contentRight - contentLeft);
  return {
    contentWidth,
    midpoint: (contentLeft + contentRight) / 2,
  };
}

function groupItemsIntoLines(items, requestedPageWidth = 0, options = {}) {
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
  const splitColumns = options.splitColumns !== false;
  const horizontal = getHorizontalMetrics(positioned, pageWidth);
  const minimumCentralGap = Math.max(4, horizontal.contentWidth * 0.012);
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
        && previous.x + previous.width <= horizontal.midpoint
        && item.x >= horizontal.midpoint;
      if (splitColumns && crossesMidpoint && gap >= minimumCentralGap) {
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

function getLineLayoutMetrics(lines, pageWidth) {
  const horizontal = getHorizontalMetrics(lines, pageWidth);
  return {
    fullWidth: horizontal.contentWidth * 0.62,
    gutter: Math.max(6, horizontal.contentWidth * 0.025),
    midpoint: horizontal.midpoint,
  };
}

function classifyLine(line, pageWidth, requestedMetrics = null) {
  const metrics = requestedMetrics || getLineLayoutMetrics([line], pageWidth);
  const { fullWidth, gutter, midpoint } = metrics;
  const lineWidth = Math.max(0, line.xMax - line.xMin);
  if (lineWidth >= fullWidth || (line.xMin < midpoint - gutter && line.xMax > midpoint + gutter)) {
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
  const metrics = getLineLayoutMetrics(lines, pageWidth);
  const left = lines.filter((line) => classifyLine(line, pageWidth, metrics) === 'left');
  const right = lines.filter((line) => classifyLine(line, pageWidth, metrics) === 'right');
  if (left.length < 2 || right.length < 2) {
    return false;
  }
  const directionalCount = left.length + right.length;
  if (directionalCount < Math.max(4, Math.ceil(lines.length * 0.35))) {
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
  const metrics = getLineLayoutMetrics(lines, pageWidth);
  const flushBand = () => {
    if (!band.length) {
      return;
    }
    const left = band
      .filter((line) => classifyLine(line, pageWidth, metrics) === 'left')
      .sort((a, b) => b.y - a.y);
    const right = band
      .filter((line) => classifyLine(line, pageWidth, metrics) === 'right')
      .sort((a, b) => b.y - a.y);
    const columnsOverlap = left.length && right.length
      && Math.min(left[0].y, right[0].y)
        > Math.max(left[left.length - 1].y, right[right.length - 1].y);
    if (columnsOverlap) {
      output.push(...left, ...right);
    } else {
      output.push(...band.slice().sort((a, b) => (b.y - a.y) || (a.xMin - b.xMin)));
    }
    band = [];
  };

  for (const line of lines) {
    if (classifyLine(line, pageWidth, metrics) === 'full') {
      flushBand();
      output.push(line);
    } else {
      band.push(line);
    }
  }
  flushBand();
  return output;
}

function extractPdfTextLayout(items, options = {}) {
  const textItems = (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.str === 'string' && item.str.trim());
  const positionedCount = textItems
    .filter((item) => normalizePositionedItem(item)).length;
  const viewportWidth = Number(options.viewport && options.viewport.width);
  const viewportHeight = Number(options.viewport && options.viewport.height);
  if (positionedCount < Math.max(2, Math.ceil(textItems.length * 0.7))) {
    return {
      lines: [],
      pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
      pageWidth: Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0,
      text: extractTextInItemOrder(items),
      twoColumn: false,
    };
  }

  const positionedItems = textItems
    .map(normalizePositionedItem)
    .filter(Boolean);
  const requestedPageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : Math.max(...positionedItems.map((item) => item.x + item.width), 1);
  const candidateLines = groupItemsIntoLines(items, requestedPageWidth, { splitColumns: true });
  if (!candidateLines.length) {
    return {
      lines: [],
      pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
      pageWidth: requestedPageWidth,
      text: extractTextInItemOrder(items),
      twoColumn: false,
    };
  }
  const pageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : Math.max(...candidateLines.map((line) => line.xMax), 1);
  const twoColumn = hasTwoColumnLayout(candidateLines, pageWidth);
  const lines = twoColumn
    ? candidateLines
    : groupItemsIntoLines(items, requestedPageWidth, { splitColumns: false });
  const ordered = twoColumn
    ? orderTwoColumnLines(lines, pageWidth)
    : lines;
  return {
    lines: ordered.map((line) => ({ ...line })),
    pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
    pageWidth,
    text: cleanupExtractedText(ordered.map((line) => line.text)),
    twoColumn,
  };
}

function extractTextFromPdfItems(items, options = {}) {
  return extractPdfTextLayout(items, options).text;
}

module.exports = {
  extractPdfTextLayout,
  extractTextFromPdfItems,
  extractTextInItemOrder,
  groupItemsIntoLines,
  hasTwoColumnLayout,
  orderTwoColumnLines,
};
