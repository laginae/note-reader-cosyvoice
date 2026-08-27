var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// ../note-reader-core/src/pdf-layout.js
var require_pdf_layout = __commonJS({
  "../note-reader-core/src/pdf-layout.js"(exports2, module2) {
    "use strict";
    function normalizeLineBreaks2(text) {
      return String(text || "").replace(/\r\n?/g, "\n");
    }
    function isCjkCharacter(character) {
      return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(String(character || ""));
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
      let line = "";
      for (const token of tokens) {
        const value = String(token || "").replace(/[ \t]+/g, " ").trim();
        if (!value) {
          continue;
        }
        line = line && !shouldJoinPdfTextTokens(line, value) ? `${line} ${value}` : `${line}${value}`;
      }
      return line.trim();
    }
    function cleanupExtractedText(lines) {
      return (Array.isArray(lines) ? lines : []).map((line) => String(line || "").trim()).filter(Boolean).join("\n").replace(/([A-Za-z])-\n(?=[a-z])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
    }
    function extractTextInItemOrder(items) {
      const lines = [];
      let currentLine = "";
      const flushLine = () => {
        const line = currentLine.trim();
        if (line) {
          lines.push(line);
        }
        currentLine = "";
      };
      for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item.str !== "string") {
          continue;
        }
        const parts = normalizeLineBreaks2(item.str).split("\n");
        parts.forEach((part, index) => {
          const token = part.replace(/[ \t]+/g, " ").trim();
          if (token) {
            currentLine = currentLine && !shouldJoinPdfTextTokens(currentLine, token) ? `${currentLine} ${token}` : `${currentLine}${token}`;
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
      if (!item || typeof item.str !== "string" || !item.str.trim()) {
        return null;
      }
      const transform = Array.isArray(item.transform) || ArrayBuffer.isView(item.transform) ? item.transform : null;
      const rawX = typeof item.x !== "undefined" ? item.x : transform ? transform[4] : void 0;
      const rawY = typeof item.y !== "undefined" ? item.y : transform ? transform[5] : void 0;
      if (rawX === null || rawY === null || typeof rawX === "undefined" || typeof rawY === "undefined") {
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
      const normalized = (Array.isArray(entries) ? entries : []).map((entry) => {
        const xMin = Number(typeof entry.xMin !== "undefined" ? entry.xMin : entry.x);
        const xMax = Number(typeof entry.xMax !== "undefined" ? entry.xMax : Number(entry.x) + Math.max(0, Number(entry.width) || 0));
        return Number.isFinite(xMin) && Number.isFinite(xMax) && xMax >= xMin ? { xMax, xMin } : null;
      }).filter(Boolean);
      const pageWidth = Number.isFinite(Number(requestedPageWidth)) && Number(requestedPageWidth) > 0 ? Number(requestedPageWidth) : 0;
      if (!normalized.length) {
        const fallbackWidth = Math.max(1, pageWidth);
        return {
          contentWidth: fallbackWidth,
          midpoint: fallbackWidth / 2
        };
      }
      const contentLeft = Math.min(...normalized.map((entry) => entry.xMin));
      const contentRight = Math.max(...normalized.map((entry) => entry.xMax));
      const contentWidth = Math.max(1, contentRight - contentLeft);
      return {
        contentWidth,
        midpoint: (contentLeft + contentRight) / 2
      };
    }
    function groupItemsIntoLines(items, requestedPageWidth = 0, options = {}) {
      const positioned = (Array.isArray(items) ? items : []).map(normalizePositionedItem).filter(Boolean);
      if (positioned.length < 2) {
        return [];
      }
      const tolerance = Math.max(2, median(positioned.map((item) => item.height)) * 0.5);
      const pageWidth = Number.isFinite(Number(requestedPageWidth)) && Number(requestedPageWidth) > 0 ? Number(requestedPageWidth) : Math.max(...positioned.map((item) => item.x + item.width), 1);
      const splitColumns = options.splitColumns !== false;
      const horizontal = getHorizontalMetrics(positioned, pageWidth);
      const minimumCentralGap = Math.max(4, horizontal.contentWidth * 0.012);
      positioned.sort((left, right) => right.y - left.y || left.x - right.x);
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
          const crossesMidpoint = previous && previous.x + previous.width <= horizontal.midpoint && item.x >= horizontal.midpoint;
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
      return lineClusters.map((line) => {
        const xMin = Math.min(...line.items.map((item) => item.x));
        const xMax = Math.max(...line.items.map((item) => item.x + item.width));
        return {
          text: joinTokens(line.items.map((item) => item.str)),
          xMax,
          xMin,
          y: line.y
        };
      }).filter((line) => line.text).sort((left, right) => right.y - left.y || left.xMin - right.xMin);
    }
    function getLineLayoutMetrics(lines, pageWidth) {
      const horizontal = getHorizontalMetrics(lines, pageWidth);
      return {
        fullWidth: horizontal.contentWidth * 0.62,
        gutter: Math.max(6, horizontal.contentWidth * 0.025),
        midpoint: horizontal.midpoint
      };
    }
    function classifyLine(line, pageWidth, requestedMetrics = null) {
      const metrics = requestedMetrics || getLineLayoutMetrics([line], pageWidth);
      const { fullWidth, gutter, midpoint } = metrics;
      const lineWidth = Math.max(0, line.xMax - line.xMin);
      if (lineWidth >= fullWidth || line.xMin < midpoint - gutter && line.xMax > midpoint + gutter) {
        return "full";
      }
      if (line.xMax <= midpoint + gutter && (line.xMin + line.xMax) / 2 < midpoint) {
        return "left";
      }
      if (line.xMin >= midpoint - gutter && (line.xMin + line.xMax) / 2 >= midpoint) {
        return "right";
      }
      return "full";
    }
    function hasTwoColumnLayout(lines, pageWidth) {
      const metrics = getLineLayoutMetrics(lines, pageWidth);
      const left = lines.filter((line) => classifyLine(line, pageWidth, metrics) === "left");
      const right = lines.filter((line) => classifyLine(line, pageWidth, metrics) === "right");
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
        const left = band.filter((line) => classifyLine(line, pageWidth, metrics) === "left").sort((a, b) => b.y - a.y);
        const right = band.filter((line) => classifyLine(line, pageWidth, metrics) === "right").sort((a, b) => b.y - a.y);
        const columnsOverlap = left.length && right.length && Math.min(left[0].y, right[0].y) > Math.max(left[left.length - 1].y, right[right.length - 1].y);
        if (columnsOverlap) {
          output.push(...left, ...right);
        } else {
          output.push(...band.slice().sort((a, b) => b.y - a.y || a.xMin - b.xMin));
        }
        band = [];
      };
      for (const line of lines) {
        if (classifyLine(line, pageWidth, metrics) === "full") {
          flushBand();
          output.push(line);
        } else {
          band.push(line);
        }
      }
      flushBand();
      return output;
    }
    function extractPdfTextLayout2(items, options = {}) {
      const textItems = (Array.isArray(items) ? items : []).filter((item) => item && typeof item.str === "string" && item.str.trim());
      const positionedCount = textItems.filter((item) => normalizePositionedItem(item)).length;
      const viewportWidth = Number(options.viewport && options.viewport.width);
      const viewportHeight = Number(options.viewport && options.viewport.height);
      if (positionedCount < Math.max(2, Math.ceil(textItems.length * 0.7))) {
        return {
          lines: [],
          pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
          pageWidth: Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0,
          text: extractTextInItemOrder(items),
          twoColumn: false
        };
      }
      const positionedItems = textItems.map(normalizePositionedItem).filter(Boolean);
      const requestedPageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : Math.max(...positionedItems.map((item) => item.x + item.width), 1);
      const candidateLines = groupItemsIntoLines(items, requestedPageWidth, { splitColumns: true });
      if (!candidateLines.length) {
        return {
          lines: [],
          pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
          pageWidth: requestedPageWidth,
          text: extractTextInItemOrder(items),
          twoColumn: false
        };
      }
      const pageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : Math.max(...candidateLines.map((line) => line.xMax), 1);
      const twoColumn = hasTwoColumnLayout(candidateLines, pageWidth);
      const lines = twoColumn ? candidateLines : groupItemsIntoLines(items, requestedPageWidth, { splitColumns: false });
      const ordered = twoColumn ? orderTwoColumnLines(lines, pageWidth) : lines;
      return {
        lines: ordered.map((line) => ({ ...line })),
        pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
        pageWidth,
        text: cleanupExtractedText(ordered.map((line) => line.text)),
        twoColumn
      };
    }
    function extractTextFromPdfItems2(items, options = {}) {
      return extractPdfTextLayout2(items, options).text;
    }
    module2.exports = {
      extractPdfTextLayout: extractPdfTextLayout2,
      extractTextFromPdfItems: extractTextFromPdfItems2,
      extractTextInItemOrder,
      groupItemsIntoLines,
      hasTwoColumnLayout,
      orderTwoColumnLines
    };
  }
});

// src/pdf-layout.js
var require_pdf_layout2 = __commonJS({
  "src/pdf-layout.js"(exports2, module2) {
    "use strict";
    module2.exports = require_pdf_layout();
  }
});

// src/audio-export.js
var require_audio_export = __commonJS({
  "src/audio-export.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var MAX_EXPORTED_AUDIO_BYTES2 = 256 * 1024 * 1024;
    function bufferToArrayBuffer2(buffer) {
      const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    function sanitizeExportBaseName(value) {
      const sanitized = String(value || "note").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim();
      return sanitized || "note";
    }
    function buildExportAudioFileName2(noteBaseName, extension, scope = "entire") {
      const normalizedExtension = String(extension || "").toLowerCase() === "mp3" ? "mp3" : "wav";
      const suffix = scope === "selection" ? "selection narration" : scope === "from-selection" ? "continued narration" : "narration";
      return `${sanitizeExportBaseName(noteBaseName)} - ${suffix}.${normalizedExtension}`;
    }
    function parseWaveBuffer(value) {
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
      if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error("The local speech engine returned an invalid WAV file.");
      }
      let formatChunk = null;
      const dataChunks = [];
      let offset = 12;
      while (offset + 8 <= buffer.length) {
        const chunkId = buffer.toString("ascii", offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        const chunkStart = offset + 8;
        const chunkEnd = chunkStart + chunkSize;
        if (chunkEnd > buffer.length) {
          throw new Error("The local speech engine returned a truncated WAV file.");
        }
        if (chunkId === "fmt " && !formatChunk) {
          formatChunk = Buffer.from(buffer.subarray(chunkStart, chunkEnd));
        } else if (chunkId === "data" && chunkSize > 0) {
          dataChunks.push(buffer.subarray(chunkStart, chunkEnd));
        }
        offset = chunkEnd + chunkSize % 2;
      }
      if (!formatChunk || formatChunk.length < 16 || !dataChunks.length) {
        throw new Error("The local speech engine returned a WAV file without PCM audio data.");
      }
      const audioFormat = formatChunk.readUInt16LE(0);
      const channels = formatChunk.readUInt16LE(2);
      const sampleRate = formatChunk.readUInt32LE(4);
      const byteRate = formatChunk.readUInt32LE(8);
      const blockAlign = formatChunk.readUInt16LE(12);
      const bitsPerSample = formatChunk.readUInt16LE(14);
      const isPcm = audioFormat === 1;
      const isExtensiblePcm = audioFormat === 65534 && formatChunk.length >= 40 && formatChunk.readUInt16LE(24) === 1;
      if (!isPcm && !isExtensiblePcm) {
        throw new Error(`WAV export supports PCM audio only; received format ${audioFormat}.`);
      }
      if (!channels || !sampleRate || !byteRate || !blockAlign || !bitsPerSample) {
        throw new Error("The local speech engine returned an invalid WAV format header.");
      }
      const dataBytes = dataChunks.reduce((total, chunk) => total + chunk.length, 0);
      if (dataBytes % blockAlign !== 0) {
        throw new Error("The local speech engine returned misaligned WAV audio data.");
      }
      return {
        audioFormat,
        bitsPerSample,
        blockAlign,
        byteRate,
        channels,
        dataBytes,
        dataChunks,
        formatChunk,
        sampleRate
      };
    }
    function getWaveFormatSignature(parsed) {
      return [
        parsed.audioFormat,
        parsed.channels,
        parsed.sampleRate,
        parsed.byteRate,
        parsed.blockAlign,
        parsed.bitsPerSample,
        parsed.formatChunk.toString("hex")
      ].join(":");
    }
    function createWaveHeader(formatChunkValue, dataBytes) {
      const formatChunk = Buffer.from(formatChunkValue);
      const formatPadding = formatChunk.length % 2;
      const headerLength = 12 + 8 + formatChunk.length + formatPadding + 8;
      const riffSize = headerLength + dataBytes - 8;
      if (!Number.isSafeInteger(dataBytes) || dataBytes < 0 || riffSize > 4294967295) {
        throw new Error("The exported WAV file is too large for the WAV format.");
      }
      const header = Buffer.alloc(headerLength);
      header.write("RIFF", 0, "ascii");
      header.writeUInt32LE(riffSize, 4);
      header.write("WAVE", 8, "ascii");
      header.write("fmt ", 12, "ascii");
      header.writeUInt32LE(formatChunk.length, 16);
      formatChunk.copy(header, 20);
      const dataHeaderOffset = 20 + formatChunk.length + formatPadding;
      header.write("data", dataHeaderOffset, "ascii");
      header.writeUInt32LE(dataBytes, dataHeaderOffset + 4);
      return header;
    }
    async function writeBufferAt(fileHandle, buffer, position) {
      let offset = 0;
      while (offset < buffer.length) {
        const result = await fileHandle.write(buffer, offset, buffer.length - offset, position + offset);
        if (!result || !result.bytesWritten) {
          throw new Error("Unable to write the exported audio file.");
        }
        offset += result.bytesWritten;
      }
      return position + buffer.length;
    }
    async function mergeWaveFiles(inputPaths, outputPath, options = {}) {
      const paths = Array.isArray(inputPaths) ? inputPaths.filter(Boolean) : [];
      if (!paths.length) {
        throw new Error("No WAV segments were generated for export.");
      }
      const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : MAX_EXPORTED_AUDIO_BYTES2;
      let expectedSignature = "";
      let formatChunk = null;
      let totalDataBytes = 0;
      for (const inputPath of paths) {
        const parsed = parseWaveBuffer(await fs2.promises.readFile(inputPath));
        const signature = getWaveFormatSignature(parsed);
        if (expectedSignature && signature !== expectedSignature) {
          throw new Error("The generated WAV segments use different audio formats and cannot be merged safely.");
        }
        expectedSignature = signature;
        formatChunk = parsed.formatChunk;
        totalDataBytes += parsed.dataBytes;
        if (totalDataBytes > maxBytes) {
          throw new Error(`The exported audio exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB safety limit.`);
        }
      }
      const header = createWaveHeader(formatChunk, totalDataBytes);
      if (header.length + totalDataBytes > maxBytes) {
        throw new Error(`The exported audio exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB safety limit.`);
      }
      let handle = null;
      try {
        await fs2.promises.mkdir(path2.dirname(outputPath), { recursive: true });
        handle = await fs2.promises.open(outputPath, "w", 384);
        let outputOffset = await writeBufferAt(handle, header, 0);
        for (const inputPath of paths) {
          const parsed = parseWaveBuffer(await fs2.promises.readFile(inputPath));
          for (const chunk of parsed.dataChunks) {
            outputOffset = await writeBufferAt(handle, chunk, outputOffset);
          }
        }
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {
          });
          handle = null;
        }
        await fs2.promises.unlink(outputPath).catch(() => {
        });
        throw error;
      } finally {
        if (handle) {
          await handle.close().catch(() => {
          });
        }
      }
      return {
        bytes: header.length + totalDataBytes,
        extension: "wav",
        segments: paths.length
      };
    }
    var MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    var MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    function parseMp3FrameHeader(buffer, offset) {
      if (offset + 4 > buffer.length) {
        return null;
      }
      const header = buffer.readUInt32BE(offset) >>> 0;
      if ((header >>> 21 & 2047) !== 2047) {
        return null;
      }
      const versionBits = header >>> 19 & 3;
      const layerBits = header >>> 17 & 3;
      const bitrateIndex = header >>> 12 & 15;
      const sampleRateIndex = header >>> 10 & 3;
      if (versionBits === 1 || layerBits !== 1 || bitrateIndex < 1 || bitrateIndex > 14 || sampleRateIndex === 3) {
        return null;
      }
      const baseSampleRates = [44100, 48e3, 32e3];
      const sampleRateDivisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
      const sampleRate = baseSampleRates[sampleRateIndex] / sampleRateDivisor;
      const bitrateKbps = (versionBits === 3 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex];
      const padding = header >>> 9 & 1;
      const frameLength = Math.floor(
        (versionBits === 3 ? 144 : 72) * bitrateKbps * 1e3 / sampleRate
      ) + padding;
      if (frameLength <= 4 || offset + frameLength > buffer.length) {
        return null;
      }
      const channelMode = header >>> 6 & 3;
      return {
        bitrateKbps,
        channels: channelMode === 3 ? 1 : 2,
        frameLength,
        layerBits,
        sampleRate,
        versionBits
      };
    }
    function readSynchsafeInteger(buffer, offset) {
      if (offset + 4 > buffer.length) {
        return -1;
      }
      const bytes = buffer.subarray(offset, offset + 4);
      if (Array.from(bytes).some((byte) => byte & 128)) {
        return -1;
      }
      return bytes[0] << 21 | bytes[1] << 14 | bytes[2] << 7 | bytes[3];
    }
    function skipLeadingId3Tags(buffer) {
      let offset = 0;
      while (offset + 10 <= buffer.length && buffer.toString("ascii", offset, offset + 3) === "ID3") {
        const tagSize = readSynchsafeInteger(buffer, offset + 6);
        if (tagSize < 0) {
          throw new Error("The online speech engine returned an invalid MP3 metadata tag.");
        }
        const hasFooter = Boolean(buffer[offset + 5] & 16);
        const nextOffset = offset + 10 + tagSize + (hasFooter ? 10 : 0);
        if (nextOffset > buffer.length) {
          throw new Error("The online speech engine returned a truncated MP3 metadata tag.");
        }
        offset = nextOffset;
      }
      return offset;
    }
    function isMp3MetadataFrame(frame) {
      const sample = frame.subarray(0, Math.min(frame.length, 192)).toString("latin1");
      return sample.includes("Xing") || sample.includes("Info") || sample.includes("VBRI");
    }
    function isIgnorableMp3Tail(buffer, offset) {
      if (offset >= buffer.length) {
        return true;
      }
      if (buffer.length - offset === 128 && buffer.toString("ascii", offset, offset + 3) === "TAG") {
        return true;
      }
      for (let index = offset; index < buffer.length; index += 1) {
        if (buffer[index] !== 0) {
          return false;
        }
      }
      return true;
    }
    function extractMp3Frames(value) {
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
      let offset = skipLeadingId3Tags(buffer);
      let skippedBeforeFirstFrame = 0;
      const frames = [];
      let format = null;
      while (offset + 4 <= buffer.length) {
        if (buffer.length - offset === 128 && buffer.toString("ascii", offset, offset + 3) === "TAG") {
          break;
        }
        const header = parseMp3FrameHeader(buffer, offset);
        if (!header) {
          if (frames.length) {
            if (isIgnorableMp3Tail(buffer, offset)) {
              break;
            }
            throw new Error("The online speech engine returned malformed MP3 audio frames.");
          }
          offset += 1;
          skippedBeforeFirstFrame += 1;
          if (skippedBeforeFirstFrame > 4096) {
            break;
          }
          continue;
        }
        const frame = buffer.subarray(offset, offset + header.frameLength);
        if (format && [
          header.versionBits,
          header.layerBits,
          header.sampleRate,
          header.channels
        ].join(":") !== [
          format.versionBits,
          format.layerBits,
          format.sampleRate,
          format.channels
        ].join(":")) {
          throw new Error("The online speech engine returned inconsistent MP3 audio frames.");
        }
        frames.push(frame);
        format = format || header;
        offset += header.frameLength;
      }
      if (frames.length > 1 && isMp3MetadataFrame(frames[0])) {
        frames.shift();
      }
      if (!frames.length || !format) {
        throw new Error("The online speech engine returned an MP3 file without readable audio frames.");
      }
      return {
        bytes: frames.reduce((total, frame) => total + frame.length, 0),
        format,
        frames
      };
    }
    function getMp3FormatSignature(parsed) {
      return [
        parsed.format.versionBits,
        parsed.format.layerBits,
        parsed.format.sampleRate,
        parsed.format.channels
      ].join(":");
    }
    async function mergeMp3Files(inputPaths, outputPath, options = {}) {
      const paths = Array.isArray(inputPaths) ? inputPaths.filter(Boolean) : [];
      if (!paths.length) {
        throw new Error("No MP3 segments were generated for export.");
      }
      const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : MAX_EXPORTED_AUDIO_BYTES2;
      let expectedSignature = "";
      let totalBytes = 0;
      let totalFrames = 0;
      let handle = null;
      try {
        await fs2.promises.mkdir(path2.dirname(outputPath), { recursive: true });
        handle = await fs2.promises.open(outputPath, "w", 384);
        let outputOffset = 0;
        for (const inputPath of paths) {
          const parsed = extractMp3Frames(await fs2.promises.readFile(inputPath));
          const signature = getMp3FormatSignature(parsed);
          if (expectedSignature && signature !== expectedSignature) {
            throw new Error("The generated MP3 segments use different sample formats and cannot be merged safely.");
          }
          expectedSignature = signature;
          totalBytes += parsed.bytes;
          if (totalBytes > maxBytes) {
            throw new Error(`The exported audio exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB safety limit.`);
          }
          for (const frame of parsed.frames) {
            outputOffset = await writeBufferAt(handle, frame, outputOffset);
            totalFrames += 1;
          }
        }
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {
          });
          handle = null;
        }
        await fs2.promises.unlink(outputPath).catch(() => {
        });
        throw error;
      } finally {
        if (handle) {
          await handle.close().catch(() => {
          });
        }
      }
      return {
        bytes: totalBytes,
        extension: "mp3",
        frames: totalFrames,
        segments: paths.length
      };
    }
    async function mergeAudioFiles2(inputPaths, outputPath, extension, options = {}) {
      return String(extension || "").toLowerCase() === "mp3" ? mergeMp3Files(inputPaths, outputPath, options) : mergeWaveFiles(inputPaths, outputPath, options);
    }
    module2.exports = {
      MAX_EXPORTED_AUDIO_BYTES: MAX_EXPORTED_AUDIO_BYTES2,
      bufferToArrayBuffer: bufferToArrayBuffer2,
      buildExportAudioFileName: buildExportAudioFileName2,
      createWaveHeader,
      extractMp3Frames,
      mergeAudioFiles: mergeAudioFiles2,
      mergeMp3Files,
      mergeWaveFiles,
      parseMp3FrameHeader,
      parseWaveBuffer,
      sanitizeExportBaseName
    };
  }
});

// ../note-reader-core/src/reading-position.js
var require_reading_position = __commonJS({
  "../note-reader-core/src/reading-position.js"(exports2, module2) {
    "use strict";
    var MAX_READING_POSITIONS = 100;
    var MAX_ANCHOR_LENGTH = 180;
    function normalizeAnchorText(text) {
      return String(text || "").normalize("NFKC").replace(/\u00ad/g, "").replace(/([A-Za-z])-\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").trim();
    }
    function createReadingAnchor2(text) {
      return normalizeAnchorText(text).slice(0, MAX_ANCHOR_LENGTH);
    }
    function normalizeReadingPosition(value, filePath = "") {
      if (!value || typeof value !== "object") {
        return null;
      }
      const normalizedPath = String(filePath || value.filePath || "").trim().slice(0, 1024);
      const anchor = createReadingAnchor2(value.anchor);
      const kind = value.kind === "pdf" ? "pdf" : value.kind === "markdown" ? "markdown" : "";
      if (!normalizedPath || !anchor || !kind) {
        return null;
      }
      const pageNumber = kind === "pdf" ? Math.max(1, Math.floor(Number(value.pageNumber) || 1)) : null;
      return {
        anchor,
        chunkIndex: Math.max(0, Math.floor(Number(value.chunkIndex) || 0)),
        fileMtime: Math.max(0, Math.floor(Number(value.fileMtime) || 0)),
        filePath: normalizedPath,
        kind,
        pageNumber,
        updatedAt: Math.max(0, Math.floor(Number(value.updatedAt) || Date.now()))
      };
    }
    function normalizeReadingPositions2(value, maxEntries = MAX_READING_POSITIONS) {
      const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const normalized = Object.entries(source).map(([filePath, position]) => normalizeReadingPosition(position, filePath)).filter(Boolean).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, Math.max(1, Math.floor(Number(maxEntries) || MAX_READING_POSITIONS)));
      return Object.fromEntries(normalized.map((position) => [position.filePath, position]));
    }
    function upsertReadingPosition2(positions, position, maxEntries = MAX_READING_POSITIONS) {
      const normalized = normalizeReadingPosition(position, position && position.filePath);
      if (!normalized) {
        return normalizeReadingPositions2(positions, maxEntries);
      }
      return normalizeReadingPositions2({
        ...normalizeReadingPositions2(positions, maxEntries),
        [normalized.filePath]: normalized
      }, maxEntries);
    }
    function removeReadingPosition2(positions, filePath) {
      const normalized = normalizeReadingPositions2(positions);
      delete normalized[String(filePath || "")];
      return normalized;
    }
    function sliceTextFromReadingPosition2(text, position) {
      const normalizedText = normalizeAnchorText(text);
      const anchor = createReadingAnchor2(position && position.anchor);
      if (!normalizedText || !anchor) {
        return { matched: false, text: normalizedText };
      }
      const candidateLengths = [anchor.length, 140, 100, 72, 48, 32, 20, 12].map((length) => Math.min(anchor.length, length)).filter((length, index, values) => length >= 12 && values.indexOf(length) === index);
      const lowerText = normalizedText.toLocaleLowerCase();
      for (const length of candidateLengths) {
        const candidate = anchor.slice(0, length);
        let index = normalizedText.indexOf(candidate);
        if (index < 0) {
          index = lowerText.indexOf(candidate.toLocaleLowerCase());
        }
        if (index >= 0) {
          return { matched: true, text: normalizedText.slice(index) };
        }
      }
      return { matched: false, text: normalizedText };
    }
    module2.exports = {
      MAX_ANCHOR_LENGTH,
      MAX_READING_POSITIONS,
      createReadingAnchor: createReadingAnchor2,
      normalizeAnchorText,
      normalizeReadingPosition,
      normalizeReadingPositions: normalizeReadingPositions2,
      removeReadingPosition: removeReadingPosition2,
      sliceTextFromReadingPosition: sliceTextFromReadingPosition2,
      upsertReadingPosition: upsertReadingPosition2
    };
  }
});

// src/reading-position.js
var require_reading_position2 = __commonJS({
  "src/reading-position.js"(exports2, module2) {
    "use strict";
    module2.exports = require_reading_position();
  }
});

