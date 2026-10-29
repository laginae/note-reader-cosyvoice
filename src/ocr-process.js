'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { env: systemEnvironment } = require('process');
const { MAX_PIXELS, validateResult } = require('./ocr-contract');

// One bounded page at a time. Pixels travel over stdin, never a temporary file.
class OcrProcess {
  constructor(executable, model, options = {}) {
    if (!path.isAbsolute(executable) || /^\\\\/.test(executable) || /[\r\n\0]/.test(executable) || /\.(?:bat|cmd|ps1|sh)$/i.test(executable)) throw new Error('OCR_PATH');
    this.executable = executable; this.model = model === 'tiny' ? 'tiny' : 'small';
    this.spawn = options.spawn || spawn; this.timeout = options.timeout || 120000;
  }
  start() {
    if (this.closed) throw new Error('OCR_CANCELLED');
    if (this.child) return;
    this.output = ''; this.outputBytes = 0;
    this.child = this.spawn(this.executable, ['--model', this.model], {
      shell: false, windowsHide: true, stdio: ['pipe','pipe','pipe'],
      env: { ...Object.fromEntries(Object.entries(systemEnvironment).filter(([key]) => /^(SystemRoot|WINDIR|PATH|HOME|USERPROFILE|TEMP|TMP|TMPDIR|DOTNET_ROOT|DOTNET_ROOT_X64|LANG|LC_ALL)$/i.test(key))),
        DOTNET_PROCESSOR_COUNT: '4', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      if (!this.pending || (this.outputBytes += Buffer.byteLength(chunk)) > 2 * 1024 * 1024) { this.close('OCR_PROTOCOL'); return; }
      this.output += chunk;
      const end = this.output.indexOf('\n');
      if (end < 0) return;
      try {
        if (this.output.slice(end + 1).trim()) throw new Error('OCR_PROTOCOL');
        const { width, height } = this.pending;
        const result = validateResult(JSON.parse(this.output.slice(0, end)), width, height);
        const pending = this.pending; this.pending = null; this.output = ''; this.outputBytes = 0;
        pending.finish(null, result);
      } catch (_) { this.close('OCR_PROTOCOL'); }
    });
    // Native errors may contain file paths or recognized text. Do not surface/log them.
    this.child.stderr.resume();
    this.child.stdin.on('error', () => this.close('OCR_HELPER'));
    this.child.on('error', () => this.close('OCR_HELPER'));
    this.child.on('exit', () => this.close('OCR_HELPER'));
  }
  recognize(rgb, width, height, signal) {
    if (this.pending) return Promise.reject(new Error('OCR_BUSY'));
    if (signal?.aborted || this.closed) return Promise.reject(new Error('OCR_CANCELLED'));
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > MAX_PIXELS || rgb.length !== width * height * 3) return Promise.reject(new Error('OCR_IMAGE'));
    return new Promise((resolve, reject) => {
      const abort = () => this.close('OCR_CANCELLED');
      const timer = setTimeout(() => this.close('OCR_TIMEOUT'), this.timeout);
      this.pending = { width, height, finish: (error, result) => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (error) reject(new Error(error)); else resolve(result);
      } };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        this.start();
        const header = Buffer.from(JSON.stringify({ version: 1, width, height }) + '\n');
        this.child.stdin.write(header);
        this.child.stdin.write(rgb);
      } catch (_) { this.close('OCR_HELPER'); }
    });
  }
  close(reason = 'OCR_CANCELLED') {
    this.closed = true;
    const pending = this.pending; this.pending = null;
    pending?.finish(reason);
    const child = this.child; this.child = null;
    child?.kill(); this.output = ''; this.outputBytes = 0;
  }
}
module.exports = { OcrProcess };
