'use strict';

const fs = require('fs');
const path = require('path');

const MAX_EXPORTED_AUDIO_BYTES = 256 * 1024 * 1024;

function bufferToArrayBuffer(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function sanitizeExportBaseName(value) {
  const sanitized = String(value || 'note')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return sanitized || 'note';
}

function buildExportAudioFileName(noteBaseName, extension, scope = 'entire') {
  const normalizedExtension = String(extension || '').toLowerCase() === 'mp3' ? 'mp3' : 'wav';
  const suffix = scope === 'selection'
    ? 'selection narration'
    : scope === 'from-selection'
      ? 'continued narration'
      : 'narration';
  return `${sanitizeExportBaseName(noteBaseName)} - ${suffix}.${normalizedExtension}`;
}

function parseWaveBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (buffer.length < 12
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('The local speech engine returned an invalid WAV file.');
  }

  let formatChunk = null;
  const dataChunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) {
      throw new Error('The local speech engine returned a truncated WAV file.');
    }
    if (chunkId === 'fmt ' && !formatChunk) {
      formatChunk = Buffer.from(buffer.subarray(chunkStart, chunkEnd));
    } else if (chunkId === 'data' && chunkSize > 0) {
      dataChunks.push(buffer.subarray(chunkStart, chunkEnd));
    }
    offset = chunkEnd + (chunkSize % 2);
  }

  if (!formatChunk || formatChunk.length < 16 || !dataChunks.length) {
    throw new Error('The local speech engine returned a WAV file without PCM audio data.');
  }

  const audioFormat = formatChunk.readUInt16LE(0);
  const channels = formatChunk.readUInt16LE(2);
  const sampleRate = formatChunk.readUInt32LE(4);
  const byteRate = formatChunk.readUInt32LE(8);
  const blockAlign = formatChunk.readUInt16LE(12);
  const bitsPerSample = formatChunk.readUInt16LE(14);
  const isPcm = audioFormat === 1;
  const isExtensiblePcm = audioFormat === 0xfffe
    && formatChunk.length >= 40
    && formatChunk.readUInt16LE(24) === 1;
  if (!isPcm && !isExtensiblePcm) {
    throw new Error(`WAV export supports PCM audio only; received format ${audioFormat}.`);
  }
  if (!channels || !sampleRate || !byteRate || !blockAlign || !bitsPerSample) {
    throw new Error('The local speech engine returned an invalid WAV format header.');
  }

  const dataBytes = dataChunks.reduce((total, chunk) => total + chunk.length, 0);
  if (dataBytes % blockAlign !== 0) {
    throw new Error('The local speech engine returned misaligned WAV audio data.');
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
    sampleRate,
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
    parsed.formatChunk.toString('hex'),
  ].join(':');
}

function createWaveHeader(formatChunkValue, dataBytes) {
  const formatChunk = Buffer.from(formatChunkValue);
  const formatPadding = formatChunk.length % 2;
  const headerLength = 12 + 8 + formatChunk.length + formatPadding + 8;
  const riffSize = headerLength + dataBytes - 8;
  if (!Number.isSafeInteger(dataBytes) || dataBytes < 0 || riffSize > 0xffffffff) {
    throw new Error('The exported WAV file is too large for the WAV format.');
  }

  const header = Buffer.alloc(headerLength);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(riffSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(formatChunk.length, 16);
  formatChunk.copy(header, 20);
  const dataHeaderOffset = 20 + formatChunk.length + formatPadding;
  header.write('data', dataHeaderOffset, 'ascii');
  header.writeUInt32LE(dataBytes, dataHeaderOffset + 4);
  return header;
}

async function writeBufferAt(fileHandle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const result = await fileHandle.write(buffer, offset, buffer.length - offset, position + offset);
    if (!result || !result.bytesWritten) {
      throw new Error('Unable to write the exported audio file.');
    }
    offset += result.bytesWritten;
  }
  return position + buffer.length;
}

async function mergeWaveFiles(inputPaths, outputPath, options = {}) {
  const paths = Array.isArray(inputPaths) ? inputPaths.filter(Boolean) : [];
  if (!paths.length) {
    throw new Error('No WAV segments were generated for export.');
  }
  const maxBytes = Number(options.maxBytes) > 0
    ? Number(options.maxBytes)
    : MAX_EXPORTED_AUDIO_BYTES;
  let expectedSignature = '';
  let formatChunk = null;
  let totalDataBytes = 0;

  for (const inputPath of paths) {
    const parsed = parseWaveBuffer(await fs.promises.readFile(inputPath));
    const signature = getWaveFormatSignature(parsed);
    if (expectedSignature && signature !== expectedSignature) {
      throw new Error('The generated WAV segments use different audio formats and cannot be merged safely.');
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
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    handle = await fs.promises.open(outputPath, 'w', 0o600);
    let outputOffset = await writeBufferAt(handle, header, 0);
    for (const inputPath of paths) {
      const parsed = parseWaveBuffer(await fs.promises.readFile(inputPath));
      for (const chunk of parsed.dataChunks) {
        outputOffset = await writeBufferAt(handle, chunk, outputOffset);
      }
    }
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      handle = null;
    }
    await fs.promises.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }

  return {
    bytes: header.length + totalDataBytes,
    extension: 'wav',
    segments: paths.length,
  };
}

