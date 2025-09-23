# Script Master

Electron-based GUI to create, save, and run reusable shell scripts.

## Features
- Create & manage multiple scripts (persisted under Electron userData folder)
- Choose shell: PowerShell, CMD (Windows) or bash/sh (cross-platform options shown)
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

## License
ISC
