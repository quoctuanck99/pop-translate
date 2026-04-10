# Pop Translate — Design Spec
**Date:** 2026-04-10

## Overview

A macOS menu bar utility built with Electron that translates selected text on demand using the OpenAI API. The user selects text in any app, presses a configurable hotkey, and a compact translation popup appears near the mouse cursor.

---

## Architecture

A single Electron process running as a menu bar app (no dock icon). Three surfaces:

- **Tray icon** — always-present in the macOS status bar. Right-click opens a menu with "Settings" and "Quit".
- **Popup window** — small frameless `BrowserWindow` that appears near the mouse cursor after the hotkey fires. Auto-dismisses on outside click, `Esc`, or after 10 seconds of inactivity.
- **Settings window** — standard `BrowserWindow` opened from the tray menu.

All OpenAI API calls are made from the **main process** so the API key is never exposed to renderer HTML. Settings are persisted using `electron-store`.

---

## Project Structure

```
pop-translate/
├── src/
│   ├── main.js            # Electron entry: tray, global shortcut, window management
│   ├── translator.js      # OpenAI API calls and prompt construction
│   ├── store.js           # electron-store wrapper with defaults
│   ├── popup/
│   │   ├── popup.html     # Compact card UI (translation result + copy button)
│   │   └── popup.js       # Renderer: receives result via IPC, handles copy/dismiss
│   ├── settings/
│   │   ├── settings.html  # Settings form UI
│   │   └── settings.js    # Renderer: load/save settings via IPC
│   └── preload.js         # contextBridge IPC bridge for both windows
├── package.json
└── .gitignore
```

---

## Translation Flow

1. User selects text in any app and presses the hotkey (default: `Cmd+Shift+T`)
2. Main process saves current clipboard contents
3. Main process simulates `Cmd+C` via AppleScript (`osascript -e 'tell application "System Events" to keystroke "c" using command down'`) to copy the selected text
4. Main process reads the new clipboard value
5. If clipboard is empty or unchanged, do nothing silently
6. Text is passed to `translator.js`, which calls the OpenAI Chat Completions API
7. Result is sent to the popup window via IPC
8. Popup `BrowserWindow` is shown near the current mouse cursor position
9. User can copy the translation or dismiss the popup

---

## Settings & Data Model

Persisted via `electron-store` at the default macOS app data path.

```js
{
  apiKey: "",                          // OpenAI API key (required)
  model: "gpt-4o-mini",               // "gpt-4o-mini" | "gpt-4o" | "gpt-4-turbo"
  sourceLang: "auto",                  // "auto" (detect) or BCP-47 code e.g. "en"
  targetLang: "vi",                    // default: Vietnamese
  tone: "casual",                      // "casual" | "formal" | "literal"
  hotkey: "CommandOrControl+Shift+T",  // configurable global shortcut
  launchAtStartup: false               // register as login item
}
```

### Translation Prompt

```
Translate the following text to [targetLang].
Tone: [tone].
If source language is "auto", detect it automatically.
Reply with only the translated text, no explanation.

[selected text]
```

---

## Settings Window

Fields exposed in the settings UI:

| Setting | Control | Notes |
|---|---|---|
| API Key | Password input | Masked, saved to electron-store |
| Model | Dropdown | gpt-4o-mini (default), gpt-4o, gpt-4-turbo |
| Source Language | Dropdown | Auto-detect + common languages |
| Target Language | Dropdown | Default: Vietnamese |
| Translation Tone | Radio / Dropdown | Casual, Formal, Literal |
| Hotkey | Keyboard shortcut recorder | Re-registers shortcut on change |
| Launch at Startup | Toggle | Uses Electron's `app.setLoginItemSettings` |

---

## Popup UI

A compact floating card with:
- Language pair label (e.g., "EN → VI")
- Translated text
- Copy button (copies translation to clipboard)
- Dismiss button (or click outside / press Esc)

Popup behavior:
- Positioned near mouse cursor, clamped to screen bounds
- Frameless, always-on-top `BrowserWindow`
- Auto-dismisses after 10 seconds of no interaction

---

## Error Handling

| Condition | Behavior |
|---|---|
| No API key configured | Popup shows: "Please set your API key in Settings" |
| API error / network failure | Popup shows the OpenAI error message |
| Empty or unchanged clipboard | Hotkey does nothing silently |
| Popup idle | Auto-dismisses after 10 seconds |

---

## Tech Stack

| Concern | Library |
|---|---|
| App framework | Electron |
| Settings persistence | electron-store |
| OpenAI calls | openai (official SDK) |
| Global hotkey | Electron `globalShortcut` |
| Clipboard access | Electron `clipboard` module |
| Login item | Electron `app.setLoginItemSettings` |

---

## Out of Scope

- Automated tests (manual testing covers all flows)
- Windows / Linux support
- Translation history
- Multiple simultaneous translations
