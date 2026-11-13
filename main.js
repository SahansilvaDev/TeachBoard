const { app, BrowserWindow, ipcMain, dialog, Menu, clipboard, screen, session, webContents, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWin = null;
let inkWin = null;
const APP_ICON = path.join(__dirname, 'src', 'assets', 'app-icon.png');

// Look like a normal Chrome browser so Google / YouTube serve their full sites.
const CHROME_UA = app.userAgentFallback
  .replace(/\s?Electron\/\S+/, '')
  .replace(/\s?teachboard\/\S+/i, '')
  .replace(/\s?TeachBoard\/\S+/, '');
app.userAgentFallback = CHROME_UA;

const userFile = (name) => path.join(app.getPath('userData'), name);

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

function addRecent(filePath) {
  const list = readJSON(userFile('recent.json'), []).filter((p) => p !== filePath);
  list.unshift(filePath);
  writeJSON(userFile('recent.json'), list.slice(0, 12));
}

function fileArgFrom(argv) {
  return argv.slice(1).find((a) => /\.(pdf|tboard)$/i.test(a) && fs.existsSync(a));
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1f24',
    title: 'TeachBoard',
    icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
    },
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.maximize();

  mainWin.on('enter-full-screen', () => mainWin.webContents.send('fullscreen-changed', true));
  mainWin.on('leave-full-screen', () => mainWin.webContents.send('fullscreen-changed', false));

  // Unsaved whiteboards: the page cancels unload, we ask the teacher.
  mainWin.webContents.on('will-prevent-unload', (e) => {
    if (installingUpdate) { e.preventDefault(); return; }
    const choice = dialog.showMessageBoxSync(mainWin, {
      type: 'warning',
      buttons: ['Close without saving', 'Go back'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved whiteboard',
      message: 'You have whiteboards that are not saved.',
      detail: 'Close TeachBoard anyway? Unsaved drawings will be lost.',
    });
    if (choice === 0) e.preventDefault();
  });

  mainWin.webContents.on('did-finish-load', () => {
    const f = fileArgFrom(process.argv);
    if (f) mainWin.webContents.send('open-path', f);
  });
  mainWin.on('closed', () => { mainWin = null; });

  // If the page crashes (the "white screen") or freezes, offer a reload. The renderer saves its
  // session every few seconds, so reloading brings back the open PDFs, boards and pages.
  mainWin.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    askReload('TeachBoard stopped working', `The window crashed (${details.reason}). Reload to continue — your open tabs and drawings will come back.`);
  });
  mainWin.webContents.on('unresponsive', () => {
    askReload('TeachBoard is not responding', 'Reload the window? Your open tabs and drawings will come back.', true);
  });
}

let reloadAsked = false;
function askReload(title, detail, canWait) {
  if (!mainWin || reloadAsked) return;
  reloadAsked = true;
  const buttons = canWait ? ['Reload', 'Wait'] : ['Reload'];
  const choice = dialog.showMessageBoxSync(mainWin, { type: 'warning', title, message: title, detail, buttons, defaultId: 0, noLink: true });
  reloadAsked = false;
  if (choice === 0 && mainWin) mainWin.webContents.reload();
}

app.on('child-process-gone', (_e, details) => {
  // A GPU crash can leave the window blank even though the page itself is fine.
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    askReload('The display stopped working', 'Reload the window to redraw it? Your open tabs and drawings will come back.', true);
  }
});

// ---------- Auto-update from GitHub Releases ----------
let installingUpdate = false;
let autoUpdater = null;
const sendUpdate = (s) => mainWin && mainWin.webContents.send('update-status', s);

function setupUpdater() {
  if (!app.isPackaged) return; // only installed copies update themselves
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'latest', version: app.getVersion() }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (err) => sendUpdate({ state: 'error', message: String((err && err.message) || err).split('\n')[0].slice(0, 200) }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
}

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('update-check', async () => {
  if (!autoUpdater) return { state: 'dev' };
  try { await autoUpdater.checkForUpdates(); return { state: 'checking' }; }
  catch (err) { return { state: 'error', message: String(err.message || err).split('\n')[0] }; }
});
ipcMain.handle('update-install', () => {
  if (!autoUpdater) return;
  installingUpdate = true;
  autoUpdater.quitAndInstall();
});

