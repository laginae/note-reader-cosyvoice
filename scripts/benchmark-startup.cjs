'use strict';
// Measures the bundled module, not Obsidian's entire startup or first synthesis.
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { spawnSync } = require('node:child_process');
const file = process.argv[2] || 'main.js';
if (process.argv.includes('--sample')) {
  const source = fs.readFileSync(file, 'utf8');
  const start = performance.now();
  const factory = new Function('require', 'module', 'exports', source);
  const compiled = performance.now();
  class Stub {}
  const moduleObject = { exports: {} };
  factory(id => id === 'obsidian' ? new Proxy({}, { get: () => Stub }) : require(id), moduleObject, moduleObject.exports);
  process.stdout.write(JSON.stringify({ bytes: Buffer.byteLength(source), compileMs: compiled - start, initializeMs: performance.now() - compiled }));
} else {
  const samples = Array.from({ length: 9 }, () => {
    const result = spawnSync(process.execPath, [__filename, file, '--sample'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    return JSON.parse(result.stdout);
  });
  const median = key => samples.map(x => x[key]).sort((a,b) => a-b)[4];
  process.stdout.write(JSON.stringify({ bytes: samples[0].bytes, samples: samples.length,
    compileMedianMs: median('compileMs'), initializeMedianMs: median('initializeMs'),
    scope: 'Fresh Node process per sample; warm OS disk cache; excludes Obsidian activation and API latency.' }, null, 2));
}
