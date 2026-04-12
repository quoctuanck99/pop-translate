// Maps DOM event modifier keys to Electron globalShortcut format
const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift']);

const SPECIAL_KEY_MAP = {
  Enter: 'Return', ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down',
  ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Escape',
  Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete'
};

function makeHotkeyRecorder(inputId) {
  const input = document.getElementById(inputId);
  let recording = false;
  let previousValue = '';

  input.addEventListener('click', () => {
    previousValue = input.value;
    input.value = 'Press your shortcut...';
    input.classList.add('recording');
    recording = true;
  });

  input.addEventListener('blur', () => {
    if (recording) {
      input.value = previousValue;
      input.classList.remove('recording');
      recording = false;
    }
  });

  input.addEventListener('keydown', (e) => {
    if (!recording) return;
    e.preventDefault();
    if (MODIFIER_KEYS.has(e.key)) return;

    const parts = [];
    if (e.metaKey) parts.push('Command');
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const keyName = e.code.startsWith('Key')
      ? e.code.slice(3)
      : e.key.length === 1
        ? e.key.toUpperCase()
        : SPECIAL_KEY_MAP[e.key] || e.key;

    parts.push(keyName);
    input.value = parts.join('+');
    input.classList.remove('recording');
    recording = false;
  });
}

async function loadSettings() {
  const s = await window.api.getSettings();
  document.getElementById('apiKey').value = s.apiKey || '';
  document.getElementById('model').value = s.model;
  document.getElementById('sourceLang').value = s.sourceLang;
  document.getElementById('targetLang').value = s.targetLang;
  document.getElementById('tone').value = s.tone;
  document.getElementById('hotkey').value = s.hotkey;
  document.getElementById('rephraseHotkey').value = s.rephraseHotkey;
  document.getElementById('launchAtStartup').checked = s.launchAtStartup;
}

makeHotkeyRecorder('hotkey');
makeHotkeyRecorder('rephraseHotkey');

document.getElementById('btn-save').addEventListener('click', async () => {
  const settings = {
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value,
    sourceLang: document.getElementById('sourceLang').value,
    targetLang: document.getElementById('targetLang').value,
    tone: document.getElementById('tone').value,
    hotkey: document.getElementById('hotkey').value,
    rephraseHotkey: document.getElementById('rephraseHotkey').value,
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
