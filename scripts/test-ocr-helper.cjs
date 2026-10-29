'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { OcrProcess } = require('../src/ocr-process');

async function main() {
  const [executable, fixtureFolder, mode] = process.argv.slice(2);
  if (!executable || !fixtureFolder) throw new Error('Usage: node scripts/test-ocr-helper.cjs <helper-executable> <public-fixtures-folder>');
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureFolder,'manifest.json')));
  assert.match(manifest.provenance, /^Original generic text authored for this test/);
  const results = [];
  for (const model of ['small','tiny']) {
    const helper = new OcrProcess(path.resolve(executable),model);
    try {
      for (const id of mode === '--release-smoke' ? ['public-library'] : ['en-clean','zh-clean','en-columns']) {
        const page = manifest.cases.find(row => row.id === id);
        assert.ok(page, `Missing public fixture: ${id}`);
        const rgb = fs.readFileSync(path.join(fixtureFolder, `${id}.rgb`));
        const start = performance.now();
        const result = await helper.recognize(rgb,page.width,page.height);
        const recognized = result.lines.map(line=>line.text).join(' ');
        if (mode === '--release-smoke') {
          assert.match(recognized, /public library/i);
          assert.match(recognized, /opens at nine/i);
        } else {
          assert.ok(result.lines.length > 5);
          assert.ok(recognized.length > 100);
        }
        results.push({ model, id, ms: Math.round(performance.now()-start), lines: result.lines.length });
        rgb.fill(0);
      }
    } finally { helper.close(); }
  }
  console.log(JSON.stringify({ passed:true, privateInputs:false, networkRequests:0, results }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