// ---------- Session restore + board auto-save ----------
const SESSION_FILE = () => userFile('session.json');
const autosaveFile = (id) => userFile(path.join('autosave', String(id).replace(/[^a-z0-9]/gi, '') + '.tboard'));
ipcMain.handle('session-load', () => readJSON(SESSION_FILE(), null));
ipcMain.handle('session-save', (_e, data) => writeJSON(SESSION_FILE(), data));
ipcMain.on('session-save-sync', (e, data) => { try { writeJSON(SESSION_FILE(), data); } catch {} e.returnValue = true; });
ipcMain.handle('autosave-write', (_e, id, text) => {
  fs.mkdirSync(path.dirname(autosaveFile(id)), { recursive: true });
  fs.writeFileSync(autosaveFile(id), text, 'utf8');
});
ipcMain.handle('autosave-read', (_e, id) => { try { return fs.readFileSync(autosaveFile(id), 'utf8'); } catch { return null; } });
ipcMain.handle('autosave-delete', (_e, id) => { try { fs.unlinkSync(autosaveFile(id)); } catch {} });
ipcMain.handle('reload-window', () => mainWin && mainWin.webContents.reload());

// ---------- Browser (webview) behaviour ----------
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;

  // App shortcuts keep working while a web page has keyboard focus.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key;
    const ctrl = input.control || input.meta;
    const forward =
      k === 'F11' || k === 'F5' ||
      (ctrl && ['t', 'w', 'n', 'o', '\\', 'Tab', '=', '+', '-', '0'].includes(k.length === 1 ? k.toLowerCase() : k)) ||
      (input.alt && (k === 'ArrowLeft' || k === 'ArrowRight')) ||
      (ctrl && input.shift && k.toLowerCase() === 'r');
    if (!forward || !contents.hostWebContents) return;
    event.preventDefault();
    contents.hostWebContents.send('shortcut', { key: k, control: ctrl, shift: input.shift, alt: input.alt });
  });

  // Popups / target=_blank open as a new tab inside TeachBoard.
  contents.setWindowOpenHandler(({ url }) => {
    if (contents.hostWebContents) contents.hostWebContents.send('open-url-in-tab', url);
    return { action: 'deny' };
  });

  contents.on('context-menu', (_ev, params) => {
    const host = contents.hostWebContents;
    const items = [];
    if (params.mediaType === 'image' && params.srcURL) {
      items.push({ label: 'Add image to whiteboard', click: () => host.send('web-image-to-board', params.srcURL) });
      items.push({ label: 'Copy image', click: () => contents.copyImageAt(params.x, params.y) });
      items.push({ label: 'Open image in new tab', click: () => host.send('open-url-in-tab', params.srcURL) });
      items.push({ type: 'separator' });
    }
    if (params.linkURL) {
      items.push({ label: 'Open link in new tab', click: () => host.send('open-url-in-tab', params.linkURL) });
      items.push({ label: 'Copy link', click: () => clipboard.writeText(params.linkURL) });
      items.push({ type: 'separator' });
    }
    if (params.selectionText) {
      const sel = params.selectionText.trim();
      items.push({ label: 'Copy', role: 'copy' });
      items.push({ label: 'Add text to whiteboard', click: () => host.send('web-text-to-board', sel) });
      items.push({
        label: `Search Google for "${sel.length > 30 ? sel.slice(0, 30) + '…' : sel}"`,
        click: () => host.send('open-url-in-tab', 'https://www.google.com/search?q=' + encodeURIComponent(sel)),
      });
      items.push({ type: 'separator' });
    }
    if (params.isEditable) {
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
    }
    items.push({ label: 'Back', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() });
    items.push({ label: 'Forward', enabled: contents.navigationHistory.canGoForward(), click: () => contents.navigationHistory.goForward() });
    items.push({ label: 'Reload', click: () => contents.reload() });
    items.push({ label: 'Snapshot page to whiteboard', click: () => host.send('web-snapshot-request', contents.id) });
    Menu.buildFromTemplate(items).popup();
  });
});