// ../note-reader-core/src/semantic-chunker.js
var require_semantic_chunker = __commonJS({
  "../note-reader-core/src/semantic-chunker.js"(exports2, module2) {
    "use strict";
    var DEFAULT_CHUNK_LIMITS2 = [40, 80, 120, 160, 280, 320];
    function parseChunkLimits2(value, fallback = DEFAULT_CHUNK_LIMITS2) {
      const list = Array.isArray(value) ? value : String(value || "").split(",").map((item) => item.trim());
      const limits = list.map((item) => Math.floor(Number(item))).filter((item) => Number.isFinite(item) && item > 0);
      const fallbackLimits = Array.isArray(fallback) ? fallback.filter((item) => Number.isFinite(item) && item > 0) : [];
      return limits.length ? limits : fallbackLimits.length ? fallbackLimits.slice() : DEFAULT_CHUNK_LIMITS2.slice();
    }
    function normalizeChunkText(text) {
      return String(text || "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    function findLastBoundary(search, pattern, limit) {
      let match;
      let best = -1;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(search)) !== null) {
        const end = match.index + match[0].length;
        if (end > 0 && end <= limit) {
          best = end;
        }
        if (match[0].length === 0) {
          pattern.lastIndex += 1;
        }
      }
      return best;
    }
    function chooseChunkCut(text, limit) {
      const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
      const search = String(text || "").slice(0, safeLimit + 1);
      const minUsefulCut = Math.max(1, Math.floor(safeLimit * 0.35));
      const boundaries = [
        /\n{2,}/g,
        /\n/g,
        /[。！？!?](?:["'\u2019\u201d\u3009-\u3011\u3015\uff09])?\s*/g,
        /\.(?!\d)(?:["'\u2019\u201d])?\s+/g,
        /[，,；;：:]\s*/g,
        /\s+/g
      ];
      for (const pattern of boundaries) {
        const cut = findLastBoundary(search, pattern, safeLimit);
        if (cut >= minUsefulCut) {
          return cut;
        }
      }
      return safeLimit;
    }
    function splitTextForSpeechChunks2(text, maxLengths = DEFAULT_CHUNK_LIMITS2) {
      const limits = parseChunkLimits2(maxLengths);
      let remaining = normalizeChunkText(text);
      const chunks = [];
      while (remaining) {
        const limit = limits[Math.min(chunks.length, limits.length - 1)];
        if (remaining.length <= limit) {
          chunks.push(remaining);
          break;
        }
        const cut = chooseChunkCut(remaining, limit);
        const chunk = remaining.slice(0, cut).trim();
        remaining = remaining.slice(cut).trim();
        if (chunk) {
          chunks.push(chunk);
        }
      }
      return chunks;
    }
    function createIncrementalSpeechChunker2(maxLengths = DEFAULT_CHUNK_LIMITS2, options = {}) {
      const limits = parseChunkLimits2(maxLengths);
      const detailed = options && options.detailed === true;
      let buffer = "";
      let chunkCount = 0;
      let spans = [];
      const appendSpan = (length, metadata) => {
        if (length <= 0) {
          return;
        }
        const previous = spans[spans.length - 1];
        if (previous && previous.metadata === metadata) {
          previous.length += length;
        } else {
          spans.push({ length, metadata });
        }
      };
      const consumeSpans = (count) => {
        let remaining = count;
        while (remaining > 0 && spans.length) {
          if (remaining >= spans[0].length) {
            remaining -= spans[0].length;
            spans.shift();
          } else {
            spans[0].length -= remaining;
            remaining = 0;
          }
        }
      };
      const consumeBuffer = (count) => {
        let next = buffer.slice(count);
        const leadingWhitespace = /^\s*/.exec(next)[0].length;
        consumeSpans(count + leadingWhitespace);
        buffer = next.slice(leadingWhitespace);
      };
      const firstMetadata = () => {
        const span = spans.find((entry) => entry.metadata !== null && typeof entry.metadata !== "undefined");
        return span ? span.metadata : null;
      };
      const formatChunk = (text) => detailed ? { metadata: firstMetadata(), text } : text;
      const takeReadyChunks = (flush) => {
        const chunks = [];
        while (buffer) {
          const limit = limits[Math.min(chunkCount, limits.length - 1)];
          if (buffer.length <= limit) {
            if (flush) {
              const chunk2 = buffer.trim();
              if (chunk2) {
                chunks.push(formatChunk(chunk2));
                chunkCount += 1;
              }
              buffer = "";
              spans = [];
            }
            break;
          }
          const cut = chooseChunkCut(buffer, limit);
          const chunk = buffer.slice(0, cut).trim();
          if (chunk) {
            chunks.push(formatChunk(chunk));
            chunkCount += 1;
          }
          consumeBuffer(cut);
        }
        return chunks;
      };
      return {
        push(text, metadata = null) {
          const normalized = normalizeChunkText(text);
          if (normalized) {
            if (buffer) {
              buffer += "\n\n";
              appendSpan(2, null);
            }
            buffer += normalized;
            appendSpan(normalized.length, metadata);
          }
          return takeReadyChunks(false);
        },
        finish() {
          return takeReadyChunks(true);
        }
      };
    }
    module2.exports = {
      DEFAULT_CHUNK_LIMITS: DEFAULT_CHUNK_LIMITS2,
      chooseChunkCut,
      createIncrementalSpeechChunker: createIncrementalSpeechChunker2,
      normalizeChunkText,
      parseChunkLimits: parseChunkLimits2,
      splitTextForSpeechChunks: splitTextForSpeechChunks2
    };
  }
});

// src/semantic-chunker.js
var require_semantic_chunker2 = __commonJS({
  "src/semantic-chunker.js"(exports2, module2) {
    "use strict";
    module2.exports = require_semantic_chunker();
  }
});

// ../note-reader-core/src/task-state.js
var require_task_state = __commonJS({
  "../note-reader-core/src/task-state.js"(exports2, module2) {
    "use strict";
    var PHASE_TRANSITIONS = {
      idle: /* @__PURE__ */ new Set(["extracting", "queued"]),
      extracting: /* @__PURE__ */ new Set(["complete", "error", "paused", "playing", "queued", "stopping", "synthesizing"]),
      queued: /* @__PURE__ */ new Set(["complete", "error", "extracting", "paused", "playing", "stopping", "synthesizing"]),
      synthesizing: /* @__PURE__ */ new Set(["complete", "error", "extracting", "paused", "playing", "queued", "stopping"]),
      playing: /* @__PURE__ */ new Set(["complete", "error", "extracting", "paused", "queued", "stopping", "synthesizing"]),
      paused: /* @__PURE__ */ new Set(["error", "extracting", "playing", "queued", "stopping", "synthesizing"]),
      stopping: /* @__PURE__ */ new Set(["error", "idle"]),
      complete: /* @__PURE__ */ new Set(["extracting", "idle", "queued", "stopping"]),
      error: /* @__PURE__ */ new Set(["extracting", "idle", "queued", "stopping"])
    };
    function createTaskState2(sessionId, phase = "idle") {
      const normalizedPhase = Object.prototype.hasOwnProperty.call(PHASE_TRANSITIONS, phase) ? phase : "idle";
      return {
        phase: normalizedPhase,
        revision: 0,
        sessionId: Number(sessionId) || 0
      };
    }
    function canTransitionTaskState(fromPhase, toPhase) {
      if (fromPhase === toPhase) {
        return true;
      }
      const allowed = PHASE_TRANSITIONS[fromPhase];
      return Boolean(allowed && allowed.has(toPhase));
    }
    function transitionTaskState2(state, nextPhase, sessionId = state && state.sessionId) {
      const current = state || createTaskState2(sessionId);
      if (Number(sessionId) !== current.sessionId) {
        return current;
      }
      if (!Object.prototype.hasOwnProperty.call(PHASE_TRANSITIONS, nextPhase)) {
        throw new Error(`Unknown reading task phase: ${nextPhase}`);
      }
      if (!canTransitionTaskState(current.phase, nextPhase)) {
        throw new Error(`Invalid reading task transition: ${current.phase} -> ${nextPhase}`);
      }
      if (current.phase === nextPhase) {
        return current;
      }
      return {
        phase: nextPhase,
        revision: current.revision + 1,
        sessionId: current.sessionId
      };
    }
    module2.exports = {
      PHASE_TRANSITIONS,
      canTransitionTaskState,
      createTaskState: createTaskState2,
      transitionTaskState: transitionTaskState2
    };
  }
});

// src/task-state.js
var require_task_state2 = __commonJS({
  "src/task-state.js"(exports2, module2) {
    "use strict";
    module2.exports = require_task_state();
  }
});

// src/main.js
var { ItemView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, SecretComponent, Setting, loadPdfJs, setIcon } = require("obsidian");
var crypto = require("crypto");
var fs = require("fs");
var https = require("https");
var os = require("os");
var path = require("path");
var { spawn } = require("child_process");
var { pathToFileURL } = require("url");
var { extractPdfTextLayout, extractTextFromPdfItems } = require_pdf_layout2();
var {
  MAX_EXPORTED_AUDIO_BYTES,
  bufferToArrayBuffer,
  buildExportAudioFileName,
  mergeAudioFiles
} = require_audio_export();
var {
  createReadingAnchor,
  normalizeReadingPositions,
  removeReadingPosition,
  sliceTextFromReadingPosition,
  upsertReadingPosition
} = require_reading_position2();
var {
  createIncrementalSpeechChunker,
  parseChunkLimits,
  splitTextForSpeechChunks
} = require_semantic_chunker2();
var {
  createTaskState,
  transitionTaskState
} = require_task_state2();
var PLUGIN_ID = "note-reader-cosyvoice";
var VIEW_TYPE = "note-reader-cosyvoice-control";
var GITHUB_ISSUES_URL = "https://github.com/laginae/note-reader-cosyvoice/issues";
var DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];
var DEFAULT_ONLINE_CHUNK_LIMITS = [200, 400, 800];
var MAX_ONLINE_PREFETCH_CHUNKS = 1;
var DEFAULT_MATH_READING_LANGUAGE = "english";
var DEFAULT_EDGE_TTS_VOICE = "en-GB-RyanNeural";
var DEFAULT_EDGE_TTS_EXECUTABLE = "edge-tts";
var DEFAULT_AZURE_SPEECH_VOICE = "en-GB-RyanNeural";
var DEFAULT_OPENROUTER_TTS_MODEL = "hexgrad/kokoro-82m";
var DEFAULT_OPENROUTER_TTS_VOICE = "bm_george";
var AZURE_SPEECH_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
var OPENROUTER_TTS_ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";
var RECOMMENDED_SCRIPT_PATH = "%LOCALAPPDATA%\\note-reader-cosyvoice\\cosyvoice-wrapper.ps1";
var SPEED_PRESETS = [1, 1.25, 1.5, 2, 1.1, 1.2, 1.3, 1.4];
var KEYBOARD_SEEK_SECONDS = 5;
var LATEX_FORMULA_MAX_CHARS = 12;
var MATH_READING_LANGUAGES = ["english", "chinese", "skip"];
var SETTINGS_LANGUAGES = ["english", "chinese"];
var AUDIO_EXPORT_LOCATIONS = ["obsidian-attachment", "note-folder", "custom-folder"];
var AUDIO_EXPORT_SCOPES = ["entire", "selection", "from-selection"];
var CREDENTIAL_SOURCES = ["obsidian-secret", "key-file"];
var SPEECH_ENGINES = ["local-cosyvoice", "edge-tts", "azure-speech", "openrouter-tts"];
var AZURE_SPEECH_CLOUDS = ["public", "china"];
var REMOTE_TTS_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
var REMOTE_TTS_MAX_ATTEMPTS = 3;
var REMOTE_TTS_RETRY_DELAYS_MS = [750, 1500];
var REMOTE_TTS_RETRY_AFTER_MAX_MS = 1e4;
var REMOTE_TTS_RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 425, 429, 500, 502, 503, 504, 524, 529]);
var REMOTE_TTS_RETRYABLE_ERROR_CODES = /* @__PURE__ */ new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT"
]);
var RUNTIME_LOG_MAX_BYTES = 1024 * 1024;
var PDF_MAX_BYTES = 200 * 1024 * 1024;
var PDF_MAX_PAGES = 2e3;
var PDF_MAX_TEXT_CHARS = 5e6;
var OWNED_CACHE_FILE_PATTERN = /^\d{10,}-\d+-(?:\d+|export)\.(?:txt|wav|mp3)$/i;
var MICROSOFT_VOICE_PRESETS = [
  ["zh-CN-XiaoxiaoNeural", "Mandarin Chinese - Xiaoxiao (female, warm)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u5C0F\u6653\uFF08\u5973\u58F0\uFF0C\u6E29\u6696\uFF09"],
  ["zh-CN-XiaoyiNeural", "Mandarin Chinese - Xiaoyi (female, lively)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u5C0F\u827A\uFF08\u5973\u58F0\uFF0C\u6D3B\u6CFC\uFF09"],
  ["zh-CN-YunxiNeural", "Mandarin Chinese - Yunxi (male, lively)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u4E91\u5E0C\uFF08\u7537\u58F0\uFF0C\u6D3B\u6CFC\uFF09"],
  ["zh-CN-YunyangNeural", "Mandarin Chinese - Yunyang (male, professional)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u4E91\u626C\uFF08\u7537\u58F0\uFF0C\u4E13\u4E1A\uFF09"],
  ["zh-HK-HiuMaanNeural", "Cantonese Chinese - HiuMaan (female)", "\u4E2D\u6587\u7CA4\u8BED - \u6653\u66FC\uFF08\u5973\u58F0\uFF09"],
  ["zh-TW-HsiaoChenNeural", "Taiwan Chinese - HsiaoChen (female)", "\u4E2D\u6587\u53F0\u6E7E - \u6653\u81FB\uFF08\u5973\u58F0\uFF09"],
  ["en-US-JennyNeural", "English (US) - Jenny (female)", "\u7F8E\u5F0F\u82F1\u8BED - Jenny\uFF08\u5973\u58F0\uFF09"],
  ["en-US-GuyNeural", "English (US) - Guy (male)", "\u7F8E\u5F0F\u82F1\u8BED - Guy\uFF08\u7537\u58F0\uFF09"],
  ["en-US-AriaNeural", "English (US) - Aria (female)", "\u7F8E\u5F0F\u82F1\u8BED - Aria\uFF08\u5973\u58F0\uFF09"],
  ["en-GB-SoniaNeural", "English (UK) - Sonia (female)", "\u82F1\u5F0F\u82F1\u8BED - Sonia\uFF08\u5973\u58F0\uFF09"],
  ["en-GB-RyanNeural", "English (UK) - Ryan (male)", "\u82F1\u5F0F\u82F1\u8BED - Ryan\uFF08\u7537\u58F0\uFF09"]
];
var OPENROUTER_TTS_MODELS = [
  [
    "microsoft/mai-voice-2-flash",
    "en-US-Ethan:MAI-Voice-2-Flash",
    "Microsoft MAI-Voice-2 Flash - low latency, US English male default",
    "Microsoft MAI-Voice-2 Flash - \u4F4E\u5EF6\u8FDF\u3001\u9ED8\u8BA4\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0",
    "A low-latency Microsoft model for responsive playback. Ethan is the US English male default from Microsoft's MAI catalog. It and the additional Microsoft-published voices are compatibility presets because OpenRouter does not list them all. Microsoft currently publishes no UK English MAI voice.",
    "\u5FAE\u8F6F\u4F4E\u5EF6\u8FDF\u8BED\u97F3\u6A21\u578B\uFF0C\u9002\u5408\u5FEB\u901F\u5F00\u59CB\u64AD\u653E\u3002\u9ED8\u8BA4\u4F7F\u7528\u5FAE\u8F6F MAI \u5B98\u65B9\u76EE\u5F55\u4E2D\u7684\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0 Ethan\uFF1BEthan \u53CA\u5176\u4ED6\u5FAE\u8F6F\u5B98\u65B9\u97F3\u8272\u5C5E\u4E8E\u517C\u5BB9\u9884\u8BBE\uFF0C\u56E0\u4E3A OpenRouter \u672A\u5B8C\u6574\u5217\u51FA\u3002\u5FAE\u8F6F\u5F53\u524D\u6CA1\u6709\u53D1\u5E03\u82F1\u5F0F\u82F1\u8BED MAI \u97F3\u8272\u3002"
  ],
  [
    "microsoft/mai-voice-2",
    "en-US-Ethan:MAI-Voice-2",
    "Microsoft MAI-Voice-2 - expressive, US English male default",
    "Microsoft MAI-Voice-2 - \u8868\u73B0\u529B\u5F3A\u3001\u9ED8\u8BA4\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0",
    "An expressive Microsoft model for natural long-form narration. Ethan is the US English male default. The plugin also offers other Microsoft-published English and Mandarin ShortNames as compatibility presets even when OpenRouter metadata omits them. Microsoft currently publishes no UK English MAI voice.",
    "\u5FAE\u8F6F\u8868\u73B0\u529B\u8BED\u97F3\u6A21\u578B\uFF0C\u9002\u5408\u81EA\u7136\u957F\u6587\u53D9\u8FF0\u3002\u9ED8\u8BA4\u4F7F\u7528\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0 Ethan\uFF1B\u63D2\u4EF6\u8FD8\u63D0\u4F9B OpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\u3001\u4F46\u7531\u5FAE\u8F6F\u5B98\u65B9\u53D1\u5E03\u7684\u5176\u4ED6\u82F1\u6587\u548C\u666E\u901A\u8BDD ShortName \u4F5C\u4E3A\u517C\u5BB9\u9884\u8BBE\u3002\u5FAE\u8F6F\u5F53\u524D\u6CA1\u6709\u53D1\u5E03\u82F1\u5F0F\u82F1\u8BED MAI \u97F3\u8272\u3002"
  ],
  [
    "google/gemini-3.1-flash-tts-preview",
    "Charon",
    "Google Gemini 3.1 Flash TTS Preview - 30 multilingual voices",
    "Google Gemini 3.1 Flash TTS \u9884\u89C8\u7248 - 30 \u4E2A\u591A\u8BED\u8A00\u97F3\u8272",
    "OpenRouter lists 30 multilingual voices. Charon is the informative default for academic reading. Google describes voices by delivery style rather than fixed gender or US/UK accent, so the plugin does not make an unsupported male or accent claim.",
    "OpenRouter \u5217\u51FA 30 \u4E2A\u591A\u8BED\u8A00\u97F3\u8272\u3002\u9ED8\u8BA4\u4F7F\u7528\u66F4\u9002\u5408\u5B66\u672F\u6717\u8BFB\u7684\u4FE1\u606F\u578B Charon\u3002Google \u6309\u6717\u8BFB\u98CE\u683C\u800C\u975E\u56FA\u5B9A\u6027\u522B\u6216\u82F1\u7F8E\u53E3\u97F3\u63CF\u8FF0\u97F3\u8272\uFF0C\u56E0\u6B64\u63D2\u4EF6\u4E0D\u4F1A\u628A\u67D0\u4E2A\u97F3\u8272\u65E0\u4F9D\u636E\u5730\u6807\u4E3A\u7537\u58F0\u6216\u7279\u5B9A\u53E3\u97F3\u3002"
  ],
  [
    "hexgrad/kokoro-82m",
    "bm_george",
    "Kokoro 82M - lightweight, low cost, many preset voices",
    "Kokoro 82M - \u8F7B\u91CF\u3001\u4F4E\u6210\u672C\u3001\u9884\u8BBE\u97F3\u8272\u4E30\u5BCC",
    "OpenRouter lists 54 voices. The plugin provides 12 curated presets covering Chinese, US English, and UK English, with both female and male voices in every group. George remains the restrained academic-reading default.",
    "OpenRouter \u5217\u51FA 54 \u4E2A\u97F3\u8272\u3002\u672C\u63D2\u4EF6\u63D0\u4F9B 12 \u4E2A\u7CBE\u9009\u9884\u8BBE\uFF0C\u5B8C\u6574\u8986\u76D6\u4E2D\u6587\u3001\u7F8E\u5F0F\u82F1\u8BED\u548C\u82F1\u5F0F\u82F1\u8BED\u7684\u7537\u5973\u58F0\uFF1B\u9ED8\u8BA4 George \u7537\u58F0\u9002\u5408\u8F83\u514B\u5236\u7684\u5B66\u672F\u6717\u8BFB\u3002"
  ]
];
var OPENROUTER_TTS_PRESETS = [
  ["microsoft/mai-voice-2-flash", "en-US-Ethan:MAI-Voice-2-Flash", "Ethan (US English male; not listed in OpenRouter metadata)", "Ethan\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "en-US-Olivia:MAI-Voice-2-Flash", "Olivia (US English female; Microsoft compatibility preset)", "Olivia\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF1B\u5FAE\u8F6F\u517C\u5BB9\u9884\u8BBE\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Bo:MAI-Voice-2-Flash", "Bo (Mandarin male; not listed in OpenRouter metadata)", "Bo\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Wei:MAI-Voice-2-Flash", "Wei (Mandarin male; not listed in OpenRouter metadata)", "Wei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Lan:MAI-Voice-2-Flash", "Lan (Mandarin female; not listed in OpenRouter metadata)", "Lan\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Mei:MAI-Voice-2-Flash", "Mei (Mandarin female; not listed in OpenRouter metadata)", "Mei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "en-US-Harper:MAI-Voice-2", "Harper (US English female; OpenRouter-listed ID)", "Harper\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF1BOpenRouter \u5DF2\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "es-MX-Valeria:MAI-Voice-2", "Valeria (Mexican Spanish)", "Valeria\uFF08\u58A8\u897F\u54E5\u897F\u73ED\u7259\u8BED\uFF09"],
  ["microsoft/mai-voice-2-flash", "fr-FR-Soleil:MAI-Voice-2", "Soleil (French)", "Soleil\uFF08\u6CD5\u8BED\uFF09"],
  ["microsoft/mai-voice-2-flash", "de-DE-Klaus:MAI-Voice-2", "Klaus (German)", "Klaus\uFF08\u5FB7\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Ethan:MAI-Voice-2", "Ethan (US English male; not listed in OpenRouter metadata)", "Ethan\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Grant:MAI-Voice-2", "Grant (US English male; Microsoft compatibility preset)", "Grant\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1B\u5FAE\u8F6F\u517C\u5BB9\u9884\u8BBE\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Jasper:MAI-Voice-2", "Jasper (US English male; Microsoft compatibility preset)", "Jasper\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1B\u5FAE\u8F6F\u517C\u5BB9\u9884\u8BBE\uFF09"],
  ["microsoft/mai-voice-2", "zh-CN-Bo:MAI-Voice-2", "Bo (Mandarin male; not listed in OpenRouter metadata)", "Bo\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "zh-CN-Lan:MAI-Voice-2", "Lan (Mandarin female; not listed in OpenRouter metadata)", "Lan\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "zh-CN-Mei:MAI-Voice-2", "Mei (Mandarin female; not listed in OpenRouter metadata)", "Mei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Harper:MAI-Voice-2", "Harper (US English)", "Harper\uFF08\u7F8E\u5F0F\u82F1\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "es-MX-Valeria:MAI-Voice-2", "Valeria (Mexican Spanish)", "Valeria\uFF08\u58A8\u897F\u54E5\u897F\u73ED\u7259\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "fr-FR-Soleil:MAI-Voice-2", "Soleil (French)", "Soleil\uFF08\u6CD5\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "de-DE-Klaus:MAI-Voice-2", "Klaus (German)", "Klaus\uFF08\u5FB7\u8BED\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Charon", "Charon (multilingual, informative)", "Charon\uFF08\u591A\u8BED\u8A00\uFF0C\u4FE1\u606F\u578B\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Rasalgethi", "Rasalgethi (multilingual, informative)", "Rasalgethi\uFF08\u591A\u8BED\u8A00\uFF0C\u4FE1\u606F\u578B\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Sadaltager", "Sadaltager (multilingual, knowledgeable)", "Sadaltager\uFF08\u591A\u8BED\u8A00\uFF0C\u535A\u5B66\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Schedar", "Schedar (multilingual, even)", "Schedar\uFF08\u591A\u8BED\u8A00\uFF0C\u5E73\u7A33\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Iapetus", "Iapetus (multilingual, clear)", "Iapetus\uFF08\u591A\u8BED\u8A00\uFF0C\u6E05\u6670\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Erinome", "Erinome (multilingual, clear)", "Erinome\uFF08\u591A\u8BED\u8A00\uFF0C\u6E05\u6670\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Kore", "Kore (multilingual, firm)", "Kore\uFF08\u591A\u8BED\u8A00\uFF0C\u575A\u5B9A\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Orus", "Orus (multilingual, firm)", "Orus\uFF08\u591A\u8BED\u8A00\uFF0C\u575A\u5B9A\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Gacrux", "Gacrux (multilingual, mature)", "Gacrux\uFF08\u591A\u8BED\u8A00\uFF0C\u6210\u719F\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Sulafat", "Sulafat (multilingual, warm)", "Sulafat\uFF08\u591A\u8BED\u8A00\uFF0C\u6E29\u6696\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Vindemiatrix", "Vindemiatrix (multilingual, gentle)", "Vindemiatrix\uFF08\u591A\u8BED\u8A00\uFF0C\u6E29\u548C\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Aoede", "Aoede (multilingual, breezy)", "Aoede\uFF08\u591A\u8BED\u8A00\uFF0C\u8F7B\u5FEB\uFF09"],
  ["hexgrad/kokoro-82m", "zf_xiaoxiao", "Xiaoxiao (Chinese female)", "\u5C0F\u6653\uFF08\u4E2D\u6587\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "zf_xiaoyi", "Xiaoyi (Chinese female)", "\u5C0F\u827A\uFF08\u4E2D\u6587\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "zm_yunjian", "Yunjian (Chinese male)", "\u4E91\u5065\uFF08\u4E2D\u6587\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "zm_yunyang", "Yunyang (Chinese male)", "\u4E91\u626C\uFF08\u4E2D\u6587\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "af_heart", "Heart (US English female)", "Heart\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "af_bella", "Bella (US English female)", "Bella\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "am_michael", "Michael (US English male)", "Michael\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "am_fenrir", "Fenrir (US English male)", "Fenrir\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bf_emma", "Emma (UK English female)", "Emma\uFF08\u82F1\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bf_isabella", "Isabella (UK English female)", "Isabella\uFF08\u82F1\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bm_george", "George (UK English male)", "George\uFF08\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bm_fable", "Fable (UK English male)", "Fable\uFF08\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"]
];
var SETTINGS_UI_TEXT = {
  english: {
    settingsLanguageName: "Settings language",
    settingsLanguageDesc: "Choose the language used on this plugin settings page.",
    settingsLanguageEnglish: "English",
    settingsLanguageChinese: "\u4E2D\u6587",
    speechEngineName: "Speech engine",
    speechEngineDesc: "Choose local CosyVoice, Microsoft Edge online voice, Microsoft Azure Speech, or OpenRouter TTS. Online modes send text to their service providers.",
    speechEngineLocal: "Local CosyVoice",
    speechEngineEdge: "Microsoft Edge online voice",
    speechEngineAzure: "Microsoft Azure Speech",
    speechEngineOpenRouter: "OpenRouter TTS",
    localScriptName: "CosyVoice script",
    localScriptDesc: "PowerShell wrapper used in Local CosyVoice mode.",
    edgeConsentName: "Allow Edge online processing",
    edgeConsentDesc: "Required for Edge mode. When enabled, each text chunk is sent to Microsoft Edge TTS. Keep this off for private or sensitive notes.",
    edgeExecutableName: "Edge TTS executable",
    edgeExecutableDesc: "Use an absolute edge-tts.exe path to avoid PATH ambiguity. The default value resolves edge-tts from the Obsidian process PATH.",
    edgeCommonVoicesName: "Common Edge TTS voices",
    edgeCommonVoicesDesc: "Common Chinese, US English, and UK English online voices. Selecting one fills the Voice ID below.",
    customVoiceOption: "Custom voice ID",
    edgeVoiceName: "Edge TTS voice",
    edgeVoiceDesc: "Voice ID used by Edge mode. Keep a preset above or enter any ID returned by edge-tts --list-voices.",
    azureConsentName: "Allow Azure online processing",
    azureConsentDesc: "Required for Azure mode. Each text chunk is sent by HTTPS to the selected Azure Speech cloud and region. Keep this off for private notes unless that processing is acceptable.",
    credentialSourceName: "API key storage",
    credentialSourceDesc: "Use Obsidian SecretStorage on Obsidian 1.11.4 or later, or keep a one-line key file outside the vault as a compatibility fallback.",
    credentialSourceSecret: "Obsidian SecretStorage (recommended)",
    credentialSourceFile: "External one-line key file",
    secretStorageUnavailableName: "Obsidian SecretStorage unavailable",
    secretStorageUnavailableDesc: "Update Obsidian to 1.11.4 or later, or select the external key-file option.",
    azureCloudName: "Azure cloud",
    azureCloudDesc: "Select the cloud that owns the Speech resource and subscription key.",
    azurePublicCloud: "Azure public cloud",
    azureChinaCloud: "Azure China operated by 21Vianet",
    azureRegionName: "Azure Speech region",
    azureRegionDesc: "Region identifier from the Azure resource, for example eastasia, southeastasia, chinaeast2, or chinanorth3.",
    azureKeyFileName: "Azure Speech key file",
    azureKeyFileDesc: "Compatibility fallback: absolute path to a one-line Speech resource key file outside the Obsidian vault. The key itself is not saved in data.json.",
    azureSecretName: "Azure Speech secret",
    azureSecretDesc: "Select or create an Obsidian secret containing the Speech resource key. Only the secret name is saved in data.json.",
    azureCommonVoicesName: "Common Azure Speech voices",
    azureCommonVoicesDesc: "Common Chinese, US English, and UK English Azure voices. Selecting one fills the Voice ID below.",
    azureVoiceName: "Azure Speech voice",
    azureVoiceDesc: "Prebuilt Azure Speech voice ID, for example zh-CN-XiaoxiaoNeural or en-US-JennyNeural.",
    openRouterConsentName: "Allow OpenRouter online processing",
    openRouterConsentDesc: "Required for OpenRouter mode. This permits sending text to OpenRouter and an eligible upstream TTS provider, but never relaxes ZDR routing.",
    openRouterKeyFileName: "OpenRouter API key file",
    openRouterKeyFileDesc: "Compatibility fallback: absolute path to a one-line OpenRouter API key file outside the Obsidian vault. The key itself is not saved in data.json.",
    openRouterSecretName: "OpenRouter API secret",
    openRouterSecretDesc: "Select or create an Obsidian secret containing the OpenRouter API key. Only the secret name is saved in data.json.",
    openRouterModelsName: "ZDR-compatible OpenRouter TTS models",
    openRouterModelsDesc: "Built-in choices verified against OpenRouter's speech and ZDR model filter for this release. Availability can change; every request still enforces ZDR.",
    customModelOption: "Custom model ID",
    openRouterModelName: "OpenRouter TTS model",
    openRouterModelDesc: "Speech-output model ID. A custom model works only when OpenRouter has an eligible ZDR endpoint for it.",
    openRouterModelInfoName: "Selected model characteristics",
    customModelInfo: "Custom model: check its language, voice, and speech-output support in OpenRouter. The request fails if no ZDR endpoint is eligible.",
    openRouterVoicesName: "Common voices for this model",
    openRouterVoicesDesc: "Model-specific presets are listed. MAI-Voice-2 also includes Microsoft-published Mandarin IDs that OpenRouter may accept even when its supported_voices metadata omits them; availability can vary by endpoint.",
    openRouterVoiceName: "OpenRouter TTS voice",
    openRouterVoiceDesc: "Voice ID supported by the selected model. Voice catalogs differ between models.",
    openRouterPrivacyName: "OpenRouter privacy routing",
    openRouterPrivacyDesc: "Always enforced: provider.zdr is true and provider data collection is denied. The plugin never falls back to a non-ZDR endpoint. Keep OpenRouter account-level input/output logging and data sharing disabled for private content.",
    speedName: "Speed",
    speedDesc: "Speech speed passed to the selected speech engine.",
    chunkLimitsName: "Local chunk limits",
    chunkLimitsDesc: "Comma-separated character limits used by Local CosyVoice. Earlier chunks are shorter so playback starts sooner.",
    onlineChunkLimitsName: "Online chunk limits",
    onlineChunkLimitsDesc: "Used by Edge, Azure, and OpenRouter for notes and PDFs. The default 200,400,800 balances startup latency, continuity, and request count.",
    onlinePrefetchName: "Online synthesis prefetch",
    onlinePrefetchDesc: "How many future chunks an online engine may synthesize early. The default 1 improves continuity while limiting unused work to at most one chunk; choose 0 for strict on-demand synthesis.",
    onlinePrefetchNone: "0 - synthesize only when needed",
    onlinePrefetchOne: "1 - prefetch one chunk",
    audioExportLocationName: "Audio export save location",
    audioExportLocationDesc: "Choose where audio exported from notes or PDFs is saved. The confirmation dialog shows the selected scope and planned vault path before synthesis starts.",
    audioExportLocationAttachment: "Obsidian attachment folder (default)",
    audioExportLocationNote: "Same folder as the note",
    audioExportLocationCustom: "Custom folder in this vault",
    audioExportFolderName: "Custom audio folder",
    audioExportFolderDesc: "Enter a vault-relative folder such as Audio exports. Absolute paths and parent-directory segments are rejected.",
    audioExportFolderPlaceholder: "Audio exports",
    stripMarkdownName: "Strip Markdown",
    stripMarkdownDesc: "Remove frontmatter, links, headings, embeds, and common formatting before synthesis.",
    mathLanguageName: "Math reading language",
    mathLanguageDesc: "Choose how short LaTeX formulas are verbalized. Long formulas are skipped in all modes.",
    mathEnglish: "English",
    mathChinese: "Chinese",
    mathSkip: "Skip math",
    rememberPositionName: "Remember reading position",
    rememberPositionDesc: "Off by default. When enabled, the plugin stores only the file path, page or chunk number, a short text anchor, and a timestamp. It never stores the note or PDF body in reading history.",
    clearPositionsName: "Clear saved reading positions",
    clearPositionsDesc: "Remove all saved resume anchors without changing speech settings or API credentials.",
    clearPositionsButton: "Clear positions",
    positionsClearedNotice: "CosyVoice: saved reading positions cleared.",
    cleanupName: "Clean temporary audio",
    cleanupDesc: "Delete temporary text and audio after reading, and clear stale files when the plugin starts. Temporary data is stored outside the Obsidian vault.",
    diagnosticName: "Diagnostic logging",
    diagnosticDesc: "Off by default. When enabled, only bounded failure metadata is stored in the system temporary directory; note names and child-process output are excluded.",
    clearTemporaryName: "Clear temporary data",
    clearTemporaryDesc: "Stop reading and remove plugin-owned temporary text, audio, legacy cache files, and diagnostic logs now.",
    clearNowButton: "Clear now",
    restoreDefaultsName: "Restore default settings",
    restoreDefaultsDesc: "Reset every setting on this page to its default value and save immediately.",
    restoreDefaultsButton: "Restore defaults",
    settingsRestoredNotice: "CosyVoice: settings restored to defaults.",
    temporaryDataClearedNotice: "CosyVoice: temporary text, audio, and diagnostic logs cleared.",
    feedbackName: "Feedback and bug reports",
    feedbackDesc: "Open GitHub Issues to report a problem, request a feature, or follow existing reports. Do not include API keys or private note text.",
    feedbackButton: "Open GitHub Issues",
    feedbackTooltip: "Open the feedback page in your browser",
    commandsFooter: "Commands also include resume the current file, seek backward or forward 5 seconds, and move to the previous or next reading chunk."
  },
  chinese: {
    settingsLanguageName: "\u8BBE\u7F6E\u754C\u9762\u8BED\u8A00",
    settingsLanguageDesc: "\u9009\u62E9\u672C\u63D2\u4EF6\u8BBE\u7F6E\u9875\u9762\u4F7F\u7528\u7684\u8BED\u8A00\u3002",
    settingsLanguageEnglish: "English",
    settingsLanguageChinese: "\u4E2D\u6587",
    speechEngineName: "\u8BED\u97F3\u5F15\u64CE",
    speechEngineDesc: "\u9009\u62E9\u672C\u5730 CosyVoice\u3001Microsoft Edge \u5728\u7EBF\u8BED\u97F3\u3001Microsoft Azure Speech \u6216 OpenRouter TTS\u3002\u5728\u7EBF\u6A21\u5F0F\u4F1A\u628A\u6587\u672C\u53D1\u9001\u7ED9\u76F8\u5E94\u670D\u52A1\u5546\u3002",
    speechEngineLocal: "\u672C\u5730 CosyVoice",
    speechEngineEdge: "Microsoft Edge \u5728\u7EBF\u8BED\u97F3",
    speechEngineAzure: "Microsoft Azure Speech",
    speechEngineOpenRouter: "OpenRouter TTS",
    localScriptName: "CosyVoice \u811A\u672C",
    localScriptDesc: "\u672C\u5730 CosyVoice \u6A21\u5F0F\u4F7F\u7528\u7684 PowerShell \u5305\u88C5\u811A\u672C\u3002",
    edgeConsentName: "\u5141\u8BB8 Edge \u5728\u7EBF\u5904\u7406",
    edgeConsentDesc: "Edge \u6A21\u5F0F\u5FC5\u987B\u5F00\u542F\u3002\u5F00\u542F\u540E\uFF0C\u6BCF\u4E2A\u6587\u672C\u5206\u6BB5\u90FD\u4F1A\u53D1\u9001\u7ED9 Microsoft Edge TTS\u3002\u79C1\u5BC6\u6216\u654F\u611F\u7B14\u8BB0\u5EFA\u8BAE\u4FDD\u6301\u5173\u95ED\u3002",
    edgeExecutableName: "Edge TTS \u53EF\u6267\u884C\u6587\u4EF6",
    edgeExecutableDesc: "\u5EFA\u8BAE\u586B\u5199 edge-tts.exe \u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u907F\u514D PATH \u6307\u5411\u4E0D\u660E\u786E\u3002\u9ED8\u8BA4\u503C\u4ECE Obsidian \u8FDB\u7A0B\u7684 PATH \u4E2D\u67E5\u627E edge-tts\u3002",
    edgeCommonVoicesName: "\u5E38\u7528 Edge TTS \u97F3\u8272",
    edgeCommonVoicesDesc: "\u5E38\u7528\u4E2D\u6587\u3001\u7F8E\u5F0F\u82F1\u8BED\u548C\u82F1\u5F0F\u82F1\u8BED\u5728\u7EBF\u97F3\u8272\u3002\u9009\u62E9\u540E\u4F1A\u81EA\u52A8\u586B\u5199\u4E0B\u65B9\u7684\u97F3\u8272 ID\u3002",
    customVoiceOption: "\u81EA\u5B9A\u4E49\u97F3\u8272 ID",
    edgeVoiceName: "Edge TTS \u97F3\u8272",
    edgeVoiceDesc: "Edge \u6A21\u5F0F\u4F7F\u7528\u7684\u97F3\u8272 ID\u3002\u53EF\u4F7F\u7528\u4E0A\u65B9\u9884\u8BBE\uFF0C\u6216\u586B\u5199 edge-tts --list-voices \u8FD4\u56DE\u7684\u4EFB\u610F ID\u3002",
    azureConsentName: "\u5141\u8BB8 Azure \u5728\u7EBF\u5904\u7406",
    azureConsentDesc: "Azure \u6A21\u5F0F\u5FC5\u987B\u5F00\u542F\u3002\u6BCF\u4E2A\u6587\u672C\u5206\u6BB5\u4F1A\u901A\u8FC7 HTTPS \u53D1\u9001\u5230\u6240\u9009 Azure Speech \u4E91\u73AF\u5883\u548C\u533A\u57DF\u3002\u9664\u975E\u53EF\u4EE5\u63A5\u53D7\u8BE5\u5904\u7406\uFF0C\u5426\u5219\u79C1\u5BC6\u7B14\u8BB0\u5E94\u4FDD\u6301\u5173\u95ED\u3002",
    credentialSourceName: "API \u5BC6\u94A5\u5B58\u50A8\u65B9\u5F0F",
    credentialSourceDesc: "Obsidian 1.11.4 \u53CA\u4EE5\u4E0A\u7248\u672C\u5EFA\u8BAE\u4F7F\u7528 SecretStorage\uFF1B\u4E5F\u53EF\u4EE5\u7EE7\u7EED\u4F7F\u7528 Obsidian \u5E93\u5916\u7684\u5355\u884C\u5BC6\u94A5\u6587\u4EF6\u4F5C\u4E3A\u517C\u5BB9\u56DE\u9000\u3002",
    credentialSourceSecret: "Obsidian SecretStorage\uFF08\u63A8\u8350\uFF09",
    credentialSourceFile: "\u5E93\u5916\u5355\u884C\u5BC6\u94A5\u6587\u4EF6",
    secretStorageUnavailableName: "Obsidian SecretStorage \u4E0D\u53EF\u7528",
    secretStorageUnavailableDesc: "\u8BF7\u628A Obsidian \u66F4\u65B0\u5230 1.11.4 \u6216\u66F4\u9AD8\u7248\u672C\uFF0C\u6216\u6539\u9009\u5E93\u5916\u5BC6\u94A5\u6587\u4EF6\u3002",
    azureCloudName: "Azure \u4E91\u73AF\u5883",
    azureCloudDesc: "\u9009\u62E9 Speech \u8D44\u6E90\u548C\u8BA2\u9605\u5BC6\u94A5\u6240\u5C5E\u7684\u4E91\u73AF\u5883\u3002",
    azurePublicCloud: "Azure \u516C\u6709\u4E91",
    azureChinaCloud: "\u7531\u4E16\u7EAA\u4E92\u8054\u8FD0\u8425\u7684 Azure \u4E2D\u56FD\u533A",
    azureRegionName: "Azure Speech \u533A\u57DF",
    azureRegionDesc: "Azure \u8D44\u6E90\u4E2D\u7684\u533A\u57DF\u6807\u8BC6\uFF0C\u4F8B\u5982 eastasia\u3001southeastasia\u3001chinaeast2 \u6216 chinanorth3\u3002",
    azureKeyFileName: "Azure Speech \u5BC6\u94A5\u6587\u4EF6",
    azureKeyFileDesc: "\u517C\u5BB9\u56DE\u9000\u65B9\u5F0F\uFF1A\u586B\u5199 Obsidian \u5E93\u5916\u5355\u884C Speech \u8D44\u6E90\u5BC6\u94A5\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\u3002\u5BC6\u94A5\u672C\u8EAB\u4E0D\u4F1A\u4FDD\u5B58\u5230 data.json\u3002",
    azureSecretName: "Azure Speech \u79D8\u5BC6",
    azureSecretDesc: "\u9009\u62E9\u6216\u521B\u5EFA\u4E00\u4E2A\u4FDD\u5B58 Speech \u8D44\u6E90\u5BC6\u94A5\u7684 Obsidian \u79D8\u5BC6\u3002data.json \u53EA\u4FDD\u5B58\u79D8\u5BC6\u540D\u79F0\uFF0C\u4E0D\u4FDD\u5B58\u5BC6\u94A5\u503C\u3002",
    azureCommonVoicesName: "\u5E38\u7528 Azure Speech \u97F3\u8272",
    azureCommonVoicesDesc: "\u5E38\u7528\u4E2D\u6587\u3001\u7F8E\u5F0F\u82F1\u8BED\u548C\u82F1\u5F0F\u82F1\u8BED Azure \u97F3\u8272\u3002\u9009\u62E9\u540E\u4F1A\u81EA\u52A8\u586B\u5199\u4E0B\u65B9\u7684\u97F3\u8272 ID\u3002",
    azureVoiceName: "Azure Speech \u97F3\u8272",
    azureVoiceDesc: "Azure Speech \u9884\u6784\u5EFA\u97F3\u8272 ID\uFF0C\u4F8B\u5982 zh-CN-XiaoxiaoNeural \u6216 en-US-JennyNeural\u3002",
    openRouterConsentName: "\u5141\u8BB8 OpenRouter \u5728\u7EBF\u5904\u7406",
    openRouterConsentDesc: "OpenRouter \u6A21\u5F0F\u5FC5\u987B\u5F00\u542F\u3002\u5B83\u53EA\u8868\u793A\u5141\u8BB8\u628A\u6587\u672C\u53D1\u9001\u7ED9 OpenRouter \u53CA\u7B26\u5408\u6761\u4EF6\u7684\u4E0A\u6E38 TTS \u670D\u52A1\u5546\uFF0C\u4E0D\u4F1A\u653E\u5BBD ZDR \u8DEF\u7531\u3002",
    openRouterKeyFileName: "OpenRouter API \u5BC6\u94A5\u6587\u4EF6",
    openRouterKeyFileDesc: "\u517C\u5BB9\u56DE\u9000\u65B9\u5F0F\uFF1A\u586B\u5199 Obsidian \u5E93\u5916\u5355\u884C OpenRouter API \u5BC6\u94A5\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\u3002\u5BC6\u94A5\u672C\u8EAB\u4E0D\u4F1A\u4FDD\u5B58\u5230 data.json\u3002",
    openRouterSecretName: "OpenRouter API \u79D8\u5BC6",
    openRouterSecretDesc: "\u9009\u62E9\u6216\u521B\u5EFA\u4E00\u4E2A\u4FDD\u5B58 OpenRouter API \u5BC6\u94A5\u7684 Obsidian \u79D8\u5BC6\u3002data.json \u53EA\u4FDD\u5B58\u79D8\u5BC6\u540D\u79F0\uFF0C\u4E0D\u4FDD\u5B58\u5BC6\u94A5\u503C\u3002",
    openRouterModelsName: "\u652F\u6301 ZDR \u7684 OpenRouter TTS \u6A21\u578B",
    openRouterModelsDesc: "\u5185\u7F6E\u9009\u9879\u5DF2\u6309\u672C\u7248\u672C\u53D1\u5E03\u65F6 OpenRouter \u7684\u8BED\u97F3\u4E0E ZDR \u6A21\u578B\u8FC7\u6EE4\u7ED3\u679C\u6838\u5BF9\u3002\u53EF\u7528\u6027\u53EF\u80FD\u53D8\u5316\uFF0C\u4F46\u6BCF\u6B21\u8BF7\u6C42\u4ECD\u4F1A\u5F3A\u5236\u4F7F\u7528 ZDR\u3002",
    customModelOption: "\u81EA\u5B9A\u4E49\u6A21\u578B ID",
    openRouterModelName: "OpenRouter TTS \u6A21\u578B",
    openRouterModelDesc: "\u652F\u6301\u8BED\u97F3\u8F93\u51FA\u7684\u6A21\u578B ID\u3002\u81EA\u5B9A\u4E49\u6A21\u578B\u53EA\u6709\u5728 OpenRouter \u5B58\u5728\u7B26\u5408\u6761\u4EF6\u7684 ZDR \u7AEF\u70B9\u65F6\u624D\u80FD\u4F7F\u7528\u3002",
    openRouterModelInfoName: "\u6240\u9009\u6A21\u578B\u7279\u70B9",
    customModelInfo: "\u81EA\u5B9A\u4E49\u6A21\u578B\uFF1A\u8BF7\u5728 OpenRouter \u6838\u5BF9\u5176\u8BED\u8A00\u3001\u97F3\u8272\u548C\u8BED\u97F3\u8F93\u51FA\u80FD\u529B\uFF1B\u5982\u679C\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684 ZDR \u7AEF\u70B9\uFF0C\u8BF7\u6C42\u4F1A\u5931\u8D25\u3002",
    openRouterVoicesName: "\u8BE5\u6A21\u578B\u7684\u5E38\u7528\u97F3\u8272",
    openRouterVoicesDesc: "\u8FD9\u91CC\u53EA\u5217\u51FA\u4E0E\u6240\u9009\u6A21\u578B\u5BF9\u5E94\u7684\u9884\u8BBE\u3002MAI-Voice-2 \u8FD8\u52A0\u5165\u4E86\u5FAE\u8F6F\u5B98\u65B9\u53D1\u5E03\u3001\u4F46 OpenRouter supported_voices \u5143\u6570\u636E\u53EF\u80FD\u9057\u6F0F\u7684\u666E\u901A\u8BDD\u97F3\u8272\uFF1B\u5B9E\u9645\u53EF\u7528\u6027\u53EF\u80FD\u968F\u7AEF\u70B9\u53D8\u5316\u3002",
    openRouterVoiceName: "OpenRouter TTS \u97F3\u8272",
    openRouterVoiceDesc: "\u6240\u9009\u6A21\u578B\u652F\u6301\u7684\u97F3\u8272 ID\u3002\u4E0D\u540C\u6A21\u578B\u7684\u97F3\u8272\u76EE\u5F55\u5E76\u4E0D\u76F8\u540C\u3002",
    openRouterPrivacyName: "OpenRouter \u9690\u79C1\u8DEF\u7531",
    openRouterPrivacyDesc: "\u59CB\u7EC8\u5F3A\u5236\u6267\u884C\uFF1Aprovider.zdr \u4E3A true\uFF0C\u5E76\u62D2\u7EDD\u4F9B\u5E94\u5546\u6536\u96C6\u6570\u636E\u3002\u63D2\u4EF6\u4E0D\u4F1A\u964D\u7EA7\u5230\u975E ZDR \u7AEF\u70B9\u3002\u6717\u8BFB\u79C1\u5BC6\u5185\u5BB9\u65F6\uFF0C\u8FD8\u5E94\u5173\u95ED OpenRouter \u8D26\u6237\u7EA7\u8F93\u5165\u8F93\u51FA\u65E5\u5FD7\u548C\u6570\u636E\u5171\u4EAB\u3002",
    speedName: "\u8BED\u901F",
    speedDesc: "\u4F20\u9012\u7ED9\u5F53\u524D\u8BED\u97F3\u5F15\u64CE\u7684\u6717\u8BFB\u901F\u5EA6\u3002",
    chunkLimitsName: "\u672C\u5730\u5206\u6BB5\u957F\u5EA6",
    chunkLimitsDesc: "\u672C\u5730 CosyVoice \u4F7F\u7528\u7684\u5B57\u7B26\u6570\u4E0A\u9650\uFF0C\u4EE5\u82F1\u6587\u9017\u53F7\u5206\u9694\u3002\u524D\u51E0\u4E2A\u5206\u6BB5\u8F83\u77ED\uFF0C\u53EF\u66F4\u5FEB\u5F00\u59CB\u64AD\u653E\u3002",
    onlineChunkLimitsName: "\u5728\u7EBF\u5206\u6BB5\u957F\u5EA6",
    onlineChunkLimitsDesc: "Edge\u3001Azure \u548C OpenRouter \u6717\u8BFB\u7B14\u8BB0\u6216 PDF \u65F6\u4F7F\u7528\u3002\u9ED8\u8BA4 200,400,800\uFF0C\u7528\u4E8E\u5E73\u8861\u542F\u52A8\u901F\u5EA6\u3001\u8FDE\u8D2F\u6027\u548C\u8BF7\u6C42\u6B21\u6570\u3002",
    onlinePrefetchName: "\u5728\u7EBF\u5408\u6210\u9884\u53D6",
    onlinePrefetchDesc: "\u5141\u8BB8\u5728\u7EBF\u5F15\u64CE\u63D0\u524D\u5408\u6210\u7684\u540E\u7EED\u5206\u6BB5\u6570\u91CF\u3002\u9ED8\u8BA4 1 \u53EF\u6539\u5584\u8854\u63A5\uFF0C\u5E76\u628A\u53EF\u80FD\u672A\u4F7F\u7528\u7684\u63D0\u524D\u5408\u6210\u9650\u5236\u4E3A\u6700\u591A\u4E00\u6BB5\uFF1B\u9009\u62E9 0 \u53EF\u4E25\u683C\u6309\u9700\u5408\u6210\u3002",
    onlinePrefetchNone: "0 - \u9700\u8981\u65F6\u624D\u5408\u6210",
    onlinePrefetchOne: "1 - \u63D0\u524D\u5408\u6210\u4E00\u6BB5",
    audioExportLocationName: "\u97F3\u9891\u5BFC\u51FA\u4FDD\u5B58\u4F4D\u7F6E",
    audioExportLocationDesc: "\u9009\u62E9\u4ECE\u7B14\u8BB0\u6216 PDF \u5BFC\u51FA\u7684\u97F3\u9891\u4FDD\u5B58\u4F4D\u7F6E\u3002\u5F00\u59CB\u5408\u6210\u524D\uFF0C\u786E\u8BA4\u7A97\u53E3\u4F1A\u663E\u793A\u6240\u9009\u8303\u56F4\u548C\u9884\u8BA1\u7684\u5E93\u5185\u8DEF\u5F84\u3002",
    audioExportLocationAttachment: "Obsidian \u9644\u4EF6\u76EE\u5F55\uFF08\u9ED8\u8BA4\uFF09",
    audioExportLocationNote: "\u4E0E\u539F\u7B14\u8BB0\u76F8\u540C\u7684\u76EE\u5F55",
    audioExportLocationCustom: "\u672C\u5E93\u5185\u7684\u81EA\u5B9A\u4E49\u76EE\u5F55",
    audioExportFolderName: "\u81EA\u5B9A\u4E49\u97F3\u9891\u76EE\u5F55",
    audioExportFolderDesc: "\u586B\u5199\u5E93\u5185\u76F8\u5BF9\u76EE\u5F55\uFF0C\u4F8B\u5982\u201C\u5BFC\u51FA\u97F3\u9891\u201D\u3002\u4E0D\u5141\u8BB8\u7EDD\u5BF9\u8DEF\u5F84\u6216\u8FD4\u56DE\u4E0A\u7EA7\u76EE\u5F55\u7684\u8DEF\u5F84\u3002",
    audioExportFolderPlaceholder: "\u5BFC\u51FA\u97F3\u9891",
    stripMarkdownName: "\u79FB\u9664 Markdown \u683C\u5F0F",
    stripMarkdownDesc: "\u5408\u6210\u524D\u79FB\u9664 frontmatter\u3001\u94FE\u63A5\u3001\u6807\u9898\u3001\u5D4C\u5165\u5185\u5BB9\u548C\u5E38\u89C1\u683C\u5F0F\u6807\u8BB0\u3002",
    mathLanguageName: "\u6570\u5B66\u516C\u5F0F\u6717\u8BFB\u8BED\u8A00",
    mathLanguageDesc: "\u9009\u62E9\u77ED LaTeX \u516C\u5F0F\u7684\u6717\u8BFB\u65B9\u5F0F\u3002\u6240\u6709\u6A21\u5F0F\u90FD\u4F1A\u8DF3\u8FC7\u8FC7\u957F\u516C\u5F0F\u3002",
    mathEnglish: "\u82F1\u8BED",
    mathChinese: "\u4E2D\u6587",
    mathSkip: "\u8DF3\u8FC7\u516C\u5F0F",
    rememberPositionName: "\u8BB0\u4F4F\u6717\u8BFB\u4F4D\u7F6E",
    rememberPositionDesc: "\u9ED8\u8BA4\u5173\u95ED\u3002\u5F00\u542F\u540E\u53EA\u4FDD\u5B58\u6587\u4EF6\u8DEF\u5F84\u3001\u9875\u7801\u6216\u5206\u6BB5\u5E8F\u53F7\u3001\u77ED\u6587\u672C\u951A\u70B9\u548C\u65F6\u95F4\uFF0C\u4E0D\u4F1A\u628A\u7B14\u8BB0\u6216 PDF \u6B63\u6587\u4FDD\u5B58\u5230\u6717\u8BFB\u5386\u53F2\u4E2D\u3002",
    clearPositionsName: "\u6E05\u9664\u5DF2\u4FDD\u5B58\u7684\u6717\u8BFB\u4F4D\u7F6E",
    clearPositionsDesc: "\u5220\u9664\u5168\u90E8\u7EE7\u7EED\u6717\u8BFB\u951A\u70B9\uFF0C\u4E0D\u6539\u53D8\u8BED\u97F3\u8BBE\u7F6E\u6216 API \u51ED\u636E\u3002",
    clearPositionsButton: "\u6E05\u9664\u4F4D\u7F6E",
    positionsClearedNotice: "CosyVoice\uFF1A\u5DF2\u6E05\u9664\u4FDD\u5B58\u7684\u6717\u8BFB\u4F4D\u7F6E\u3002",
    cleanupName: "\u6E05\u7406\u4E34\u65F6\u97F3\u9891",
    cleanupDesc: "\u6717\u8BFB\u540E\u5220\u9664\u4E34\u65F6\u6587\u672C\u548C\u97F3\u9891\uFF0C\u5E76\u5728\u63D2\u4EF6\u542F\u52A8\u65F6\u6E05\u7406\u8FC7\u671F\u6587\u4EF6\u3002\u4E34\u65F6\u6570\u636E\u4FDD\u5B58\u5728 Obsidian \u5E93\u5916\u3002",
    diagnosticName: "\u8BCA\u65AD\u65E5\u5FD7",
    diagnosticDesc: "\u9ED8\u8BA4\u5173\u95ED\u3002\u5F00\u542F\u540E\u53EA\u5728\u7CFB\u7EDF\u4E34\u65F6\u76EE\u5F55\u4FDD\u5B58\u6709\u5927\u5C0F\u9650\u5236\u7684\u5931\u8D25\u5143\u6570\u636E\uFF0C\u4E0D\u5305\u542B\u7B14\u8BB0\u540D\u79F0\u6216\u5B50\u8FDB\u7A0B\u8F93\u51FA\u3002",
    clearTemporaryName: "\u6E05\u9664\u4E34\u65F6\u6570\u636E",
    clearTemporaryDesc: "\u7ACB\u5373\u505C\u6B62\u6717\u8BFB\uFF0C\u5E76\u5220\u9664\u672C\u63D2\u4EF6\u4EA7\u751F\u7684\u4E34\u65F6\u6587\u672C\u3001\u97F3\u9891\u3001\u65E7\u7F13\u5B58\u6587\u4EF6\u548C\u8BCA\u65AD\u65E5\u5FD7\u3002",
    clearNowButton: "\u7ACB\u5373\u6E05\u9664",
    restoreDefaultsName: "\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E",
    restoreDefaultsDesc: "\u628A\u672C\u9875\u9762\u7684\u6240\u6709\u8BBE\u7F6E\u6062\u590D\u4E3A\u9ED8\u8BA4\u503C\u5E76\u7ACB\u5373\u4FDD\u5B58\u3002",
    restoreDefaultsButton: "\u6062\u590D\u9ED8\u8BA4\u503C",
    settingsRestoredNotice: "CosyVoice\uFF1A\u8BBE\u7F6E\u5DF2\u6062\u590D\u4E3A\u9ED8\u8BA4\u503C\u3002",
    temporaryDataClearedNotice: "CosyVoice\uFF1A\u4E34\u65F6\u6587\u672C\u3001\u97F3\u9891\u548C\u8BCA\u65AD\u65E5\u5FD7\u5DF2\u6E05\u9664\u3002",
    feedbackName: "\u53CD\u9988\u4E0E\u95EE\u9898\u62A5\u544A",
    feedbackDesc: "\u6253\u5F00 GitHub Issues \u62A5\u544A\u95EE\u9898\u3001\u63D0\u51FA\u529F\u80FD\u5EFA\u8BAE\u6216\u67E5\u770B\u73B0\u6709\u53CD\u9988\u3002\u8BF7\u52FF\u63D0\u4EA4 API \u5BC6\u94A5\u6216\u79C1\u5BC6\u7B14\u8BB0\u6B63\u6587\u3002",
    feedbackButton: "\u6253\u5F00 GitHub Issues",
    feedbackTooltip: "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u53CD\u9988\u9875\u9762",
    commandsFooter: "\u547D\u4EE4\u8FD8\u5305\u62EC\u4ECE\u5F53\u524D\u6587\u4EF6\u4FDD\u5B58\u7684\u4F4D\u7F6E\u7EE7\u7EED\u6717\u8BFB\u3001\u540E\u9000\u6216\u524D\u8FDB 5 \u79D2\uFF0C\u4EE5\u53CA\u8DF3\u5230\u4E0A\u4E00\u4E2A\u6216\u4E0B\u4E00\u4E2A\u6717\u8BFB\u5206\u6BB5\u3002"
  }
};
var LATEX_COMMAND_REPLACEMENTS = {
  chinese: [
    ["\\rightarrow", "\u5230"],
    ["\\leftarrow", "\u5230"],
    ["\\approx", "\u7EA6\u7B49\u4E8E"],
    ["\\times", "\u4E58\u4EE5"],
    ["\\cdot", "\u70B9\u4E58"],
    ["\\leq", "\u5C0F\u4E8E\u7B49\u4E8E"],
    ["\\geq", "\u5927\u4E8E\u7B49\u4E8E"],
    ["\\neq", "\u4E0D\u7B49\u4E8E"],
    ["\\ne", "\u4E0D\u7B49\u4E8E"],
    ["\\le", "\u5C0F\u4E8E\u7B49\u4E8E"],
    ["\\ge", "\u5927\u4E8E\u7B49\u4E8E"],
    ["\\pm", "\u6B63\u8D1F"],
    ["\\mp", "\u8D1F\u6B63"],
    ["\\infty", "\u65E0\u7A77"],
    ["\\alpha", "alpha"],
    ["\\beta", "beta"],
    ["\\gamma", "gamma"],
    ["\\delta", "delta"],
    ["\\epsilon", "epsilon"],
    ["\\theta", "theta"],
    ["\\lambda", "lambda"],
    ["\\mu", "mu"],
    ["\\pi", "pi"],
    ["\\sigma", "sigma"],
    ["\\omega", "omega"],
    ["\\sum", "\u6C42\u548C"],
    ["\\int", "\u79EF\u5206"],
    ["\\to", "\u5230"],
    ["\\left", ""],
    ["\\right", ""]
  ],
  english: [
    ["\\rightarrow", "to"],
    ["\\leftarrow", "from"],
    ["\\approx", "approximately equal to"],
    ["\\times", "times"],
    ["\\cdot", "dot"],
    ["\\leq", "less than or equal to"],
    ["\\geq", "greater than or equal to"],
    ["\\neq", "not equal to"],
    ["\\ne", "not equal to"],
    ["\\le", "less than or equal to"],
    ["\\ge", "greater than or equal to"],
    ["\\pm", "plus or minus"],
    ["\\mp", "minus or plus"],
    ["\\infty", "infinity"],
    ["\\alpha", "alpha"],
    ["\\beta", "beta"],
    ["\\gamma", "gamma"],
    ["\\delta", "delta"],
    ["\\epsilon", "epsilon"],
    ["\\theta", "theta"],
    ["\\lambda", "lambda"],
    ["\\mu", "mu"],
    ["\\pi", "pi"],
    ["\\sigma", "sigma"],
    ["\\omega", "omega"],
    ["\\sum", "sum"],
    ["\\int", "integral"],
    ["\\to", "to"],
    ["\\left", ""],
    ["\\right", ""]
  ]
};
var DEFAULT_SETTINGS = {
  settingsLanguage: "english",
  scriptPath: resolveDefaultScriptPath(),
  speechEngine: "local-cosyvoice",
  audioExportLocation: "obsidian-attachment",
  audioExportFolder: "",
  edgeTtsConsent: false,
  edgeTtsExecutable: DEFAULT_EDGE_TTS_EXECUTABLE,
  edgeTtsVoice: DEFAULT_EDGE_TTS_VOICE,
  azureSpeechCloud: "public",
  azureSpeechConsent: false,
  azureSpeechCredentialSource: "obsidian-secret",
  azureSpeechKeyPath: "",
  azureSpeechRegion: "",
  azureSpeechSecretName: "",
  azureSpeechVoice: DEFAULT_AZURE_SPEECH_VOICE,
  openRouterConsent: false,
  openRouterCredentialSource: "obsidian-secret",
  openRouterKeyPath: "",
  openRouterModel: DEFAULT_OPENROUTER_TTS_MODEL,
  openRouterSecretName: "",
  openRouterVoice: DEFAULT_OPENROUTER_TTS_VOICE,
  speed: 1,
  stripMarkdown: true,
  cleanupCache: true,
  diagnosticLogging: false,
  mathReadingLanguage: DEFAULT_MATH_READING_LANGUAGE,
  chunkLimits: DEFAULT_CHUNK_LIMITS.join(","),
  onlineChunkLimits: DEFAULT_ONLINE_CHUNK_LIMITS.join(","),
  onlinePrefetchChunks: 1,
  rememberReadingPosition: false,
  readingPositions: {}
};
function normalizeLineBreaks(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}
function isPdfFile(file) {
  return Boolean(file && String(file.extension || "").toLowerCase() === "pdf");
}
function getPdfFileIdentity(file) {
  return String(file && (file.path || file.name) || "");
}
function getFileMtime(file) {
  return Math.max(0, Math.floor(Number(file && file.stat && file.stat.mtime) || 0));
}
function getPdfPageInfoFromNode(node, root) {
  let element = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (element) {
    const getAttribute = typeof element.getAttribute === "function" ? (name) => element.getAttribute(name) : () => null;
    const pageNumberValue = getAttribute("data-page-number");
    const pageNumber = Number(pageNumberValue);
    if (pageNumberValue !== null && Number.isInteger(pageNumber) && pageNumber >= 1) {
      return { element, pageNumber };
    }
    const pageIndexValue = getAttribute("data-page-index");
    const pageIndex = Number(pageIndexValue);
    if (pageIndexValue !== null && Number.isInteger(pageIndex) && pageIndex >= 0) {
      return { element, pageNumber: pageIndex + 1 };
    }
    const identity = `${getAttribute("id") || ""} ${getAttribute("aria-label") || ""}`;
    const identityMatch = /(?:pageContainer|page[-_]|\bpage\s+)(\d+)\b/i.exec(identity);
    if (identityMatch) {
      return { element, pageNumber: Number(identityMatch[1]) };
    }
    if (element === root) {
      break;
    }
    element = element.parentElement;
  }
  return null;
}
function getPdfPageNumberFromNode(node, root) {
  const pageInfo = getPdfPageInfoFromNode(node, root);
  return pageInfo ? pageInfo.pageNumber : null;
}
function getFirstRangeRect(range) {
  if (!range) {
    return null;
  }
  try {
    if (typeof range.getClientRects === "function") {
      const rects = range.getClientRects();
      if (rects && rects.length) {
        return rects[0];
      }
    }
    if (typeof range.getBoundingClientRect === "function") {
      return range.getBoundingClientRect();
    }
  } catch (error) {
    return null;
  }
  return null;
}
function getPdfSelectionPosition(range, pageElement) {
  if (!range || !pageElement || typeof pageElement.getBoundingClientRect !== "function") {
    return null;
  }
  let pageRect;
  try {
    pageRect = pageElement.getBoundingClientRect();
  } catch (error) {
    return null;
  }
  const pageLeft = Number(pageRect && pageRect.left);
  const pageTop = Number(pageRect && pageRect.top);
  const pageWidth = Number(pageRect && pageRect.width);
  const pageHeight = Number(pageRect && pageRect.height);
  if (![pageLeft, pageTop, pageWidth, pageHeight].every(Number.isFinite) || pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }
  let selectionRect = null;
  if (typeof range.cloneRange === "function") {
    try {
      const startRange = range.cloneRange();
      if (startRange && typeof startRange.collapse === "function") {
        startRange.collapse(true);
        selectionRect = getFirstRangeRect(startRange);
      }
    } catch (error) {
      selectionRect = null;
    }
  }
  const isRectInsidePage = (rect) => {
    const left = Number(rect && rect.left);
    const top = Number(rect && rect.top);
    const width = Math.max(0, Number(rect && rect.width) || 0);
    const height = Math.max(0, Number(rect && rect.height) || 0);
    return Number.isFinite(left) && Number.isFinite(top) && (width > 0 || height > 0) && left >= pageLeft - 2 && left <= pageLeft + pageWidth + 2 && top >= pageTop - 2 && top <= pageTop + pageHeight + 2;
  };
  if (!isRectInsidePage(selectionRect)) {
    selectionRect = getFirstRangeRect(range);
  }
  if (!isRectInsidePage(selectionRect)) {
    return null;
  }
  const selectionLeft = Number(selectionRect.left);
  const selectionTop = Number(selectionRect.top);
  const selectionHeight = Math.max(0, Number(selectionRect.height) || 0);
  const clampRatio = (value) => Math.max(0, Math.min(1, value));
  return {
    xRatio: clampRatio((selectionLeft - pageLeft) / pageWidth),
    yRatio: clampRatio((selectionTop + selectionHeight / 2 - pageTop) / pageHeight)
  };
}
function getPdfSelectionContext(selection, leaves, fallbackFile = null, capturedAt = Date.now()) {
  if (!selection || typeof selection.toString !== "function" || typeof selection.getRangeAt !== "function") {
    return null;
  }
  const selectedText = selection.toString().trim();
  if (!selectedText || Number(selection.rangeCount) < 1) {
    return null;
  }
  let range;
  try {
    range = selection.getRangeAt(0);
  } catch (error) {
    return null;
  }
  const startNode = range && range.startContainer;
  if (!startNode) {
    return null;
  }
  for (const leaf of Array.isArray(leaves) ? leaves : []) {
    const view = leaf && leaf.view;
    const root = view && (view.containerEl || view.contentEl);
    if (!root || typeof root.contains !== "function" || !root.contains(startNode)) {
      continue;
    }
    const file = isPdfFile(view.file) ? view.file : fallbackFile;
    if (!isPdfFile(file)) {
      continue;
    }
    const pageInfo = getPdfPageInfoFromNode(startNode, root);
    if (!pageInfo) {
      continue;
    }
    const selectionPosition = getPdfSelectionPosition(range, pageInfo.element);
    return {
      capturedAt: Number(capturedAt) || Date.now(),
      filePath: getPdfFileIdentity(file),
      pageNumber: pageInfo.pageNumber,
      selectedText: selectedText.slice(0, 2e3),
      ...selectionPosition ? { selectionPosition } : {}
    };
  }
  return null;
}
function normalizePdfSelectionText(text) {
  return normalizeLineBreaks(text).normalize("NFKC").replace(/\u00ad/g, "").replace(/([A-Za-z])-\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").trim();
}
function createNormalizedPdfLayoutMap(layout) {
  const sourceLines = layout && Array.isArray(layout.lines) ? layout.lines : [];
  const lines = [];
  let text = "";
  for (const sourceLine of sourceLines) {
    const lineText = normalizePdfSelectionText(sourceLine && sourceLine.text);
    if (!lineText) {
      continue;
    }
    let start = 0;
    if (text) {
      if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(lineText)) {
        text = text.slice(0, -1);
        start = text.length;
      } else {
        text += " ";
        start = text.length;
      }
    }
    text += lineText;
    lines.push({
      ...sourceLine,
      normalizedEnd: text.length,
      normalizedStart: start
    });
  }
  return { lines, text };
}
function getPdfSpatialLineAnchor(pageText, layout, selectionPosition) {
  const xRatio = Number(selectionPosition && selectionPosition.xRatio);
  const yRatio = Number(selectionPosition && selectionPosition.yRatio);
  const pageWidth = Number(layout && layout.pageWidth);
  const pageHeight = Number(layout && layout.pageHeight);
  if (![xRatio, yRatio, pageWidth, pageHeight].every(Number.isFinite) || xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1 || pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }
  const mapped = createNormalizedPdfLayoutMap(layout);
  if (!mapped.lines.length || mapped.text !== pageText) {
    return null;
  }
  const targetX = xRatio * pageWidth;
  const targetY = (1 - yRatio) * pageHeight;
  let best = null;
  for (const line of mapped.lines) {
    const xMin = Number(line.xMin);
    const xMax = Number(line.xMax);
    const y = Number(line.y);
    if (![xMin, xMax, y].every(Number.isFinite)) {
      continue;
    }
    const horizontalDistance = targetX < xMin ? xMin - targetX : targetX > xMax ? targetX - xMax : 0;
    const verticalDistance = Math.abs(targetY - y);
    const score = verticalDistance + horizontalDistance * 0.4;
    if (!best || score < best.score) {
      best = { horizontalDistance, line, score, verticalDistance };
    }
  }
  if (!best || best.verticalDistance > Math.max(24, pageHeight * 0.04) || best.horizontalDistance > Math.max(30, pageWidth * 0.12)) {
    return null;
  }
  return best.line.normalizedStart;
}
function findPdfSelectionMatchIndices(pageLower, candidateLower) {
  const indexes = [];
  let searchFrom = 0;
  while (candidateLower && searchFrom <= pageLower.length) {
    const index = pageLower.indexOf(candidateLower, searchFrom);
    if (index < 0) {
      break;
    }
    indexes.push(index);
    searchFrom = index + 1;
  }
  return indexes;
}
function slicePdfTextFromSelection(pageText, selectedText, options = {}) {
  const page = normalizePdfSelectionText(pageText);
  const selected = normalizePdfSelectionText(selectedText);
  if (!page || !selected) {
    return { matched: false, text: page };
  }
  const spatialAnchor = getPdfSpatialLineAnchor(
    page,
    options.layout,
    options.selectionPosition
  );
  const minimumCandidateLength = spatialAnchor === null ? 8 : 2;
  const candidateLengths = [selected.length, 400, 240, 160, 100, 60, 30, 16, 8, 4, 2].map((length) => Math.min(selected.length, length)).filter((length, index, values) => length >= minimumCandidateLength && values.indexOf(length) === index);
  const pageLower = page.toLocaleLowerCase();
  for (const length of candidateLengths) {
    const candidate = selected.slice(0, length);
    if (spatialAnchor === null) {
      let matchIndex = page.indexOf(candidate);
      if (matchIndex < 0) {
        matchIndex = pageLower.indexOf(candidate.toLocaleLowerCase());
      }
      if (matchIndex >= 0) {
        return { matched: true, text: page.slice(matchIndex) };
      }
      continue;
    }
    const matchIndices = findPdfSelectionMatchIndices(
      pageLower,
      candidate.toLocaleLowerCase()
    );
    if (!matchIndices.length) {
      continue;
    }
    const closestIndex = matchIndices.reduce((closest, current) => Math.abs(current - spatialAnchor) < Math.abs(closest - spatialAnchor) ? current : closest);
    if (Math.abs(closestIndex - spatialAnchor) <= Math.max(240, selected.length)) {
      return { matched: true, text: page.slice(closestIndex) };
    }
  }
  if (spatialAnchor !== null) {
    return { matched: true, text: page.slice(spatialAnchor) };
  }
  return { matched: false, text: page };
}
function joinPdfPageText(pageTexts) {
  return (Array.isArray(pageTexts) ? pageTexts : []).map((text) => normalizeLineBreaks(text).trim()).filter(Boolean).join("\n\n");
}
function getPdfExtractionErrorMessage(error) {
  const message = messageFromError(error);
  if (/password/i.test(`${error && error.name ? error.name : ""} ${message}`)) {
    return "This PDF is password-protected. Unlock it before reading.";
  }
  if (/invalidpdf|invalid pdf|malformed pdf/i.test(`${error && error.name ? error.name : ""} ${message}`)) {
    return "This PDF is invalid or damaged and its text could not be extracted.";
  }
  return message;
}
function splitMarkdownTableRow(line) {
  let value = String(line || "").trim();
  if (!value.includes("|")) {
    return [];
  }
  if (value.startsWith("|")) {
    value = value.slice(1);
  }
  if (hasUnescapedTrailingPipe(value)) {
    value = value.slice(0, -1);
  }
  const cells = [];
  let current = "";
  let inCode = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      current += character;
      continue;
    }
    if (character === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}
function hasUnescapedTrailingPipe(value) {
  if (!value.endsWith("|")) {
    return false;
  }
  let backslashes = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}
function isMarkdownTableDelimiterLine(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}
function formatMarkdownTableForSpeech(headers, rows) {
  const tableText = headers.concat(...rows).join(" ");
  const useChineseLabels = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(tableText);
  const output = [];
  const headerLabels = headers.map((header) => header.trim()).filter(Boolean);
  if (headerLabels.length) {
    output.push(`${useChineseLabels ? "\u8868\u683C\u5217" : "Table columns"}: ${headerLabels.join("; ")}${useChineseLabels ? "\u3002" : "."}`);
  }
  rows.forEach((cells, rowIndex) => {
    const values = [];
    const cellCount = Math.max(headers.length, cells.length);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const cell = String(cells[cellIndex] || "").trim();
      if (!cell) {
        continue;
      }
      const header = String(headers[cellIndex] || "").trim();
      values.push(header ? `${header}: ${cell}` : cell);
    }
    if (values.length) {
      const rowLabel = useChineseLabels ? `\u7B2C ${rowIndex + 1} \u884C` : `Row ${rowIndex + 1}`;
      output.push(`${rowLabel}. ${values.join("; ")}${useChineseLabels ? "\u3002" : "."}`);
    }
  });
  return output.join("\n");
}
function sanitizeMarkdownTablesForSpeech(text) {
  const lines = normalizeLineBreaks(text).split("\n");
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (headerLine.includes("|") && isMarkdownTableDelimiterLine(delimiterLine)) {
      const headers = splitMarkdownTableRow(headerLine);
      const rows = [];
      let rowIndex = index + 2;
      while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes("|")) {
        const cells = splitMarkdownTableRow(lines[rowIndex]);
        if (isMarkdownTableDelimiterLine(lines[rowIndex])) {
          break;
        }
        rows.push(cells);
        rowIndex += 1;
      }
      output.push(formatMarkdownTableForSpeech(headers, rows));
      index = rowIndex - 1;
      continue;
    }
    if (!isMarkdownTableDelimiterLine(headerLine)) {
      output.push(headerLine);
    }
  }
  return output.join("\n");
}
function joinCitationSpeechParts(parts, useChineseLabels) {
  if (useChineseLabels) {
    return parts.join("\u3001");
  }
  if (parts.length <= 1) {
    return parts[0] || "";
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}
function verbalizeNumericCitationsForSpeech(text) {
  const value = String(text || "");
  const useChineseLabels = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(value);
  return value.replace(
    /\[(\d+(?:\s*(?:[,;]|[-–—])\s*\d+)*)\](?:\([^)]*\))?/g,
    (match, content) => {
      const numbers = content.match(/\d+/g) || [];
      if (!numbers.length || numbers.some((number) => Number(number) < 1 || Number(number) > 999)) {
        return match;
      }
      const parts = content.split(/\s*[,;]\s*/).map((part) => {
        const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(part);
        if (!range) {
          return part.trim();
        }
        return `${range[1]} ${useChineseLabels ? "\u5230" : "to"} ${range[2]}`;
      }).filter(Boolean);
      const isPlural = parts.length > 1 || /[-–—]/.test(content);
      const label = useChineseLabels ? "\u53C2\u8003\u6587\u732E" : isPlural ? "references" : "reference";
      return ` ${label} ${joinCitationSpeechParts(parts, useChineseLabels)} `;
    }
  );
}
function sanitizeTextForSpeech(text, options = {}) {
  let value = sanitizeLatexForSpeech(normalizeLineBreaks(text), options);
  value = value.replace(/^---\n[\s\S]*?\n---\n?/, "");
  value = value.replace(/```[\s\S]*?```/g, " ");
  value = value.replace(/!\[\[[^\]]+\]\]/g, " ");
  value = value.replace(/!\[[^\]]*]\([^)]*\)/g, " ");
  value = value.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  value = value.replace(/\[\[([^\]]+)\]\]/g, "$1");
  value = verbalizeNumericCitationsForSpeech(value);
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  value = sanitizeMarkdownTablesForSpeech(value);
  value = value.replace(/`([^`]+)`/g, "$1");
  value = value.replace(/<[^>]+>/g, " ");
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  value = value.replace(/^\s*>\s?/gm, "");
  value = value.replace(/^\s*[-+*]\s+/gm, "");
  value = value.replace(/[*_~]/g, "");
  value = value.replace(/\|/g, " ");
  value = value.replace(/[ \t]+/g, " ");
  value = value.replace(/\s+([，。、；：！？,.])/g, "$1");
  value = value.replace(/([，。、；：！？])\s+/g, "$1");
  return value.split("\n").map((line) => line.trim()).filter(Boolean).join("\n").trim();
}
function sanitizeLatexForSpeech(text, options = {}) {
  let value = normalizeLineBreaks(text);
  const mathReadingLanguage = normalizeMathReadingLanguage(options.mathReadingLanguage);
  value = value.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\$([^$\n]+?)\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  return verbalizeLatexCommands(value, mathReadingLanguage);
}
function replaceLatexFormula(match, content, mathReadingLanguage) {
  if (mathReadingLanguage === "skip" || isLongLatexFormula(content)) {
    return " ";
  }
  return ` ${verbalizeShortLatex(content, mathReadingLanguage)} `;
}
function isLongLatexFormula(content) {
  return stripLatexDelimiters(content).replace(/\s+/g, "").length > LATEX_FORMULA_MAX_CHARS;
}
function stripLatexDelimiters(content) {
  let value = String(content || "").trim();
  value = value.replace(/^\$\$([\s\S]*?)\$\$$/, "$1");
  value = value.replace(/^\\\[([\s\S]*?)\\\]$/, "$1");
  value = value.replace(/^\\\(([\s\S]*?)\\\)$/, "$1");
  value = value.replace(/^\$([^$]*)\$$/, "$1");
  return value.trim();
}
function verbalizeShortLatex(content, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  let value = stripLatexDelimiters(content);
  const language = normalizeMathReadingLanguage(mathReadingLanguage);
  value = verbalizeLatexCommands(value, language);
  value = verbalizeLatexAbsoluteValues(value, language);
  value = value.replace(/_/g, language === "chinese" ? " \u4E0B\u6807 " : " subscript ");
  value = value.replace(/\^/g, language === "chinese" ? " \u4E0A\u6807 " : " superscript ");
  value = value.replace(/\+/g, language === "chinese" ? " \u52A0 " : " plus ");
  value = value.replace(/=/g, language === "chinese" ? " \u7B49\u4E8E " : " equals ");
  value = value.replace(/[{}()[\]]/g, " ");
  value = value.replace(/\\/g, " ");
  return cleanupLatexSpeech(value);
}
function verbalizeLatexAbsoluteValues(text, mathReadingLanguage) {
  let value = String(text || "").replace(/\\(?:lvert|rvert|vert)\b/g, "|");
  value = value.replace(/\|([^|\n]+)\|/g, (_match, inner) => mathReadingLanguage === "chinese" ? `${inner} \u7684\u7EDD\u5BF9\u503C` : `absolute value of ${inner}`);
  return value.replace(/\|/g, " ");
}
function verbalizeLatexCommands(text, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  const language = normalizeMathReadingLanguage(mathReadingLanguage);
  let value = replaceLatexCommands(String(text || ""), language);
  value = replaceLatexSymbolCommands(value, language);
  return cleanupLatexSpeechPreservingLines(value);
}
function replaceLatexCommands(text, mathReadingLanguage) {
  let value = String(text || "");
  let previous = "";
  const fractionSpeech = mathReadingLanguage === "chinese" ? "$1 \u5206\u4E4B $2" : "$1 over $2";
  while (value !== previous) {
    previous = value;
    value = value.replace(/\\(?:textbf|mathbf|boldsymbol|textit|emph|mathrm|operatorname|text)\s*\{([^{}]*)\}/g, "$1");
    value = value.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, fractionSpeech);
  }
  return value;
}
function replaceLatexSymbolCommands(text, mathReadingLanguage) {
  let value = String(text || "");
  const replacements = LATEX_COMMAND_REPLACEMENTS[mathReadingLanguage] || LATEX_COMMAND_REPLACEMENTS[DEFAULT_MATH_READING_LANGUAGE];
  for (const [command, speech] of replacements) {
    const replacement = speech ? ` ${speech} ` : " ";
    value = value.replace(new RegExp(`${escapeRegExp(command)}\\b`, "g"), replacement);
  }
  return value;
}
function cleanupLatexSpeech(text) {
  return String(text || "").replace(/\s+/g, " ").replace(/\s+([，。、；：！？,.])/g, "$1").replace(/([，。、；：！？])\s+/g, "$1").trim();
}
function cleanupLatexSpeechPreservingLines(text) {
  return String(text || "").split("\n").map((line) => cleanupLatexSpeech(line)).join("\n");
}
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function resolveDefaultScriptPath() {
  return "";
}
function normalizeSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) {
    return 1;
  }
  return Math.min(2, Math.max(0.5, speed));
}
function normalizeMathReadingLanguage(value) {
  const language = String(value || DEFAULT_MATH_READING_LANGUAGE).toLowerCase();
  return MATH_READING_LANGUAGES.includes(language) ? language : DEFAULT_MATH_READING_LANGUAGE;
}
function normalizeSettingsLanguage(value) {
  const language = String(value || DEFAULT_SETTINGS.settingsLanguage).toLowerCase();
  return SETTINGS_LANGUAGES.includes(language) ? language : DEFAULT_SETTINGS.settingsLanguage;
}
function normalizeCredentialSource(value) {
  const source = String(value || "obsidian-secret").trim().toLowerCase();
  return CREDENTIAL_SOURCES.includes(source) ? source : "obsidian-secret";
}
function getSettingsUiText(language) {
  return SETTINGS_UI_TEXT[normalizeSettingsLanguage(language)];
}
function openGitHubIssues() {
  if (typeof window === "undefined" || typeof window.open !== "function") {
    return false;
  }
  return Boolean(window.open(GITHUB_ISSUES_URL, "_blank", "noopener,noreferrer"));
}
function normalizeSpeechEngine(value) {
  const engine = String(value || DEFAULT_SETTINGS.speechEngine).toLowerCase();
  return SPEECH_ENGINES.includes(engine) ? engine : DEFAULT_SETTINGS.speechEngine;
}
function isOnlineSpeechEngine(value) {
  return normalizeSpeechEngine(value) !== "local-cosyvoice";
}
function normalizeOnlinePrefetchChunks(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) ? Math.min(MAX_ONLINE_PREFETCH_CHUNKS, Math.max(0, count)) : DEFAULT_SETTINGS.onlinePrefetchChunks;
}
function getChunkLimitsForSpeechEngine(settings, speechEngine = normalizeSpeechEngine(settings && settings.speechEngine)) {
  if (isOnlineSpeechEngine(speechEngine)) {
    return parseChunkLimits(settings && settings.onlineChunkLimits, DEFAULT_ONLINE_CHUNK_LIMITS);
  }
  return parseChunkLimits(settings && settings.chunkLimits, DEFAULT_CHUNK_LIMITS);
}
function getSynthesisPrefetchCount(settings, speechEngine = normalizeSpeechEngine(settings && settings.speechEngine)) {
  return isOnlineSpeechEngine(speechEngine) ? normalizeOnlinePrefetchChunks(settings && settings.onlinePrefetchChunks) : 1;
}
function normalizeEdgeTtsVoice(value) {
  const voice = String(value || "").trim();
  return voice || DEFAULT_EDGE_TTS_VOICE;
}
function normalizeEdgeTtsExecutable(value) {
  const executable = String(value || "").trim();
  return executable || DEFAULT_EDGE_TTS_EXECUTABLE;
}
function normalizeAzureSpeechCloud(value) {
  const cloud = String(value || "").trim().toLowerCase();
  return AZURE_SPEECH_CLOUDS.includes(cloud) ? cloud : "public";
}
function normalizeAzureSpeechRegion(value) {
  const region = String(value || "").trim().toLowerCase();
  return /^[a-z0-9]{2,32}$/.test(region) ? region : "";
}
function normalizeAzureSpeechVoice(value) {
  const voice = String(value || "").trim();
  return /^[a-z]{2,3}-[a-z]{2}-[a-z0-9][a-z0-9._:-]{1,190}$/i.test(voice) ? voice : DEFAULT_AZURE_SPEECH_VOICE;
}
function normalizeOpenRouterModel(value) {
  const model = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._-]{1,149}(?::[a-z0-9._-]+)?$/i.test(model) ? model : DEFAULT_OPENROUTER_TTS_MODEL;
}
function normalizeOpenRouterVoice(value) {
  const voice = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(voice) ? voice : DEFAULT_OPENROUTER_TTS_VOICE;
}
function hasObsidianSecretStorage(app) {
  return Boolean(app && app.secretStorage && typeof app.secretStorage.getSecret === "function");
}
function hasObsidianSecretStorageUi(app) {
  return hasObsidianSecretStorage(app) && typeof SecretComponent === "function";
}
function getCredentialValueError(value, serviceLabel) {
  const secret = String(value || "").replace(/^\uFEFF/, "").trim();
  if (!secret) {
    return `${serviceLabel} secret is empty or unavailable.`;
  }
  if (/[\r\n]/.test(secret)) {
    return `${serviceLabel} secret must contain exactly one non-empty line.`;
  }
  return "";
}
function readObsidianSecretValue(secretNameValue, app, serviceLabel) {
  const secretName = String(secretNameValue || "").trim();
  if (!secretName) {
    throw new Error(`Select or create an Obsidian SecretStorage entry for ${serviceLabel}.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(secretName)) {
    throw new Error(`${serviceLabel} secret name must use lowercase letters, numbers, and dashes.`);
  }
  if (!hasObsidianSecretStorage(app)) {
    throw new Error("Obsidian SecretStorage requires Obsidian 1.11.4 or later. Select the external key-file option on older versions.");
  }
  let value;
  try {
    value = app.secretStorage.getSecret(secretName);
  } catch (error) {
    throw new Error(`Could not read the ${serviceLabel} secret from Obsidian SecretStorage.`);
  }
  const valueError = getCredentialValueError(value, serviceLabel);
  if (valueError) {
    throw new Error(valueError);
  }
  return String(value).trim();
}
function getObsidianSecretConfigurationError(secretNameValue, app, serviceLabel) {
  try {
    readObsidianSecretValue(secretNameValue, app, serviceLabel);
    return "";
  } catch (error) {
    return error && error.message ? String(error.message) : `Could not read the ${serviceLabel} secret from Obsidian SecretStorage.`;
  }
}
function getSecretFileConfigurationError(keyPathValue, vaultBasePath, serviceLabel) {
  const keyPath = String(keyPathValue || "").trim();
  if (!keyPath || !path.isAbsolute(keyPath)) {
    return `Set an absolute ${serviceLabel} key file path in the plugin settings.`;
  }
  if (vaultBasePath && isInsideDirectory(keyPath, vaultBasePath)) {
    return `The ${serviceLabel} key file must be stored outside the Obsidian vault.`;
  }
  if (!fs.existsSync(keyPath)) {
    return `${serviceLabel} key file not found: ${keyPath}`;
  }
  return "";
}
function getRemoteCredentialConfigurationError({ credentialSource, secretName, keyPath }, vaultBasePath, app, serviceLabel) {
  if (normalizeCredentialSource(credentialSource) === "obsidian-secret") {
    return getObsidianSecretConfigurationError(secretName, app, serviceLabel);
  }
  return getSecretFileConfigurationError(keyPath, vaultBasePath, serviceLabel);
}
function buildAzureSpeechEndpoint(settings = {}) {
  const cloud = String(settings.azureSpeechCloud || "public").trim().toLowerCase();
  const region = normalizeAzureSpeechRegion(settings.azureSpeechRegion);
  if (!AZURE_SPEECH_CLOUDS.includes(cloud)) {
    throw new Error("Invalid Azure Speech cloud.");
  }
  if (!region) {
    throw new Error("Invalid Azure Speech region.");
  }
  const domain = cloud === "china" ? "tts.speech.azure.cn" : "tts.speech.microsoft.com";
  return `https://${region}.${domain}/cognitiveservices/v1`;
}
function escapeXml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function buildAzureSpeechSsml(text, settings = {}) {
  const voice = normalizeAzureSpeechVoice(settings.azureSpeechVoice);
  const locale = voice.split("-").slice(0, 2).join("-");
  const rate = formatEdgeTtsRate(settings.speed);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(locale)}"><voice name="${escapeXml(voice)}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
}
function getAzureSpeechConfigurationError(settings = {}, vaultBasePath = "", app = null) {
  const cloud = String(settings.azureSpeechCloud || "public").trim().toLowerCase();
  if (!AZURE_SPEECH_CLOUDS.includes(cloud)) {
    return "Select a valid Azure Speech cloud in the plugin settings.";
  }
  const region = String(settings.azureSpeechRegion || "").trim().toLowerCase();
  if (!region || normalizeAzureSpeechRegion(region) !== region) {
    return "Set a valid Azure Speech region in the plugin settings.";
  }
  if (normalizeAzureSpeechVoice(settings.azureSpeechVoice) !== String(settings.azureSpeechVoice || "").trim()) {
    return "Set a valid Azure Speech voice ID in the plugin settings.";
  }
  return getRemoteCredentialConfigurationError({
    credentialSource: settings.azureSpeechCredentialSource,
    secretName: settings.azureSpeechSecretName,
    keyPath: settings.azureSpeechKeyPath
  }, vaultBasePath, app, "Azure Speech");
}
function getOpenRouterConfigurationError(settings = {}, vaultBasePath = "", app = null) {
  if (normalizeOpenRouterModel(settings.openRouterModel) !== String(settings.openRouterModel || "").trim()) {
    return "Set a valid OpenRouter TTS model ID in the plugin settings.";
  }
  if (normalizeOpenRouterVoice(settings.openRouterVoice) !== String(settings.openRouterVoice || "").trim()) {
    return "Set a valid OpenRouter TTS voice ID in the plugin settings.";
  }
  return getRemoteCredentialConfigurationError({
    credentialSource: settings.openRouterCredentialSource,
    secretName: settings.openRouterSecretName,
    keyPath: settings.openRouterKeyPath
  }, vaultBasePath, app, "OpenRouter API");
}
function buildOpenRouterTtsRequestBody(text, settings = {}) {
  return JSON.stringify({
    model: normalizeOpenRouterModel(settings.openRouterModel),
    input: String(text || ""),
    voice: normalizeOpenRouterVoice(settings.openRouterVoice),
    response_format: "mp3",
    speed: normalizeSpeed(settings.speed),
    provider: {
      data_collection: "deny",
      zdr: true
    }
  });
}
function getMicrosoftVoicePresets(language) {
  const labelIndex = normalizeSettingsLanguage(language) === "chinese" ? 2 : 1;
  return MICROSOFT_VOICE_PRESETS.map((preset) => [preset[0], preset[labelIndex]]);
}
function getEdgeTtsVoicePresets(language) {
  return getMicrosoftVoicePresets(language);
}
function getAzureSpeechVoicePresets(language) {
  return getMicrosoftVoicePresets(language);
}
function getOpenRouterTtsModels(language) {
  const normalizedLanguage = normalizeSettingsLanguage(language);
  const labelIndex = normalizedLanguage === "chinese" ? 3 : 2;
  const infoIndex = normalizedLanguage === "chinese" ? 5 : 4;
  return OPENROUTER_TTS_MODELS.map((model) => [model[0], model[1], model[labelIndex], model[infoIndex]]);
}
function getDefaultOpenRouterVoiceForModel(modelId) {
  const selected = OPENROUTER_TTS_MODELS.find(([model]) => model === String(modelId || "").trim());
  return selected ? selected[1] : DEFAULT_OPENROUTER_TTS_VOICE;
}
function getOpenRouterTtsPresets(language) {
  const labelIndex = normalizeSettingsLanguage(language) === "chinese" ? 3 : 2;
  return OPENROUTER_TTS_PRESETS.map((preset) => [preset[0], preset[1], preset[labelIndex]]);
}
function getOpenRouterTtsVoicePresets(modelId, language) {
  const selectedModel = String(modelId || "").trim();
  return getOpenRouterTtsPresets(language).filter(([model]) => model === selectedModel);
}
function hasEdgeTtsConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== "edge-tts" || settings.edgeTtsConsent === true;
}
function hasAzureSpeechConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== "azure-speech" || settings.azureSpeechConsent === true;
}
function hasOpenRouterConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== "openrouter-tts" || settings.openRouterConsent === true;
}
function getPluginTempCacheDir(vaultBasePath, tempBasePath = os.tmpdir()) {
  const resolvedVaultPath = path.resolve(String(vaultBasePath || ""));
  const vaultKey = crypto.createHash("sha256").update(resolvedVaultPath).digest("hex").slice(0, 16);
  return path.join(tempBasePath, PLUGIN_ID, vaultKey);
}
function isOwnedCacheFileName(fileName) {
  const name = String(fileName || "");
  return OWNED_CACHE_FILE_PATTERN.test(name) || name === "diagnostic.log";
}
function createSafeRuntimeLogEvent(stage, settings = {}, timestamp = (/* @__PURE__ */ new Date()).toISOString()) {
  if (stage !== "failed") {
    return null;
  }
  return {
    time: timestamp,
    stage: "failed",
    engine: getSpeechEngineLabel(settings)
  };
}
function formatEdgeTtsRate(speed) {
  const rate = Math.round((normalizeSpeed(speed) - 1) * 100);
  return `${rate >= 0 ? "+" : ""}${rate}%`;
}
function buildEdgeTtsArgs(inputPath, outputPath, settings = {}) {
  return [
    "--voice",
    normalizeEdgeTtsVoice(settings.edgeTtsVoice),
    `--rate=${formatEdgeTtsRate(settings.speed)}`,
    "--file",
    inputPath,
    "--write-media",
    outputPath
  ];
}
function getSpeechEngineLabel(settings = {}) {
  const speechEngine = normalizeSpeechEngine(settings.speechEngine);
  if (speechEngine === "edge-tts") {
    return "Edge TTS";
  }
  if (speechEngine === "azure-speech") {
    return "Azure Speech";
  }
  if (speechEngine === "openrouter-tts") {
    return "OpenRouter TTS";
  }
  return "CosyVoice";
}
function getSpeedPresets() {
  return SPEED_PRESETS.slice();
}
function formatSpeedLabel(speed) {
  return `${normalizeSpeed(speed).toString()}x`;
}
function selectKnownSettings(defaults, candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, defaultValue]) => [
    key,
    Object.prototype.hasOwnProperty.call(source, key) ? source[key] : defaultValue
  ]));
}
function createDefaultSettings() {
  return {
    audioExportFolder: normalizeAudioExportFolder(DEFAULT_SETTINGS.audioExportFolder),
    audioExportLocation: normalizeAudioExportLocation(DEFAULT_SETTINGS.audioExportLocation),
    azureSpeechCloud: normalizeAzureSpeechCloud(DEFAULT_SETTINGS.azureSpeechCloud),
    azureSpeechConsent: DEFAULT_SETTINGS.azureSpeechConsent,
    azureSpeechCredentialSource: normalizeCredentialSource(DEFAULT_SETTINGS.azureSpeechCredentialSource),
    azureSpeechKeyPath: DEFAULT_SETTINGS.azureSpeechKeyPath,
    azureSpeechRegion: DEFAULT_SETTINGS.azureSpeechRegion,
    azureSpeechSecretName: DEFAULT_SETTINGS.azureSpeechSecretName,
    azureSpeechVoice: normalizeAzureSpeechVoice(DEFAULT_SETTINGS.azureSpeechVoice),
    cleanupCache: DEFAULT_SETTINGS.cleanupCache,
    chunkLimits: parseChunkLimits(DEFAULT_SETTINGS.chunkLimits).join(","),
    onlineChunkLimits: parseChunkLimits(
      DEFAULT_SETTINGS.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(","),
    onlinePrefetchChunks: normalizeOnlinePrefetchChunks(DEFAULT_SETTINGS.onlinePrefetchChunks),
    readingPositions: normalizeReadingPositions(DEFAULT_SETTINGS.readingPositions),
    rememberReadingPosition: DEFAULT_SETTINGS.rememberReadingPosition,
    diagnosticLogging: DEFAULT_SETTINGS.diagnosticLogging,
    edgeTtsConsent: DEFAULT_SETTINGS.edgeTtsConsent,
    edgeTtsExecutable: normalizeEdgeTtsExecutable(DEFAULT_SETTINGS.edgeTtsExecutable),
    edgeTtsVoice: normalizeEdgeTtsVoice(DEFAULT_SETTINGS.edgeTtsVoice),
    mathReadingLanguage: normalizeMathReadingLanguage(DEFAULT_SETTINGS.mathReadingLanguage),
    openRouterConsent: DEFAULT_SETTINGS.openRouterConsent,
    openRouterCredentialSource: normalizeCredentialSource(DEFAULT_SETTINGS.openRouterCredentialSource),
    openRouterKeyPath: DEFAULT_SETTINGS.openRouterKeyPath,
    openRouterModel: normalizeOpenRouterModel(DEFAULT_SETTINGS.openRouterModel),
    openRouterSecretName: DEFAULT_SETTINGS.openRouterSecretName,
    openRouterVoice: normalizeOpenRouterVoice(DEFAULT_SETTINGS.openRouterVoice),
    settingsLanguage: normalizeSettingsLanguage(DEFAULT_SETTINGS.settingsLanguage),
    scriptPath: resolveDefaultScriptPath(),
    speechEngine: normalizeSpeechEngine(DEFAULT_SETTINGS.speechEngine),
    speed: normalizeSpeed(DEFAULT_SETTINGS.speed),
    stripMarkdown: DEFAULT_SETTINGS.stripMarkdown
  };
}
function createReaderState(overrides = {}) {
  return normalizeReaderState({
    canPause: false,
    canNextChunk: false,
    canPreviousChunk: false,
    canSeek: false,
    canStop: false,
    currentChunk: 0,
    currentText: "",
    error: "",
    isPaused: false,
    label: "CosyVoice idle",
    phase: "idle",
    progress: 0,
    source: "",
    status: "idle",
    totalChunks: 0,
    ...overrides
  });
}
function normalizeReaderState(state) {
  const totalChunks = Math.max(0, Math.floor(Number(state.totalChunks) || 0));
  const currentChunk = Math.max(0, Math.min(totalChunks || Number.MAX_SAFE_INTEGER, Math.floor(Number(state.currentChunk) || 0)));
  return {
    canPause: Boolean(state.canPause),
    canNextChunk: Boolean(state.canNextChunk),
    canPreviousChunk: Boolean(state.canPreviousChunk),
    canSeek: Boolean(state.canSeek),
    canStop: Boolean(state.canStop),
    currentChunk,
    currentText: String(state.currentText || ""),
    error: String(state.error || ""),
    isPaused: Boolean(state.isPaused),
    label: String(state.label || "CosyVoice idle"),
    phase: String(state.phase || "idle"),
    progress: clampProgress(state.progress),
    source: String(state.source || ""),
    status: String(state.status || "idle"),
    totalChunks
  };
}
function calculateCurrentChunkSeekTime({ progress, currentChunk, totalChunks, duration }) {
  const total = Math.max(0, Math.floor(Number(totalChunks) || 0));
  const chunk = Math.max(0, Math.floor(Number(currentChunk) || 0));
  const seconds = Number(duration);
  if (!total || !chunk || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const chunkStart = (chunk - 1) / total;
  const chunkEnd = chunk / total;
  const clampedProgress = Math.min(chunkEnd, Math.max(chunkStart, clampProgress(progress)));
  const localProgress = (clampedProgress - chunkStart) / (chunkEnd - chunkStart);
  return Math.round(seconds * localProgress * 1e3) / 1e3;
}
function getTextFromPositionToEnd(lines, position) {
  const sourceLines = Array.isArray(lines) ? lines.map((line2) => String(line2 || "")) : [];
  const line = Math.max(0, Math.min(sourceLines.length - 1, Math.floor(Number(position && position.line) || 0)));
  const ch = Math.max(0, Math.floor(Number(position && position.ch) || 0));
  if (!sourceLines.length) {
    return "";
  }
  const firstLine = sourceLines[line] || "";
  return [firstLine.slice(ch), ...sourceLines.slice(line + 1)].join("\n").trim();
}
function clampProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.min(1, Math.max(0, progress));
}
function formatProgressLabel(state) {
  const currentChunk = Math.max(0, Math.floor(Number(state.currentChunk) || 0));
  const totalChunks = Math.max(0, Math.floor(Number(state.totalChunks) || 0));
  return `${currentChunk} / ${totalChunks}`;
}
function isSpaceKeyEvent(event) {
  return event && (event.code === "Space" || event.key === " " || event.key === "Spacebar");
}
function getKeyboardSeekDeltaSeconds(event) {
  if (!event) {
    return 0;
  }
  if (event.code === "ArrowLeft" || event.key === "ArrowLeft") {
    return -KEYBOARD_SEEK_SECONDS;
  }
  if (event.code === "ArrowRight" || event.key === "ArrowRight") {
    return KEYBOARD_SEEK_SECONDS;
  }
  return 0;
}
function isInteractiveKeyboardTarget(target) {
  if (!target || !target.tagName) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (typeof target.closest === "function" && target.closest('.cm-editor, .markdown-source-view, [contenteditable="true"]')) {
    return true;
  }
  const tagName = String(target.tagName).toLowerCase();
  if (tagName === "textarea" || tagName === "select") {
    return true;
  }
  if (tagName !== "input") {
    return false;
  }
  const type = String(
    target.type || target.attributes && target.attributes.type || "text"
  ).toLowerCase();
  return !["button", "checkbox", "radio", "range", "reset", "submit"].includes(type);
}
function getChunkNavigationState(currentChunk, totalChunks) {
  const total = Math.max(0, Math.floor(Number(totalChunks) || 0));
  const current = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, Math.floor(Number(currentChunk) || 0)));
  return {
    canNextChunk: Boolean(current && current < total),
    canPreviousChunk: current > 1
  };
}
function previewText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 320);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function parseRetryAfterMs(value, nowMs = Date.now()) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return null;
  }
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Math.min(REMOTE_TTS_RETRY_AFTER_MAX_MS, Math.max(0, Math.ceil(Number(normalized) * 1e3)));
  }
  const retryAtMs = Date.parse(normalized);
  if (!Number.isFinite(retryAtMs)) {
    return null;
  }
  return Math.min(REMOTE_TTS_RETRY_AFTER_MAX_MS, Math.max(0, retryAtMs - nowMs));
}
function isRetryableRemoteError(error) {
  if (!error) {
    return false;
  }
  const statusCode = Number(error.statusCode) || 0;
  if (statusCode) {
    return REMOTE_TTS_RETRYABLE_STATUS_CODES.has(statusCode);
  }
  return REMOTE_TTS_RETRYABLE_ERROR_CODES.has(String(error.code || "").toUpperCase());
}
function getRemoteHttpErrorDetail(statusCode, failureHint) {
  const fallback = failureHint || "Check the service configuration and account status.";
  if (statusCode === 400 || statusCode === 422) {
    return `The provider rejected the request. Check the selected model, voice, text length, and request format. ${fallback}`;
  }
  if (statusCode === 401) {
    return "Authentication failed. The API key may be missing, invalid, expired, or associated with a different service account.";
  }
  if (statusCode === 402) {
    return "Account credit, balance, or spending limit is exhausted. Add credit or raise the provider budget before retrying.";
  }
  if (statusCode === 403) {
    return `The request was forbidden. Check API-key permissions, model or provider access, and required privacy routing. ${fallback}`;
  }
  if (statusCode === 404) {
    return `The requested endpoint, model, voice, region, or resource was not found. ${fallback}`;
  }
  if (statusCode === 413) {
    return "The text request is too large for the provider. Reduce the online chunk limits and try again.";
  }
  if (statusCode === 429) {
    return "The service rate limit or request quota has been reached. Wait for the provider reset time, reduce request frequency, or review the account limits.";
  }
  if (statusCode === 408 || statusCode === 425 || statusCode >= 500) {
    return "The upstream service is temporarily unavailable, busy, or timed out.";
  }
  return fallback;
}
function createRemoteHttpError(serviceLabel, statusCode, failureHint, retryAfterValue) {
  const retryAfterMs = parseRetryAfterMs(retryAfterValue);
  const retryAfterDetail = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? ` A Retry-After delay of ${Math.ceil(retryAfterMs / 1e3)} seconds will be observed before the next attempt.` : "";
  const error = new Error(
    `${serviceLabel} returned HTTP ${statusCode}. ${getRemoteHttpErrorDetail(statusCode, failureHint)}${retryAfterDetail}`
  );
  error.statusCode = statusCode;
  error.retryAfterMs = retryAfterMs;
  error.category = statusCode === 402 ? "quota" : statusCode === 429 ? "rate-limit" : statusCode === 401 ? "authentication" : statusCode === 403 ? "access" : REMOTE_TTS_RETRYABLE_STATUS_CODES.has(statusCode) ? "temporary" : "request";
  return error;
}
function createRemoteRetryExhaustedError(serviceLabel, error, attempts) {
  const statusCode = Number(error && error.statusCode) || 0;
  const failure = statusCode ? `HTTP ${statusCode}` : messageFromError(error);
  const detail = statusCode === 429 ? "The rate limit or request quota is still exceeded. Wait for the provider reset time or review the account limits." : "The upstream provider may be temporarily unavailable. Try again shortly or select another model.";
  const exhaustedError = new Error(
    `${serviceLabel} returned ${failure} after ${attempts} attempts. ` + detail
  );
  exhaustedError.statusCode = statusCode || void 0;
  exhaustedError.code = error && error.code;
  exhaustedError.category = error && error.category;
  exhaustedError.retryAfterMs = error && error.retryAfterMs;
  return exhaustedError;
}
function focusElementWithoutScroll(element) {
  if (!element || typeof element.focus !== "function") {
    return;
  }
  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}
