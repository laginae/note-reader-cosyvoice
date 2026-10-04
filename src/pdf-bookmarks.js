'use strict';
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString, PDFNumber, PDFRef } = require('pdf-lib');
const key = PDFName.of;

async function loadWritablePdf(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.isEncrypted || doc.catalog.has(key('Perms'))) throw new Error('Encrypted or restricted PDF: bookmark writing is disabled.');
  const seen = new Set();
  function inspect(object) {
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFDict && (object.has(key('ByteRange')) || object.get(key('FT'))?.toString() === '/Sig'
      || object.get(key('Type'))?.toString() === '/Sig')) {
      throw new Error('Signed PDF or signature field: bookmark writing is disabled.');
    }
    if (object instanceof PDFDict) for (const [, child] of object.entries()) {
      if (!(child instanceof PDFRef)) inspect(child);
    }
    if (object instanceof PDFArray) for (const child of object.asArray()) if (!(child instanceof PDFRef)) inspect(child);
  }
  for (const [, object] of doc.context.enumerateIndirectObjects()) inspect(object);
  return doc;
}

function pageFingerprint(doc) {
  return doc.getPages().map(page => ({ box: page.getMediaBox(),
    contents: page.node.get(key('Contents'))?.toString(),
    annotations: page.node.lookupMaybe(key('Annots'), PDFArray)?.asArray().map(ref => doc.context.lookup(ref)?.toString()) || [] }));
}

async function writePdfBookmarks(bytes, entries, mode = 'replace', existing = []) {
  if (!['keep','merge','replace'].includes(mode)) throw new Error('Invalid bookmark mode.');
  const doc = await loadWritablePdf(bytes), before = pageFingerprint(doc);
  const oldRoot = doc.catalog.lookupMaybe(key('Outlines'), PDFDict);
  if (mode === 'keep' && oldRoot) return new Uint8Array(bytes);
  let rows = entries.map(e => ({ ...e, title: String(e.title || '').trim() }));
  if (mode === 'merge') rows = rows.filter(e => !existing.some(old =>
    (old.title.trim() === e.title || old.title.trim() === e.originalTitle) && old.page === e.page));
  if (rows.length > 1000) throw new Error('Too many bookmarks.');
  for (const row of rows) if (!row.title || row.title.length > 500 || !Number.isInteger(row.page) || row.page < 1 || row.page > doc.getPageCount()
    || !Number.isInteger(row.level) || row.level < 1 || row.level > 6 || !Number.isFinite(row.x) || !Number.isFinite(row.y)) throw new Error('Invalid bookmark title, level or destination.');
  if (!rows.length) return new Uint8Array(bytes);
  let root = mode === 'merge' ? oldRoot : null;
  let rootRef = root ? doc.catalog.get(key('Outlines')) : null;
  if (root && !(rootRef instanceof PDFRef)) throw new Error('Unsupported existing bookmark tree. Use replace on a copy.');
  if (!root) { root = doc.context.obj({ Type: 'Outlines' }); rootRef = doc.context.register(root); doc.catalog.set(key('Outlines'), rootRef); }
  const stack = [{ level: 0, dict: root, ref: rootRef, added: 0 }];
  const parents = new Set([stack[0]]);
  for (const row of rows) {
    while (stack.length > 1 && stack[stack.length-1].level >= row.level) stack.pop();
    const parent = stack[stack.length-1];
    const dict = doc.context.obj({ Title: PDFHexString.fromText(row.title), Parent: parent.ref,
      Dest: [doc.getPage(row.page-1).ref, 'XYZ', row.x, row.y, null] });
    const ref = doc.context.register(dict), previous = parent.dict.get(key('Last'));
    if (previous) {
      const sibling = doc.context.lookup(previous, PDFDict);
      sibling.set(key('Next'), ref); dict.set(key('Prev'), previous);
    } else parent.dict.set(key('First'), ref);
    parent.dict.set(key('Last'), ref);
    for (const ancestor of stack) ancestor.added++;
    const node = { level: row.level, dict, ref, added: 0 }; parents.add(node); stack.push(node);
  }
  for (const parent of parents) if (parent.added) {
    const count = parent.dict.lookupMaybe(key('Count'), PDFNumber)?.asNumber() || 0;
    parent.dict.set(key('Count'), PDFNumber.of(Math.abs(count) + parent.added));
  }
  const output = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  const check = await PDFDocument.load(output, { updateMetadata: false });
  if (JSON.stringify(pageFingerprint(check)) !== JSON.stringify(before)) throw new Error('PDF page or annotation verification failed; no file was saved.');
  const checkedRoot = check.catalog.lookupMaybe(key('Outlines'), PDFDict);
  if (!checkedRoot?.has(key('First'))) throw new Error('Bookmark verification failed.');
  const verified = [], visited = new Set();
  function visit(parent) {
    let ref = parent.get(key('First'));
    while (ref) {
      const id = ref.toString();
      if (visited.has(id) || visited.size > 5000) throw new Error('Invalid bookmark tree.');
      visited.add(id);
      const node = check.context.lookup(ref, PDFDict), dest = node.lookupMaybe(key('Dest'), PDFArray);
      verified.push({ title: node.lookup(key('Title')).decodeText(), dest: dest?.toString() });
      visit(node); ref = node.get(key('Next'));
    }
  }
  visit(checkedRoot);
  for (const row of rows) {
    const dest = check.context.obj([check.getPage(row.page-1).ref, 'XYZ', row.x, row.y, null]).toString();
    if (!verified.some(v => v.title === row.title && v.dest === dest)) throw new Error('Bookmark destination verification failed.');
  }
  return output;
}

module.exports = { loadWritablePdf, writePdfBookmarks, pageFingerprint };