// ---------- IPC ----------
ipcMain.handle('open-pdf-dialog', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Open tute / PDF',
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('open-board-dialog', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Open whiteboard',
    filters: [{ name: 'TeachBoard whiteboard', extensions: ['tboard'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('open-image-dialog', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Insert image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (r.canceled) return [];
  return r.filePaths.map((p) => {
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
  });
});

ipcMain.handle('read-file', async (_e, filePath) => {
  const data = fs.readFileSync(filePath);
  addRecent(filePath);
  return { path: filePath, name: path.basename(filePath), data: new Uint8Array(data) };
});

ipcMain.handle('read-text', async (_e, filePath) => {
  addRecent(filePath);
  return { path: filePath, name: path.basename(filePath), text: fs.readFileSync(filePath, 'utf8') };
});

ipcMain.handle('save-text', async (_e, { filePath, text, defaultName, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(mainWin, {
      title: 'Save whiteboard',
      defaultPath: defaultName || 'Whiteboard.tboard',
      filters: [{ name: 'TeachBoard whiteboard', extensions: ['tboard'] }],
    });
    if (r.canceled) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, text, 'utf8');
  addRecent(target);
  return { path: target, name: path.basename(target) };
});

ipcMain.handle('save-binary', async (_e, { data, defaultName, filterName, ext }) => {
  const r = await dialog.showSaveDialog(mainWin, {
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions: [ext] }],
  });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  return r.filePath;
});

ipcMain.handle('recent-list', async () =>
  readJSON(userFile('recent.json'), [])
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ path: p, name: path.basename(p) }))
);

// PDF annotations are kept in the app's data folder, keyed by the PDF path,
// so the teacher's original tute files are never modified.
const annotFile = (pdfPath) =>
  userFile(path.join('annotations', crypto.createHash('sha1').update(pdfPath.toLowerCase()).digest('hex') + '.json'));
ipcMain.handle('annot-load', async (_e, pdfPath) => readJSON(annotFile(pdfPath), null));
ipcMain.handle('annot-save', async (_e, pdfPath, data) => writeJSON(annotFile(pdfPath), data));

ipcMain.handle('fetch-image', async (_e, url) => {
  if (url.startsWith('data:')) return url;
  const res = await net.fetch(url, { headers: { 'User-Agent': CHROME_UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buf.toString('base64')}`;
});

ipcMain.handle('capture-webcontents', async (_e, id) => {
  const wc = webContents.fromId(id);
  if (!wc) return null;
  const img = await wc.capturePage();
  return img.toDataURL();
});

ipcMain.handle('toggle-fullscreen', () => {
  mainWin.setFullScreen(!mainWin.isFullScreen());
  return mainWin.isFullScreen();
});

ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

// ---------- Screen ink (draw over any app) ----------
ipcMain.handle('ink-open', () => {
  if (inkWin) { inkWin.focus(); return; }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  inkWin = new BrowserWindow({
    ...display.bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    title: 'TeachBoard Screen Ink',
    icon: APP_ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  inkWin.setAlwaysOnTop(true, 'screen-saver');
  inkWin.setBounds(display.bounds);
  inkWin.loadFile(path.join(__dirname, 'src', 'ink.html'));
  inkWin.on('closed', () => { inkWin = null; });
});
ipcMain.handle('ink-close', () => inkWin && inkWin.close());
ipcMain.handle('ink-passthrough', (_e, on) => {
  if (inkWin) inkWin.setIgnoreMouseEvents(on, { forward: true });
});

// ---------- App lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
    const f = fileArgFrom(argv);
    if (f) mainWin.webContents.send('open-path', f);
  });

  app.setAppUserModelId('lk.codeplus.teachboard'); // taskbar uses our icon, not Electron's
  app.whenReady().then(() => {
    session.fromPartition('persist:web').setUserAgent(CHROME_UA);
    createMainWindow();
    setupUpdater();
  });
  app.on('window-all-closed', () => app.quit());
}
