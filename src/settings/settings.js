// Maps DOM event modifier keys to Electron globalShortcut format
const MODIFIER_MAP = {
  Meta: 'Command',
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift'
};
const MODIFIER_KEYS = new Set(Object.keys(MODIFIER_MAP));

let recordingHotkey = false;

async function loadSettings() {
  const s = await window.api.getSettings();
  document.getElementById('apiKey').value = s.apiKey || '';
  document.getElementById('model').value = s.model;
  document.getElementById('sourceLang').value = s.sourceLang;
  document.getElementById('targetLang').value = s.targetLang;
  document.getElementById('tone').value = s.tone;
  document.getElementById('hotkey').value = s.hotkey;
  document.getElementById('launchAtStartup').checked = s.launchAtStartup;
}

const hotkeyInput = document.getElementById('hotkey');

hotkeyInput.addEventListener('click', () => {
  hotkeyInput.value = 'Press your shortcut...';
  hotkeyInput.classList.add('recording');
  recordingHotkey = true;
});

hotkeyInput.addEventListener('keydown', (e) => {
  if (!recordingHotkey) return;
  e.preventDefault();
  if (MODIFIER_KEYS.has(e.key)) return;

  const parts = [];
  if (e.metaKey) parts.push('Command');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Map DOM key names to Electron globalShortcut key names
  const SPECIAL_KEY_MAP = {
    Enter: 'Return', ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down',
    ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Escape',
    Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete'
  };
  // Use e.code for letter keys (KeyA → A), map special keys, fallback to e.key
  const keyName = e.code.startsWith('Key')
    ? e.code.slice(3)
    : e.key.length === 1
      ? e.key.toUpperCase()
      : SPECIAL_KEY_MAP[e.key] || e.key;

  parts.push(keyName);
  hotkeyInput.value = parts.join('+');
  hotkeyInput.classList.remove('recording');
  recordingHotkey = false;
});

document.getElementById('btn-save').addEventListener('click', async () => {
  const settings = {
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value,
    sourceLang: document.getElementById('sourceLang').value,
    targetLang: document.getElementById('targetLang').value,
    tone: document.getElementById('tone').value,
    hotkey: document.getElementById('hotkey').value,
    launchAtStartup: document.getElementById('launchAtStartup').checked
  };

  await window.api.saveSettings(settings);
  const status = document.getElementById('status');
  status.textContent = 'Saved!';
  setTimeout(() => { status.textContent = ''; }, 2000);
});

document.getElementById('btn-cancel').addEventListener('click', () => {
  window.api.closeSettings();
});

loadSettings();
