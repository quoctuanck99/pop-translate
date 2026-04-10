# Pop Translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS menu bar Electron app that translates selected text via OpenAI when a global hotkey is pressed, showing the result in a compact floating popup near the cursor.

**Architecture:** Single Electron process, no dock icon, three surfaces — tray icon, frameless popup BrowserWindow, settings BrowserWindow. All OpenAI calls happen in the main process so the API key is never exposed to renderers. Settings persist via electron-store.

**Tech Stack:** Electron 34, electron-store 8 (CJS), openai SDK v4, Node.js child_process (AppleScript for Cmd+C simulation).

---

## File Map

| File | Responsibility |
|---|---|
| `src/main.js` | App entry: tray, global shortcut, window management, IPC handlers, translation flow |
| `src/store.js` | electron-store wrapper with schema defaults |
| `src/translator.js` | OpenAI API call + prompt construction |
| `src/preload.js` | contextBridge IPC bridge shared by both windows |
| `src/popup/popup.html` | Compact translation card UI |
| `src/popup/popup.js` | Popup renderer: receives result, handles copy/dismiss |
| `src/settings/settings.html` | Settings form UI |
| `src/settings/settings.js` | Settings renderer: load/save via IPC |

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/`, `src/popup/`, `src/settings/` directories

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pop-translate",
  "version": "1.0.0",
  "description": "macOS menu bar translation utility",
  "main": "src/main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "electron-store": "^8.2.0",
    "openai": "^4.0.0"
  },
  "devDependencies": {
    "electron": "^34.0.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.DS_Store
.superpowers/
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p src/popup src/settings
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json .gitignore
git commit -m "feat: project setup"
```

---

## Task 2: Settings Store

**Files:**
- Create: `src/store.js`

- [ ] **Step 1: Create src/store.js**

```js
const Store = require('electron-store');

const store = new Store({
  schema: {
    apiKey: { type: 'string', default: '' },
    model: { type: 'string', default: 'gpt-4o-mini' },
    sourceLang: { type: 'string', default: 'auto' },
    targetLang: { type: 'string', default: 'vi' },
    tone: { type: 'string', default: 'casual' },
    hotkey: { type: 'string', default: 'CommandOrControl+Shift+T' },
    launchAtStartup: { type: 'boolean', default: false }
  }
});

module.exports = store;
```

- [ ] **Step 2: Smoke test store**

```bash
node -e "const s = require('./src/store'); console.log(s.store);"
```

Expected output:
```
{
  apiKey: '',
  model: 'gpt-4o-mini',
  sourceLang: 'auto',
  targetLang: 'vi',
  tone: 'casual',
  hotkey: 'CommandOrControl+Shift+T',
  launchAtStartup: false
}
```

- [ ] **Step 3: Commit**

```bash
git add src/store.js
git commit -m "feat: add settings store with defaults"
```

---

## Task 3: Translator

**Files:**
- Create: `src/translator.js`

- [ ] **Step 1: Create src/translator.js**

```js
const OpenAI = require('openai');

async function translate(text, settings) {
  const { apiKey, model, sourceLang, targetLang, tone } = settings;

  if (!apiKey) throw new Error('NO_API_KEY');

  const client = new OpenAI({ apiKey });

  const sourcePart = sourceLang === 'auto'
    ? 'Detect the source language automatically.'
    : `Source language: ${sourceLang}.`;

  const prompt = [
    `Translate the following text to ${targetLang}.`,
    `Tone: ${tone}.`,
    sourcePart,
    'Reply with only the translated text, no explanation.',
    '',
    text
  ].join('\n');

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000
  });

  return response.choices[0].message.content.trim();
}

module.exports = { translate };
```

- [ ] **Step 2: Smoke test with a real API key (optional)**

If you have an OpenAI key available:
```bash
node -e "
const { translate } = require('./src/translator');
translate('Hello world', { apiKey: 'YOUR_KEY', model: 'gpt-4o-mini', sourceLang: 'auto', targetLang: 'vi', tone: 'casual' })
  .then(r => console.log(r))
  .catch(e => console.error(e.message));
"
```

Expected: Vietnamese translation printed, e.g. `Xin chào thế giới`

- [ ] **Step 3: Commit**

```bash
git add src/translator.js
git commit -m "feat: add OpenAI translator"
```

---

## Task 4: Preload IPC Bridge

**Files:**
- Create: `src/preload.js`

