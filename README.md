# Script Master

Electron-based GUI to create, save, and run reusable shell scripts.

## Features
- Create & manage multiple scripts (persisted under Electron userData folder)
- Choose shell: PowerShell, CMD, or bash/sh (bash supported on Windows via WSL / Git Bash / PATH bash)
- Auto-detects bash environments on Windows in priority: WSL > Git Bash > PATH
- Streamed real-time output with separation of stdout/stderr
- Start/Stop script execution
- Secure preload bridge (contextIsolation enabled)

## Development

Install dependencies (already done if you have `node_modules`):

```powershell
npm install
```

Run the app:

```powershell
npm start
```

## Data Storage
Scripts are stored as individual JSON files in: `%APPDATA%/Script Master/scripts` (Windows) or the platform-equivalent `app.getPath('userData')`.

Each file schema:
```json
{
  "id": "<unique id>",
  "name": "My Script",
  "shell": "powershell",
  "content": "echo Hello",
  "createdAt": 1710000000000,
  "updatedAt": 1710000100000
}
```

## Security Notes
- `contextIsolation: true` and a minimal `preload.js` exposes only needed IPC methods.
- No direct `nodeIntegration` in renderer.

## Roadmap Ideas
- Syntax highlighting (Monaco / CodeMirror)
- Export / import scripts bundle
- Variables & parameters per run
- Scheduling / cron-like runner
- Tags & search
- Execution history with logs

## Bash on Windows Support
If you select bash/sh while running on Windows, the app tries to find an environment:
1. WSL (`wsl.exe bash -lc '<script>'`)
2. Git Bash (common install paths)
3. Any `bash.exe` present in PATH

If none are found you will see an error advising you to install WSL or Git for Windows.

Install options:
- WSL (recommended):
  - PowerShell (admin): `wsl --install` then restart. Your default distro provides bash.
- Git Bash:
  - Download from https://git-scm.com and ensure "Git Bash" is installed (default). This provides `bash.exe` under Program Files.

Quirks:
- WSL path translation: the script runs in a Linux environment; Windows drives are under `/mnt/c`.
- Git Bash runs in a MinGW environment and can execute most POSIX shell constructs but not all Linux utilities unless provided.
- Basic single-quote escaping is applied; very complex quoting may require wrapping logic in a separate script file.

## License
ISC
