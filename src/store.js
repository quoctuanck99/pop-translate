const Store = require('electron-store');

const store = new Store({
  schema: {
    apiKey: { type: 'string', default: '' },
    model: { type: 'string', default: 'gpt-4o-mini' },
    sourceLang: { type: 'string', default: 'auto' },
    targetLang: { type: 'string', default: 'vi' },
    tone: { type: 'string', default: 'casual' },
    hotkey: { type: 'string', default: 'CommandOrControl+Shift+T' },
    rephraseHotkey: { type: 'string', default: 'CommandOrControl+Shift+E' },
    launchAtStartup: { type: 'boolean', default: false }
  }
});

module.exports = store;
