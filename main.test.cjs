const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;

class MockPlugin {}
class MockItemView {}
class MockModal {}
class MockPluginSettingTab {}
class MockSetting {}
class MockNotice {}
class MockMarkdownView {}
function mockSetIcon() {}
async function mockLoadPdfJs() {
  return {};
}

Module._load = function loadWithObsidianMock(request, parent, isMain) {
  if (request === 'obsidian') {
    return {
      ItemView: MockItemView,
      MarkdownView: MockMarkdownView,
      Modal: MockModal,
      Notice: MockNotice,
      Plugin: MockPlugin,
      PluginSettingTab: MockPluginSettingTab,
      Setting: MockSetting,
      loadPdfJs: mockLoadPdfJs,
      normalizePath: (value) => String(value || '').replace(/\\/g, '/'),
      setIcon: mockSetIcon,
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

try {
  const pluginModule = require('./main');
  assert.strictEqual(typeof pluginModule.default, 'function');
  assert.strictEqual(
    Object.getPrototypeOf(pluginModule.default.prototype),
    MockPlugin.prototype
  );
  console.log('main export tests passed');
} finally {
  Module._load = originalLoad;
}
