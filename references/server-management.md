# Server Management Reference

**Shell note:** Always use PowerShell commands to manage processes — bash on Windows (Git Bash) misinterprets `taskkill /PID` as a file path, so native `taskkill` calls will fail.

## Start the server

```bash
node src/server.js
# or
npm run server
```

When running via Claude Code's Bash tool, use `run_in_background: true`. The startup log prints the status of all three API keys followed by `Server running at http://localhost:3000`.

## Find the server PID

```powershell
powershell -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess"
```

## Kill the server

```powershell
powershell -Command "Stop-Process -Id <PID> -Force"
```

## Confirm the server is dead

```bash
curl -s http://localhost:3000/api/releases
```

Exit code **7** = connection refused = server is gone.
Exit code **0** = server is still responding.

## Full stop-and-restart sequence

1. Get PID (PowerShell `Get-NetTCPConnection`)
2. Kill it (`Stop-Process -Force`)
3. Confirm dead (`curl` → exit 7)
4. Start new server (`run_in_background: true`)
5. Wait 2 s, then confirm alive (`curl` → exit 0 with JSON response)
