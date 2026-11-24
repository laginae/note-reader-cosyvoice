'use strict';

const {translate} = require('./i18n');

function waitLabel(model, lang) {
  const t = (en,zh) => translate(lang,en,zh);
  const stages = {
    preparing:['Preparing audio','正在准备音频'],response:['Waiting for the speech service','正在等待语音接口返回'],
    receiving:['Receiving audio','正在接收音频'],finishing:['Processing response','正在处理返回结果'],
    backoff:['Waiting to retry','正在等待自动重试'],limited:['Waiting for the rate limit to clear','正在等待接口解除限流'],
    cancelling:['Cancelling the current request','正在取消当前请求'],
  };
  const [en,zh] = stages[model.stage] || stages.preparing;
  let label = t(en,zh);
  if (model.attempt > 1 && ['response','receiving'].includes(model.stage))
    label += t(' (attempt {n})','（第 {n} 次请求）').replace('{n}',model.attempt);
  return label + t(' · {s}s elapsed',' · 已等 {s} 秒').replace('{s}',model.seconds);
}

function renderReadingWait(plugin, parent, root, model, setIcon, compact = false) {
  if (!model || !parent?.ownerDocument) { root?.remove(); return null; }
  if (!root || root.parentNode !== parent) {
    root?.remove();
    const doc = parent.ownerDocument;
    root = doc.createElement('span'); root.className = 'note-reader-long-wait';
    const label = doc.createElement('span'); label.setAttribute('role','timer');
    const button = doc.createElement('button'); button.type = 'button';
    const icon = doc.createElement('span'); icon.setAttribute('aria-hidden','true'); setIcon(icon,'rotate-cw');
    const caption = doc.createElement('span'); button.append(icon,caption);
    if (compact) caption.hidden = true;
    button.addEventListener('click',()=>{ if (!button.disabled) plugin.confirmReadingRetry?.(root.retryTicket); });
    root.append(label,button); parent.append(root);
  }
  const lang = plugin.settings.settingsLanguage, [label,button] = root.children;
  const name = translate(lang,'Retry current part','重试当前段');
  const text = waitLabel(model,lang);
  if (label.textContent !== text) label.textContent = text;
  root.retryTicket = model.ticket;
  button.hidden = button.disabled = !model.ticket;
  if (button.lastElementChild.textContent !== name) button.lastElementChild.textContent = name;
  button.setAttribute('aria-label',name); button.title = name;
  return root;
}
module.exports = { renderReadingWait, waitLabel };
