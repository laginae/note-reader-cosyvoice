'use strict';

const APPEARANCE_DEFAULTS = { highlightColor: '#e5b83d', highlightStrength: 22, readerOpenMode: 'sidebar' };
function normalizeAppearance(settings) {
  settings.highlightColor = /^#[0-9a-f]{6}$/i.test(settings.highlightColor || '') ? settings.highlightColor : APPEARANCE_DEFAULTS.highlightColor;
  const strength = Number(settings.highlightStrength);
  settings.highlightStrength = Number.isFinite(strength) ? Math.max(5, Math.min(60, Math.round(strength))) : APPEARANCE_DEFAULTS.highlightStrength;
  if (!['sidebar', 'toolbar', 'both'].includes(settings.readerOpenMode)) settings.readerOpenMode = 'sidebar';
  return settings;
}
function applyAppearance(plugin) {
  normalizeAppearance(plugin.settings);
  plugin.highlightDocuments ||= new Set();
  const docs = new Set();
  if (typeof document !== 'undefined') docs.add(document);
  plugin.app?.workspace?.iterateAllLeaves?.(leaf => { if (leaf.view?.containerEl?.ownerDocument) docs.add(leaf.view.containerEl.ownerDocument); });
  for (const doc of docs) {
    plugin.highlightDocuments.add(doc);
    doc.documentElement.style.setProperty('--note-reader-highlight-color', plugin.settings.highlightColor);
    doc.documentElement.style.setProperty('--note-reader-highlight-strength', `${plugin.settings.highlightStrength}%`);
  }
}
function clearAppearance(plugin) {
  for (const doc of plugin.highlightDocuments || []) {
    doc.documentElement.style.removeProperty('--note-reader-highlight-color');
    doc.documentElement.style.removeProperty('--note-reader-highlight-strength');
  }
  plugin.highlightDocuments?.clear();
}
module.exports = { APPEARANCE_DEFAULTS, normalizeAppearance, applyAppearance, clearAppearance };
