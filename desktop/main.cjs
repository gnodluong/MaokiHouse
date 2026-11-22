// Electron main process for Maoki Admin. The UI is the bundled renderer (desktop/dist); data comes from Supabase.
const { app, BrowserWindow, Menu, shell, nativeTheme, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged && process.env.MAOKI_DEV_URL;
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; }
}
function saveState(win) {
  if (win.isDestroyed()) return;
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  try { fs.writeFileSync(statePath(), JSON.stringify({ ...bounds, maximized: win.isMaximized() })); } catch { /* not critical */ }
}

function createWindow() {
  const state = loadState();
  const win = new BrowserWindow({
    width: state.width || 1360, height: state.height || 860, x: state.x, y: state.y,
    minWidth: 960, minHeight: 600, show: false,
    title: 'Maoki Admin',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#f5f6f8',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveState(win));
  // External links open in the system browser; the app never navigates away from its own UI.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => {
    const own = isDev ? url.startsWith(process.env.MAOKI_DEV_URL) : url.startsWith('file://');
    if (!own) { event.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); }
  });
  if (isDev) void win.loadURL(process.env.MAOKI_DEV_URL);
  else void win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  return win;
}

// Window controls and OS theme are exposed to the renderer through a narrow, explicit API.
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, systemDark: nativeTheme.shouldUseDarkColors }));
ipcMain.handle('app:set-theme-source', (_event, value) => { if (['system', 'light', 'dark'].includes(value)) nativeTheme.themeSource = value; });
ipcMain.handle('app:open-external', (_event, url) => { if (typeof url === 'string' && /^https?:\/\//.test(url)) return shell.openExternal(url); });

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => { const [win] = BrowserWindow.getAllWindows(); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]) : null);
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
