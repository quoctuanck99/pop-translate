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
