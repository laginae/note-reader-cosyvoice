'use strict';
function visibleReadingArea(scroller) {
  const rect = scroller?.getBoundingClientRect?.();
  if (!rect) return null;
  let top = rect.top, bottom = rect.bottom;
  const win = scroller.ownerDocument?.defaultView;
  if (win?.innerHeight) { top = Math.max(0, top); bottom = Math.min(win.innerHeight, bottom); }
  const pane = scroller.closest?.('.workspace-leaf-content') || scroller;
  for (const bar of pane.querySelectorAll?.('.note-reader-native-toolbar, .view-header, [role="toolbar"], .editingToolbar, .editing-toolbar') || []) {
    const bounds = bar.getBoundingClientRect(), style = win?.getComputedStyle(bar);
    if (bounds.height > 0 && bounds.top <= top + 2 && bounds.bottom > top
      && (style?.position === 'sticky' || style?.position === 'fixed' || bar.classList.contains('note-reader-native-toolbar'))) top = bounds.bottom;
  }
  const margin = Math.min(16, Math.max(0, (bottom - top) / 8));
  return { top: top + margin, bottom: bottom - margin };
}
function scrollDecision(bounds, visible) {
  if (!bounds || !visible || visible.bottom <= visible.top) return null;
  const tall = bounds.bottom - bounds.top > visible.bottom - visible.top;
  if (tall) return Math.abs(bounds.top - visible.top) > 2 ? { tall, delta: bounds.top - visible.top } : null;
  if (bounds.top >= visible.top && bounds.bottom <= visible.bottom) return null;
  return { tall, delta: bounds.top < visible.top ? bounds.top - visible.top : bounds.bottom - visible.bottom };
}
function followElements(scroller, nodes) {
  const rects = nodes.filter(Boolean).map(node => node.getBoundingClientRect());
  if (!rects.length) return;
  const decision = scrollDecision({ top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) }, visibleReadingArea(scroller));
  if (decision) scroller.scrollTop += decision.delta;
}
module.exports = { visibleReadingArea, scrollDecision, followElements };
