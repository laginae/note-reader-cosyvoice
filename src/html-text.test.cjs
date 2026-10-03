const assert = require('node:assert/strict');
const test = require('node:test');
const { parseDocument } = require('htmlparser2');
const {
  captureHtmlSelection, extractHtmlText, extractHtmlTreeText,
  getHtmlReaderDocument, isHtmlFile,
} = require('./html-text');

test('HTML and HTM are supported without claiming web or MHTML views', () => {
  for (const extension of ['html', 'htm', 'HTML']) assert.equal(isHtmlFile({ extension }), true);
  for (const extension of ['md', 'mhtml', 'pdf', '']) assert.equal(isHtmlFile({ extension }), false);
});

test('HTML extraction decodes entities and preserves inline words, paragraphs and tables', () => {
  const text = extractHtmlText('<h1>Study</h1><p>co<em>variance</em> &amp; x &lt; 5 &gt; 2.</p>'
    + '<p>&#20013;&#25991;&nbsp;text<br>Next line</p><table><tr><th>Region</th><th>Value</th></tr>'
    + '<tr><td>North</td><td>95%</td></tr></table><ul><li>First</li><li>Second</li></ul>');
  assert.match(text, /covariance & x < 5 > 2\./);
  assert.match(text, /中文 text\nNext line/);
  assert.match(text, /Region; Value;\s+North; 95%/);
  assert.match(text, /First\n\nSecond/);
});

test('extraction omits active, hidden and navigation content but preserves visible article text', () => {
  const text = extractHtmlText('<head><title>Not body</title><script>fetch("https://example.org")</script></head>'
    + '<nav>Navigation</nav><header>Article title</header><main><p>Visible <a href="https://example.org">reference</a>.</p>'
    + '<script>Secret script</script><style>Private style</style><template>Template</template>'
    + '<p hidden>Hidden</p><p aria-hidden="true">Aria hidden</p><p style="color:red; display: none !important">CSS hidden</p>'
    + '<iframe src="https://example.org">Frame</iframe><img src="https://example.org/image"><form>Login</form></main>'
    + '<footer>Footer</footer>');
  assert.equal(text, 'Article title\n\nVisible reference.');
  assert.ok(!text.includes('example.org'));
});

test('malformed HTML remains readable and scripts are never evaluated', () => {
  global.__htmlReaderScriptRan = false;
  assert.equal(extractHtmlText('<p>First<p>Second<script>global.__htmlReaderScriptRan=true</script>'), 'First\n\nSecond');
  assert.equal(global.__htmlReaderScriptRan, false);
  delete global.__htmlReaderScriptRan;
});

test('range offsets use node identity to select a repeated phrase in the second paragraph', () => {
  const root = parseDocument('<p>Repeated phrase. Earlier.</p><p>Repeated phrase. Later.</p><p>End.</p>');
  const second = root.children[1].children[0];
  const result = extractHtmlTreeText(root, {
    startContainer: second, startOffset: 0, endContainer: second, endOffset: 16,
  });
  assert.equal(result.selection.selectedText, 'Repeated phrase.');
  assert.equal(result.text.slice(result.selection.startOffset), 'Repeated phrase. Later.\n\nEnd.');
  assert.ok(result.selection.startOffset > result.text.indexOf('Repeated phrase.'));
});

test('range offsets handle partial words, whitespace and element child boundaries', () => {
  const root = parseDocument('<p>Prefix <em> selected </em> suffix.</p><p>Last.</p>');
  const paragraph = root.children[0];
  const result = extractHtmlTreeText(root, {
    startContainer: paragraph, startOffset: 1, endContainer: paragraph, endOffset: 2,
  });
  assert.equal(result.selection.selectedText, 'selected');
  const node = paragraph.children[2];
  const partial = extractHtmlTreeText(root, {
    startContainer: node, startOffset: 2, endContainer: node, endOffset: 5,
  });
  assert.equal(partial.selection.selectedText, 'uff');
});

test('selected hidden content is not spoken or silently relocated', () => {
  const root = parseDocument('<p hidden>Hidden</p><p>Visible</p>');
  const node = root.children[0].children[0];
  assert.equal(extractHtmlTreeText(root, {
    startContainer: node, startOffset: 0, endContainer: node, endOffset: 6,
  }).selection, null);
});

test('selection capture is transient, belongs to the body, and rejects inaccessible frames', () => {
  const body = parseDocument('<p>Selected content.</p>');
  const node = body.children[0].children[0];
  body.contains = (candidate) => candidate === node;
  const range = { startContainer: node, startOffset: 0, endContainer: node, endOffset: 8 };
  const doc = { body, getSelection: () => ({ isCollapsed: false, rangeCount: 1, getRangeAt: () => range }) };
  const context = captureHtmlSelection(doc, 'Articles/sample.html', 123);
  assert.equal(context.selectedText, 'Selected');
  assert.equal(context.filePath, 'Articles/sample.html');
  assert.equal(context.fileMtime, 123);
  assert.equal(context.text, 'Selected content.');
  assert.equal(getHtmlReaderDocument({ mainView: { iframe: { contentDocument: doc } } }), doc);
  assert.equal(getHtmlReaderDocument({ mainView: { iframe: { get contentDocument() { throw new Error('Blocked'); } } } }), null);
  body.contains = () => false;
  assert.equal(captureHtmlSelection(doc, 'Articles/sample.html', 123), null);
});

test('HTML parsing bounds text and node counts rather than clipping a document silently', () => {
  assert.throws(() => extractHtmlText('<p>' + 'a'.repeat(5_000_001) + '</p>'), /size limit/);
  assert.throws(() => extractHtmlText('<span></span>'.repeat(200_001)), /too many elements/);
});
