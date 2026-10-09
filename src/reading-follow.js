'use strict';
const { manualScrollIntent } = require('./follow-input');
const keys = { markdown: 'readingFollow', pdf: 'pdfReadingFollow', html: 'webReadingFollow', web: 'webReadingFollow' };
function kindFor(plugin, view) {
  if (!view) return plugin.activeSession?.sourceKind;
  return { markdown: 'markdown', pdf: 'pdf', 'html-view': 'html', webviewer: 'web' }[view.getViewType?.()]
    || ({ md: 'markdown', pdf: 'pdf', html: 'html', htm: 'html' }[view.file?.extension]);
}
function followState(plugin, kind) {
  const key = keys[kind], enabled = Boolean(key && plugin.settings[key]);
  return { enabled, paused: enabled && Boolean(plugin.readingFollowPaused?.has(key)), supported: Boolean(key) };
}
function following(plugin, kind) { const state = followState(plugin, kind); return state.enabled && !state.paused; }
function pauseFollowing(plugin, kind) {
  const key = keys[kind];
  if (!key || !plugin.settings[key]) return;
  plugin.readingFollowPaused ||= new Set();
  if (plugin.readingFollowPaused.has(key)) return;
  plugin.readingFollowPaused.add(key);
  plugin.nativeToolbars?.render();
  for (const view of plugin.readerViews || []) view.render();
}
function watchFollowing(plugin, root, kind) {
  const pause = event => {
    if (!manualScrollIntent(event)) return;
    pauseFollowing(plugin, kind);
  };
  for (const name of ['wheel','touchmove','pointerdown','keydown']) root.addEventListener(name, pause, { passive: true });
  return () => { for (const name of ['wheel','touchmove','pointerdown','keydown']) root.removeEventListener(name, pause); };
}
async function toggleFollowing(plugin, kind) {
  const state = followState(plugin, kind), key = keys[kind];
  if (!key) return;
  plugin.settings[key] = !state.enabled || state.paused;
  plugin.readingFollowPaused?.delete(key);
  plugin.followRevision = (plugin.followRevision || 0) + 1;
  if (key === 'readingFollow') {
    plugin.noteHighlights?.resetFollowing();
    for (const view of plugin.documentViews || []) { view.manualScroll = false; view.lastHighlight = ''; }
  }
  plugin.htmlHighlights && (plugin.htmlHighlights.key = '');
  plugin.pdfHighlights?.update(); plugin.noteHighlights?.update(); plugin.htmlHighlights?.update();
  plugin.renderReaderViews?.();
  await plugin.saveSettings();
}
function updateFollowButton(button, plugin, kind) {
  const state = followState(plugin, kind), zh = plugin.settings.settingsLanguage === 'chinese';
  button.disabled = !state.supported || plugin.activeSession?.kind === 'audio-export';
  button.setAttribute('aria-pressed', String(state.enabled && !state.paused));
  button.classList.toggle('is-active', state.enabled && !state.paused);
  button.classList.toggle('is-paused', state.paused);
  button.setAttribute('aria-label', state.paused ? (zh ? '跟随已暂停：点击恢复' : 'Following paused: click to resume')
    : state.enabled ? (zh ? '自动跟随：已开启，点击关闭' : 'Auto-follow: on, click to disable')
      : (zh ? '自动跟随：已关闭，点击开启' : 'Auto-follow: off, click to enable'));
}
module.exports = { kindFor, followState, following, pauseFollowing, watchFollowing, toggleFollowing, updateFollowButton };
