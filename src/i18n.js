'use strict';

const LANGUAGES = { english:'English', chinese:'中文', german:'Deutsch', french:'Français', russian:'Русский', korean:'한국어', japanese:'日本語', spanish:'Español', italian:'Italiano', portuguese:'Português' };
const ORDER = ['german','french','russian','korean','japanese','spanish','italian'];
const catalog = require('./locales/common.json');
const portuguese = require('./locales/pt.json');
const aliases = {
  'Voice reader controls':'Reader controls', 'Previous chunk':'Previous segment', 'Next chunk':'Next segment',
  'Reading progress':'Overall progress', 'Common voices for this model':'Suggested voices for this model',
  'Azure Speech secret':'Azure Speech API secret',
  'Resume reading (or press Space)':'Resume (Space)', 'Pause reading (or press Space)':'Pause (Space)',
};
function translate(language, english, chinese) {
  if (language === 'chinese') return chinese || english;
  if (language === 'portuguese') return portuguese[aliases[english] || english] || english;
  const index = ORDER.indexOf(language);
  return index >= 0 ? catalog[aliases[english] || english]?.[index] || english : english;
}
function localizedSetting(Base, language) {
  const t = value => typeof value === 'string' ? translate(language,value) : value;
  const component = (value, methods) => {
    for (const [method,index] of methods) if (typeof value[method] === 'function') {
      const original = value[method];
      value[method] = function(...args) { args[index] = t(args[index]); return original.apply(this,args); };
    }
    return value;
  };
  return class extends Base {
    setName(value) { return super.setName(t(value)); }
    setDesc(value) { return super.setDesc(t(value)); }
    addDropdown(callback) { return super.addDropdown(value => callback(component(value,[['addOption',1]]))); }
    addButton(callback) { return super.addButton(value => callback(component(value,[['setButtonText',0],['setTooltip',0]]))); }
  };
}
module.exports = { LANGUAGES, translate, localizedSetting };