function toVaultRelativePath(basePath, filePath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(filePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(path.sep).join("/");
}
function getAudioUrlForFile(adapter, basePath, filePath) {
  const vaultPath = toVaultRelativePath(basePath, filePath);
  if (vaultPath && adapter && typeof adapter.getResourcePath === "function") {
    return adapter.getResourcePath(vaultPath);
  }
  return pathToFileURL(filePath).href;
}
function getAudioMimeType(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".wav" ? "audio/wav" : "audio/mpeg";
}
function createBlobAudioSource(audioBytes, filePath, runtime = globalThis) {
  if (!audioBytes || typeof audioBytes.length !== "number" || audioBytes.length === 0) {
    return null;
  }
  const BlobConstructor = runtime && runtime.Blob;
  const urlApi = runtime && runtime.URL;
  if (typeof BlobConstructor !== "function" || !urlApi || typeof urlApi.createObjectURL !== "function" || typeof urlApi.revokeObjectURL !== "function") {
    return null;
  }
  try {
    const mimeType = getAudioMimeType(filePath);
    const objectUrl = urlApi.createObjectURL(new BlobConstructor([audioBytes], { type: mimeType }));
    if (!objectUrl) {
      return null;
    }
    let released = false;
    return {
      mimeType,
      url: String(objectUrl),
      release() {
        if (released) {
          return;
        }
        released = true;
        try {
          urlApi.revokeObjectURL(objectUrl);
        } catch (error) {
          console.warn(`[${PLUGIN_ID}] Could not release temporary audio URL`, error);
        }
      }
    };
  } catch (error) {
    return null;
  }
}
function describeMediaError(mediaError) {
  const code = Number(mediaError && mediaError.code) || 0;
  const descriptions = {
    1: "playback was aborted",
    2: "the audio source could not be loaded",
    3: "the audio could not be decoded",
    4: "the audio source or format is unsupported"
  };
  return code ? ` (media error ${code}: ${descriptions[code] || "unknown media failure"})` : "";
}
function resolvePowerShellExecutable() {
  return "powershell.exe";
}
function isMarkdownFile(file) {
  return Boolean(file && String(file.extension || "").toLowerCase() === "md");
}
function getAudioExportExtension(speechEngine) {
  return normalizeSpeechEngine(speechEngine) === "local-cosyvoice" ? "wav" : "mp3";
}
function normalizeAudioExportScope(value) {
  const normalized = String(value || "").trim();
  return AUDIO_EXPORT_SCOPES.includes(normalized) ? normalized : "entire";
}
function normalizeAudioExportLocation(value) {
  const normalized = String(value || "").trim();
  return AUDIO_EXPORT_LOCATIONS.includes(normalized) ? normalized : "obsidian-attachment";
}
function normalizeVaultRelativeAudioPath(value) {
  const source = String(value || "");
  if (source.includes("\0")) {
    return "";
  }
  const normalized = source.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  const segments = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || segments.some((segment) => segment.trim() === "." || segment.trim() === "..")) {
    return "";
  }
  return normalized;
}
function normalizeAudioExportFolder(value) {
  return normalizeVaultRelativeAudioPath(value);
}
function getAvailableVaultAudioPath(vault, requestedPath) {
  const normalizedPath = normalizeVaultRelativeAudioPath(requestedPath);
  if (!normalizedPath) {
    throw new Error("The audio export path must stay inside the current Obsidian vault.");
  }
  if (!vault || typeof vault.getAbstractFileByPath !== "function") {
    return normalizedPath;
  }
  const extension = path.posix.extname(normalizedPath);
  const stem = extension ? normalizedPath.slice(0, -extension.length) : normalizedPath;
  for (let suffix = 0; suffix < 1e4; suffix += 1) {
    const candidate = `${stem}${suffix ? ` ${suffix}` : ""}${extension}`;
    if (!vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not choose a non-conflicting name for the exported audio.");
}
function selectMarkdownAudioExportText(documentText, selectionText, selectionStart, scopeValue) {
  const scope = normalizeAudioExportScope(scopeValue);
  if (scope === "selection") {
    return String(selectionText || "").trim();
  }
  if (scope === "from-selection") {
    return getTextFromPositionToEnd(
      normalizeLineBreaks(documentText).split("\n"),
      selectionStart
    ).trim();
  }
  return String(documentText || "").trim();
}
function createAudioExportSummary(options = {}) {
  return {
    chunkCount: Math.max(0, Math.floor(Number(options.chunkCount) || 0)),
    documentKind: options.documentKind === "pdf" ? "pdf" : "markdown",
    engineLabel: String(options.engineLabel || "Speech engine"),
    fileName: String(options.fileName || options.noteName || "document"),
    insertAfterExport: options.insertAfterExport === true,
    isOnline: isOnlineSpeechEngine(options.speechEngine),
    noteName: String(options.fileName || options.noteName || "document"),
    scope: normalizeAudioExportScope(options.scope),
    speechEngine: normalizeSpeechEngine(options.speechEngine),
    targetPath: String(options.targetPath || "").trim(),
    textLength: Math.max(0, Math.floor(Number(options.textLength) || 0))
  };
}
function getAudioExportScopeLabel(languageValue, scopeValue) {
  const useChinese = normalizeSettingsLanguage(languageValue) === "chinese";
  const scope = normalizeAudioExportScope(scopeValue);
  const labels = useChinese ? {
    entire: "\u5168\u90E8\u5185\u5BB9",
    selection: "\u4EC5\u9009\u4E2D\u5185\u5BB9",
    "from-selection": "\u4ECE\u9009\u4E2D\u4F4D\u7F6E\u5230\u672B\u5C3E"
  } : {
    entire: "Entire document",
    selection: "Selected text only",
    "from-selection": "From selection to end"
  };
  return labels[scope];
}
function getAudioExportScopeUiText(languageValue, context = {}) {
  const useChinese = normalizeSettingsLanguage(languageValue) === "chinese";
  const isPdf = context.documentKind === "pdf";
  const hasSelection = context.hasSelection === true;
  if (useChinese) {
    return {
      cancel: "\u53D6\u6D88",
      continue: "\u7EE7\u7EED",
      description: isPdf ? "\u9009\u62E9\u8981\u4ECE\u5F53\u524D\u6587\u672C\u578B PDF \u5BFC\u51FA\u7684\u5185\u5BB9\u8303\u56F4\u3002\u4E0B\u4E00\u6B65\u4F1A\u5148\u5728\u672C\u5730\u89E3\u6790\u5E76\u8BA1\u7B97\u51C6\u786E\u5206\u6BB5\uFF0C\u518D\u8981\u6C42\u786E\u8BA4\u3002" : "\u9009\u62E9\u8981\u4ECE\u5F53\u524D Markdown \u7B14\u8BB0\u5BFC\u51FA\u7684\u5185\u5BB9\u8303\u56F4\u3002\u4E0B\u4E00\u6B65\u4F1A\u8BA1\u7B97\u51C6\u786E\u5206\u6BB5\u5E76\u8981\u6C42\u786E\u8BA4\u3002",
      entire: "\u5168\u90E8\u5185\u5BB9",
      fileLabel: isPdf ? "PDF" : "\u7B14\u8BB0",
      fromSelection: "\u4ECE\u9009\u4E2D\u4F4D\u7F6E\u5230\u672B\u5C3E",
      noSelection: "\u5F53\u524D\u6587\u4EF6\u6CA1\u6709\u53EF\u7528\u9009\u533A\u3002\u8BF7\u5148\u9009\u4E2D\u6587\u5B57\uFF0C\u518D\u4F7F\u7528\u540E\u4E24\u79CD\u8303\u56F4\u3002",
      scopeLabel: "\u5BFC\u51FA\u8303\u56F4",
      selection: "\u4EC5\u9009\u4E2D\u5185\u5BB9",
      selectionAvailable: hasSelection,
      title: "\u9009\u62E9\u97F3\u9891\u5BFC\u51FA\u8303\u56F4"
    };
  }
  return {
    cancel: "Cancel",
    continue: "Continue",
    description: isPdf ? "Choose what to export from the current text-based PDF. The plugin will parse locally, calculate exact segments, and then ask for confirmation." : "Choose what to export from the current Markdown note. The plugin will calculate exact segments and then ask for confirmation.",
    entire: "Entire document",
    fileLabel: isPdf ? "PDF" : "Note",
    fromSelection: "From selection to end",
    noSelection: "There is no usable selection in the current file. Select text first to use the other two scopes.",
    scopeLabel: "Export scope",
    selection: "Selected text only",
    selectionAvailable: hasSelection,
    title: "Choose audio export scope"
  };
}
function getAudioExportUiText(languageValue, summaryValue) {
  const summary = createAudioExportSummary(summaryValue);
  const useChinese = normalizeSettingsLanguage(languageValue) === "chinese";
  const numberFormatter = new Intl.NumberFormat(useChinese ? "zh-CN" : "en-US");
  if (useChinese) {
    return {
      acknowledge: summary.isOnline ? "\u6211\u4E86\u89E3\uFF1A\u4E0A\u8FF0\u8303\u56F4\u5185\u7684\u53EF\u6717\u8BFB\u6587\u672C\u5C06\u5206\u6BB5\u53D1\u9001\u7ED9\u6240\u9009\u5728\u7EBF\u8BED\u97F3\u670D\u52A1\uFF0C\u5E76\u53EF\u80FD\u6D88\u8017 API \u989D\u5EA6\u6216\u4EA7\u751F\u8D39\u7528\u3002" : "\u6211\u4E86\u89E3\uFF1A\u63D2\u4EF6\u5C06\u4E3A\u4E0A\u8FF0\u8303\u56F4\u6267\u884C\u672C\u5730\u8BED\u97F3\u5408\u6210\uFF0C\u8FC7\u7A0B\u53EF\u80FD\u9700\u8981\u8F83\u957F\u65F6\u95F4\u3002",
      cancel: "\u53D6\u6D88",
      characterLabel: "\u53EF\u6717\u8BFB\u5B57\u7B26\u6570",
      confirm: summary.insertAfterExport ? "\u5BFC\u51FA\u5E76\u63D2\u5165" : "\u5BFC\u51FA\u97F3\u9891",
      description: summary.insertAfterExport ? "\u5168\u90E8\u5206\u6BB5\u6210\u529F\u540E\uFF0C\u97F3\u9891\u4F1A\u4FDD\u5B58\u5230\u4E0B\u65B9\u4F4D\u7F6E\u5E76\u63D2\u5165\u539F\u7B14\u8BB0\u3002" : "\u5168\u90E8\u5206\u6BB5\u6210\u529F\u540E\uFF0C\u97F3\u9891\u4F1A\u4FDD\u5B58\u5230\u4E0B\u65B9\u4F4D\u7F6E\u3002",
      engineLabel: "\u8BED\u97F3\u5F15\u64CE",
      fileLabel: summary.documentKind === "pdf" ? "PDF" : "\u7B14\u8BB0",
      locationLabel: "\u9884\u8BA1\u4FDD\u5B58\u4F4D\u7F6E",
      quotaWarning: summary.isOnline ? `\u5C06\u53D1\u9001 ${numberFormatter.format(summary.textLength)} \u4E2A\u5B57\u7B26\uFF0C\u8BA1\u5212\u6309 ${numberFormatter.format(summary.chunkCount)} \u4E2A\u5206\u6BB5\u987A\u5E8F\u5408\u6210\uFF1B\u4E34\u65F6\u5931\u8D25\u53EF\u80FD\u89E6\u53D1\u6709\u9650\u91CD\u8BD5\uFF0C\u56E0\u6B64\u5B9E\u9645\u7F51\u7EDC\u5C1D\u8BD5\u6B21\u6570\u53EF\u80FD\u66F4\u9AD8\u3002\u4E0D\u4F1A\u4E3A\u64AD\u653E\u8FDE\u7EED\u6027\u989D\u5916\u9884\u5408\u6210\u3002\u5B9E\u9645\u989D\u5EA6\u6216\u8D39\u7528\u7531\u670D\u52A1\u5546\u548C\u6A21\u578B\u51B3\u5B9A\u3002` : `\u5C06\u6267\u884C ${numberFormatter.format(summary.chunkCount)} \u4E2A\u672C\u5730\u5408\u6210\u5206\u6BB5\uFF1B\u4E0D\u4F1A\u8C03\u7528\u5728\u7EBF API\u3002`,
      requestLabel: summary.isOnline ? "\u9884\u8BA1\u5728\u7EBF\u8BF7\u6C42" : "\u5408\u6210\u5206\u6BB5",
      scopeLabel: "\u5BFC\u51FA\u8303\u56F4",
      scopeValue: getAudioExportScopeLabel("chinese", summary.scope),
      title: "\u786E\u8BA4\u5BFC\u51FA\u97F3\u9891\uFF1F"
    };
  }
  return {
    acknowledge: summary.isOnline ? "I understand that readable text in the selected scope will be sent in chunks to the selected online speech service and may use API quota or incur charges." : "I understand that the selected scope will be synthesized locally and may take a long time.",
    cancel: "Cancel",
    characterLabel: "Readable characters",
    confirm: summary.insertAfterExport ? "Export and insert" : "Export audio",
    description: summary.insertAfterExport ? "After every segment succeeds, the audio will be saved at the location below and embedded in the original note." : "After every segment succeeds, the audio will be saved at the location below.",
    engineLabel: "Speech engine",
    fileLabel: summary.documentKind === "pdf" ? "PDF" : "Note",
    locationLabel: "Planned save location",
    quotaWarning: summary.isOnline ? `${numberFormatter.format(summary.textLength)} characters will be sent in ${numberFormatter.format(summary.chunkCount)} planned sequential segments. Temporary failures may trigger bounded retries, so the network attempt count can be higher. No playback-continuity chunks are prefetched. Actual quota or cost depends on the provider and model.` : `${numberFormatter.format(summary.chunkCount)} local synthesis segments will run. No online API is used.`,
    requestLabel: summary.isOnline ? "Estimated online requests" : "Synthesis segments",
    scopeLabel: "Export scope",
    scopeValue: getAudioExportScopeLabel("english", summary.scope),
    title: "Confirm audio export?"
  };
}
var AudioExportScopeModal = class extends Modal {
  constructor(app, language, context) {
    super(app);
    this.language = language;
    this.context = context || {};
    this.settled = false;
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }
  finish(result) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveResult(result ? normalizeAudioExportScope(result) : null);
    this.close();
  }
  openAndWait() {
    this.open();
    return this.resultPromise;
  }
  onOpen() {
    const ui = getAudioExportScopeUiText(this.language, this.context);
    this.titleEl.setText(ui.title);
    this.contentEl.empty();
    this.contentEl.addClass("note-reader-cosyvoice-export-modal");
    this.contentEl.createEl("p", { text: ui.description });
    const fileSummary = this.contentEl.createEl("dl", { cls: "note-reader-cosyvoice-export-summary" });
    fileSummary.createEl("dt", { text: ui.fileLabel });
    fileSummary.createEl("dd", { text: String(this.context.fileName || "document") });
    const scopeRow = this.contentEl.createEl("label", { cls: "note-reader-cosyvoice-export-scope" });
    scopeRow.createSpan({ text: ui.scopeLabel });
    const select = scopeRow.createEl("select", { attr: { "aria-label": ui.scopeLabel } });
    const addOption = (value, label, disabled = false) => {
      const option = select.createEl("option", { attr: { value }, text: label });
      option.disabled = disabled;
    };
    addOption("entire", ui.entire);
    addOption("selection", ui.selection, !ui.selectionAvailable);
    addOption("from-selection", ui.fromSelection, !ui.selectionAvailable);
    select.value = "entire";
    if (!ui.selectionAvailable) {
      this.contentEl.createDiv({ cls: "note-reader-cosyvoice-export-hint", text: ui.noSelection });
    }
    const actions = this.contentEl.createDiv({ cls: "note-reader-cosyvoice-export-actions" });
    const cancelButton = actions.createEl("button", { text: ui.cancel });
    const continueButton = actions.createEl("button", { cls: "mod-cta", text: ui.continue });
    cancelButton.addEventListener("click", () => this.finish(null));
    continueButton.addEventListener("click", () => this.finish(select.value));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveResult(null);
    }
  }
};
var AudioExportConfirmModal = class extends Modal {
  constructor(app, language, summary) {
    super(app);
    this.language = language;
    this.summary = createAudioExportSummary(summary);
    this.settled = false;
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }
  finish(result) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveResult(Boolean(result));
    this.close();
  }
  openAndWait() {
    this.open();
    return this.resultPromise;
  }
  onOpen() {
    const ui = getAudioExportUiText(this.language, this.summary);
    this.titleEl.setText(ui.title);
    this.contentEl.empty();
    this.contentEl.addClass("note-reader-cosyvoice-export-modal");
    this.contentEl.createEl("p", { text: ui.description });
    const summaryEl = this.contentEl.createEl("dl", { cls: "note-reader-cosyvoice-export-summary" });
    const addSummaryRow = (label, value) => {
      summaryEl.createEl("dt", { text: label });
      summaryEl.createEl("dd", { text: String(value) });
    };
    addSummaryRow(ui.fileLabel, this.summary.fileName);
    addSummaryRow(ui.scopeLabel, ui.scopeValue);
    addSummaryRow(ui.engineLabel, this.summary.engineLabel);
    addSummaryRow(ui.locationLabel, this.summary.targetPath);
    addSummaryRow(ui.characterLabel, new Intl.NumberFormat().format(this.summary.textLength));
    addSummaryRow(ui.requestLabel, new Intl.NumberFormat().format(this.summary.chunkCount));
    this.contentEl.createDiv({
      cls: "note-reader-cosyvoice-export-warning",
      text: ui.quotaWarning
    });
    const acknowledgement = this.contentEl.createEl("label", {
      cls: "note-reader-cosyvoice-export-acknowledgement"
    });
    const checkbox = acknowledgement.createEl("input", {
      attr: { type: "checkbox" }
    });
    acknowledgement.createSpan({ text: ui.acknowledge });
    const actions = this.contentEl.createDiv({ cls: "note-reader-cosyvoice-export-actions" });
    const cancelButton = actions.createEl("button", { text: ui.cancel });
    const confirmButton = actions.createEl("button", {
      cls: "mod-cta",
      text: ui.confirm
    });
    confirmButton.disabled = true;
    checkbox.addEventListener("change", () => {
      confirmButton.disabled = !checkbox.checked;
    });
    cancelButton.addEventListener("click", () => this.finish(false));
    confirmButton.addEventListener("click", () => {
      if (checkbox.checked) {
        this.finish(true);
      }
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveResult(false);
    }
  }
};
var CosyVoiceReaderPlugin = class extends Plugin {
  async onload() {
    this.sequence = 0;
    this.activeSession = null;
    this.currentAudio = null;
    this.currentProcess = null;
    this.currentRequests = /* @__PURE__ */ new Set();
    this.lastMarkdownView = null;
    this.lastReadableFile = null;
    this.lastPdfSelection = null;
    this.pendingAudioMerge = null;
    this.pauseRequested = false;
    this.readerState = createReaderState();
    this.readerViews = /* @__PURE__ */ new Set();
    this.vaultBasePath = null;
    this.cacheDir = null;
    this.legacyCacheDir = null;
    this.legacyLogPath = null;
    this.logPath = null;
    this.statusBar = this.addStatusBarItem();
    await this.loadSettings();
    await this.ensureCacheDir();
    this.registerView(VIEW_TYPE, (leaf) => new CosyVoiceReaderView(leaf, this));
    this.lastMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const initiallyActiveFile = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
    if (isMarkdownFile(initiallyActiveFile) || isPdfFile(initiallyActiveFile)) {
      this.lastReadableFile = initiallyActiveFile;
    }
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
          this.lastMarkdownView = view;
        }
        const file = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
        if (isMarkdownFile(file) || isPdfFile(file)) {
          this.lastReadableFile = file;
        }
        this.renderReaderViews();
      })
    );
    if (typeof document !== "undefined") {
      this.registerDomEvent(document, "selectionchange", () => {
        this.capturePdfSelection();
      });
    }
    this.addRibbonIcon("volume-2", "Open voice reader controls", () => {
      void this.activateControlView();
    });
    this.addCommand({
      id: "open-control-panel",
      name: "Open voice reader controls",
      callback: () => {
        void this.activateControlView();
      }
    });
    this.addCommand({
      id: "read-current-note",
      name: "Read current note or PDF aloud",
      callback: () => {
        void this.runUserAction("Read file", () => this.readCurrentNote());
      }
    });
    this.addCommand({
      id: "export-current-note-audio",
      name: "Export audio from current note or PDF",
      checkCallback: (checking) => {
        if (!this.canExportCurrentFile()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction("Export audio", () => this.exportCurrentFileAudio({ insertAfterExport: false }));
        }
        return true;
      }
    });
    this.addCommand({
      id: "export-current-note-audio-and-insert",
      name: "Export audio from the current note and insert it",
      checkCallback: (checking) => {
        if (!this.canInsertAudioExportIntoCurrentNote()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction("Export and insert audio", () => this.exportCurrentFileAudio({ insertAfterExport: true }));
        }
        return true;
      }
    });
    this.addCommand({
      id: "retry-audio-export-merge",
      name: "Retry pending audio export merge only",
      checkCallback: (checking) => {
        if (!this.hasPendingAudioMerge()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction("Retry merge only", () => this.retryPendingAudioMerge());
        }
        return true;
      }
    });
    this.addCommand({
      id: "resume-current-file",
      name: "Resume reading current note or PDF",
      checkCallback: (checking) => {
        if (!this.canResumeCurrentFile()) {
          return false;
        }
        if (!checking) {
          void this.resumeCurrentFile();
        }
        return true;
      }
    });
    this.addCommand({
      id: "read-current-pdf",
      name: "Read current PDF aloud",
      checkCallback: (checking) => {
        const file = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
        if (!isPdfFile(file)) {
          return false;
        }
        if (!checking) {
          void this.readCurrentPdf(file);
        }
        return true;
      }
    });
    this.addCommand({
      id: "read-current-pdf-from-selection",
      name: "Read current PDF from selection aloud",
      checkCallback: (checking) => {
        const file = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
        if (!isPdfFile(file)) {
          return false;
        }
        if (!checking) {
          void this.readCurrentPdfFromSelection(file);
        }
        return true;
      }
    });
    this.addCommand({
      id: "read-selection",
      name: "Read selection aloud",
      callback: () => {
        void this.readSelection();
      }
    });
    this.addCommand({
      id: "read-from-selection",
      name: "Read from selection aloud",
      callback: () => {
        void this.readFromSelection();
      }
    });
    this.addCommand({
      id: "pause-or-resume",
      name: "Pause or resume voice reading",
      callback: () => {
        void this.pauseOrResume();
      }
    });
    this.addCommand({
      id: "seek-backward-5-seconds",
      name: "Seek backward 5 seconds",
      checkCallback: (checking) => {
        if (!this.readerState.canSeek) {
          return false;
        }
        if (!checking) {
          this.seekCurrentAudioBySeconds(-KEYBOARD_SEEK_SECONDS);
        }
        return true;
      }
    });
    this.addCommand({
      id: "seek-forward-5-seconds",
      name: "Seek forward 5 seconds",
      checkCallback: (checking) => {
        if (!this.readerState.canSeek) {
          return false;
        }
        if (!checking) {
          this.seekCurrentAudioBySeconds(KEYBOARD_SEEK_SECONDS);
        }
        return true;
      }
    });
    this.addCommand({
      id: "previous-reading-chunk",
      name: "Move to previous reading chunk",
      checkCallback: (checking) => {
        if (!this.readerState.canPreviousChunk) {
          return false;
        }
        if (!checking) {
          this.jumpToAdjacentChunk(-1);
        }
        return true;
      }
    });
    this.addCommand({
      id: "next-reading-chunk",
      name: "Move to next reading chunk",
      checkCallback: (checking) => {
        if (!this.readerState.canNextChunk) {
          return false;
        }
        if (!checking) {
          this.jumpToAdjacentChunk(1);
        }
        return true;
      }
    });
    this.addCommand({
      id: "stop-reading",
      name: "Stop voice reading",
      callback: () => {
        void this.stopReading();
      }
    });
    this.addSettingTab(new CosyVoiceReaderSettingTab(this.app, this));
    this.register(() => {
      void this.stopReading({ silent: true });
    });
    this.updateStatus("CosyVoice idle");
  }
  async onunload() {
    await this.stopReading({ silent: true });
    if (this.settings && this.settings.cleanupCache) {
      await this.discardPendingAudioMerge({ silent: true });
    }
  }
  async loadSettings() {
    const defaults = createDefaultSettings();
    const savedSettings = await this.loadData();
    const source = savedSettings && typeof savedSettings === "object" ? savedSettings : {};
    const removedObsoleteSettings = Object.keys(source).some(
      (key) => !Object.prototype.hasOwnProperty.call(defaults, key)
    );
    const missingKnownSettings = Object.keys(defaults).some(
      (key) => !Object.prototype.hasOwnProperty.call(source, key)
    );
    const hadAzureCredentialSource = Object.prototype.hasOwnProperty.call(source, "azureSpeechCredentialSource");
    const hadOpenRouterCredentialSource = Object.prototype.hasOwnProperty.call(source, "openRouterCredentialSource");
    this.settings = selectKnownSettings(defaults, source);
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    this.settings.azureSpeechCloud = normalizeAzureSpeechCloud(this.settings.azureSpeechCloud);
    this.settings.azureSpeechConsent = this.settings.azureSpeechConsent === true;
    this.settings.azureSpeechCredentialSource = !hadAzureCredentialSource && String(source.azureSpeechKeyPath || "").trim() ? "key-file" : normalizeCredentialSource(this.settings.azureSpeechCredentialSource);
    this.settings.azureSpeechKeyPath = String(this.settings.azureSpeechKeyPath || "").trim();
    this.settings.azureSpeechRegion = normalizeAzureSpeechRegion(this.settings.azureSpeechRegion);
    this.settings.azureSpeechSecretName = String(this.settings.azureSpeechSecretName || "").trim();
    this.settings.azureSpeechVoice = normalizeAzureSpeechVoice(this.settings.azureSpeechVoice);
    this.settings.edgeTtsConsent = this.settings.edgeTtsConsent === true;
    this.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    this.settings.edgeTtsVoice = normalizeEdgeTtsVoice(this.settings.edgeTtsVoice);
    this.settings.diagnosticLogging = this.settings.diagnosticLogging === true;
    this.settings.mathReadingLanguage = normalizeMathReadingLanguage(this.settings.mathReadingLanguage);
    this.settings.openRouterConsent = this.settings.openRouterConsent === true;
    this.settings.openRouterCredentialSource = !hadOpenRouterCredentialSource && String(source.openRouterKeyPath || "").trim() ? "key-file" : normalizeCredentialSource(this.settings.openRouterCredentialSource);
    this.settings.openRouterKeyPath = String(this.settings.openRouterKeyPath || "").trim();
    this.settings.openRouterModel = normalizeOpenRouterModel(this.settings.openRouterModel);
    this.settings.openRouterSecretName = String(this.settings.openRouterSecretName || "").trim();
    this.settings.openRouterVoice = normalizeOpenRouterVoice(this.settings.openRouterVoice);
    this.settings.settingsLanguage = normalizeSettingsLanguage(this.settings.settingsLanguage);
    this.settings.scriptPath = String(this.settings.scriptPath || defaults.scriptPath);
    this.settings.chunkLimits = parseChunkLimits(this.settings.chunkLimits).join(",");
    this.settings.onlineChunkLimits = parseChunkLimits(
      this.settings.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(",");
    this.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(this.settings.onlinePrefetchChunks);
    this.settings.readingPositions = normalizeReadingPositions(this.settings.readingPositions);
    this.settings.rememberReadingPosition = this.settings.rememberReadingPosition === true;
    if (removedObsoleteSettings || missingKnownSettings) {
      await this.saveData(this.settings);
    }
  }
  async saveSettings() {
    this.settings = selectKnownSettings(createDefaultSettings(), this.settings);
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    this.settings.azureSpeechCloud = normalizeAzureSpeechCloud(this.settings.azureSpeechCloud);
    this.settings.azureSpeechConsent = this.settings.azureSpeechConsent === true;
    this.settings.azureSpeechCredentialSource = normalizeCredentialSource(this.settings.azureSpeechCredentialSource);
    this.settings.azureSpeechKeyPath = String(this.settings.azureSpeechKeyPath || "").trim();
    this.settings.azureSpeechRegion = normalizeAzureSpeechRegion(this.settings.azureSpeechRegion);
    this.settings.azureSpeechSecretName = String(this.settings.azureSpeechSecretName || "").trim();
    this.settings.azureSpeechVoice = normalizeAzureSpeechVoice(this.settings.azureSpeechVoice);
    this.settings.edgeTtsConsent = this.settings.edgeTtsConsent === true;
    this.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    this.settings.edgeTtsVoice = normalizeEdgeTtsVoice(this.settings.edgeTtsVoice);
    this.settings.diagnosticLogging = this.settings.diagnosticLogging === true;
    this.settings.mathReadingLanguage = normalizeMathReadingLanguage(this.settings.mathReadingLanguage);
    this.settings.openRouterConsent = this.settings.openRouterConsent === true;
    this.settings.openRouterCredentialSource = normalizeCredentialSource(this.settings.openRouterCredentialSource);
    this.settings.openRouterKeyPath = String(this.settings.openRouterKeyPath || "").trim();
    this.settings.openRouterModel = normalizeOpenRouterModel(this.settings.openRouterModel);
    this.settings.openRouterSecretName = String(this.settings.openRouterSecretName || "").trim();
    this.settings.openRouterVoice = normalizeOpenRouterVoice(this.settings.openRouterVoice);
    this.settings.settingsLanguage = normalizeSettingsLanguage(this.settings.settingsLanguage);
    this.settings.chunkLimits = parseChunkLimits(this.settings.chunkLimits).join(",");
    this.settings.onlineChunkLimits = parseChunkLimits(
      this.settings.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(",");
    this.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(this.settings.onlinePrefetchChunks);
    this.settings.readingPositions = normalizeReadingPositions(this.settings.readingPositions);
    this.settings.rememberReadingPosition = this.settings.rememberReadingPosition === true;
    await this.saveData(this.settings);
  }
  async resetSettingsToDefaults() {
    this.settings = createDefaultSettings();
    await this.saveSettings();
  }
  async setSpeechSpeed(speed) {
    if (!this.settings) {
      this.settings = createDefaultSettings();
    }
    this.settings.speed = normalizeSpeed(speed);
    await this.saveSettings();
    this.renderReaderViews();
    return this.settings.speed;
  }
  async ensureCacheDir() {
    const adapter = this.app.vault.adapter;
    if (!adapter || typeof adapter.getBasePath !== "function") {
      throw new Error("Note and PDF Voice Reader requires the desktop FileSystemAdapter.");
    }
    this.vaultBasePath = adapter.getBasePath();
    this.legacyCacheDir = path.join(this.vaultBasePath, ".obsidian", "plugins", PLUGIN_ID, "cache");
    this.legacyLogPath = path.join(this.vaultBasePath, ".obsidian", "plugins", PLUGIN_ID, "last-error.log");
    this.cacheDir = getPluginTempCacheDir(this.vaultBasePath);
    this.logPath = path.join(this.cacheDir, "diagnostic.log");
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
    if (this.settings.cleanupCache) {
      await this.cleanupStaleTemporaryData();
    }
  }
  async cleanupOwnedFilesInDirectory(directoryPath) {
    if (!directoryPath) {
      return;
    }
    let entries;
    try {
      entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !isOwnedCacheFileName(entry.name)) {
        continue;
      }
      try {
        await fs.promises.unlink(path.join(directoryPath, entry.name));
      } catch (error) {
        if (!error || error.code !== "ENOENT") {
          console.warn(`[${PLUGIN_ID}] Could not remove stale temporary file`, entry.name, error);
        }
      }
    }
  }
  async removeLegacyRuntimeLog() {
    if (!this.legacyLogPath) {
      return;
    }
    try {
      await fs.promises.unlink(this.legacyLogPath);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        console.warn(`[${PLUGIN_ID}] Could not remove legacy runtime log`, error);
      }
    }
  }
  async cleanupStaleTemporaryData() {
    await this.cleanupOwnedFilesInDirectory(this.cacheDir);
    await this.cleanupOwnedFilesInDirectory(this.legacyCacheDir);
    await this.removeLegacyRuntimeLog();
    if (this.legacyCacheDir) {
      try {
        await fs.promises.rmdir(this.legacyCacheDir);
      } catch (error) {
        if (!error || !["ENOENT", "ENOTEMPTY"].includes(error.code)) {
          console.warn(`[${PLUGIN_ID}] Could not remove empty legacy cache directory`, error);
        }
      }
    }
  }
  async clearTemporaryData() {
    await this.stopReading({ silent: true });
    this.pendingAudioMerge = null;
    await this.cleanupStaleTemporaryData();
    new Notice(getSettingsUiText(this.settings.settingsLanguage).temporaryDataClearedNotice);
  }
  async activateControlView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice("CosyVoice: unable to open reader controls.");
        return null;
      }
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true
      });
    }
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
  registerReaderView(view) {
    this.readerViews.add(view);
    view.render();
  }
  unregisterReaderView(view) {
    this.readerViews.delete(view);
  }
  renderReaderViews() {
    for (const view of this.readerViews) {
      view.render();
    }
  }
  setReaderState(patch) {
    this.readerState = createReaderState({
      ...this.readerState,
      ...patch
    });
    this.renderReaderViews();
  }
  async runUserAction(label, action) {
    try {
      return await action();
    } catch (error) {
      const message = messageFromError(error);
      if (!this.activeSession) {
        this.updateStatus(`CosyVoice ${label} error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
      }
      if (typeof this.writeRuntimeLog === "function") {
        await this.writeRuntimeLog("failed", { message: `${label}: ${message}` });
      }
      new Notice(`CosyVoice ${label} failed: ${message}`, 1e4);
      return null;
    }
  }
  capturePdfSelection() {
    if (typeof document === "undefined" || typeof document.getSelection !== "function") {
      return null;
    }
    const selection = document.getSelection();
    const selectedText = selection && typeof selection.toString === "function" ? selection.toString().trim() : "";
    if (!selectedText) {
      return null;
    }
    const workspace = this.app && this.app.workspace;
    const leaves = workspace && typeof workspace.getLeavesOfType === "function" ? workspace.getLeavesOfType("pdf") : [];
    const activeFile = workspace && typeof workspace.getActiveFile === "function" ? workspace.getActiveFile() : null;
    const context = getPdfSelectionContext(selection, leaves, activeFile);
    this.lastPdfSelection = context;
    return context;
  }
  getPdfSelectionForFile(file) {
    const liveSelection = this.capturePdfSelection();
    const context = liveSelection || this.lastPdfSelection;
    return context && context.filePath === getPdfFileIdentity(file) ? context : null;
  }
  getCurrentReadableFile() {
    const workspace = this.app && this.app.workspace;
    const activeFile = workspace && typeof workspace.getActiveFile === "function" ? workspace.getActiveFile() : null;
    if (activeFile) {
      if (isMarkdownFile(activeFile) || isPdfFile(activeFile)) {
        this.lastReadableFile = activeFile;
      }
      return activeFile;
    }
    return this.lastReadableFile || null;
  }
  findMarkdownViewForFile(file) {
    if (!isMarkdownFile(file)) {
      return null;
    }
    const targetPath = getPdfFileIdentity(file);
    const workspace = this.app && this.app.workspace;
    const candidates = [];
    if (workspace && typeof workspace.getActiveViewOfType === "function") {
      candidates.push(workspace.getActiveViewOfType(MarkdownView));
    }
    candidates.push(this.lastMarkdownView);
    if (workspace && typeof workspace.getLeavesOfType === "function") {
      const leaves = workspace.getLeavesOfType("markdown");
      for (const leaf of Array.isArray(leaves) ? leaves : []) {
        candidates.push(leaf && leaf.view);
      }
    }
    const view = candidates.find((candidate) => candidate && candidate.editor && getPdfFileIdentity(candidate.file) === targetPath);
    if (view) {
      this.lastMarkdownView = view;
    }
    return view || null;
  }
  getCurrentMarkdownContext(options = {}) {
    const notify = options.notify !== false;
    const file = this.getCurrentReadableFile();
    const view = this.findMarkdownViewForFile(file);
    if (!file || !view) {
      if (notify) {
        new Notice("CosyVoice: open a Markdown note before using this action.", 8e3);
      }
      return null;
    }
    return { file, view };
  }
  getActiveMarkdownView() {
    const context = this.getCurrentMarkdownContext({ notify: true });
    return context ? context.view : null;
  }
  getCurrentAudioExportContext(options = {}) {
    const notify = options.notify !== false;
    const file = this.getCurrentReadableFile();
    if (isMarkdownFile(file)) {
      const view = this.findMarkdownViewForFile(file);
      if (!view || !view.editor) {
        if (notify) {
          new Notice("CosyVoice: open the Markdown note before exporting audio.", 8e3);
        }
        return null;
      }
      const documentText = String(view.editor.getValue() || "");
      const selectionText = typeof view.editor.getSelection === "function" ? String(view.editor.getSelection() || "") : "";
      const selectionStart = typeof view.editor.getCursor === "function" ? view.editor.getCursor("from") : null;
      return {
        documentKind: "markdown",
        documentText,
        file,
        fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || "note",
        hasSelection: Boolean(selectionText.trim()),
        selectionStart,
        selectionText,
        view
      };
    }
    if (isPdfFile(file)) {
      const selectionContext = this.getPdfSelectionForFile(file);
      return {
        documentKind: "pdf",
        file,
        fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || "PDF",
        hasSelection: Boolean(selectionContext && selectionContext.selectedText),
        selectionContext
      };
    }
    if (notify) {
      new Notice("CosyVoice: open a Markdown note or text-based PDF before exporting audio.", 8e3);
    }
    return null;
  }
  canExportCurrentFile() {
    return Boolean(this.getCurrentAudioExportContext({ notify: false }));
  }
  canInsertAudioExportIntoCurrentNote() {
    const context = this.getCurrentAudioExportContext({ notify: false });
    return Boolean(context && context.documentKind === "markdown");
  }
  canExportCurrentNote() {
    return this.canInsertAudioExportIntoCurrentNote();
  }
  getCurrentNoteExportContext() {
    return this.getCurrentMarkdownContext({ notify: true });
  }
  requestAudioExportScope(context) {
    const modal = new AudioExportScopeModal(
      this.app,
      this.settings && this.settings.settingsLanguage,
      context
    );
    return modal.openAndWait();
  }
  requestAudioExportConfirmation(summary) {
    const modal = new AudioExportConfirmModal(
      this.app,
      this.settings && this.settings.settingsLanguage,
      summary
    );
    return modal.openAndWait();
  }
  async getAudioExportTargetPlan(noteFile, extension, scope = "entire") {
    const normalizedExtension = String(extension || "").trim().toLowerCase().replace(/^\./, "");
    if (!["mp3", "wav"].includes(normalizedExtension)) {
      throw new Error("The selected speech engine returned an unsupported export format.");
    }
    const fileName = buildExportAudioFileName(
      noteFile && (noteFile.basename || noteFile.name) || "note",
      normalizedExtension,
      normalizeAudioExportScope(scope)
    );
    const location = normalizeAudioExportLocation(
      this.settings && this.settings.audioExportLocation
    );
    let requestedPath = "";
    if (location === "obsidian-attachment" && this.app.fileManager && typeof this.app.fileManager.getAvailablePathForAttachment === "function") {
      requestedPath = await this.app.fileManager.getAvailablePathForAttachment(
        fileName,
        noteFile && noteFile.path
      );
    } else {
      let folder = "";
      if (location === "custom-folder") {
        folder = normalizeAudioExportFolder(this.settings && this.settings.audioExportFolder);
        if (!folder) {
          throw new Error("Choose a valid custom audio folder in the plugin settings before exporting.");
        }
      } else {
        const noteFolder = path.posix.dirname(String(noteFile && noteFile.path || ""));
        folder = noteFolder && noteFolder !== "." ? noteFolder : "";
      }
      requestedPath = folder ? `${folder}/${fileName}` : fileName;
    }
    return {
      location,
      targetPath: getAvailableVaultAudioPath(this.app.vault, requestedPath)
    };
  }
  async ensureAudioExportFolder(folderPath) {
    const normalizedFolder = normalizeAudioExportFolder(folderPath);
    if (!normalizedFolder) {
      return;
    }
    const vault = this.app && this.app.vault;
    if (!vault || typeof vault.getAbstractFileByPath !== "function" || typeof vault.createFolder !== "function") {
      throw new Error("This Obsidian version cannot create the custom audio export folder.");
    }
    let currentPath = "";
    for (const segment of normalizedFolder.split("/")) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = vault.getAbstractFileByPath(currentPath);
      if (existing) {
        if (!Array.isArray(existing.children)) {
          throw new Error(`Cannot create the audio export folder because ${currentPath} is a file.`);
        }
        continue;
      }
      try {
        await vault.createFolder(currentPath);
      } catch (error) {
        const concurrentlyCreated = vault.getAbstractFileByPath(currentPath);
        if (!concurrentlyCreated || !Array.isArray(concurrentlyCreated.children)) {
          throw error;
        }
      }
    }
  }
  async createVaultAudioAttachment(noteFile, temporaryAudioPath, extension, targetPlan = null) {
    if (!this.app.vault || typeof this.app.vault.createBinary !== "function") {
      throw new Error("This Obsidian version cannot create binary attachments.");
    }
    const normalizedExtension = String(extension || "").trim().toLowerCase().replace(/^\./, "");
    const plan = targetPlan && targetPlan.targetPath ? {
      location: normalizeAudioExportLocation(targetPlan.location),
      targetPath: targetPlan.targetPath
    } : await this.getAudioExportTargetPlan(noteFile, normalizedExtension);
    let targetPath = normalizeVaultRelativeAudioPath(plan.targetPath);
    if (!targetPath || path.posix.extname(targetPath).toLowerCase() !== `.${normalizedExtension}`) {
      throw new Error("Obsidian returned an invalid attachment path for the exported audio.");
    }
    if (typeof this.app.vault.getAbstractFileByPath === "function" && this.app.vault.getAbstractFileByPath(targetPath)) {
      targetPath = getAvailableVaultAudioPath(this.app.vault, targetPath);
    }
    if (plan.location === "custom-folder") {
      const targetFolder = path.posix.dirname(targetPath);
      await this.ensureAudioExportFolder(targetFolder === "." ? "" : targetFolder);
    }
    const audioBytes = await fs.promises.readFile(temporaryAudioPath);
    if (!audioBytes.length || audioBytes.length > MAX_EXPORTED_AUDIO_BYTES) {
      throw new Error(`The exported audio is empty or exceeds the ${Math.floor(MAX_EXPORTED_AUDIO_BYTES / (1024 * 1024))} MB safety limit.`);
    }
    return this.app.vault.createBinary(targetPath, bufferToArrayBuffer(audioBytes));
  }
  async insertAudioAttachmentIntoNote(noteFile, audioFile) {
    const generatedLink = this.app.fileManager && typeof this.app.fileManager.generateMarkdownLink === "function" ? this.app.fileManager.generateMarkdownLink(audioFile, noteFile.path) : `[[${audioFile.path}]]`;
    const embed = generatedLink.startsWith("!") ? generatedLink : `!${generatedLink}`;
    const workspace = this.app && this.app.workspace;
    const activeView = workspace && typeof workspace.getActiveViewOfType === "function" ? workspace.getActiveViewOfType(MarkdownView) : null;
    if (activeView && activeView.editor && getPdfFileIdentity(activeView.file) === getPdfFileIdentity(noteFile)) {
      activeView.editor.replaceRange(`
${embed}
`, activeView.editor.getCursor());
      return "cursor";
    }
    if (this.app.vault && typeof this.app.vault.process === "function") {
      await this.app.vault.process(noteFile, (content) => {
        const trimmed = String(content || "").replace(/\s*$/, "");
        return `${trimmed}${trimmed ? "\n\n" : ""}${embed}
`;
      });
      return "end";
    }
    throw new Error("The audio was exported, but the original note is no longer open and cannot be updated safely.");
  }
  getPendingAudioMerge() {
    const pending = this.pendingAudioMerge;
    const preparedPaths = pending && Array.isArray(pending.preparedPaths) ? pending.preparedPaths : [];
    const isValid = Boolean(
      pending && preparedPaths.length && preparedPaths.every((filePath) => this.cacheDir && isInsideDirectory(filePath, this.cacheDir) && fs.existsSync(filePath))
    );
    if (!isValid) {
      this.pendingAudioMerge = null;
      return null;
    }
    return pending;
  }
  hasPendingAudioMerge() {
    return Boolean(this.getPendingAudioMerge());
  }
  preservePendingAudioMerge(job, session) {
    const preparedPaths = Array.isArray(job && job.preparedPaths) ? job.preparedPaths.filter((filePath) => this.cacheDir && isInsideDirectory(filePath, this.cacheDir) && fs.existsSync(filePath)) : [];
    if (!preparedPaths.length) {
      return false;
    }
    this.pendingAudioMerge = {
      ...job,
      preparedPaths: preparedPaths.slice()
    };
    if (session) {
      session.preservedAudioPaths = preparedPaths.slice();
    }
    this.renderReaderViews();
    return true;
  }
  async discardPendingAudioMerge(options = {}) {
    const pending = this.pendingAudioMerge;
    this.pendingAudioMerge = null;
    const paths = pending ? [
      ...Array.isArray(pending.preparedPaths) ? pending.preparedPaths : [],
      pending.temporaryOutputPath
    ].filter(Boolean) : [];
    for (const filePath of paths) {
      await this.removeTempFile(filePath);
    }
    this.renderReaderViews();
    if (!options.silent && pending) {
      new Notice("CosyVoice: kept export segments were removed.");
    }
  }
  createAudioMergeRetryError(error, segmentCount, stage = "merge") {
    const action = stage === "merge" ? "Audio merging" : "Audio export finalization";
    const retryError = new Error(
      `${action} failed: ${messageFromError(error)} ${segmentCount} synthesized segments were kept locally. Use "Retry merge only"; it reuses those files and does not call the TTS API again.`
    );
    retryError.code = "AUDIO_MERGE_RETRY_AVAILABLE";
    retryError.cause = error;
    return retryError;
  }
  async finalizeMergedAudioExport(job, merged, session) {
    const audioFile = await this.createVaultAudioAttachment(
      job.context.file,
      job.temporaryOutputPath,
      job.extension,
      job.exportPlan
    );
    if (!this.isActive(session)) {
      new Notice(`CosyVoice: the completed audio was saved to ${audioFile.path} after export was stopped.`, 1e4);
      return audioFile;
    }
    let insertionLocation = "";
    let insertionError = null;
    if (job.insertAfterExport) {
      try {
        insertionLocation = await this.insertAudioAttachmentIntoNote(job.context.file, audioFile);
      } catch (error) {
        insertionError = error;
      }
    }
    this.updateStatus(`${job.configuration.engineLabel} audio export complete`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: false,
      currentChunk: job.preparedPaths.length,
      currentText: audioFile.path,
      error: insertionError ? messageFromError(insertionError) : "",
      isPaused: false,
      phase: "complete",
      progress: 1,
      status: "complete",
      totalChunks: job.preparedPaths.length
    });
    await this.writeRuntimeLog("audio-export-complete", {
      bytes: merged.bytes,
      chunks: job.preparedPaths.length,
      documentKind: job.context.documentKind,
      inserted: Boolean(insertionLocation),
      scope: job.scope
    });
    this.activeSession = null;
    const insertedMessage = insertionLocation === "cursor" ? " and inserted at the current cursor" : insertionLocation === "end" ? " and appended to the original note" : "";
    if (insertionError) {
      new Notice(
        `CosyVoice: audio was exported to ${audioFile.path}, but it could not be inserted: ${messageFromError(insertionError)}`,
        12e3
      );
    } else {
      new Notice(`CosyVoice: exported ${audioFile.path}${insertedMessage}.`, 1e4);
    }
    return audioFile;
  }
  async retryPendingAudioMerge() {
    const job = this.getPendingAudioMerge();
    if (!job) {
      new Notice("CosyVoice: no synthesized export segments are available for merge retry.", 6e3);
      this.renderReaderViews();
      return null;
    }
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const segmentCount = job.preparedPaths.length;
    const session = this.createSpeechSession(
      Array.from({ length: segmentCount }, () => "kept audio segment"),
      job.sourceLabel,
      job.configuration,
      {
        file: job.context.file,
        kind: "audio-export",
        sourceKind: job.context.documentKind
      }
    );
    session.files.push(...job.preparedPaths, job.temporaryOutputPath);
    this.activeSession = session;
    this.updateStatus(`${job.configuration.engineLabel} retrying merge`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: segmentCount,
      currentText: `Combining ${segmentCount} kept synthesized segments without new TTS requests...`,
      error: "",
      isPaused: false,
      phase: "synthesizing",
      progress: 0.99,
      source: job.sourceLabel,
      status: "running",
      totalChunks: segmentCount
    });
    new Notice(
      `CosyVoice: retrying the merge from ${segmentCount} kept segments. No TTS API request will be made.`,
      8e3
    );
    try {
      const merged = await mergeAudioFiles(
        job.preparedPaths,
        job.temporaryOutputPath,
        job.extension
      );
      if (!this.isActive(session)) {
        throw new Error("Audio export stopped.");
      }
      const audioFile = await this.finalizeMergedAudioExport(job, merged, session);
      this.pendingAudioMerge = null;
      this.renderReaderViews();
      return audioFile;
    } catch (error) {
      if (this.isActive(session)) {
        this.preservePendingAudioMerge(job, session);
        const retryError = error && error.code === "AUDIO_MERGE_RETRY_AVAILABLE" ? error : this.createAudioMergeRetryError(error, segmentCount, "merge");
        const message = messageFromError(retryError);
        this.updateStatus(`${job.configuration.engineLabel} merge retry error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", { message });
        new Notice(`CosyVoice merge retry failed: ${message}`, 12e3);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
        this.renderReaderViews();
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session, {
          preservePaths: session.preservedAudioPaths
        });
      }
    }
  }
  sanitizeAudioExportText(value) {
    return this.settings.stripMarkdown ? sanitizeTextForSpeech(value, {
      mathReadingLanguage: this.settings.mathReadingLanguage
    }) : normalizeLineBreaks(value).trim();
  }
  isAudioExportContextCurrent(context) {
    const currentFile = this.getCurrentReadableFile();
    if (!currentFile || getPdfFileIdentity(currentFile) !== getPdfFileIdentity(context.file)) {
      return false;
    }
    if (context.documentKind === "markdown") {
      const view = this.findMarkdownViewForFile(currentFile);
      return Boolean(view && view.editor && String(view.editor.getValue() || "") === context.documentText);
    }
    return getFileMtime(currentFile) === context.fileMtime;
  }
  async extractPdfAudioExportText(context, scope, configuration) {
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const sourceLabel = `${context.fileName} (PDF export preparation)`;
    const session = this.createSpeechSession([], sourceLabel, configuration, {
      file: context.file,
      kind: "audio-export",
      sourceKind: "pdf"
    });
    this.activeSession = session;
    this.updateStatus("PDF export preparation", {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: scope === "from-selection" ? `Extracting PDF from page ${context.selectionContext.pageNumber}...` : "Extracting complete PDF text...",
      error: "",
      isPaused: false,
      phase: "extracting PDF",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: 0
    });
    try {
      const selectionContext = scope === "from-selection" ? context.selectionContext : null;
      const extractedText = await this.extractPdfText(context.file, session, {
        reportProgress: true,
        selectedText: selectionContext ? selectionContext.selectedText : "",
        selectionPosition: selectionContext ? selectionContext.selectionPosition : null,
        startPageNumber: selectionContext ? selectionContext.pageNumber : 1
      });
      if (!this.isActive(session)) {
        return null;
      }
      if (selectionContext && session.pdfSelectionMatched === false) {
        throw new Error("The selected PDF position could not be matched reliably. Select a slightly longer phrase and try again.");
      }
      const text = this.sanitizeAudioExportText(extractedText);
      if (!text) {
        throw new Error("No extractable text was found. This PDF may be scanned or image-only; run OCR first and try again.");
      }
      this.updateStatus("PDF export preparation complete", {
        canPause: false,
        canNextChunk: false,
        canPreviousChunk: false,
        canSeek: false,
        canStop: false,
        currentText: previewText(text),
        isPaused: false,
        phase: "complete",
        progress: 1,
        status: "complete"
      });
      session.stopped = true;
      this.activeSession = null;
      return text;
    } catch (error) {
      if (this.isActive(session)) {
        const message = getPdfExtractionErrorMessage(error);
        this.updateStatus("PDF export preparation error", {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", { message });
        new Notice(`CosyVoice PDF export failed: ${message}`, 1e4);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session);
      }
    }
  }
  async exportCurrentFileAudio(options = {}) {
    if (this.hasPendingAudioMerge()) {
      new Notice(
        'CosyVoice: a previous export is waiting for "Retry merge only". Retry it first, or use Clear temporary data in settings to discard the kept segments.',
        12e3
      );
      return null;
    }
    const context = this.getCurrentAudioExportContext({ notify: true });
    if (!context) {
      return null;
    }
    if (options.expectedDocumentKind && context.documentKind !== options.expectedDocumentKind) {
      new Notice("CosyVoice: open a Markdown note before using this action.", 8e3);
      return null;
    }
    const insertAfterExport = options.insertAfterExport === true;
    if (insertAfterExport && context.documentKind !== "markdown") {
      new Notice("CosyVoice: PDF audio can be saved as an attachment but cannot be inserted into the PDF.", 8e3);
      return null;
    }
    const scope = Object.prototype.hasOwnProperty.call(options, "scope") ? normalizeAudioExportScope(options.scope) : await this.requestAudioExportScope(context);
    if (!scope) {
      return null;
    }
    if (scope !== "entire" && !context.hasSelection) {
      new Notice("CosyVoice: select text before using the selected-text export scopes.", 8e3);
      return null;
    }
    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return null;
    }
    const extension = getAudioExportExtension(configuration.speechEngine);
    const exportPlan = await this.getAudioExportTargetPlan(context.file, extension, scope);
    let text = "";
    if (context.documentKind === "markdown") {
      text = this.sanitizeAudioExportText(selectMarkdownAudioExportText(
        context.documentText,
        context.selectionText,
        context.selectionStart,
        scope
      ));
    } else if (scope === "selection") {
      text = this.sanitizeAudioExportText(context.selectionContext.selectedText);
    } else {
      text = await this.extractPdfAudioExportText(context, scope, configuration);
      if (!text) {
        return null;
      }
    }
    const chunks = splitTextForSpeechChunks(text, configuration.chunkLimits);
    if (!text || !chunks.length) {
      new Notice("CosyVoice: nothing readable in the selected export scope.", 6e3);
      return null;
    }
    const summary = createAudioExportSummary({
      chunkCount: chunks.length,
      documentKind: context.documentKind,
      engineLabel: configuration.engineLabel,
      fileName: context.fileName,
      insertAfterExport,
      scope,
      speechEngine: configuration.speechEngine,
      targetPath: exportPlan.targetPath,
      textLength: text.length
    });
    if (!await this.requestAudioExportConfirmation(summary)) {
      return null;
    }
    if (!this.isAudioExportContextCurrent(context)) {
      new Notice("CosyVoice: the active file changed while export was being prepared. Start again to review a new estimate.", 8e3);
      return null;
    }
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const sourceLabel = `${context.fileName} (${getAudioExportScopeLabel("english", scope)} audio export)`;
    const session = this.createSpeechSession(chunks, sourceLabel, configuration, {
      file: context.file,
      kind: "audio-export",
      sourceKind: context.documentKind
    });
    this.activeSession = session;
    this.updateStatus(`${configuration.engineLabel} export 0/${chunks.length}`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: previewText(chunks[0]),
      error: "",
      isPaused: false,
      phase: "queued",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: chunks.length
    });
    await this.writeRuntimeLog("audio-export-start", {
      chunks: chunks.length,
      documentKind: context.documentKind,
      insertAfterExport,
      scope,
      textLength: text.length
    });
    new Notice(`${configuration.engineLabel}: exporting ${chunks.length} audio segments.`, 6e3);
    const temporaryOutputPath = path.join(
      this.cacheDir,
      `${Date.now()}-${session.id}-export.${extension}`
    );
    session.files.push(temporaryOutputPath);
    const preparedPaths = [];
    let exportStage = "synthesis";
    let synthesisComplete = false;
    const createMergeJob = () => ({
      configuration: {
        engineLabel: configuration.engineLabel,
        prefetchChunks: 0,
        speechEngine: configuration.speechEngine
      },
      context: {
        documentKind: context.documentKind,
        file: context.file,
        fileName: context.fileName
      },
      exportPlan: { ...exportPlan },
      extension,
      insertAfterExport,
      preparedPaths: preparedPaths.slice(),
      scope,
      sourceLabel,
      temporaryOutputPath
    });
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (!this.isActive(session)) {
          throw new Error("Audio export stopped.");
        }
        session.currentChunkIndex = index;
        const prepared = await this.prepareChunk(chunks[index], index, session);
        preparedPaths.push(prepared.outputPath);
      }
      synthesisComplete = preparedPaths.length === chunks.length;
      if (!this.isActive(session)) {
        throw new Error("Audio export stopped.");
      }
      exportStage = "merge";
      this.updateStatus(`${configuration.engineLabel} merging audio`, {
        canPause: false,
        canNextChunk: false,
        canPreviousChunk: false,
        canSeek: false,
        canStop: true,
        currentChunk: chunks.length,
        currentText: `Combining ${chunks.length} synthesized segments...`,
        isPaused: false,
        phase: "synthesizing",
        progress: 0.99,
        status: "running",
        totalChunks: chunks.length
      });
      const merged = await mergeAudioFiles(preparedPaths, temporaryOutputPath, extension);
      if (!this.isActive(session)) {
        throw new Error("Audio export stopped.");
      }
      exportStage = "finalization";
      return await this.finalizeMergedAudioExport(createMergeJob(), merged, session);
    } catch (error) {
      if (this.isActive(session)) {
        let reportedError = error;
        if (synthesisComplete && preparedPaths.length === chunks.length) {
          const mergeJob = createMergeJob();
          if (this.preservePendingAudioMerge(mergeJob, session)) {
            reportedError = this.createAudioMergeRetryError(
              error,
              preparedPaths.length,
              exportStage === "merge" ? "merge" : "finalization"
            );
          }
        }
        const message = messageFromError(reportedError);
        this.updateStatus(`${configuration.engineLabel} audio export error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", { message });
        new Notice(`CosyVoice audio export failed: ${message}`, 1e4);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
        this.renderReaderViews();
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session, {
          preservePaths: session.preservedAudioPaths
        });
      }
    }
  }
  async exportCurrentNoteAudio(options = {}) {
    return this.exportCurrentFileAudio({
      ...options,
      expectedDocumentKind: "markdown",
      scope: Object.prototype.hasOwnProperty.call(options, "scope") ? options.scope : "entire"
    });
  }
  async readCurrentNote() {
    const activeFile = this.getCurrentReadableFile();
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdf(activeFile);
      return;
    }
    if (!isMarkdownFile(activeFile)) {
      new Notice("CosyVoice: open a Markdown note or PDF before reading.", 8e3);
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }
    await this.activateControlView();
    await this.startReading(
      view.editor.getValue(),
      view.file?.basename || "note",
      { file: view.file, sourceKind: "markdown" }
    );
  }
  getSavedReadingPosition(file) {
    const filePath = getPdfFileIdentity(file);
    if (!filePath || !this.settings || !this.settings.rememberReadingPosition) {
      return null;
    }
    return normalizeReadingPositions(this.settings.readingPositions)[filePath] || null;
  }
  canResumeCurrentFile() {
    const file = this.app && this.app.workspace && typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
    return Boolean(this.getSavedReadingPosition(file));
  }
  async resumeCurrentFile() {
    if (!this.settings || !this.settings.rememberReadingPosition) {
      new Notice("CosyVoice: enable Remember reading position in the plugin settings first.", 8e3);
      return;
    }
    const file = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
    const position = this.getSavedReadingPosition(file);
    if (!file || !position) {
      new Notice("CosyVoice: no saved reading position for the current file.", 6e3);
      return;
    }
    if (isPdfFile(file)) {
      await this.readCurrentPdf(file, { resumePosition: position });
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view || getPdfFileIdentity(view.file) !== position.filePath) {
      new Notice("CosyVoice: open the saved note before resuming.", 6e3);
      return;
    }
    const fullText = this.settings.stripMarkdown ? sanitizeTextForSpeech(view.editor.getValue(), { mathReadingLanguage: this.settings.mathReadingLanguage }) : normalizeLineBreaks(view.editor.getValue()).trim();
    let resumeSlice = sliceTextFromReadingPosition(fullText, position);
    if (!resumeSlice.matched) {
      const configuration = this.getSpeechConfiguration();
      if (!configuration) {
        return;
      }
      const chunks = splitTextForSpeechChunks(fullText, configuration.chunkLimits);
      const fallbackIndex = Math.min(Math.max(0, position.chunkIndex), Math.max(0, chunks.length - 1));
      resumeSlice = { matched: false, text: chunks.slice(fallbackIndex).join("\n\n") };
      new Notice("CosyVoice: the saved text anchor changed. Resuming from the nearest saved chunk.", 8e3);
    }
    if (!resumeSlice.text) {
      new Notice("CosyVoice: the saved position is no longer readable.", 6e3);
      return;
    }
    await this.activateControlView();
    await this.startReading(resumeSlice.text, `${file.basename || file.name || "note"} (resumed)`, {
      file,
      sourceKind: "markdown"
    });
  }
  async clearReadingPositions() {
    this.settings.readingPositions = {};
    await this.saveSettings();
    this.renderReaderViews();
    new Notice(getSettingsUiText(this.settings.settingsLanguage).positionsClearedNotice);
  }
  async saveSessionReadingPosition(session) {
    if (!session || !this.settings || !this.settings.rememberReadingPosition || !session.filePath || session.kind === "audio-export" || !["markdown", "pdf"].includes(session.sourceKind) || !session.chunks.length || !Number.isInteger(session.currentChunkIndex)) {
      return false;
    }
    let chunkIndex = Math.max(0, Math.min(session.chunks.length - 1, session.currentChunkIndex));
    if (session.lastCompletedChunkIndex === chunkIndex && chunkIndex + 1 < session.chunks.length) {
      chunkIndex += 1;
    }
    const anchor = createReadingAnchor(session.chunks[chunkIndex]);
    if (!anchor) {
      return false;
    }
    this.settings.readingPositions = upsertReadingPosition(this.settings.readingPositions, {
      anchor,
      chunkIndex,
      fileMtime: session.fileMtime,
      filePath: session.filePath,
      kind: session.sourceKind,
      pageNumber: session.sourceKind === "pdf" ? Array.isArray(session.chunkPageNumbers) && session.chunkPageNumbers[chunkIndex] || 1 : null,
      updatedAt: Date.now()
    });
    await this.saveSettings();
    this.renderReaderViews();
    return true;
  }
  async clearSessionReadingPosition(session) {
    if (!session || !session.filePath || !this.settings || !this.settings.rememberReadingPosition) {
      return false;
    }
    const current = normalizeReadingPositions(this.settings.readingPositions);
    if (!current[session.filePath]) {
      return false;
    }
    this.settings.readingPositions = removeReadingPosition(current, session.filePath);
    await this.saveSettings();
    this.renderReaderViews();
    return true;
  }
  async readCurrentPdfFromSelection(pdfFile = null) {
    const file = pdfFile || (typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null);
    if (!isPdfFile(file)) {
      new Notice("CosyVoice: no active PDF file.");
      return;
    }
    const selectionContext = this.getPdfSelectionForFile(file);
    if (!selectionContext) {
      new Notice("CosyVoice PDF: select text in the PDF first, then try again.", 8e3);
      return;
    }
    await this.readCurrentPdf(file, { selectionContext });
  }
  getSpeechConfiguration() {
    const speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    const engineLabel = getSpeechEngineLabel(this.settings);
    const scriptPath = String(this.settings.scriptPath || "").trim();
    if (speechEngine === "edge-tts" && !hasEdgeTtsConsent(this.settings)) {
      new Notice("Edge TTS sends text to Microsoft. Enable online processing consent in the plugin settings before reading.", 1e4);
      return null;
    }
    if (speechEngine === "azure-speech" && !hasAzureSpeechConsent(this.settings)) {
      new Notice("Azure Speech sends text to your Microsoft Azure Speech resource. Enable Azure online processing consent before reading.", 1e4);
      return null;
    }
    if (speechEngine === "azure-speech") {
      const configurationError = getAzureSpeechConfigurationError(this.settings, this.vaultBasePath, this.app);
      if (configurationError) {
        new Notice(`Azure Speech: ${configurationError}`, 1e4);
        return null;
      }
    }
    if (speechEngine === "openrouter-tts" && !hasOpenRouterConsent(this.settings)) {
      new Notice("OpenRouter TTS sends text to OpenRouter and an eligible upstream provider. Enable OpenRouter online processing consent before reading.", 1e4);
      return null;
    }
    if (speechEngine === "openrouter-tts") {
      const configurationError = getOpenRouterConfigurationError(this.settings, this.vaultBasePath, this.app);
      if (configurationError) {
        new Notice(`OpenRouter TTS: ${configurationError}`, 1e4);
        return null;
      }
    }
    if (speechEngine === "local-cosyvoice" && (!scriptPath || !fs.existsSync(scriptPath))) {
      new Notice(`CosyVoice: script not found: ${scriptPath || "(empty)"}`, 8e3);
      return null;
    }
    return {
      chunkLimits: getChunkLimitsForSpeechEngine(this.settings, speechEngine),
      engineLabel,
      prefetchChunks: getSynthesisPrefetchCount(this.settings, speechEngine),
      speechEngine
    };
  }
  createSpeechSession(chunks, sourceLabel, configuration, options = {}) {
    const initialChunks = Array.isArray(chunks) ? chunks.slice() : [];
    const id = ++this.sequence;
    return {
      chunkWaiters: /* @__PURE__ */ new Set(),
      chunkPageNumbers: initialChunks.map(() => null),
      chunks: initialChunks,
      currentChunkIndex: null,
      engineLabel: configuration.engineLabel,
      fileMtime: getFileMtime(options.file),
      filePath: getPdfFileIdentity(options.file),
      files: [],
      id,
      kind: options.kind || "text",
      lastCompletedChunkIndex: null,
      pdfLoadingTask: null,
      pdfSelectionMatched: null,
      prefetchChunks: configuration.prefetchChunks,
      prepareAvailableChunks: null,
      producerError: null,
      productionComplete: options.productionComplete !== false,
      requestedChunkIndex: null,
      sourceLabel,
      sourceKind: options.sourceKind || "",
      speechEngine: configuration.speechEngine,
      speechStarted: false,
      stopped: false,
      taskState: createTaskState(id, options.kind === "pdf-progressive" ? "extracting" : "queued"),
      totalChunks: initialChunks.length
    };
  }
  transitionSessionPhase(session, phase) {
    if (!session || !session.taskState || !phase) {
      return;
    }
    const taskPhase = phase === "extracting PDF" ? "extracting" : phase;
    try {
      session.taskState = transitionTaskState(session.taskState, taskPhase, session.id);
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Reading task state transition was rejected`, error);
    }
  }
  notifySessionChunkWaiters(session) {
    if (!session || !(session.chunkWaiters instanceof Set)) {
      return;
    }
    const waiters = Array.from(session.chunkWaiters);
    session.chunkWaiters.clear();
    for (const wake of waiters) {
      wake();
    }
  }
  appendSessionChunks(session, chunks, options = {}) {
    if (!this.isActive(session) || !Array.isArray(chunks)) {
      return 0;
    }
    const readableChunks = chunks.map((chunk) => {
      const detailed = chunk && typeof chunk === "object" && Object.prototype.hasOwnProperty.call(chunk, "text");
      const text = String(detailed ? chunk.text : chunk || "").trim();
      const pageNumber = detailed && chunk.metadata ? Math.max(1, Math.floor(Number(chunk.metadata.pageNumber) || 1)) : options.pageNumber ? Math.max(1, Math.floor(Number(options.pageNumber) || 1)) : null;
      return text ? { pageNumber, text } : null;
    }).filter(Boolean);
    if (!readableChunks.length) {
      return 0;
    }
    session.chunks.push(...readableChunks.map((chunk) => chunk.text));
    session.chunkPageNumbers.push(...readableChunks.map((chunk) => chunk.pageNumber));
    session.totalChunks = session.chunks.length;
    const currentChunk = this.readerState.currentChunk;
    this.setReaderState({
      ...getChunkNavigationState(currentChunk, session.totalChunks),
      totalChunks: session.totalChunks
    });
    this.notifySessionChunkWaiters(session);
    if (typeof session.prepareAvailableChunks === "function") {
      session.prepareAvailableChunks();
    }
    return readableChunks.length;
  }
  completeSessionChunks(session) {
    session.productionComplete = true;
    session.totalChunks = session.chunks.length;
    this.notifySessionChunkWaiters(session);
  }
  failSessionChunks(session, error) {
    session.producerError = error instanceof Error ? error : new Error(messageFromError(error));
    session.productionComplete = true;
    this.notifySessionChunkWaiters(session);
  }
  async waitForSessionChunk(session, index) {
    while (this.isActive(session) && index >= session.chunks.length && !session.productionComplete && !session.producerError) {
      await new Promise((resolve) => {
        const wake = () => {
          session.chunkWaiters.delete(wake);
          resolve();
        };
        session.chunkWaiters.add(wake);
      });
    }
    if (session.producerError) {
      throw session.producerError;
    }
    return index < session.chunks.length ? session.chunks[index] : null;
  }
  async readCurrentPdf(pdfFile = null, options = {}) {
    const file = pdfFile || (typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null);
    if (!isPdfFile(file)) {
      new Notice("CosyVoice: no active PDF file.");
      return;
    }
    const selectionContext = options && options.selectionContext && getPdfFileIdentity(file) === options.selectionContext.filePath ? options.selectionContext : null;
    const resumePosition = options && options.resumePosition && getPdfFileIdentity(file) === options.resumePosition.filePath ? options.resumePosition : null;
    const startContext = selectionContext || (resumePosition ? {
      filePath: resumePosition.filePath,
      pageNumber: resumePosition.pageNumber,
      selectedText: resumePosition.anchor
    } : null);
    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return;
    }
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const sourceLabel = file.basename || file.name || "PDF";
    const readingSourceLabel = resumePosition ? `${sourceLabel} (resumed PDF)` : selectionContext ? `${sourceLabel} (PDF from selection)` : `${sourceLabel} (PDF)`;
    const session = this.createSpeechSession([], readingSourceLabel, configuration, {
      file,
      kind: "pdf-progressive",
      productionComplete: false,
      sourceKind: "pdf"
    });
    this.activeSession = session;
    this.updateStatus("PDF text extraction", {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: startContext ? `Loading PDF text from page ${startContext.pageNumber}...` : "Loading PDF text...",
      error: "",
      isPaused: false,
      phase: "extracting PDF",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: 0
    });
    session.producerPromise = this.producePdfSpeechChunks(
      file,
      session,
      startContext,
      configuration.chunkLimits
    ).then(() => {
      this.completeSessionChunks(session);
    }).catch((error) => {
      this.failSessionChunks(session, error);
    });
    const prefetchNotice = configuration.prefetchChunks > 0 ? "Up to one next chunk may be prepared early." : "Audio is synthesized only as needed.";
    new Notice(
      `${configuration.engineLabel}: progressively reading ${readingSourceLabel}. ${prefetchNotice}`,
      6e3
    );
    await this.runSpeechSession(session);
  }
  async producePdfSpeechChunks(file, session, selectionContext, chunkLimits) {
    const chunker = createIncrementalSpeechChunker(chunkLimits, { detailed: true });
    let readableTextLength = 0;
    let selectionFallbackNotified = false;
    await this.extractPdfText(file, session, {
      collectText: false,
      onPageText: async (pageText, pageInfo) => {
        if (!this.isActive(session)) {
          return;
        }
        const text = this.settings.stripMarkdown ? sanitizeTextForSpeech(pageText, { mathReadingLanguage: this.settings.mathReadingLanguage }) : normalizeLineBreaks(pageText).trim();
        readableTextLength += text.length;
        this.appendSessionChunks(session, chunker.push(text, { pageNumber: pageInfo.pageNumber }));
        if (selectionContext && pageInfo.pageNumber === selectionContext.pageNumber && session.pdfSelectionMatched === false && !selectionFallbackNotified) {
          selectionFallbackNotified = true;
          new Notice(
            `CosyVoice PDF: the selected text could not be matched exactly. Reading from the start of page ${selectionContext.pageNumber}.`,
            1e4
          );
        }
      },
      reportProgress: true,
      selectedText: selectionContext ? selectionContext.selectedText : "",
      selectionPosition: selectionContext ? selectionContext.selectionPosition : null,
      startPageNumber: selectionContext ? selectionContext.pageNumber : 1
    });
    if (!this.isActive(session)) {
      return;
    }
    this.appendSessionChunks(session, chunker.finish());
    if (!readableTextLength || !session.chunks.length) {
      throw new Error("No extractable text was found. This PDF may be scanned or image-only; run OCR first and try again.");
    }
  }
  async extractPdfText(file, session, options = {}) {
    if (!isPdfFile(file)) {
      throw new Error("The active file is not a PDF.");
    }
    if (Number(file.stat && file.stat.size) > PDF_MAX_BYTES) {
      throw new Error("This PDF is larger than 200 MB. Split or compress it before reading.");
    }
    if (typeof loadPdfJs !== "function") {
      throw new Error("PDF text extraction is unavailable in this Obsidian version. Update Obsidian and try again.");
    }
    if (!this.app.vault || typeof this.app.vault.readBinary !== "function") {
      throw new Error("Obsidian could not read the active PDF.");
    }
    const [pdfjsLib, binary] = await Promise.all([
      loadPdfJs(),
      this.app.vault.readBinary(file)
    ]);
    if (!this.isActive(session)) {
      return "";
    }
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
      throw new Error("Obsidian PDF.js did not load correctly.");
    }
    const data = binary instanceof Uint8Array ? new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength) : new Uint8Array(binary);
    const loadingTask = pdfjsLib.getDocument({ data });
    session.pdfLoadingTask = loadingTask;
    let pdfDocument = null;
    try {
      pdfDocument = await loadingTask.promise;
      if (!this.isActive(session)) {
        return "";
      }
      const totalPages = Math.max(0, Math.floor(Number(pdfDocument.numPages) || 0));
      if (!totalPages) {
        throw new Error("This PDF contains no readable pages.");
      }
      if (totalPages > PDF_MAX_PAGES) {
        throw new Error(`This PDF has more than ${PDF_MAX_PAGES} pages. Split it before reading.`);
      }
      const requestedStartPage = Math.floor(Number(options.startPageNumber) || 1);
      const startPageNumber = Math.max(1, Math.min(totalPages, requestedStartPage));
      const selectedText = String(options.selectedText || "").trim();
      const collectText = options.collectText !== false;
      const onPageText = typeof options.onPageText === "function" ? options.onPageText : null;
      const reportProgress = options.reportProgress !== false;
      if (!onPageText) {
        session.totalChunks = totalPages;
      }
      const pageTexts = [];
      let textLength = 0;
      for (let pageNumber = startPageNumber; pageNumber <= totalPages; pageNumber += 1) {
        if (!this.isActive(session)) {
          return "";
        }
        if (reportProgress && !session.speechStarted) {
          this.updateStatus(`PDF page ${pageNumber}/${totalPages}`, {
            canPause: false,
            canNextChunk: false,
            canPreviousChunk: false,
            canSeek: false,
            canStop: true,
            currentChunk: onPageText ? 0 : pageNumber - 1,
            currentText: `Extracting page ${pageNumber} of ${totalPages}...`,
            phase: "extracting PDF",
            progress: (pageNumber - 1) / totalPages,
            status: "running",
            totalChunks: onPageText ? session.totalChunks : totalPages
          });
        }
        let page = null;
        try {
          page = await pdfDocument.getPage(pageNumber);
          if (!this.isActive(session)) {
            return "";
          }
          const textContent = await page.getTextContent();
          if (!this.isActive(session)) {
            return "";
          }
          const viewport = typeof page.getViewport === "function" ? page.getViewport({ scale: 1 }) : null;
          const pageLayout = extractPdfTextLayout(textContent && textContent.items, { viewport });
          let pageText = pageLayout.text;
          if (selectedText && pageNumber === startPageNumber) {
            const selectionSlice = slicePdfTextFromSelection(pageText, selectedText, {
              layout: pageLayout,
              selectionPosition: options.selectionPosition
            });
            pageText = selectionSlice.text;
            session.pdfSelectionMatched = selectionSlice.matched;
          }
          if (collectText) {
            pageTexts.push(pageText);
          }
          textLength += pageText.length;
          if (textLength > PDF_MAX_TEXT_CHARS) {
            throw new Error("This PDF contains more than 5,000,000 extractable characters. Split it before reading.");
          }
          if (onPageText) {
            await onPageText(pageText, { pageNumber, totalPages });
          }
        } finally {
          if (page && typeof page.cleanup === "function") {
            page.cleanup();
          }
        }
        if (reportProgress && !session.speechStarted) {
          this.updateStatus(`PDF page ${pageNumber}/${totalPages}`, {
            currentChunk: onPageText ? 0 : pageNumber,
            progress: pageNumber / totalPages
          });
        }
      }
      return collectText ? joinPdfPageText(pageTexts) : "";
    } finally {
      const ownsLoadingTask = session.pdfLoadingTask === loadingTask;
      if (ownsLoadingTask) {
        session.pdfLoadingTask = null;
      }
      try {
        if (pdfDocument && typeof pdfDocument.destroy === "function") {
          await pdfDocument.destroy();
        } else if (ownsLoadingTask && loadingTask && typeof loadingTask.destroy === "function") {
          loadingTask.destroy();
        }
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] Could not release PDF resources`, error);
      }
    }
  }
  async readSelection() {
    const activeFile = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
    if (isPdfFile(activeFile)) {
      const selectionContext = this.getPdfSelectionForFile(activeFile);
      if (!selectionContext) {
        new Notice("CosyVoice PDF: select text in the PDF first, then try again.", 8e3);
        return;
      }
      await this.activateControlView();
      await this.startReading(
        selectionContext.selectedText,
        `${activeFile.basename || activeFile.name || "PDF"} (PDF selection)`
      );
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }
    const selection = view.editor.getSelection();
    if (!selection || !selection.trim()) {
      new Notice("CosyVoice: select text first.");
      return;
    }
    await this.activateControlView();
    await this.startReading(selection, "selection");
  }
  async readFromSelection() {
    const activeFile = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdfFromSelection(activeFile);
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }
    const selection = view.editor.getSelection();
    if (!selection || !selection.trim()) {
      new Notice("CosyVoice: select a start point first.");
      return;
    }
    const from = view.editor.getCursor("from");
    const lines = view.editor.getValue().split(/\r\n?|\n/);
    const text = getTextFromPositionToEnd(lines, from);
    if (!text) {
      new Notice("CosyVoice: nothing to read after selection.");
      return;
    }
    await this.activateControlView();
    await this.startReading(text, "from selection", { file: view.file, sourceKind: "markdown" });
  }
  async startReading(rawText, sourceLabel, options = {}) {
    const text = this.settings.stripMarkdown ? sanitizeTextForSpeech(rawText, { mathReadingLanguage: this.settings.mathReadingLanguage }) : normalizeLineBreaks(rawText).trim();
    if (!text) {
      new Notice("CosyVoice: nothing readable in this note.");
      return;
    }
    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return;
    }
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const chunks = splitTextForSpeechChunks(text, configuration.chunkLimits);
    const session = this.createSpeechSession(chunks, sourceLabel, configuration, {
      file: options.file,
      sourceKind: options.sourceKind || ""
    });
    this.activeSession = session;
    this.updateStatus(`${configuration.engineLabel} 0/${chunks.length}`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: previewText(chunks[0]),
      error: "",
      isPaused: false,
      phase: "queued",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: chunks.length
    });
    await this.writeRuntimeLog("start", {
      chunks: chunks.length,
      prefetchChunks: configuration.prefetchChunks,
      source: sourceLabel,
      textLength: text.length
    });
    new Notice(`${configuration.engineLabel}: reading ${sourceLabel}. First synthesis may take a while.`, 6e3);
    await this.runSpeechSession(session);
  }
  async runSpeechSession(session) {
    const preparedChunks = /* @__PURE__ */ new Map();
    const getPreparedChunk = (index) => {
      if (!preparedChunks.has(index)) {
        const preparing = this.queuePrepareChunk(session.chunks[index], index, session);
        preparing.catch(() => {
        });
        preparedChunks.set(index, preparing);
      }
      return preparedChunks.get(index);
    };
    session.prepareAvailableChunks = () => {
      if (!this.isActive(session) || !Number.isInteger(session.prefetchBaseIndex)) {
        return;
      }
      for (let offset = 1; offset <= session.prefetchChunks; offset += 1) {
        const prefetchIndex = session.prefetchBaseIndex + offset;
        if (prefetchIndex < session.chunks.length) {
          getPreparedChunk(prefetchIndex);
        }
      }
    };
    try {
      let index = 0;
      while (this.isActive(session)) {
        if (Number.isInteger(session.requestedChunkIndex) && session.chunks.length) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          session.requestedChunkIndex = null;
        }
        session.prefetchBaseIndex = index;
        if (session.kind === "pdf-progressive" && index >= session.chunks.length && !session.productionComplete) {
          this.updateStatus("PDF parsing next pages", {
            canPause: true,
            canNextChunk: false,
            canSeek: false,
            canStop: true,
            isPaused: false,
            phase: "extracting PDF",
            progress: Math.min(0.99, this.readerState.progress),
            status: "running"
          });
        }
        const chunkText = await this.waitForSessionChunk(session, index);
        if (!this.isActive(session)) {
          break;
        }
        if (chunkText === null) {
          break;
        }
        session.currentChunkIndex = index;
        const prepared = await getPreparedChunk(index);
        if (!this.isActive(session)) {
          break;
        }
        if (Number.isInteger(session.requestedChunkIndex) && session.requestedChunkIndex !== index) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          session.requestedChunkIndex = null;
          continue;
        }
        session.prepareAvailableChunks();
        session.requestedChunkIndex = null;
        await this.playPreparedAudio(prepared, session, index, session.totalChunks);
        session.lastCompletedChunkIndex = index;
        if (Number.isInteger(session.requestedChunkIndex)) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          session.requestedChunkIndex = null;
        } else {
          index += 1;
        }
      }
      if (this.isActive(session)) {
        this.updateStatus(`${session.engineLabel} complete`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          isPaused: false,
          phase: "complete",
          progress: 1,
          status: "complete"
        });
        await this.clearSessionReadingPosition(session);
        this.activeSession = null;
      }
    } catch (error) {
      if (this.isActive(session)) {
        const message = session.kind === "pdf-progressive" ? getPdfExtractionErrorMessage(error) : messageFromError(error);
        this.updateStatus(`${session.engineLabel} error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", {
          message
        });
        const noticePrefix = session.kind === "pdf-progressive" ? "CosyVoice PDF" : session.engineLabel;
        new Notice(`${noticePrefix} failed: ${message}`, 1e4);
        await this.saveSessionReadingPosition(session);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
      }
    } finally {
      session.prepareAvailableChunks = null;
      session.prefetchBaseIndex = null;
      if (session.producerPromise) {
        await session.producerPromise.catch(() => {
        });
      }
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session);
      }
    }
  }
  async prepareChunk(chunkText, index, session) {
    if (!this.isActive(session)) {
      throw new Error("Reading stopped.");
    }
    session.speechStarted = true;
    const speechEngine = normalizeSpeechEngine(session.speechEngine || this.settings.speechEngine);
    const engineLabel = session.engineLabel || getSpeechEngineLabel(this.settings);
    const outputExtension = speechEngine === "local-cosyvoice" ? "wav" : "mp3";
    const basename = `${Date.now()}-${session.id}-${index}`;
    const inputPath = path.join(this.cacheDir, `${basename}.txt`);
    const outputPath = path.join(this.cacheDir, `${basename}.${outputExtension}`);
    session.files.push(inputPath, outputPath);
    await fs.promises.writeFile(inputPath, chunkText, { encoding: "utf8", mode: 384 });
    const isAudioExport = session.kind === "audio-export";
    const isBackgroundPrefetch = Boolean(
      this.currentAudio && Number.isInteger(session.currentChunkIndex) && index !== session.currentChunkIndex
    );
    if (!isBackgroundPrefetch) {
      this.updateStatus(`${engineLabel} synth ${index + 1}/${session.totalChunks || 0}`, {
        canPause: !isAudioExport,
        ...isAudioExport ? { canNextChunk: false, canPreviousChunk: false } : getChunkNavigationState(index + 1, session.totalChunks),
        canSeek: false,
        canStop: true,
        currentChunk: index + 1,
        currentText: previewText(chunkText),
        isPaused: false,
        phase: "synthesizing",
        progress: session.totalChunks ? index / session.totalChunks : 0,
        status: "running",
        totalChunks: session.totalChunks || 0
      });
    }
    try {
      await this.runSpeechEngine(inputPath, outputPath, session, speechEngine);
    } finally {
      if (this.settings.cleanupCache) {
        await this.removeTempFile(inputPath);
      }
    }
    const outputStat = await fs.promises.stat(outputPath);
    if (outputStat.size <= 44) {
      throw new Error(`${engineLabel} generated an invalid audio file: ${outputStat.size} bytes.`);
    }
    if (!this.isActive(session)) {
      if (this.settings.cleanupCache) {
        await this.removeTempFile(outputPath);
      }
      throw new Error("Reading stopped.");
    }
    const url = getAudioUrlForFile(this.app.vault.adapter, this.vaultBasePath, outputPath);
    await this.writeRuntimeLog("prepared", {
      index,
      outputBytes: outputStat.size,
      urlScheme: String(url).split(":")[0]
    });
    return {
      outputPath,
      url
    };
  }
  queuePrepareChunk(chunkText, index, session) {
    const promise = this.prepareChunk(chunkText, index, session);
    promise.catch(() => {
    });
    return promise;
  }
  runSpeechEngine(inputPath, outputPath, session, speechEngine = normalizeSpeechEngine(this.settings.speechEngine)) {
    if (speechEngine === "edge-tts") {
      return this.runEdgeTts(inputPath, outputPath, session);
    }
    if (speechEngine === "azure-speech") {
      return this.runAzureSpeech(inputPath, outputPath, session);
    }
    if (speechEngine === "openrouter-tts") {
      return this.runOpenRouterTts(inputPath, outputPath, session);
    }
    return this.runCosyVoice(inputPath, outputPath, session);
  }
  runCosyVoice(inputPath, outputPath, session) {
    const scriptPath = this.settings.scriptPath.trim();
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-InputPath",
      inputPath,
      "-OutputPath",
      outputPath,
      "-Speed",
      String(normalizeSpeed(this.settings.speed))
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(resolvePowerShellExecutable(), args, {
        cwd: path.dirname(scriptPath),
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      this.currentProcess = child;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new Error("CosyVoice synthesis timed out after 10 minutes."));
      }, 10 * 60 * 1e3);
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        reject(error);
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        if (!this.isActive(session)) {
          reject(new Error("Reading stopped."));
          return;
        }
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
          return;
        }
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
        reject(new Error(detail || `CosyVoice exited with code ${code}.`));
      });
    });
  }
  runEdgeTts(inputPath, outputPath, session) {
    const args = buildEdgeTtsArgs(inputPath, outputPath, this.settings);
    const executable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      this.currentProcess = child;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new Error("Edge TTS synthesis timed out after 10 minutes."));
      }, 10 * 60 * 1e3);
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        reject(new Error(`Edge TTS command failed at ${executable}. Check the configured executable path. ${messageFromError(error)}`));
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        if (!this.isActive(session)) {
          reject(new Error("Reading stopped."));
          return;
        }
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
          return;
        }
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
        reject(new Error(detail || `Edge TTS exited with code ${code}.`));
      });
    });
  }
  async readSecretFileOutsideVault(configuredPathValue, serviceLabel) {
    const configuredPath = String(configuredPathValue || "").trim();
    const keyPath = await fs.promises.realpath(configuredPath);
    const vaultPath = await fs.promises.realpath(this.vaultBasePath).catch(() => path.resolve(this.vaultBasePath));
    if (isInsideDirectory(keyPath, vaultPath)) {
      throw new Error(`${serviceLabel} key file must be stored outside the Obsidian vault.`);
    }
    const stat = await fs.promises.stat(keyPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 8192) {
      throw new Error(`${serviceLabel} key file must be a non-empty text file smaller than 8 KB.`);
    }
    const key = (await fs.promises.readFile(keyPath, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!key || /[\r\n]/.test(key)) {
      throw new Error(`${serviceLabel} key file must contain exactly one non-empty line.`);
    }
    return key;
  }
  readObsidianSecret(secretNameValue, serviceLabel) {
    return readObsidianSecretValue(secretNameValue, this.app, serviceLabel);
  }
  async readOpenRouterKey() {
    if (normalizeCredentialSource(this.settings.openRouterCredentialSource) === "obsidian-secret") {
      return this.readObsidianSecret(this.settings.openRouterSecretName, "OpenRouter API");
    }
    return this.readSecretFileOutsideVault(this.settings.openRouterKeyPath, "OpenRouter API");
  }
  async readAzureSpeechKey() {
    if (normalizeCredentialSource(this.settings.azureSpeechCredentialSource) === "obsidian-secret") {
      return this.readObsidianSecret(this.settings.azureSpeechSecretName, "Azure Speech");
    }
    return this.readSecretFileOutsideVault(this.settings.azureSpeechKeyPath, "Azure Speech");
  }
  async waitForRemoteRetry(session, delayMs) {
    let remainingMs = Math.max(0, Number(delayMs) || 0);
    while (remainingMs > 0) {
      const intervalMs = Math.min(100, remainingMs);
      await sleep(intervalMs);
      if (!this.isActive(session)) {
        throw new Error("Reading stopped.");
      }
      remainingMs -= intervalMs;
    }
  }
  async requestRemoteAudio(options) {
    if (!(this.currentRequests instanceof Set)) {
      this.currentRequests = /* @__PURE__ */ new Set();
    }
    const { session, serviceLabel } = options;
    const maxAttempts = options.retryTemporaryFailures === true ? REMOTE_TTS_MAX_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.requestRemoteAudioOnce(options);
        return;
      } catch (error) {
        if (!this.isActive(session)) {
          throw new Error("Reading stopped.");
        }
        if (!isRetryableRemoteError(error)) {
          throw error;
        }
        if (attempt === maxAttempts) {
          throw maxAttempts > 1 ? createRemoteRetryExhaustedError(serviceLabel, error, attempt) : error;
        }
        const fallbackDelayMs = REMOTE_TTS_RETRY_DELAYS_MS[attempt - 1] || REMOTE_TTS_RETRY_DELAYS_MS.at(-1);
        const retryAfterMs = Number(error.retryAfterMs);
        const delayMs = Number.isFinite(retryAfterMs) ? Math.max(fallbackDelayMs, retryAfterMs) : fallbackDelayMs;
        await this.waitForRemoteRetry(session, delayMs);
      }
    }
  }
  async requestRemoteAudioOnce({ endpoint, headers, body, outputPath, session, serviceLabel, expectedContentType, failureHint }) {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        this.currentRequests.delete(request);
        callback(value);
      };
      const request = https.request(endpoint, {
        method: "POST",
        headers
      }, (response) => {
        const statusCode = Number(response.statusCode) || 0;
        if (statusCode !== 200) {
          response.resume();
          finish(reject, createRemoteHttpError(
            serviceLabel,
            statusCode,
            failureHint,
            response.headers && response.headers["retry-after"]
          ));
          return;
        }
        const responseHeaders = response.headers || {};
        const contentType = String(responseHeaders["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (expectedContentType && contentType !== expectedContentType) {
          response.resume();
          finish(reject, new Error(`${serviceLabel} returned unexpected content type ${contentType || "(missing)"}.`));
          return;
        }
        const contentLength = Number(responseHeaders["content-length"]) || 0;
        if (contentLength > REMOTE_TTS_MAX_AUDIO_BYTES) {
          response.resume();
          finish(reject, new Error(`${serviceLabel} response exceeded the 20 MB safety limit.`));
          request.destroy();
          return;
        }
        const chunks = [];
        let totalBytes = 0;
        response.on("data", (chunk) => {
          if (settled) {
            return;
          }
          totalBytes += chunk.length;
          if (totalBytes > REMOTE_TTS_MAX_AUDIO_BYTES) {
            response.destroy();
            finish(reject, new Error(`${serviceLabel} response exceeded the 20 MB safety limit.`));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("aborted", () => {
          const error = new Error(`${serviceLabel} response was interrupted.`);
          error.code = "ECONNRESET";
          finish(reject, error);
        });
        response.on("error", (error) => {
          finish(reject, error);
        });
        response.on("end", async () => {
          if (settled) {
            return;
          }
          if (!this.isActive(session)) {
            finish(reject, new Error("Reading stopped."));
            return;
          }
          try {
            await fs.promises.writeFile(outputPath, Buffer.concat(chunks), { mode: 384 });
            finish(resolve);
          } catch (error) {
            finish(reject, error);
          }
        });
      });
      this.currentRequests.add(request);
      request.setTimeout(2 * 60 * 1e3, () => {
        const error = new Error(`${serviceLabel} synthesis timed out after 2 minutes.`);
        error.code = "ETIMEDOUT";
        finish(reject, error);
        request.destroy();
      });
      request.on("error", (error) => {
        finish(reject, error);
      });
      request.on("close", () => {
        if (!settled && !this.isActive(session)) {
          finish(reject, new Error("Reading stopped."));
        }
      });
      request.end(body);
    });
  }
  async runAzureSpeech(inputPath, outputPath, session) {
    const [text, subscriptionKey] = await Promise.all([
      fs.promises.readFile(inputPath, "utf8"),
      this.readAzureSpeechKey()
    ]);
    if (!this.isActive(session)) {
      throw new Error("Reading stopped.");
    }
    const body = buildAzureSpeechSsml(text, this.settings);
    await this.requestRemoteAudio({
      endpoint: new URL(buildAzureSpeechEndpoint(this.settings)),
      headers: {
        Accept: "audio/mpeg",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "Content-Type": "application/ssml+xml",
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "User-Agent": "note-reader-cosyvoice/0.2.6",
        "X-Microsoft-OutputFormat": AZURE_SPEECH_OUTPUT_FORMAT
      },
      body,
      outputPath,
      session,
      serviceLabel: "Azure Speech",
      expectedContentType: "audio/mpeg",
      failureHint: "Check the selected API credential, cloud, region, voice, resource status, and quota."
    });
  }
  async runOpenRouterTts(inputPath, outputPath, session) {
    const [text, apiKey] = await Promise.all([
      fs.promises.readFile(inputPath, "utf8"),
      this.readOpenRouterKey()
    ]);
    if (!this.isActive(session)) {
      throw new Error("Reading stopped.");
    }
    const body = buildOpenRouterTtsRequestBody(text, this.settings);
    await this.requestRemoteAudio({
      endpoint: new URL(OPENROUTER_TTS_ENDPOINT),
      headers: {
        Accept: "audio/mpeg",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "Content-Type": "application/json",
        "User-Agent": "note-reader-cosyvoice/0.2.6"
      },
      body,
      outputPath,
      session,
      serviceLabel: "OpenRouter TTS",
      expectedContentType: "audio/mpeg",
      failureHint: "Check the selected API credential, model, voice, account balance, and privacy settings.",
      retryTemporaryFailures: true
    });
  }
  async createPlayableAudioSource(prepared) {
    const audioBytes = await fs.promises.readFile(prepared.outputPath);
    const blobSource = createBlobAudioSource(audioBytes, prepared.outputPath);
    if (blobSource) {
      return blobSource;
    }
    return {
      mimeType: getAudioMimeType(prepared.outputPath),
      url: prepared.url,
      release() {
      }
    };
  }
  releaseAudioSource(audio) {
    if (!audio || typeof audio.noteReaderReleaseSource !== "function") {
      return;
    }
    const release = audio.noteReaderReleaseSource;
    audio.noteReaderReleaseSource = null;
    release();
  }
  async playPreparedAudio(prepared, session, index, total) {
    if (!this.isActive(session)) {
      return;
    }
    await this.waitWhilePaused(session);
    if (!this.isActive(session)) {
      return;
    }
    const source = await this.createPlayableAudioSource(prepared);
    if (!this.isActive(session)) {
      source.release();
      return;
    }
    await new Promise((resolve, reject) => {
      let audio;
      let settled = false;
      const getPlaybackTotal = () => Math.max(
        1,
        Math.floor(Number(session.totalChunks) || 0),
        Math.floor(Number(total) || 0)
      );
      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        this.releaseAudioSource(audio);
        callback(value);
      };
      try {
        audio = new Audio();
        audio.noteReaderReleaseSource = source.release;
        audio.preload = "auto";
        this.currentAudio = audio;
        const playbackTotal = getPlaybackTotal();
        this.updateStatus(`${session.engineLabel || getSpeechEngineLabel(this.settings)} play ${index + 1}/${playbackTotal}`, {
          canPause: true,
          canNextChunk: index + 1 < playbackTotal,
          canPreviousChunk: index > 0,
          canSeek: true,
          canStop: true,
          currentChunk: index + 1,
          currentText: previewText(Array.isArray(session.chunks) ? session.chunks[index] : ""),
          isPaused: false,
          phase: "playing",
          progress: index / playbackTotal,
          status: "running",
          totalChunks: playbackTotal
        });
        void this.writeRuntimeLog("play", {
          index,
          urlScheme: String(source.url).split(":")[0]
        });
        let lastProgressUpdate = 0;
        audio.ontimeupdate = () => {
          const now = Date.now();
          if (now - lastProgressUpdate < 250) {
            return;
          }
          lastProgressUpdate = now;
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          const chunkProgress = duration ? audio.currentTime / duration : 0;
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            progress: (index + chunkProgress) / currentTotal,
            totalChunks: currentTotal
          });
        };
        audio.onended = () => {
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            canPause: false,
            ...getChunkNavigationState(index + 1, currentTotal),
            canSeek: false,
            isPaused: false,
            progress: (index + 1) / currentTotal,
            totalChunks: currentTotal
          });
          finish(resolve);
        };
        audio.onerror = () => {
          finish(reject, new Error(`Unable to play ${prepared.outputPath}${describeMediaError(audio.error)}`));
        };
        audio.src = source.url;
        Promise.resolve(audio.play()).catch((error) => {
          finish(reject, error);
        });
      } catch (error) {
        if (audio) {
          finish(reject, error);
        } else {
          source.release();
          reject(error);
        }
      }
    });
  }
  async waitWhilePaused(session) {
    while (this.isActive(session) && this.pauseRequested) {
      this.updateStatus("CosyVoice paused", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: Boolean(this.currentAudio),
        canStop: true,
        isPaused: true,
        phase: "paused",
        status: "paused"
      });
      await sleep(100);
    }
  }
  handleReaderKeydown(event, options = {}) {
    if (!event || event.defaultPrevented || isInteractiveKeyboardTarget(event.target)) {
      return false;
    }
    const seekDeltaSeconds = getKeyboardSeekDeltaSeconds(event);
    if (seekDeltaSeconds) {
      if (!this.seekCurrentAudioBySeconds(seekDeltaSeconds)) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      if (options.focusPanel) {
        focusElementWithoutScroll(options.focusPanel);
      }
      return true;
    }
    const state = this.readerState || createReaderState();
    if (options.allowPause === false || event.repeat || !state.canPause || !isSpaceKeyEvent(event)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(this.pauseOrResume()).finally(() => {
      if (options.focusPanel) {
        focusElementWithoutScroll(options.focusPanel);
      }
    });
    return true;
  }
  seekToProgress(progress) {
    const audio = this.currentAudio;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return false;
    }
    const seekTime = calculateCurrentChunkSeekTime({
      progress,
      currentChunk: this.readerState.currentChunk,
      totalChunks: this.readerState.totalChunks,
      duration: audio.duration
    });
    if (seekTime === null) {
      return false;
    }
    return this.seekCurrentAudioToTime(seekTime);
  }
  seekCurrentAudioBySeconds(deltaSeconds) {
    const audio = this.currentAudio;
    const delta = Number(deltaSeconds);
    if (!audio || !Number.isFinite(delta)) {
      return false;
    }
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    return this.seekCurrentAudioToTime(currentTime + delta);
  }
  seekCurrentAudioToTime(seekTime) {
    const audio = this.currentAudio;
    const requestedTime = Number(seekTime);
    if (!audio || !Number.isFinite(requestedTime)) {
      return false;
    }
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    try {
      audio.currentTime = duration ? Math.min(duration, Math.max(0, requestedTime)) : Math.max(0, requestedTime);
    } catch (error) {
      return false;
    }
    if (!duration) {
      return true;
    }
    const chunkIndex = Math.max(0, (this.readerState.currentChunk || 1) - 1);
    const chunkProgress = duration ? audio.currentTime / duration : 0;
    this.setReaderState({
      progress: this.readerState.totalChunks ? (chunkIndex + chunkProgress) / this.readerState.totalChunks : 0
    });
    return true;
  }
  jumpToAdjacentChunk(deltaChunks) {
    const session = this.activeSession;
    const total = Math.max(0, Math.floor(Number(this.readerState.totalChunks) || 0));
    const currentChunk = Math.max(0, Math.floor(Number(this.readerState.currentChunk) || 0));
    const delta = Math.trunc(Number(deltaChunks) || 0);
    if (!this.isActive(session) || !total || !currentChunk || !delta) {
      return false;
    }
    const currentIndex = Math.max(0, Math.min(total - 1, currentChunk - 1));
    const targetIndex = Math.max(0, Math.min(total - 1, currentIndex + delta));
    if (targetIndex === currentIndex) {
      return false;
    }
    session.requestedChunkIndex = targetIndex;
    this.pauseRequested = false;
    const audio = this.currentAudio;
    if (audio && typeof audio.pause === "function") {
      audio.pause();
    }
    if (audio && typeof audio.onended === "function") {
      audio.onended();
    }
    this.updateStatus(`${getSpeechEngineLabel(this.settings)} jump ${targetIndex + 1}/${total}`, {
      canPause: true,
      ...getChunkNavigationState(targetIndex + 1, total),
      canSeek: false,
      canStop: true,
      currentChunk: targetIndex + 1,
      isPaused: false,
      phase: "queued",
      progress: total ? targetIndex / total : 0,
      status: "running",
      totalChunks: total
    });
    return true;
  }
  async pauseOrResume() {
    const audio = this.currentAudio;
    if (this.activeSession && this.activeSession.kind === "audio-export") {
      new Notice("CosyVoice: audio export can be stopped but not paused.", 6e3);
      return;
    }
    if (!audio) {
      if (!this.activeSession) {
        new Notice("CosyVoice: nothing is playing.");
        return;
      }
      this.pauseRequested = !this.pauseRequested;
      this.updateStatus(this.pauseRequested ? "CosyVoice paused" : "CosyVoice waiting", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: false,
        canStop: true,
        isPaused: this.pauseRequested,
        phase: this.pauseRequested ? "paused" : "synthesizing",
        status: this.pauseRequested ? "paused" : "running"
      });
      return;
    }
    if (audio.paused) {
      this.pauseRequested = false;
      await audio.play();
      this.updateStatus("CosyVoice playing", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: true,
        canStop: true,
        isPaused: false,
        phase: "playing",
        status: "running"
      });
    } else {
      this.pauseRequested = true;
      audio.pause();
      this.updateStatus("CosyVoice paused", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: true,
        canStop: true,
        isPaused: true,
        phase: "paused",
        status: "paused"
      });
    }
  }
  async cancelSessionOperations(session) {
    if (session) {
      session.stopped = true;
      this.notifySessionChunkWaiters(session);
    }
    if (session && session.pdfLoadingTask && typeof session.pdfLoadingTask.destroy === "function") {
      try {
        await session.pdfLoadingTask.destroy();
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] Could not cancel PDF loading`, error);
      }
      session.pdfLoadingTask = null;
    }
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    if (this.currentRequests instanceof Set) {
      for (const request of Array.from(this.currentRequests)) {
        request.destroy();
      }
      this.currentRequests.clear();
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.releaseAudioSource(this.currentAudio);
      this.currentAudio.removeAttribute("src");
      this.currentAudio.load();
      this.currentAudio = null;
    }
  }
  async stopReading(options = {}) {
    const previous = this.activeSession;
    await this.saveSessionReadingPosition(previous);
    this.transitionSessionPhase(previous, "stopping");
    this.sequence += 1;
    this.pauseRequested = false;
    await this.cancelSessionOperations(previous);
    this.transitionSessionPhase(previous, "idle");
    this.activeSession = null;
    this.updateStatus("CosyVoice idle", createReaderState());
    if (previous && this.settings && this.settings.cleanupCache) {
      await this.cleanupSessionFiles(previous);
    }
    if (!options.silent) {
      new Notice("CosyVoice: stopped.");
    }
  }
  async cleanupSessionFiles(session, options = {}) {
    if (!session || !Array.isArray(session.files)) {
      return;
    }
    const preservedPaths = new Set(
      (Array.isArray(options.preservePaths) ? options.preservePaths : []).filter(Boolean).map((filePath) => path.resolve(filePath))
    );
    for (const filePath of session.files) {
      if (preservedPaths.has(path.resolve(filePath))) {
        continue;
      }
      await this.removeTempFile(filePath);
    }
  }
  async removeTempFile(filePath) {
    if (!this.cacheDir || !isInsideDirectory(filePath, this.cacheDir)) {
      return;
    }
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        console.warn(`[${PLUGIN_ID}] Could not remove temp file`, filePath, error);
      }
    }
  }
  isActive(session) {
    return Boolean(session && this.activeSession === session && !session.stopped && session.id === this.sequence);
  }
  updateStatus(text, patch = {}) {
    if (patch && patch.phase && this.activeSession) {
      this.transitionSessionPhase(this.activeSession, patch.phase);
    }
    if (this.statusBar) {
      this.statusBar.setText(text);
    }
    this.setReaderState({
      label: text,
      ...patch
    });
  }
  async writeRuntimeLog(stage, _details = {}) {
    if (!this.logPath || !this.settings || !this.settings.diagnosticLogging) {
      return;
    }
    const event = createSafeRuntimeLogEvent(stage, this.settings);
    if (!event) {
      return;
    }
    const line = `${JSON.stringify(event)}
`;
    try {
      const stat = await fs.promises.stat(this.logPath).catch((error) => {
        if (error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      });
      if (stat && stat.size + Buffer.byteLength(line, "utf8") > RUNTIME_LOG_MAX_BYTES) {
        await fs.promises.unlink(this.logPath);
      }
      await fs.promises.appendFile(this.logPath, line, { encoding: "utf8", mode: 384 });
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Could not write runtime log`, error);
    }
  }
};
var CosyVoiceReaderView = class extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.handlePanelKeydown = this.handlePanelKeydown.bind(this);
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Voice Reader";
  }
  getIcon() {
    return "volume-2";
  }
  async onOpen() {
    this.plugin.registerReaderView(this);
  }
  async onClose() {
    this.plugin.unregisterReaderView(this);
  }
  render() {
    const root = this.contentEl || this.containerEl.children[1] || this.containerEl;
    const state = this.plugin.readerState || createReaderState();
    root.empty();
    root.addClass("note-reader-cosyvoice-view");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", "Voice reader controls");
    root.addEventListener("keydown", this.handlePanelKeydown);
    const header = root.createDiv({ cls: "note-reader-cosyvoice-panel-header" });
    header.createEl("h3", { text: "Voice Reader" });
    header.createDiv({ cls: `note-reader-cosyvoice-state is-${state.status}`, text: state.label });
    const progressWrap = root.createDiv({ cls: "note-reader-cosyvoice-progress-wrap" });
    const progressControls = progressWrap.createDiv({ cls: "note-reader-cosyvoice-progress-controls" });
    this.createIconButton(progressControls, "skip-back", "Previous chunk", () => {
      this.plugin.jumpToAdjacentChunk(-1);
    }, !state.canPreviousChunk, { triggerOnPointerDown: true });
    const progressTrack = progressControls.createDiv({
      cls: `note-reader-cosyvoice-progress-track${state.canSeek ? " is-seekable" : ""}`
    });
    const progressFill = progressTrack.createDiv({ cls: "note-reader-cosyvoice-progress-fill" });
    progressFill.style.width = `${Math.round(state.progress * 100)}%`;
    const progressInput = progressTrack.createEl("input", {
      cls: "note-reader-cosyvoice-progress-input",
      attr: {
        "aria-label": "Reading progress",
        max: "1000",
        min: "0",
        step: "1",
        title: state.canSeek ? "Drag to seek within the current audio chunk" : "Progress is seekable while audio is playing",
        type: "range",
        value: String(Math.round(state.progress * 1e3))
      }
    });
    progressInput.disabled = !state.canSeek;
    progressInput.addEventListener("input", () => {
      if (!state.canSeek) {
        return;
      }
      const requestedProgress = Number(progressInput.value) / 1e3;
      this.plugin.seekToProgress(requestedProgress);
    });
    this.createIconButton(progressControls, "skip-forward", "Next chunk", () => {
      this.plugin.jumpToAdjacentChunk(1);
    }, !state.canNextChunk, { triggerOnPointerDown: true });
    const meta = progressWrap.createDiv({ cls: "note-reader-cosyvoice-meta" });
    meta.createSpan({ text: formatProgressLabel(state) });
    meta.createSpan({ text: `${Math.round(state.progress * 100)}%` });
    this.createSpeedPanel(root);
    const actions = root.createDiv({ cls: "note-reader-cosyvoice-actions" });
    const canExportFile = typeof this.plugin.canExportCurrentFile !== "function" || this.plugin.canExportCurrentFile();
    const canInsertExport = typeof this.plugin.canInsertAudioExportIntoCurrentNote !== "function" || this.plugin.canInsertAudioExportIntoCurrentNote();
    this.createActionButton(actions, "play", "Read selection", () => {
      this.runPluginAction("Read selection", () => this.plugin.readSelection());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, "list-start", "Read from selection", () => {
      this.runPluginAction("Read from selection", () => this.plugin.readFromSelection());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, "file-text", "Read file", () => {
      this.runPluginAction("Read file", () => this.plugin.readCurrentNote());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, "download", "Export audio", () => {
      this.runPluginAction("Export audio", () => this.plugin.exportCurrentFileAudio({ insertAfterExport: false }));
    }, !canExportFile, {
      title: "Export all, selected, or remaining audio from the current note or PDF",
      triggerOnPointerDown: true
    });
    this.createActionButton(actions, "paperclip", "Export & insert audio", () => {
      this.runPluginAction("Export and insert audio", () => this.plugin.exportCurrentFileAudio({ insertAfterExport: true }));
    }, !canInsertExport, {
      title: canInsertExport ? "Export audio and insert it into the current Markdown note" : "Audio can be inserted into Markdown notes, not PDF files",
      triggerOnPointerDown: true
    });
    const hasPendingAudioMerge = typeof this.plugin.hasPendingAudioMerge === "function" && this.plugin.hasPendingAudioMerge();
    if (hasPendingAudioMerge) {
      this.createActionButton(actions, "refresh-cw", "Retry merge only", () => {
        this.runPluginAction("Retry merge only", () => this.plugin.retryPendingAudioMerge());
      }, Boolean(this.plugin.activeSession), {
        title: "Reuse the kept synthesized segments without making any TTS API requests",
        triggerOnPointerDown: true
      });
    }
    const canResumeFile = typeof this.plugin.canResumeCurrentFile === "function" && this.plugin.canResumeCurrentFile();
    this.createActionButton(actions, "history", "Resume file", () => {
      void this.plugin.resumeCurrentFile();
    }, !canResumeFile);
    this.createActionButton(
      actions,
      state.isPaused ? "play" : "pause",
      state.isPaused ? "Resume" : "Pause",
      () => {
        void this.plugin.pauseOrResume();
      },
      !state.canPause,
      {
        title: state.isPaused ? "Resume reading (or press Space)" : "Pause reading (or press Space)",
        triggerOnPointerDown: true
      }
    );
    this.createActionButton(
      actions,
      "square",
      "Stop",
      () => {
        void this.plugin.stopReading();
      },
      !state.canStop
    );
    const details = root.createDiv({ cls: "note-reader-cosyvoice-details" });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-label", text: "Phase" });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-value", text: state.phase });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-label", text: "Source" });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-value", text: state.source || "-" });
    if (state.error) {
      root.createDiv({ cls: "note-reader-cosyvoice-error", text: state.error });
    }
    const preview = root.createDiv({ cls: "note-reader-cosyvoice-preview" });
    preview.createDiv({ cls: "note-reader-cosyvoice-detail-label", text: "Text" });
    preview.createDiv({
      cls: "note-reader-cosyvoice-preview-text",
      text: state.currentText || "-"
    });
  }
  createSpeedPanel(parent) {
    const currentSpeed = normalizeSpeed(this.plugin.settings && this.plugin.settings.speed);
    const panel = parent.createDiv({ cls: "note-reader-cosyvoice-speed-panel" });
    const header = panel.createDiv({ cls: "note-reader-cosyvoice-speed-header" });
    header.createSpan({ cls: "note-reader-cosyvoice-detail-label", text: "Speed" });
    header.createSpan({ cls: "note-reader-cosyvoice-speed-current", text: formatSpeedLabel(currentSpeed) });
    const options = panel.createDiv({ cls: "note-reader-cosyvoice-speed-options" });
    for (const speed of getSpeedPresets()) {
      const isActive = Math.abs(currentSpeed - speed) < 1e-3;
      const button = options.createEl("button", {
        cls: `note-reader-cosyvoice-speed-option${isActive ? " is-active" : ""}`,
        text: formatSpeedLabel(speed),
        attr: {
          "aria-label": `Set speech speed to ${formatSpeedLabel(speed)}`,
          "aria-pressed": String(isActive),
          title: `Set speech speed to ${formatSpeedLabel(speed)}`
        }
      });
      button.addEventListener("click", () => {
        void this.plugin.setSpeechSpeed(speed);
      });
    }
  }
  handlePanelKeydown(event) {
    this.plugin.handleReaderKeydown(event, { allowPause: true, focusPanel: event.currentTarget });
  }
  focusPanel(panel) {
    focusElementWithoutScroll(panel);
  }
  runPluginAction(label, action) {
    if (this.plugin && typeof this.plugin.runUserAction === "function") {
      void this.plugin.runUserAction(label, action);
      return;
    }
    try {
      const result = action();
      if (result && typeof result.catch === "function") {
        void result.catch((error) => console.error(`[${PLUGIN_ID}] ${label} failed`, error));
      }
    } catch (error) {
      console.error(`[${PLUGIN_ID}] ${label} failed`, error);
    }
  }
  createIconButton(parent, icon, label, onClick, disabled = false, options = {}) {
    const button = parent.createEl("button", {
      cls: "note-reader-cosyvoice-icon-button",
      attr: {
        "aria-label": label,
        title: label
      }
    });
    button.disabled = disabled;
    if (typeof setIcon === "function") {
      setIcon(button, icon);
    }
    this.wireButtonAction(button, onClick, options);
    return button;
  }
  createActionButton(parent, icon, label, onClick, disabled = false, options = {}) {
    const button = parent.createEl("button", {
      cls: "note-reader-cosyvoice-action",
      attr: {
        "aria-label": label,
        title: options.title || label
      }
    });
    button.disabled = disabled;
    const iconEl = button.createSpan({ cls: "note-reader-cosyvoice-action-icon" });
    if (typeof setIcon === "function") {
      setIcon(iconEl, icon);
    }
    button.createSpan({ cls: "note-reader-cosyvoice-action-label", text: label });
    this.wireButtonAction(button, onClick, options);
    return button;
  }
  wireButtonAction(button, onClick, options = {}) {
    let pointerHandled = false;
    if (options.triggerOnPointerDown) {
      button.addEventListener("pointerdown", (event) => {
        if (button.disabled || event.defaultPrevented || Number.isFinite(event.button) && event.button !== 0) {
          return;
        }
        pointerHandled = true;
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
      });
    }
    button.addEventListener("click", (event) => {
      if (pointerHandled) {
        pointerHandled = false;
        event.preventDefault();
        return;
      }
      onClick(event);
    });
  }
};
var CosyVoiceReaderSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Note and PDF Voice Reader" });
    const settingsLanguage = normalizeSettingsLanguage(this.plugin.settings.settingsLanguage);
    const ui = getSettingsUiText(settingsLanguage);
    const selectedSpeechEngine = normalizeSpeechEngine(this.plugin.settings.speechEngine);
    const microsoftVoicePresets = getMicrosoftVoicePresets(settingsLanguage);
    const commonVoiceIds = new Set(microsoftVoicePresets.map(([id]) => id));
    new Setting(containerEl).setName(ui.settingsLanguageName).setDesc(ui.settingsLanguageDesc).addDropdown((dropdown) => {
      dropdown.addOption("english", ui.settingsLanguageEnglish).addOption("chinese", ui.settingsLanguageChinese).setValue(settingsLanguage).onChange(async (value) => {
        this.plugin.settings.settingsLanguage = normalizeSettingsLanguage(value);
        await this.plugin.saveSettings();
        this.display();
      });
    });
    new Setting(containerEl).setName(ui.speechEngineName).setDesc(ui.speechEngineDesc).addDropdown((dropdown) => {
      dropdown.addOption("local-cosyvoice", ui.speechEngineLocal).addOption("edge-tts", ui.speechEngineEdge).addOption("azure-speech", ui.speechEngineAzure).addOption("openrouter-tts", ui.speechEngineOpenRouter).setValue(selectedSpeechEngine).onChange(async (value) => {
        this.plugin.settings.speechEngine = normalizeSpeechEngine(value);
        await this.plugin.saveSettings();
        this.display();
      });
    });
    if (selectedSpeechEngine === "local-cosyvoice") {
      new Setting(containerEl).setName(ui.localScriptName).setDesc(ui.localScriptDesc).addText((text) => {
        text.setPlaceholder(RECOMMENDED_SCRIPT_PATH).setValue(this.plugin.settings.scriptPath).onChange(async (value) => {
          this.plugin.settings.scriptPath = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.addClass("note-reader-cosyvoice-script-input");
      });
    }
    if (selectedSpeechEngine === "edge-tts") {
      new Setting(containerEl).setName(ui.edgeConsentName).setDesc(ui.edgeConsentDesc).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.edgeTtsConsent === true).onChange(async (value) => {
          this.plugin.settings.edgeTtsConsent = value;
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.edgeExecutableName).setDesc(ui.edgeExecutableDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_EDGE_TTS_EXECUTABLE).setValue(normalizeEdgeTtsExecutable(this.plugin.settings.edgeTtsExecutable)).onChange(async (value) => {
          this.plugin.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.addClass("note-reader-cosyvoice-script-input");
      });
      const currentEdgeVoice = normalizeEdgeTtsVoice(this.plugin.settings.edgeTtsVoice);
      new Setting(containerEl).setName(ui.edgeCommonVoicesName).setDesc(ui.edgeCommonVoicesDesc).addDropdown((dropdown) => {
        for (const [voiceId, label] of microsoftVoicePresets) {
          dropdown.addOption(voiceId, label);
        }
        dropdown.addOption("__custom__", ui.customVoiceOption).setValue(commonVoiceIds.has(currentEdgeVoice) ? currentEdgeVoice : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.edgeTtsVoice = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.edgeVoiceName).setDesc(ui.edgeVoiceDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_EDGE_TTS_VOICE).setValue(normalizeEdgeTtsVoice(this.plugin.settings.edgeTtsVoice)).onChange(async (value) => {
          this.plugin.settings.edgeTtsVoice = normalizeEdgeTtsVoice(value);
          await this.plugin.saveSettings();
        });
      });
    }
    if (selectedSpeechEngine === "azure-speech") {
      new Setting(containerEl).setName(ui.azureConsentName).setDesc(ui.azureConsentDesc).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.azureSpeechConsent === true).onChange(async (value) => {
          this.plugin.settings.azureSpeechConsent = value;
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.azureCloudName).setDesc(ui.azureCloudDesc).addDropdown((dropdown) => {
        dropdown.addOption("public", ui.azurePublicCloud).addOption("china", ui.azureChinaCloud).setValue(normalizeAzureSpeechCloud(this.plugin.settings.azureSpeechCloud)).onChange(async (value) => {
          this.plugin.settings.azureSpeechCloud = normalizeAzureSpeechCloud(value);
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.azureRegionName).setDesc(ui.azureRegionDesc).addText((text) => {
        text.setPlaceholder("eastasia").setValue(this.plugin.settings.azureSpeechRegion || "").onChange(async (value) => {
          this.plugin.settings.azureSpeechRegion = normalizeAzureSpeechRegion(value);
          await this.plugin.saveSettings();
        });
      });
      const azureCredentialSource = normalizeCredentialSource(this.plugin.settings.azureSpeechCredentialSource);
      new Setting(containerEl).setName(ui.credentialSourceName).setDesc(ui.credentialSourceDesc).addDropdown((dropdown) => {
        dropdown.addOption("obsidian-secret", ui.credentialSourceSecret).addOption("key-file", ui.credentialSourceFile).setValue(azureCredentialSource).onChange(async (value) => {
          this.plugin.settings.azureSpeechCredentialSource = normalizeCredentialSource(value);
          await this.plugin.saveSettings();
          this.display();
        });
      });
      if (azureCredentialSource === "obsidian-secret") {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl).setName(ui.azureSecretName).setDesc(ui.azureSecretDesc).addComponent((element) => new SecretComponent(this.app, element).setValue(this.plugin.settings.azureSpeechSecretName || "").onChange(async (value) => {
            this.plugin.settings.azureSpeechSecretName = String(value || "").trim();
            await this.plugin.saveSettings();
          }));
        } else {
          new Setting(containerEl).setName(ui.secretStorageUnavailableName).setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl).setName(ui.azureKeyFileName).setDesc(ui.azureKeyFileDesc).addText((text) => {
          text.setPlaceholder("%LOCALAPPDATA%\\note-reader-cosyvoice\\azure-speech-key.txt").setValue(this.plugin.settings.azureSpeechKeyPath || "").onChange(async (value) => {
            this.plugin.settings.azureSpeechKeyPath = value.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.addClass("note-reader-cosyvoice-script-input");
        });
      }
      const currentAzureVoice = normalizeAzureSpeechVoice(this.plugin.settings.azureSpeechVoice);
      new Setting(containerEl).setName(ui.azureCommonVoicesName).setDesc(ui.azureCommonVoicesDesc).addDropdown((dropdown) => {
        for (const [voiceId, label] of microsoftVoicePresets) {
          dropdown.addOption(voiceId, label);
        }
        dropdown.addOption("__custom__", ui.customVoiceOption).setValue(commonVoiceIds.has(currentAzureVoice) ? currentAzureVoice : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.azureSpeechVoice = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.azureVoiceName).setDesc(ui.azureVoiceDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_AZURE_SPEECH_VOICE).setValue(currentAzureVoice).onChange(async (value) => {
          this.plugin.settings.azureSpeechVoice = normalizeAzureSpeechVoice(value);
          await this.plugin.saveSettings();
        });
      });
    }
    if (selectedSpeechEngine === "openrouter-tts") {
      new Setting(containerEl).setName(ui.openRouterConsentName).setDesc(ui.openRouterConsentDesc).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.openRouterConsent === true).onChange(async (value) => {
          this.plugin.settings.openRouterConsent = value;
          await this.plugin.saveSettings();
        });
      });
      const openRouterCredentialSource = normalizeCredentialSource(this.plugin.settings.openRouterCredentialSource);
      new Setting(containerEl).setName(ui.credentialSourceName).setDesc(ui.credentialSourceDesc).addDropdown((dropdown) => {
        dropdown.addOption("obsidian-secret", ui.credentialSourceSecret).addOption("key-file", ui.credentialSourceFile).setValue(openRouterCredentialSource).onChange(async (value) => {
          this.plugin.settings.openRouterCredentialSource = normalizeCredentialSource(value);
          await this.plugin.saveSettings();
          this.display();
        });
      });
      if (openRouterCredentialSource === "obsidian-secret") {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl).setName(ui.openRouterSecretName).setDesc(ui.openRouterSecretDesc).addComponent((element) => new SecretComponent(this.app, element).setValue(this.plugin.settings.openRouterSecretName || "").onChange(async (value) => {
            this.plugin.settings.openRouterSecretName = String(value || "").trim();
            await this.plugin.saveSettings();
          }));
        } else {
          new Setting(containerEl).setName(ui.secretStorageUnavailableName).setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl).setName(ui.openRouterKeyFileName).setDesc(ui.openRouterKeyFileDesc).addText((text) => {
          text.setPlaceholder("%LOCALAPPDATA%\\note-reader-cosyvoice\\openrouter-api-key.txt").setValue(this.plugin.settings.openRouterKeyPath || "").onChange(async (value) => {
            this.plugin.settings.openRouterKeyPath = value.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.addClass("note-reader-cosyvoice-script-input");
        });
      }
      const currentOpenRouterModel = normalizeOpenRouterModel(this.plugin.settings.openRouterModel);
      const currentOpenRouterVoice = normalizeOpenRouterVoice(this.plugin.settings.openRouterVoice);
      const openRouterModels = getOpenRouterTtsModels(settingsLanguage);
      const selectedOpenRouterModel = openRouterModels.find(([model]) => model === currentOpenRouterModel);
      new Setting(containerEl).setName(ui.openRouterModelsName).setDesc(ui.openRouterModelsDesc).addDropdown((dropdown) => {
        for (const [model, , label] of openRouterModels) {
          dropdown.addOption(model, label);
        }
        dropdown.addOption("__custom__", ui.customModelOption).setValue(selectedOpenRouterModel ? currentOpenRouterModel : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.openRouterModel = value;
          this.plugin.settings.openRouterVoice = getDefaultOpenRouterVoiceForModel(value);
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.openRouterModelName).setDesc(ui.openRouterModelDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_OPENROUTER_TTS_MODEL).setValue(currentOpenRouterModel).onChange(async (value) => {
          this.plugin.settings.openRouterModel = normalizeOpenRouterModel(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.addClass("note-reader-cosyvoice-script-input");
      });
      new Setting(containerEl).setName(ui.openRouterModelInfoName).setDesc(selectedOpenRouterModel ? selectedOpenRouterModel[3] : ui.customModelInfo);
      const openRouterVoicePresets = getOpenRouterTtsVoicePresets(currentOpenRouterModel, settingsLanguage);
      const openRouterVoiceIds = new Set(openRouterVoicePresets.map(([, voice]) => voice));
      new Setting(containerEl).setName(ui.openRouterVoicesName).setDesc(ui.openRouterVoicesDesc).addDropdown((dropdown) => {
        for (const [, voice, label] of openRouterVoicePresets) {
          dropdown.addOption(voice, label);
        }
        dropdown.addOption("__custom__", ui.customVoiceOption).setValue(openRouterVoiceIds.has(currentOpenRouterVoice) ? currentOpenRouterVoice : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.openRouterVoice = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.openRouterVoiceName).setDesc(ui.openRouterVoiceDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_OPENROUTER_TTS_VOICE).setValue(currentOpenRouterVoice).onChange(async (value) => {
          this.plugin.settings.openRouterVoice = normalizeOpenRouterVoice(value);
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.openRouterPrivacyName).setDesc(ui.openRouterPrivacyDesc);
    }
    new Setting(containerEl).setName(ui.speedName).setDesc(ui.speedDesc).addSlider((slider) => {
      slider.setLimits(0.5, 2, 0.05).setValue(this.plugin.settings.speed).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.speed = normalizeSpeed(value);
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.chunkLimitsName).setDesc(ui.chunkLimitsDesc).addText((text) => {
      text.setValue(this.plugin.settings.chunkLimits).onChange(async (value) => {
        this.plugin.settings.chunkLimits = parseChunkLimits(value).join(",");
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.onlineChunkLimitsName).setDesc(ui.onlineChunkLimitsDesc).addText((text) => {
      text.setValue(this.plugin.settings.onlineChunkLimits).onChange(async (value) => {
        this.plugin.settings.onlineChunkLimits = parseChunkLimits(
          value,
          DEFAULT_ONLINE_CHUNK_LIMITS
        ).join(",");
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.onlinePrefetchName).setDesc(ui.onlinePrefetchDesc).addDropdown((dropdown) => {
      dropdown.addOption("0", ui.onlinePrefetchNone).addOption("1", ui.onlinePrefetchOne).setValue(String(normalizeOnlinePrefetchChunks(this.plugin.settings.onlinePrefetchChunks))).onChange(async (value) => {
        this.plugin.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(value);
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.audioExportLocationName).setDesc(ui.audioExportLocationDesc).addDropdown((dropdown) => {
      dropdown.addOption("obsidian-attachment", ui.audioExportLocationAttachment).addOption("note-folder", ui.audioExportLocationNote).addOption("custom-folder", ui.audioExportLocationCustom).setValue(normalizeAudioExportLocation(this.plugin.settings.audioExportLocation)).onChange(async (value) => {
        this.plugin.settings.audioExportLocation = normalizeAudioExportLocation(value);
        await this.plugin.saveSettings();
        this.display();
      });
    });
    if (normalizeAudioExportLocation(this.plugin.settings.audioExportLocation) === "custom-folder") {
      new Setting(containerEl).setName(ui.audioExportFolderName).setDesc(ui.audioExportFolderDesc).addText((text) => {
        text.setPlaceholder(ui.audioExportFolderPlaceholder).setValue(this.plugin.settings.audioExportFolder).onChange(async (value) => {
          this.plugin.settings.audioExportFolder = normalizeAudioExportFolder(value);
          await this.plugin.saveSettings();
        });
      });
    }
    new Setting(containerEl).setName(ui.stripMarkdownName).setDesc(ui.stripMarkdownDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.stripMarkdown).onChange(async (value) => {
        this.plugin.settings.stripMarkdown = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.mathLanguageName).setDesc(ui.mathLanguageDesc).addDropdown((dropdown) => {
      dropdown.addOption("english", ui.mathEnglish).addOption("chinese", ui.mathChinese).addOption("skip", ui.mathSkip).setValue(normalizeMathReadingLanguage(this.plugin.settings.mathReadingLanguage)).onChange(async (value) => {
        this.plugin.settings.mathReadingLanguage = normalizeMathReadingLanguage(value);
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.rememberPositionName).setDesc(ui.rememberPositionDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.rememberReadingPosition === true).onChange(async (value) => {
        this.plugin.settings.rememberReadingPosition = value;
        await this.plugin.saveSettings();
        this.plugin.renderReaderViews();
      });
    });
    new Setting(containerEl).setName(ui.clearPositionsName).setDesc(ui.clearPositionsDesc).addButton((button) => {
      button.setButtonText(ui.clearPositionsButton).setWarning().onClick(async () => {
        await this.plugin.clearReadingPositions();
        this.display();
      });
    });
    new Setting(containerEl).setName(ui.cleanupName).setDesc(ui.cleanupDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.cleanupCache).onChange(async (value) => {
        this.plugin.settings.cleanupCache = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.diagnosticName).setDesc(ui.diagnosticDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.diagnosticLogging === true).onChange(async (value) => {
        this.plugin.settings.diagnosticLogging = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.clearTemporaryName).setDesc(ui.clearTemporaryDesc).addButton((button) => {
      button.setButtonText(ui.clearNowButton).setWarning().onClick(async () => {
        await this.plugin.clearTemporaryData();
      });
    });
    new Setting(containerEl).setName(ui.restoreDefaultsName).setDesc(ui.restoreDefaultsDesc).addButton((button) => {
      button.setButtonText(ui.restoreDefaultsButton).setWarning().onClick(async () => {
        await this.plugin.resetSettingsToDefaults();
        new Notice(ui.settingsRestoredNotice);
        this.display();
      });
    });
    new Setting(containerEl).setName(ui.feedbackName).setDesc(ui.feedbackDesc).addButton((button) => {
      button.setButtonText(ui.feedbackButton).setTooltip(ui.feedbackTooltip).onClick(() => {
        if (!openGitHubIssues()) {
          new Notice(GITHUB_ISSUES_URL, 8e3);
        }
      });
    });
    containerEl.createEl("p", {
      cls: "note-reader-cosyvoice-muted",
      text: ui.commandsFooter
    });
  }
};
module.exports = {
  default: CosyVoiceReaderPlugin,
  __test: {
    DEFAULT_ONLINE_CHUNK_LIMITS,
    GITHUB_ISSUES_URL,
    VIEW_TYPE,
    buildAzureSpeechEndpoint,
    buildAzureSpeechSsml,
    buildEdgeTtsArgs,
    buildOpenRouterTtsRequestBody,
    calculateCurrentChunkSeekTime,
    createAudioExportSummary,
    createBlobAudioSource,
    createDefaultSettings,
    createIncrementalSpeechChunker,
    createReadingAnchor,
    createReaderState,
    createRemoteHttpError,
    createRemoteRetryExhaustedError,
    createSafeRuntimeLogEvent,
    createTaskState,
    describeMediaError,
    extractPdfTextLayout,
    extractTextFromPdfItems,
    formatProgressLabel,
    formatSpeedLabel,
    getAzureSpeechConfigurationError,
    getAzureSpeechVoicePresets,
    getDefaultOpenRouterVoiceForModel,
    getEdgeTtsVoicePresets,
    getObsidianSecretConfigurationError,
    getOpenRouterConfigurationError,
    getOpenRouterTtsModels,
    getOpenRouterTtsPresets,
    getOpenRouterTtsVoicePresets,
    getChunkLimitsForSpeechEngine,
    getPdfPageNumberFromNode,
    getPdfSelectionContext,
    getPdfSelectionPosition,
    getPluginTempCacheDir,
    getSettingsUiText,
    getTextFromPositionToEnd,
    getAudioUrlForFile,
    getAudioExportExtension,
    getAudioExportScopeLabel,
    getAudioExportScopeUiText,
    getAudioExportUiText,
    getAvailableVaultAudioPath,
    getRemoteHttpErrorDetail,
    getSpeedPresets,
    getSynthesisPrefetchCount,
    hasAzureSpeechConsent,
    hasEdgeTtsConsent,
    hasObsidianSecretStorage,
    hasOpenRouterConsent,
    isRetryableRemoteError,
    isMarkdownFile,
    isPdfFile,
    isOwnedCacheFileName,
    isOnlineSpeechEngine,
    joinPdfPageText,
    normalizeAzureSpeechCloud,
    normalizeAzureSpeechRegion,
    normalizeAzureSpeechVoice,
    normalizeAudioExportFolder,
    normalizeAudioExportLocation,
    normalizeAudioExportScope,
    normalizeCredentialSource,
    normalizeEdgeTtsExecutable,
    normalizeEdgeTtsVoice,
    normalizeMathReadingLanguage,
    normalizeOpenRouterModel,
    normalizeOpenRouterVoice,
    normalizeOnlinePrefetchChunks,
    normalizePdfSelectionText,
    normalizeReadingPositions,
    normalizeSettingsLanguage,
    normalizeSpeechEngine,
    openGitHubIssues,
    parseRetryAfterMs,
    resolveDefaultScriptPath,
    resolvePowerShellExecutable,
    readObsidianSecretValue,
    sanitizeTextForSpeech,
    sanitizeLatexForSpeech,
    slicePdfTextFromSelection,
    sliceTextFromReadingPosition,
    selectKnownSettings,
    selectMarkdownAudioExportText,
    splitTextForSpeechChunks,
    transitionTaskState,
    upsertReadingPosition,
    toVaultRelativePath,
    verbalizeShortLatex
  }
};
function isInsideDirectory(filePath, directoryPath) {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
function messageFromError(error) {
  if (!error) {
    return "unknown error";
  }
  if (error.message) {
    return String(error.message);
  }
  return String(error);
}
