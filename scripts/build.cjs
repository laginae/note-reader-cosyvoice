const { buildSync } = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const notice = fs.readFileSync(path.join(root, 'docs/licenses/readability.txt'), 'utf8').replace(/\r\n/g, '\n');
const guest = buildSync({
  absWorkingDir: root, entryPoints: ['src/web-document.js'], bundle: true,
  platform: 'browser', format: 'iife', globalName: 'NoteReaderWebDocument',
  target: 'es2020', write: false, legalComments: 'inline', logLevel: 'warning',
}).outputFiles[0].text;
buildSync({
  absWorkingDir: root, entryPoints: ['src/main.js'], bundle: true,
  external: ['obsidian'], platform: 'node', format: 'cjs', target: 'es2020',
  outfile: 'main.js', logLevel: 'warning',
  define: { __NOTE_READER_WEB_GUEST__: JSON.stringify(guest) },
  footer: { js: `/*!\n${notice}\n*/` },
});
