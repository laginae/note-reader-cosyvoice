'use strict';

const https = require('https');
const { createWaveHeader } = require('./audio-export');
const { synthesizeRealtimePcm, realtimeError } = require('./openai-realtime');

function requestRealtimeJson(request, signal) {
  return new Promise((resolve, reject) => {
    let settled = false, outgoing;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => { finish(realtimeError('cancelled')); outgoing?.destroy(); };
    if (signal?.aborted) { abort(); return; }
    try {
      outgoing = https.request(request.url, { method: 'POST', headers: request.headers }, response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          const error = realtimeError('rejected');
          error.message = error.message.replace('OpenAI Realtime:', `OpenAI Realtime HTTP ${response.statusCode}:`);
          finish(error); return;
        }
        if (!/^application\/json(?:;|$)/i.test(response.headers['content-type'] || '')) {
          response.destroy(); finish(realtimeError('credential')); return;
        }
        const parts = []; let length = 0;
        response.on('data', part => {
          if (settled) return;
          length += part.length;
          if (length > 65536) { finish(realtimeError('size')); response.destroy(); return; }
          parts.push(part);
        });
        response.on('error', () => finish(realtimeError('transport')));
        response.on('aborted', () => finish(realtimeError('transport')));
        response.on('end', () => {
          if (settled) return;
          try { finish(null, JSON.parse(Buffer.concat(parts).toString('utf8'))); }
          catch { finish(realtimeError('credential')); }
        });
      });
      signal?.addEventListener('abort', abort, { once: true });
      outgoing.on('error', () => finish(realtimeError('transport')));
      outgoing.setTimeout(90000, () => { finish(realtimeError('timeout')); outgoing.destroy(); });
      outgoing.end(request.body);
    } catch { finish(realtimeError('transport')); outgoing?.destroy(); }
  });
}

async function synthesizeRealtimeWav(options) {
  const pcm = await synthesizeRealtimePcm({ requestJson: requestRealtimeJson, ...options });
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0); format.writeUInt16LE(1, 2);
  format.writeUInt32LE(24000, 4); format.writeUInt32LE(48000, 8);
  format.writeUInt16LE(2, 12); format.writeUInt16LE(16, 14);
  return Buffer.concat([createWaveHeader(format, pcm.length), Buffer.from(pcm)]);
}

module.exports = { requestRealtimeJson, synthesizeRealtimeWav };
