'use strict';

// Only these fixed Markdown examples enter the preview formatter.
function addAcademicPreview(parent, language, prepare) {
  const zh = language === 'chinese';
  const box = parent.createEl('details', { cls: 'cozy-academic-preview' });
  box.createEl('summary', { text: zh ? '实际读法预览（本地文字）' : 'Reading preview (local text)' });
  const samples = require('@laginae/note-reader-core/academic-preview').academicPreviewSamples(language);
  const list = box.createEl('dl');
  const outputs = samples.map(([label]) => {
    list.createEl('dt', { text: label });
    return list.createEl('dd');
  });
  const refresh = () => {
    if (!box.open) return;
    samples.forEach(([, sample], i) => {
      const value = prepare(sample) || (zh ? '（略过）' : '(omitted)');
      if (outputs[i].textContent !== value) outputs[i].textContent = value;
    });
  };
  box.addEventListener('toggle', refresh);
  return refresh;
}

module.exports = { addAcademicPreview };
