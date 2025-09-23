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
  // --- Unique Name Handling ---
  let desiredName = (script.name || '').trim() || 'Untitled';
  const all = listScripts();
  const conflict = (name) => all.find(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== script.id);

  if (!existing) {
    // New script: auto-suffix (name (2), name (3), ...)
    if (conflict(desiredName)) {
      const base = desiredName.replace(/ \(\d+\)$/,'');
      let n = 2;
      let candidate = `${base} (${n})`;
      while (conflict(candidate)) { n++; candidate = `${base} (${n})`; }
      desiredName = candidate;
    }
  } else {
    // Update existing: if user tries to rename to an existing other script name -> error
    if (conflict(desiredName)) {
      const err = new Error('A script with that name already exists.');
      err.code = 'NAME_CONFLICT';
      throw err;
    }
  }

  const record = {
    id: script.id,
    name: desiredName,
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

// ------- Windows Bash Support Detection -------
// Allow running bash/sh scripts on Windows via (priority): WSL -> Git Bash -> bash in PATH
function findBashOnWindows() {
  if (process.platform !== 'win32') return null;
  try {
    // Check WSL presence
    const systemRoot = process.env.SYSTEMROOT || 'C://Windows';
    const wslPath = path.join(systemRoot, 'System32', 'wsl.exe');
    if (fs.existsSync(wslPath)) {
      return { type: 'wsl', command: 'wsl.exe', argsPrefix: ['bash', '-lc'] };
    }
  } catch (_) { /* ignore */ }

  // Git Bash common locations
  const gitCandidates = [
    'C://Program Files//Git//bin//bash.exe',
    'C://Program Files (x86)//Git//bin//bash.exe'
  ];
  for (const p of gitCandidates) {
    if (fs.existsSync(p)) {
      return { type: 'git-bash', command: p, argsPrefix: ['-lc'] };
    }
  }

  // Search PATH
  const pathParts = (process.env.PATH || '').split(';');
  for (const part of pathParts) {
    const candidate = path.join(part, 'bash.exe');
    if (fs.existsSync(candidate)) {
      return { type: 'path-bash', command: candidate, argsPrefix: ['-lc'] };
    }
  }
  return null;
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
    if (shell === 'bash' || shell === 'sh') {
      const bashInfo = findBashOnWindows();
      if (!bashInfo) {
        event.sender.send('scripts:run:output', { id, type: 'error', message: 'No Bash environment detected. Install WSL (https://learn.microsoft.com/windows/wsl/install) or Git for Windows to enable bash scripts.' });
        return;
      }
      command = bashInfo.command;
      // Basic escaping of single quotes for -lc '<script>' form
      const escaped = execContent.replace(/'/g, "'\\''");
      args = [...bashInfo.argsPrefix, `'${escaped}'`];
    } else if (shell === 'cmd') {
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
ipcMain.handle('scripts:save', (e, payload) => {
  try {
    return saveScript(payload);
  } catch (err) {
    return { error: err.message, code: err.code || 'SAVE_FAILED' };
  }
});
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