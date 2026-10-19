const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { maskMarkdownNonSpeech, cleanMarkdownPresentation } = require('./markdown-syntax');
const { buildMarkdownSource, currentSourceRanges } = require('./markdown-source');
const loaded = { exports: {} };
new Function('require','module','exports',fs.readFileSync(`${__dirname}/../main.js`,'utf8'))(
  name => name === 'obsidian' ? new Proxy({}, {get:()=>class {}}) : require(name), loaded, loaded.exports);
const {sanitizeTextForSpeech: clean, selectMarkdownAudioExportText: select} = loaded.exports.__test;

test('comments and emphasis markers never become spoken text; visible contents remain', () => {
  assert.equal(clean('<!-- EN-P05 -->\n==Visible words== and **bold** with ~~old~~ text.'),'Visible words and bold with old text.');
  assert.equal(clean('Before <!-- hidden\n\n# Hidden heading\nsecret --> after.\n%% internal %% End.'),'Before\nafter.\nEnd.');
  assert.equal(clean('---\ntitle: hidden\n---\n# Title\n- [x] Done\n- [ ] Pending\n---'),'Title\nDone\nPending');
  assert.equal(clean('Visible. <!-- unfinished secret'),'Visible.');
});

test('fences are omitted as code, inline code is not interpreted as a comment or highlight', () => {
  assert.equal(clean('Before\n~~~html\n<!-- code -->\n==code==\n~~~\nAfter'),'Before\nAfter');
  assert.equal(maskMarkdownNonSpeech('`<!-- literal -->` and ``==literal==``'),'`<!-- literal -->` and ``==literal==``');
  assert.equal(cleanMarkdownPresentation('$x==y$ and ==marked=='), '$x==y$ and marked');
  assert.match(clean('Keep $x = y + 2$ and ==word==.'), /x equals y plus 2.*word/);
});

test('comment masking preserves offsets and mapping across blank lines and repeated paragraphs', () => {
  const raw='First.\n\n<!-- hidden\n\n# hidden\n-->\n\n==Second.==';
  const masked=maskMarkdownNonSpeech(raw);
  assert.equal(masked.length,raw.length);
  assert.equal(masked.split('\n').length,raw.split('\n').length);
  const source=buildMarkdownSource(raw,['First.','Second.'],clean);
  assert.equal(source.mappingValid,true);
  const [range]=currentSourceRanges(source,{index:1});
  assert.equal(raw.slice(range.from,range.to),'==Second.==');
});

test('selection/export beginning inside a comment cannot reveal hidden text', () => {
  const doc='Before\n<!-- private example\nhidden words -->\n==After==';
  assert.equal(clean(select(doc,'hidden words',{line:2,ch:0},'selection',true)), '');
  assert.equal(clean(select(doc,'hidden words',{line:2,ch:0},'from-selection',true)), 'After');
  assert.equal(clean(select(doc,'',null,'entire',true)), 'Before\nAfter');
  const offset=doc.indexOf('hidden words'), raw=doc.slice(offset);
  const source=buildMarkdownSource(raw,['After'],clean,{sourceText:doc,sourceOffset:offset});
  assert.equal(source.mappingValid,true);
});