- [ ] **Step 1: Create src/preload.js**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Popup
  onTranslationResult: (callback) => {
    ipcRenderer.on('translation-result', (_, data) => callback(data));
  },
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  closePopup: () => ipcRenderer.send('close-popup'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  closeSettings: () => ipcRenderer.send('close-settings')
});
```

- [ ] **Step 2: Commit**

```bash
git add src/preload.js
git commit -m "feat: add preload IPC bridge"
```

---

## Task 5: Popup Window

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.js`

- [ ] **Step 1: Create src/popup/popup.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #252540;
      color: #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
    }
    .card { padding: 14px 16px; }
    .lang-label {
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    #content {
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 12px;
      max-height: 120px;
      overflow-y: auto;
    }
    #content.translation { color: #e0e0e0; user-select: text; }
    #content.error { color: #ff6b6b; }
    #content.loading { color: #888; font-style: italic; }
    .actions { display: flex; align-items: center; gap: 12px; }
    .btn-copy {
      font-size: 11px;
      color: #4a90d9;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
    }
    .btn-copy:hover { text-decoration: underline; }
    .btn-dismiss {
      font-size: 11px;
      color: #888;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      margin-left: auto;
    }
    .btn-dismiss:hover { color: #ccc; }
  </style>
</head>
<body>
  <div class="card">
    <div class="lang-label" id="lang-label">Pop Translate</div>
    <div class="loading" id="content">Translating...</div>
    <div class="actions">
      <button class="btn-copy" id="btn-copy" style="display:none">📋 Copy</button>
      <button class="btn-dismiss" id="btn-dismiss">✕ Dismiss</button>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/popup/popup.js**

```js
let translatedText = '';

window.api.onTranslationResult((data) => {
  const content = document.getElementById('content');
  const langLabel = document.getElementById('lang-label');
  const btnCopy = document.getElementById('btn-copy');

  if (data.loading) {
    content.className = 'loading';
    content.textContent = 'Translating...';
    btnCopy.style.display = 'none';
    return;
  }

  if (data.error) {
    content.className = 'error';
    content.textContent = data.error;
    btnCopy.style.display = 'none';
    return;
  }

  langLabel.textContent = data.langLabel || 'Translation';
  content.className = 'translation';
  content.textContent = data.translation;
  translatedText = data.translation;
  btnCopy.style.display = 'inline';
});

document.getElementById('btn-copy').addEventListener('click', () => {
  window.api.copyText(translatedText);
  const btn = document.getElementById('btn-copy');
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
});

document.getElementById('btn-dismiss').addEventListener('click', () => {
  window.api.closePopup();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closePopup();
});
```

- [ ] **Step 3: Commit**

```bash
git add src/popup/
git commit -m "feat: add popup window UI"
```

---

## Task 6: Settings Window

**Files:**
- Create: `src/settings/settings.html`
- Create: `src/settings/settings.js`

- [ ] **Step 1: Create src/settings/settings.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Pop Translate — Settings</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #1e1e2e;
      color: #e0e0e0;
      padding: 24px;
      font-size: 13px;
    }
    h1 { font-size: 16px; margin-bottom: 24px; color: #fff; }
    .field { margin-bottom: 18px; }
    label {
      display: block;
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    input[type="password"], input[type="text"], select {
      width: 100%;
      background: #252540;
      border: 1px solid #333;
      border-radius: 6px;
      color: #e0e0e0;
      padding: 8px 10px;
      font-size: 13px;
      outline: none;
    }
    input:focus, select:focus { border-color: #4a90d9; }
    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .toggle-label { font-size: 13px; color: #e0e0e0; }
    .toggle { position: relative; width: 36px; height: 20px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      inset: 0;
      background: #333;
      border-radius: 20px;
      cursor: pointer;
      transition: 0.2s;
    }
    .slider:before {
      content: '';
      position: absolute;
      width: 14px; height: 14px;
      left: 3px; top: 3px;
      background: #fff;
      border-radius: 50%;
      transition: 0.2s;
    }
    input:checked + .slider { background: #4a90d9; }
    input:checked + .slider:before { transform: translateX(16px); }
    .shortcut-input { cursor: pointer; font-family: monospace; }
    .shortcut-input.recording { border-color: #4a90d9; color: #4a90d9; }
    .actions {
      margin-top: 24px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      align-items: center;
    }
    .status { font-size: 11px; color: #4a90d9; flex: 1; }
    .btn {
      padding: 8px 18px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-primary:hover { background: #357abd; }
    .btn-secondary { background: #333; color: #ccc; }
    .btn-secondary:hover { background: #444; }
  </style>
</head>
<body>
  <h1>Pop Translate Settings</h1>

  <div class="field">
    <label>OpenAI API Key</label>
    <input type="password" id="apiKey" placeholder="sk-...">
  </div>

  <div class="field">
    <label>Model</label>
    <select id="model">
      <option value="gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
      <option value="gpt-4o">GPT-4o (best quality)</option>
      <option value="gpt-4-turbo">GPT-4 Turbo</option>
    </select>
  </div>

  <div class="field">
    <label>Source Language</label>
    <select id="sourceLang">
      <option value="auto">Auto-detect</option>
      <option value="en">English</option>
      <option value="vi">Vietnamese</option>
      <option value="zh">Chinese</option>
      <option value="ja">Japanese</option>
      <option value="ko">Korean</option>
      <option value="fr">French</option>
      <option value="es">Spanish</option>
      <option value="de">German</option>
    </select>
  </div>

  <div class="field">
    <label>Target Language</label>
    <select id="targetLang">
      <option value="vi">Vietnamese</option>
      <option value="en">English</option>
      <option value="zh">Chinese</option>
      <option value="ja">Japanese</option>
      <option value="ko">Korean</option>
      <option value="fr">French</option>
      <option value="es">Spanish</option>
      <option value="de">German</option>
    </select>
  </div>

  <div class="field">
    <label>Translation Tone</label>
    <select id="tone">
      <option value="casual">Casual</option>
      <option value="formal">Formal</option>
      <option value="literal">Literal</option>
    </select>
  </div>

  <div class="field">
    <label>Hotkey (click field, then press your shortcut)</label>
    <input type="text" id="hotkey" class="shortcut-input" readonly placeholder="Click to record...">
  </div>

  <div class="field">
    <div class="toggle-row">
      <span class="toggle-label">Launch at startup</span>
      <label class="toggle">
        <input type="checkbox" id="launchAtStartup">
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="actions">
    <span class="status" id="status"></span>
    <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
    <button class="btn btn-primary" id="btn-save">Save</button>
  </div>

  <script src="settings.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/settings/settings.js**

```js
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

  // Use e.code for letter keys (KeyA → A), e.key for others
  const keyName = e.code.startsWith('Key')
    ? e.code.slice(3)
    : e.key.length === 1
      ? e.key.toUpperCase()
      : e.key;

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
```

- [ ] **Step 3: Commit**

```bash
git add src/settings/
git commit -m "feat: add settings window UI"
```

---

## Task 7: Main Process

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: Create src/main.js**

```js
const {
  app, BrowserWindow, Tray, Menu,
  globalShortcut, clipboard, ipcMain,
  nativeImage, screen
} = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const store = require('./store');
const { translate } = require('./translator');

// No dock icon — menu bar utility only
app.dock.hide();

let tray = null;
let popupWindow = null;
let settingsWindow = null;
let popupReady = false;
let dismissTimer = null;

// ─── Tray ────────────────────────────────────────────────────────────────────

function createTray() {
  // Empty image + text title is simplest for menu bar utilities
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🌐');
  tray.setToolTip('Pop Translate');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pop Translate', enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: openSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

// ─── Popup Window ────────────────────────────────────────────────────────────

function createPopupWindow() {
  popupWindow = new BrowserWindow({
    width: 320,
    height: 180,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#252540',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  popupWindow.loadFile(path.join(__dirname, 'popup/popup.html'));
  popupWindow.webContents.on('did-finish-load', () => { popupReady = true; });
  popupWindow.on('blur', hidePopup);
}

function showPopupNearCursor() {
  const { x, y } = screen.getCursorScreenPoint();
  const { bounds } = screen.getDisplayNearestPoint({ x, y });

  const W = 320, H = 180, M = 12;
  let px = x + M;
  let py = y + M;
  if (px + W > bounds.x + bounds.width) px = x - W - M;
  if (py + H > bounds.y + bounds.height) py = y - H - M;

  popupWindow.setPosition(Math.round(px), Math.round(py));
  popupWindow.show();
  popupWindow.focus();
}

function hidePopup() {
  if (dismissTimer) clearTimeout(dismissTimer);
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.hide();
}

function startDismissTimer() {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(hidePopup, 10000);
}

// ─── Settings Window ─────────────────────────────────────────────────────────

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 530,
    resizable: false,
    title: 'Pop Translate Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings/settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── Global Hotkey ───────────────────────────────────────────────────────────

function registerHotkey() {
  globalShortcut.unregisterAll();
  const hotkey = store.get('hotkey');
  const ok = globalShortcut.register(hotkey, handleHotkey);
  if (!ok) console.error(`Failed to register hotkey: ${hotkey}`);
}

async function handleHotkey() {
  if (!popupReady) return;

  const previous = clipboard.readText();

  try {
    execSync(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`);
  } catch {
    return;
  }

  // Wait briefly for clipboard to update
  await new Promise(r => setTimeout(r, 150));

  const selected = clipboard.readText();

  // Restore original clipboard
  clipboard.writeText(previous);

  if (!selected || !selected.trim() || selected === previous) return;

  showPopupNearCursor();
  startDismissTimer();
  popupWindow.webContents.send('translation-result', { loading: true });

  const settings = store.store;

  try {
    const translation = await translate(selected, settings);
    const src = settings.sourceLang === 'auto' ? 'Auto' : settings.sourceLang.toUpperCase();
    const tgt = settings.targetLang.toUpperCase();
    popupWindow.webContents.send('translation-result', {
      translation,
      langLabel: `${src} → ${tgt}`
    });
  } catch (err) {
    const message = err.message === 'NO_API_KEY'
      ? 'Please set your API key in Settings'
      : (err.message || 'Translation failed');
    popupWindow.webContents.send('translation-result', { error: message });
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => store.store);

ipcMain.handle('save-settings', (_, settings) => {
  const prevHotkey = store.get('hotkey');
  store.set(settings);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup });
  if (settings.hotkey !== prevHotkey) registerHotkey();
});

ipcMain.handle('copy-text', (_, text) => clipboard.writeText(text));

ipcMain.on('close-popup', hidePopup);
ipcMain.on('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createTray();
  createPopupWindow();
  registerHotkey();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// Prevent app from quitting when all windows are closed (menu bar app)
// On macOS this is a no-op by default, but explicit is better
app.on('window-all-closed', () => { /* keep running */ });
```

- [ ] **Step 2: Run the app**

```bash
npm start
```

Expected:
- No dock icon appears
- A 🌐 symbol appears in the macOS menu bar
- No errors in terminal
- Right-clicking the 🌐 icon shows: "Pop Translate / Settings / Quit"

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: add main process — tray, hotkey, translation flow"
```

---

## Task 8: Manual Testing Checklist

Run `npm start` and verify each flow:

- [ ] **Settings window opens**
  - Right-click tray icon → "Settings"
  - Window appears with all fields populated from defaults
  - Enter your OpenAI API key and click Save — status shows "Saved!"
  - Close and reopen Settings — API key is still there

- [ ] **Translation flow**
  - Select any text in any app (e.g., Safari, TextEdit)
  - Press `Cmd+Shift+T`
  - Popup appears near cursor showing "Translating..."
  - Popup updates with Vietnamese translation and language label (e.g., "AUTO → VI")
  - Click "📋 Copy" — button shows "✓ Copied" briefly; paste elsewhere to verify clipboard

- [ ] **Dismiss behavior**
  - Press `Esc` while popup is visible → popup dismisses
  - Click outside popup → popup dismisses
  - Wait 10 seconds → popup auto-dismisses

- [ ] **No text selected**
  - Press hotkey without selecting anything → popup does not appear

- [ ] **No API key**
  - Clear API key in Settings, save, then trigger translation
  - Popup shows: "Please set your API key in Settings"

- [ ] **MacOS Accessibility permission**
  - On first run, macOS may prompt to grant Accessibility access for the AppleScript keystroke simulation
  - Grant access in System Settings → Privacy & Security → Accessibility
  - After granting, translation flow works as expected

- [ ] **Launch at startup**
  - Enable "Launch at startup" in Settings, save
  - Quit app, reopen "Login Items" in macOS Settings — Pop Translate is listed

- [ ] **Hotkey change**
  - Open Settings, click Hotkey field, press a new shortcut (e.g., Cmd+Shift+Y)
  - Save — old shortcut no longer works, new shortcut triggers translation

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat: complete pop-translate mvp"
```
