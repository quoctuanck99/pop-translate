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
let hotkeyBusy = false;

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
  popupWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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

function sendToPopup(channel, payload) {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send(channel, payload);
  }
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
  if (!popupReady || hotkeyBusy) return;
  hotkeyBusy = true;

  try {
    const previous = clipboard.readText();

    try {
      execSync(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`);
    } catch {
      console.error('Pop Translate: Accessibility permission denied — add Terminal.app to System Settings → Privacy & Security → Accessibility');
      return;
    }

    await new Promise(r => setTimeout(r, 150));
    const text = clipboard.readText();
    clipboard.writeText(previous);

    if (!text || !text.trim() || text === previous) {
      console.log('Pop Translate: no text selected — select text before pressing the hotkey');
      return;
    }

    showPopupNearCursor();
    startDismissTimer();
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
