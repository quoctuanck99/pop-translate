const {
  app, BrowserWindow, Tray, Menu,
  globalShortcut, clipboard, ipcMain,
  nativeImage, screen
} = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const store = require('./store');
const { translate, rephrase } = require('./translator');

// No dock icon — menu bar utility only
app.dock.hide();

let tray = null;
let popupWindow = null;
let settingsWindow = null;
let popupReady = false;
let hotkeyBusy = false;
let lastFrontApp = '';

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
    resizable: true,
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
  popupWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popupWindow.webContents.on('did-finish-load', () => { popupReady = true; });
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
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.hide();
}

function sendToPopup(channel, payload) {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send(channel, payload);
  }
}

// ─── Settings Window ─────────────────────────────────────────────────────────

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 580,
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

// ─── Front App Poller ────────────────────────────────────────────────────────

function startFrontAppPoller() {
  const poll = () => {
    try {
      const name = execSync(
        `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
        { timeout: 400 }
      ).toString().trim();
      if (name && name !== 'Electron') lastFrontApp = name;
    } catch {}
  };
  poll();
  setInterval(poll, 500);
}

// ─── Global Hotkey ───────────────────────────────────────────────────────────

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const hotkey = store.get('hotkey');
  const rephraseHotkey = store.get('rephraseHotkey');
  if (!globalShortcut.register(hotkey, handleHotkey))
    console.error(`Failed to register hotkey: ${hotkey}`);
  if (!globalShortcut.register(rephraseHotkey, handleRephraseHotkey))
    console.error(`Failed to register rephrase hotkey: ${rephraseHotkey}`);
}

async function handleHotkey() {
  if (!popupReady || hotkeyBusy) return;
  hotkeyBusy = true;

  try {
    if (!lastFrontApp) {
      console.log('Pop Translate: no foreground app detected yet');
      return;
    }

    let text;
    try {
      const previous = clipboard.readText();
      execSync(
        `osascript -e 'tell application "System Events" to tell process "${lastFrontApp}" to keystroke "c" using command down'`,
        { timeout: 500 }
      );
      await new Promise(r => setTimeout(r, 200));
      const copied = clipboard.readText();
      // Restore original clipboard content
      clipboard.writeText(previous);
      text = copied;
    } catch (e) {
      console.error('Pop Translate: failed to simulate Cmd+C:', e.message);
      return;
    }

    if (!text || !text.trim()) {
      console.log('Pop Translate: no text selected — select text before pressing the hotkey');
      return;
    }

    showPopupNearCursor();
    sendToPopup('translation-result', { loading: true });

    const settings = store.store;

    try {
      const translation = await translate(text, settings);
      const src = settings.sourceLang === 'auto' ? 'Auto' : settings.sourceLang.toUpperCase();
      const tgt = settings.targetLang.toUpperCase();
      sendToPopup('translation-result', { translation, langLabel: `${src} → ${tgt}` });
    } catch (err) {
      console.error('Translation error:', err);
      const message = err.message === 'NO_API_KEY'
        ? 'Please set your API key in Settings'
        : (err.message || 'Translation failed');
      sendToPopup('translation-result', { error: message });
    }
  } finally {
    hotkeyBusy = false;
  }
}

async function handleRephraseHotkey() {
  if (!popupReady || hotkeyBusy) return;
  hotkeyBusy = true;

  try {
    if (!lastFrontApp) {
      console.log('Pop Translate: no foreground app detected yet');
      return;
    }

    let text;
    try {
      const previous = clipboard.readText();
      execSync(
        `osascript -e 'tell application "System Events" to tell process "${lastFrontApp}" to keystroke "c" using command down'`,
        { timeout: 500 }
      );
      await new Promise(r => setTimeout(r, 200));
      const copied = clipboard.readText();
      clipboard.writeText(previous);
      text = copied;
    } catch (e) {
      console.error('Pop Translate: failed to simulate Cmd+C:', e.message);
      return;
    }

    if (!text || !text.trim()) {
      console.log('Pop Translate: no text selected — select text before pressing the hotkey');
      return;
    }

    showPopupNearCursor();
    sendToPopup('translation-result', { loading: true });

    const settings = store.store;

    try {
      const result = await rephrase(text, settings);
      sendToPopup('translation-result', { translation: result, langLabel: 'Grammar Fix' });
    } catch (err) {
      console.error('Rephrase error:', err);
      const message = err.message === 'NO_API_KEY'
        ? 'Please set your API key in Settings'
        : (err.message || 'Rephrase failed');
      sendToPopup('translation-result', { error: message });
    }
  } finally {
    hotkeyBusy = false;
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => store.store);

ipcMain.handle('save-settings', (_, settings) => {
  store.set(settings);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup });
  registerHotkeys();
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
  registerHotkeys();
  startFrontAppPoller();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// Prevent app from quitting when all windows are closed (menu bar app)
// On macOS this is a no-op by default, but explicit is better
app.on('window-all-closed', () => { /* keep running */ });
