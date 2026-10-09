'use strict';
function manualScrollIntent(event) {
  const target = event.target;
  if (target?.closest?.('button,input,select,textarea,a,[contenteditable],.note-reader-native-toolbar,.note-reader-cosyvoice-view')) return false;
  if (event.type === 'wheel' || event.type === 'touchmove') return true;
  if (event.type === 'keydown') return ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key);
  if (event.type !== 'pointerdown') return false;
  if (event.button === 1) return true;
  // Only scrollbar presses count as browsing; ordinary clicks must not disable following.
  const rect = target?.getBoundingClientRect?.();
  return Boolean(rect && target.clientWidth > 0 && target.clientHeight > 0
    && ((target.offsetWidth > target.clientWidth && event.clientX >= rect.left + target.clientWidth)
      || (target.offsetHeight > target.clientHeight && event.clientY >= rect.top + target.clientHeight)));
}
module.exports = { manualScrollIntent };
