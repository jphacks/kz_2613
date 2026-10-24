# Windows 11 setup — scaffold only

## Prerequisites
- Windows 11 and existing `jphacks/kz_2613` clone.
- Python **3.12 x64** (`py -3.12 --version`), Node.js **22 LTS** (`node --version`), npm, Git.
- Minecraft Java Edition for **later manual validation**. It is not installed or launched by this scaffold.
- Permission to run local firewall changes when testing with phones. Never disable all firewall profiles globally.

## Apply the ZIP safely
1. Unzip the package. Keep your original repository's `README.md` and `LICENSE`.
2. Copy **the contents of `repo_overlay/`** into the existing repo root. Not the surrounding package directory.
3. Inspect with `git status` before commit; do not overwrite uncommitted work.
4. Read `AGENTS.md`, `CLAUDE.md`, `docs/requirements/requirements-v0.2.md`, `docs/decisions/tech-stack-provisional.md`.
5. `py -3 scripts/verify_overlay.py` (any Python 3.10+ can perform only this check).

## Host setup
PowerShell terminal 1:
```powershell
cd apps/host
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -c constraints-core.txt -e ".[dev]"
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m uvicorn recoop_host.app:app --host 127.0.0.1 --port 8000
```
Then visit `http://127.0.0.1:8000/api/health`; expected `game_input_ready:false`, not a playable game. `localhost` is **not** reachable from phones.

## Frontend setup
PowerShell terminal 2:
```powershell
cd apps/web
npm ci
npm run check
npm test
npm run build
npm run dev
```
Then visit `http://127.0.0.1:5173/?view=desktop` or `/` for placeholder phone page. The Vite dev server deliberately binds **localhost only**; this starter does not yet accept phone inputs.

## After building web static assets
With Vite dist built, restart FastAPI and open `http://127.0.0.1:8000/`; the host serves the built placeholder page. Don't conclude WebSocket or Minecraft input works.

Run the integrated test from `apps/host` after building:
```powershell
.\.venv\Scripts\python.exe -m pytest -q --require-web-build
```
This requires the real `apps/web/dist` files and checks HTML, JavaScript/CSS asset
responses and health. Restart the host after the first build because static routes
are registered on process startup. `/` shows the phone scaffold;
`/?view=desktop` shows the PC scaffold. Both clearly mark unimplemented controls.

`constraints-core.txt` pins the versions resolved on Windows during bootstrap,
including transitive dependencies. Constraints do not force Windows-only packages
onto Linux. Platform-specific dependencies not present on Windows (such as uvloop)
are resolved by pip on their platform. Update constraints deliberately and rerun CI.
`package-lock.json` is committed; use `npm install` only when changing dependencies.
Development requires package registries for installation; built runtime assets do
not require an external CDN. The packaged desktop GUI is a later Issue.

If `py -3.12` is unavailable, install standard Python 3.12 x64, or use an existing
3.12 interpreter explicitly: `& 'C:\path\to\python.exe' -m venv .venv`.
Do not create the venv with a different Python minor version. The bootstrap was
verified with Python 3.12.14, Node 22.15.0 and npm 11.16.0.

For development operations and the complete backlog, see
`DEVELOPMENT_WORKFLOW.md` and `ISSUE_PLAN.md` in this directory.

## First real connectivity gate (Codex task)
- Implement authorized join/session and input release logic **before** exposing control endpoints on LAN.
- Switch Uvicorn bind to the selected Wi-Fi interface only if possible, or to 0.0.0.0 with firewall limited to trusted network and token checks.
- Run Windows hotspot and connect 3 phones, including iPhone Safari.
- Confirm this works without cloud; follow `docs/architecture/validation-gates.md`.

## First real game-input gate
- Implement isolated **Windows-only probe** that explicitly asks user to put Minecraft in focus and checks key/relative mouse behavior.
- Do not send synthetic keys on process startup. Provide clear local emergency stop/release.
- Do not claim the probe passed until tested and recorded on the actual PC.
