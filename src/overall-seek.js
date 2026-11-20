'use strict';

function bindOverallSeek(slider, plugin, onRelease, preview = () => {}) {
  let editing = false, owner = null, value = null, cancelled = false;
  const begin = () => { editing = true; owner = plugin.activeSession; value = null; cancelled = false; };
  const reset = () => { editing = false; owner = null; value = null; };
  slider.addEventListener('pointerdown', begin);
  slider.addEventListener('input', () => {
    if (!editing) begin();
    value = Number(slider.value) / 1000;
    preview(value);
  });
  slider.addEventListener('pointerup', () => { if (value === null) { reset(); onRelease(); } });
  slider.addEventListener('change', () => {
    const session = editing ? owner : plugin.activeSession, target = value ?? Number(slider.value) / 1000;
    reset();
    if (!cancelled && !slider.disabled && session && session === plugin.activeSession) plugin.seekToProgress(target);
    onRelease();
  });
  for (const event of ['blur', 'pointercancel']) slider.addEventListener(event, () => {
    if (!editing) return;
    cancelled = true; reset(); onRelease();
  });
  return () => editing;
}

module.exports = { bindOverallSeek };
