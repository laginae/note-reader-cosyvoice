'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  bufferToArrayBuffer,
  buildExportAudioFileName,
  extractMp3Frames,
  mergeMp3Files,
  mergeWaveFiles,
  parseWaveBuffer,
} = require('./audio-export');

function createPcmWave(samples, options = {}) {
  const channels = options.channels || 1;
  const sampleRate = options.sampleRate || 24000;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  const output = Buffer.alloc(44 + data.length);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channels, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * blockAlign, 28);
  output.writeUInt16LE(blockAlign, 32);
  output.writeUInt16LE(bitsPerSample, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(data.length, 40);
  data.copy(output, 44);
  return output;
}

function createMp3Frame(fill = 0x11) {
  const frameLength = Math.floor((144 * 128000) / 44100);
  const frame = Buffer.alloc(frameLength, fill);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  frame[3] = 0xc0;
  return frame;
}

function createId3Tag(payloadLength = 4) {
  const tag = Buffer.alloc(10 + payloadLength);
  tag.write('ID3', 0, 'ascii');
  tag[3] = 4;
  tag[9] = payloadLength;
  return tag;
}

test('buildExportAudioFileName creates a filesystem-safe narration name', () => {
  assert.equal(buildExportAudioFileName('Paper: results?', 'mp3'), 'Paper- results- - narration.mp3');
  assert.equal(buildExportAudioFileName('  ', 'invalid'), 'note - narration.wav');
});

test('bufferToArrayBuffer preserves only the selected buffer bytes', () => {
  const source = Buffer.from([1, 2, 3, 4]);
  const sliced = source.subarray(1, 3);
  assert.deepEqual(Array.from(new Uint8Array(bufferToArrayBuffer(sliced))), [2, 3]);
});

test('mergeWaveFiles concatenates PCM data and preserves the format', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'note-reader-wav-test-'));
  const firstPath = path.join(directory, 'first.wav');
  const secondPath = path.join(directory, 'second.wav');
  const outputPath = path.join(directory, 'combined.wav');
  try {
    fs.writeFileSync(firstPath, createPcmWave([100, 200]));
    fs.writeFileSync(secondPath, createPcmWave([-300, 400, 500]));
    const result = await mergeWaveFiles([firstPath, secondPath], outputPath);
    const parsed = parseWaveBuffer(fs.readFileSync(outputPath));
    assert.equal(result.extension, 'wav');
    assert.equal(result.segments, 2);
    assert.equal(parsed.sampleRate, 24000);
    assert.equal(parsed.dataBytes, 10);
    assert.deepEqual(
      Array.from(Buffer.concat(parsed.dataChunks).values()),
      Array.from(Buffer.concat([
        createPcmWave([100, 200]).subarray(44),
        createPcmWave([-300, 400, 500]).subarray(44),
      ]).values())
    );
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test('mergeWaveFiles rejects incompatible segment formats', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'note-reader-wav-mismatch-'));
  const firstPath = path.join(directory, 'first.wav');
  const secondPath = path.join(directory, 'second.wav');
  try {
    fs.writeFileSync(firstPath, createPcmWave([1], { sampleRate: 24000 }));
    fs.writeFileSync(secondPath, createPcmWave([2], { sampleRate: 22050 }));
    await assert.rejects(
      () => mergeWaveFiles([firstPath, secondPath], path.join(directory, 'combined.wav')),
      /different audio formats/
    );
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test('mergeMp3Files strips tags and joins valid Layer III frames', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'note-reader-mp3-test-'));
  const firstPath = path.join(directory, 'first.mp3');
  const secondPath = path.join(directory, 'second.mp3');
  const outputPath = path.join(directory, 'combined.mp3');
  const id3v1 = Buffer.alloc(128);
  id3v1.write('TAG', 0, 'ascii');
  try {
    fs.writeFileSync(firstPath, Buffer.concat([createId3Tag(), createMp3Frame(0x11), createMp3Frame(0x22), id3v1]));
    fs.writeFileSync(secondPath, Buffer.concat([createMp3Frame(0x33), createMp3Frame(0x44)]));
    const result = await mergeMp3Files([firstPath, secondPath], outputPath);
    const output = fs.readFileSync(outputPath);
    const parsed = extractMp3Frames(output);
    assert.equal(result.extension, 'mp3');
    assert.equal(result.segments, 2);
    assert.equal(result.frames, 4);
    assert.equal(parsed.frames.length, 4);
    assert.notEqual(output.toString('ascii', 0, 3), 'ID3');
    assert.notEqual(output.toString('ascii', output.length - 128, output.length - 125), 'TAG');
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});
