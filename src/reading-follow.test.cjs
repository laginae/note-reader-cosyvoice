const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { following, pauseFollowing, toggleFollowing, updateFollowButton, watchFollowing } = require('./reading-follow');
test('follow toggles share type settings, resume paused mode and preserve other types', async () => {
  let saved = 0;
  const p = { settings: {}, saveSettings: async () => saved++ };
  assert.equal(following(p, 'pdf'), false);
  await toggleFollowing(p, 'pdf'); assert.equal(following(p, 'pdf'), true);
  pauseFollowing(p, 'pdf'); assert.equal(following(p, 'pdf'), false);
  assert.equal(p.settings.pdfReadingFollow, true);
  await toggleFollowing(p, 'pdf'); assert.equal(following(p, 'pdf'), true);
  await toggleFollowing(p, 'pdf'); assert.equal(following(p, 'pdf'), false);
  assert.equal(p.settings.readingFollow, undefined); assert.equal(saved, 3);
});
test('follow controls show off/on/paused and user scroll pauses without treating programmatic scroll as manual', () => {
  const dom = new JSDOM('<main><button></button></main>'), root = dom.window.document.querySelector('main');
  const button = root.firstChild, p = { settings: { pdfReadingFollow: true, settingsLanguage: 'chinese' } };
  const unwatch = watchFollowing(p, root, 'pdf');
  updateFollowButton(button, p, 'pdf'); assert.equal(button.getAttribute('aria-pressed'), 'true');
  root.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
  button.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(following(p, 'pdf'), true);
  root.dispatchEvent(new dom.window.Event('scroll')); assert.equal(following(p, 'pdf'), true);
  root.dispatchEvent(new dom.window.Event('wheel')); assert.equal(following(p, 'pdf'), false);
  updateFollowButton(button, p, 'pdf'); assert.match(button.getAttribute('aria-label'), /已暂停/);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  unwatch(); p.readingFollowPaused.clear(); root.dispatchEvent(new dom.window.Event('wheel'));
  assert.equal(following(p, 'pdf'), true); dom.window.close();
});

test('scrollbar drag and middle-button scrolling pause, ordinary clicks do not', () => {
  const { manualScrollIntent } = require('./follow-input');
  const target = { clientWidth: 180, offsetWidth: 200, clientHeight: 100, offsetHeight: 100,
    getBoundingClientRect: () => ({ left: 10, top: 0 }) };
  assert.equal(manualScrollIntent({ type: 'pointerdown', target, button: 0, clientX: 100 }), false);
  assert.equal(manualScrollIntent({ type: 'pointerdown', target, button: 0, clientX: 195 }), true);
  assert.equal(manualScrollIntent({ type: 'pointerdown', target, button: 1 }), true);
});
