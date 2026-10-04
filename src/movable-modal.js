'use strict';

function makeMovableModal(modal, handle) {
  const doc = modal.ownerDocument, win = doc.defaultView;
  let dragging = null, moved = false;
  function place(left, top) {
    const rect = modal.getBoundingClientRect();
    const x = Math.max(8, Math.min(left, win.innerWidth - rect.width - 8));
    const y = Math.max(8, Math.min(top, win.innerHeight - rect.height - 8));
    Object.assign(modal.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, margin: '0', transform: 'none' });
    moved = true;
  }
  function center() {
    const rect = modal.getBoundingClientRect();
    place((win.innerWidth - rect.width) / 2, (win.innerHeight - rect.height) / 2);
  }
  function start(event) {
    if (event.button !== 0 || event.target.closest('button,input,select,textarea,a')) return;
    const rect = modal.getBoundingClientRect();
    dragging = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    handle.setPointerCapture?.(event.pointerId); event.preventDefault();
  }
  function move(event) {
    if (dragging?.id === event.pointerId) place(event.clientX - dragging.x, event.clientY - dragging.y);
  }
  function stop() { dragging = null; }
  function resize() { if (moved) { const rect = modal.getBoundingClientRect(); place(rect.left, rect.top); } }
  function key(event) {
    if (event.target !== handle) return;
    if (event.key === 'Home') { center(); event.preventDefault(); return; }
    const direction = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
    if (!direction) return;
    const rect = modal.getBoundingClientRect(); place(rect.left + direction[0], rect.top + direction[1]); event.preventDefault();
  }
  handle.addEventListener('pointerdown', start); handle.addEventListener('keydown', key);
  doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', stop); doc.addEventListener('pointercancel', stop);
  win.addEventListener('resize', resize); win.addEventListener('blur', stop);
  return { center, destroy() {
    stop(); handle.removeEventListener('pointerdown', start); handle.removeEventListener('keydown', key);
    doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', stop); doc.removeEventListener('pointercancel', stop);
    win.removeEventListener('resize', resize); win.removeEventListener('blur', stop);
  } };
}
module.exports = { makeMovableModal };