const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function parseMp3FrameHeader(buffer, offset) {
  if (offset + 4 > buffer.length) {
    return null;
  }
  const header = buffer.readUInt32BE(offset) >>> 0;
  if (((header >>> 21) & 0x7ff) !== 0x7ff) {
    return null;
  }
  const versionBits = (header >>> 19) & 0x3;
  const layerBits = (header >>> 17) & 0x3;
  const bitrateIndex = (header >>> 12) & 0xf;
  const sampleRateIndex = (header >>> 10) & 0x3;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex < 1 || bitrateIndex > 14 || sampleRateIndex === 3) {
    return null;
  }

  const baseSampleRates = [44100, 48000, 32000];
  const sampleRateDivisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
  const sampleRate = baseSampleRates[sampleRateIndex] / sampleRateDivisor;
  const bitrateKbps = (versionBits === 3 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex];
  const padding = (header >>> 9) & 0x1;
  const frameLength = Math.floor(
    ((versionBits === 3 ? 144 : 72) * bitrateKbps * 1000) / sampleRate
  ) + padding;
  if (frameLength <= 4 || offset + frameLength > buffer.length) {
    return null;
  }

  const channelMode = (header >>> 6) & 0x3;
  return {
    bitrateKbps,
    channels: channelMode === 3 ? 1 : 2,
    frameLength,
    layerBits,
    sampleRate,
    versionBits,
  };
}

function readSynchsafeInteger(buffer, offset) {
  if (offset + 4 > buffer.length) {
    return -1;
  }
  const bytes = buffer.subarray(offset, offset + 4);
  if (Array.from(bytes).some((byte) => byte & 0x80)) {
    return -1;
  }
  return (bytes[0] << 21) | (bytes[1] << 14) | (bytes[2] << 7) | bytes[3];
}

function skipLeadingId3Tags(buffer) {
  let offset = 0;
  while (offset + 10 <= buffer.length && buffer.toString('ascii', offset, offset + 3) === 'ID3') {
    const tagSize = readSynchsafeInteger(buffer, offset + 6);
    if (tagSize < 0) {
      throw new Error('The online speech engine returned an invalid MP3 metadata tag.');
    }
    const hasFooter = Boolean(buffer[offset + 5] & 0x10);
    const nextOffset = offset + 10 + tagSize + (hasFooter ? 10 : 0);
    if (nextOffset > buffer.length) {
      throw new Error('The online speech engine returned a truncated MP3 metadata tag.');
    }
    offset = nextOffset;
  }
  return offset;
}

function isMp3MetadataFrame(frame) {
  const sample = frame.subarray(0, Math.min(frame.length, 192)).toString('latin1');
  return sample.includes('Xing') || sample.includes('Info') || sample.includes('VBRI');
}

function isIgnorableMp3Tail(buffer, offset) {
  if (offset >= buffer.length) {
    return true;
  }
  if (buffer.length - offset === 128 && buffer.toString('ascii', offset, offset + 3) === 'TAG') {
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
    if (buffer.length - offset === 128 && buffer.toString('ascii', offset, offset + 3) === 'TAG') {
      break;
    }
    const header = parseMp3FrameHeader(buffer, offset);
    if (!header) {
      if (frames.length) {
        if (isIgnorableMp3Tail(buffer, offset)) {
          break;
        }
        throw new Error('The online speech engine returned malformed MP3 audio frames.');
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
      header.channels,
    ].join(':') !== [
      format.versionBits,
      format.layerBits,
      format.sampleRate,
      format.channels,
    ].join(':')) {
      throw new Error('The online speech engine returned inconsistent MP3 audio frames.');
    }
    frames.push(frame);
    format = format || header;
    offset += header.frameLength;
  }

  if (frames.length > 1 && isMp3MetadataFrame(frames[0])) {
    frames.shift();
  }
  if (!frames.length || !format) {
    throw new Error('The online speech engine returned an MP3 file without readable audio frames.');
  }

  return {
    bytes: frames.reduce((total, frame) => total + frame.length, 0),
    format,
    frames,
  };
}

function getMp3FormatSignature(parsed) {
  return [
    parsed.format.versionBits,
    parsed.format.layerBits,
    parsed.format.sampleRate,
    parsed.format.channels,
  ].join(':');
}

async function mergeMp3Files(inputPaths, outputPath, options = {}) {
  const paths = Array.isArray(inputPaths) ? inputPaths.filter(Boolean) : [];
  if (!paths.length) {
    throw new Error('No MP3 segments were generated for export.');
  }
  const maxBytes = Number(options.maxBytes) > 0
    ? Number(options.maxBytes)
    : MAX_EXPORTED_AUDIO_BYTES;
  let expectedSignature = '';
  let totalBytes = 0;
  let totalFrames = 0;
  let handle = null;

  try {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    handle = await fs.promises.open(outputPath, 'w', 0o600);
    let outputOffset = 0;
    for (const inputPath of paths) {
      const parsed = extractMp3Frames(await fs.promises.readFile(inputPath));
      const signature = getMp3FormatSignature(parsed);
      if (expectedSignature && signature !== expectedSignature) {
        throw new Error('The generated MP3 segments use different sample formats and cannot be merged safely.');
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
      await handle.close().catch(() => {});
      handle = null;
    }
    await fs.promises.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }

  return {
    bytes: totalBytes,
    extension: 'mp3',
    frames: totalFrames,
    segments: paths.length,
  };
}

async function mergeAudioFiles(inputPaths, outputPath, extension, options = {}) {
  return String(extension || '').toLowerCase() === 'mp3'
    ? mergeMp3Files(inputPaths, outputPath, options)
    : mergeWaveFiles(inputPaths, outputPath, options);
}

module.exports = {
  MAX_EXPORTED_AUDIO_BYTES,
  bufferToArrayBuffer,
  buildExportAudioFileName,
  createWaveHeader,
  extractMp3Frames,
  mergeAudioFiles,
  mergeMp3Files,
  mergeWaveFiles,
  parseMp3FrameHeader,
  parseWaveBuffer,
  sanitizeExportBaseName,
};
