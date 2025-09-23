const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// ------- Persistence Layer -------
// Scripts are stored as individual JSON files inside {userData}/scripts
// Schema: { id, name, shell, content, createdAt, updatedAt }

function getScriptsDir() {
  const dir = path.join(app.getPath('userData'), 'scripts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listScripts() {
  const dir = getScriptsDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { id: data.id, name: data.name, shell: data.shell, updatedAt: data.updatedAt };
    } catch (e) {
      return null;
    }
  }).filter(Boolean).sort((a,b)=> (b.updatedAt||0)-(a.updatedAt||0));
}

function loadScript(id) {
  const file = path.join(getScriptsDir(), `${id}.json`);
  if (!fs.existsSync(file)) throw new Error('Not found');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

function saveScript(script) {
  const now = Date.now();
  if (!script.id) script.id = generateId();
  const existing = fs.existsSync(path.join(getScriptsDir(), `${script.id}.json`)) ? loadScript(script.id) : null;
  const record = {
    id: script.id,
    name: script.name?.trim() || 'Untitled',
    shell: script.shell || defaultShell(),
    content: script.content || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  fs.writeFileSync(path.join(getScriptsDir(), `${record.id}.json`), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

function deleteScript(id) {
  const file = path.join(getScriptsDir(), `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultShell() {
  if (process.platform === 'win32') return 'powershell';
  return 'bash';
}

// ------- Execution Layer -------
// Runs scripts in a child process using chosen shell.
// Emits streaming output via IPC (channel: scripts:run:output)

const runningProcesses = new Map(); // id -> child

function runScript(event, id) {
  const script = loadScript(id);
  let command, args, execContent = script.content;
  const shell = script.shell || defaultShell();

  if (process.platform === 'win32') {
    if (shell === 'cmd') {
      command = 'cmd.exe';
      args = ['/d', '/c', execContent];
    } else { // powershell
      command = 'powershell.exe';
      args = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', execContent];
    }
  } else { // *nix
    command = shell === 'sh' ? 'sh' : 'bash';
    args = ['-c', execContent];
  }

  const child = spawn(command, args, { cwd: os.homedir(), env: process.env });
  runningProcesses.set(id, child);
  event.sender.send('scripts:run:output', { id, type: 'start', message: `Running with ${command} ${args.join(' ')}` });

  child.stdout.on('data', d => {
    event.sender.send('scripts:run:output', { id, type: 'stdout', message: d.toString() });
  });
  child.stderr.on('data', d => {
    event.sender.send('scripts:run:output', { id, type: 'stderr', message: d.toString() });
  });
  child.on('error', err => {
    event.sender.send('scripts:run:output', { id, type: 'error', message: err.message });
  });
  child.on('close', code => {
    runningProcesses.delete(id);
    event.sender.send('scripts:run:output', { id, type: 'end', code });
  });
}

function stopScript(id) {
  const child = runningProcesses.get(id);
  if (!child) return false;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', child.pid, '/T', '/F']);
  } else {
    child.kill('SIGTERM');
  }
  return true;
}

// ------- IPC Handlers -------
ipcMain.handle('scripts:list', () => listScripts());
ipcMain.handle('scripts:get', (e, id) => loadScript(id));
ipcMain.handle('scripts:save', (e, payload) => saveScript(payload));
ipcMain.handle('scripts:delete', (e, id) => { deleteScript(id); return { ok: true }; });
ipcMain.handle('scripts:run', (e, id) => { runScript(e, id); return { started: true }; });
ipcMain.handle('scripts:stop', (e, id) => ({ stopped: stopScript(id) }));

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});