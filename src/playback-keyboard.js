'use strict';

const KEYBOARD_SEEK_SECONDS = 5;

function plainPlaybackKey(event) {
  return !!event && !event.defaultPrevented && !event.ctrlKey && !event.altKey && !event.metaKey
    && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

function isSpaceKeyEvent(event) {
  return event && (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar');
}

function getKeyboardSeekDeltaSeconds(event) {
  if (event?.key === 'ArrowLeft' || event?.code === 'ArrowLeft') return -KEYBOARD_SEEK_SECONDS;
  if (event?.key === 'ArrowRight' || event?.code === 'ArrowRight') return KEYBOARD_SEEK_SECONDS;
  return 0;
}

const PDF_CONTROLS = [
  'input', 'textarea', 'select', 'button', 'a', 'summary', 'label', '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]', '[role="textbox"]', '[role="combobox"]', '[role="slider"]', '[role="menu"]', '[role="dialog"]',
  '[role="listbox"]', '[role="spinbutton"]', '[role="tree"]', '[role="tablist"]', '[role="grid"]',
  '[role="toolbar"]', '.pdf-toolbar', '.pdf-sidebar', '.pdf-findbar', '.annotationEditorLayer', '.annotationLayer',
  '.cozy-mini-panel', '.note-reader-native-toolbar',
].join(',');

function visiblePopup(doc) {
  return [...doc.querySelectorAll('.menu,.modal-container,[aria-modal="true"],[role="menu"]')].some(el =>
    !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0);
}

function bindPdfPlaybackKeys(plugin, doc) {
  const win = doc.defaultView;
  const keydown = event => {
    if (!plainPlaybackKey(event)) return;
    const space = isSpaceKeyEvent(event), delta = getKeyboardSeekDeltaSeconds(event);
    if (!space && !delta) return;
    const session = plugin.activeSession, view = plugin.app.workspace.activeLeaf?.view;
    if (!session || session.stopped || session.kind === 'audio-export' || session.sourceKind !== 'pdf'
      || (space && !plugin.readerState?.canPause) || !view?.file?.path || view.file.path !== session.filePath
      || view.getViewType?.() !== 'pdf' || view.contentEl?.ownerDocument !== doc) return;
    const root = view.contentEl, target = event.composedPath?.()[0] || event.target;
    if (target === doc.body || target === doc.documentElement) {
      // Closing a PDF context menu can leave Chromium's focus on body.
      if (doc.activeElement !== doc.body && doc.activeElement !== doc.documentElement) return;
    } else if (!target?.closest || !root.contains(target) || target.closest(PDF_CONTROLS)
      || !(root === target || target.matches('.pdf-container') || target.closest('.pdf-viewer-container,.pdfViewer,.page[data-page-number]'))) return;
    if (visiblePopup(doc)) return;
    if (space && !event.repeat) { plugin.handleReaderKeydown(event); return; }
    // Don't turn a page on held Space or during a gap between playable audio parts.
    event.preventDefault();
    event.stopPropagation();
    if (delta && (plugin.readerState?.canSeek || session.seekTarget)) plugin.seekCurrentAudioBySeconds(delta);
  };
  win.addEventListener('keydown', keydown, true);
  return () => win.removeEventListener('keydown', keydown, true);
}

function bindTimelineKeys(slider, plugin) {
  slider.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
  slider.addEventListener('keydown', event => {
    if (!slider.disabled && (plugin.readerState?.canSeek || plugin.activeSession?.seekTarget)) {
      plugin.handleReaderKeydown(event, { seekSlider: slider, allowPause: false });
    }
  });
}

module.exports = { KEYBOARD_SEEK_SECONDS, getKeyboardSeekDeltaSeconds, plainPlaybackKey, isSpaceKeyEvent, bindPdfPlaybackKeys, bindTimelineKeys };
