# Re:Cooplay — instructions for coding agents

## Objective / source precedence
- The product is a **local, cooperative controller layer for an existing unmodified PC game**. First target: **Minecraft Java Edition on Windows 11**, one game character, three phones (P1 movement, P2 camera, P3 actions).
- Read `docs/requirements/requirements-v0.2.md` before planning changes. Read `docs/decisions/2026-10-24-user-decisions.md` for later explicit decisions and `docs/decisions/tech-stack-provisional.md` for the tentative stack.
- Priorities: **new explicit user decision > user-confirmed decisions > team idea minutes > provisional implementation proposal**. Never silently promote a tentative idea to a settled team decision.
- Priority order: **actually works / reliable demo > UI flexibility > development speed > expansion**.

## Engineering boundaries
- Do **not** replace the JPHACKS `README.md` or `LICENSE`; preserve existing content and extend README carefully when instructed.
- Never write to GitHub, share-drive documents, Slack, or submit anything unless the user explicitly requests that action. Local changes and tests are fine when tasked.
- Do not claim hardware or Minecraft interoperability passed without actual device/game testing and evidence.
- The attached setup is an **initialization scaffold**, not a functioning game controller. Unimplemented behavior must fail loudly; never report a no-op input driver as success.
- Server authorizes connections and commands. A phone may not assign itself host or another role. First connected client is host and P1 in the MVP.
- On pause, disconnect, target focus loss, session/epoch change, or shutdown: stop injecting input and release all synthesized keys and mouse buttons. Fail closed when unsure.
- No external cloud relay, account, telemetry, internet CDN, Minecraft mods, or privileged driver in P0. No game video streaming to phones.

## Provisional stack (change only with evidence)
- Windows 11 native input: `SendInput` via Python `ctypes` (scan-code keys, relative mouse movement). Minecraft acceptance **unverified**.
- Host: Python 3.12, FastAPI, Uvicorn (single process/worker), in-memory session state, local JSON profiles, pywebview/WebView2 optional desktop shell.
- Browser: React, TypeScript, Vite, Tailwind CSS + custom CSS, Pointer Events. Build locally; Python serves the static assets.
- Transport: local Wi-Fi, HTTP/WebSocket JSON; Windows Mobile Hotspot provisional, local AP fallback. Never require internet for phone-to-PC game inputs.
- Tests: pytest, Vitest, TypeScript check + Android/iPhone/Windows device gates; `PyInstaller onedir` is later packaging.

## Repository structure and coding style
- `apps/host/` — API, state machine, Windows input port, Windows app wrapper.
- `apps/web/` — phone and PC web user interfaces with shared components.
- `docs/` — stable requirements, decisions, architecture and test evidence.
- `scripts/` — repeatable developer commands.
- Use explicit typed messages and document contract versions. Keep OS input separated from HTTP/WebSocket handlers.
- Do not add functionality just because an unimplemented placeholder suggests it; develop P0 first.

## Required work discipline
1. Inspect repo and existing changes; do not discard other people's work.
2. Write a short plan for nontrivial work and name unverified assumptions.
3. Implement the smallest vertical slice; add focused tests.
4. Run tests and record commands/results in `docs/handoff/BUILD_LOG.md`. If unable, say so.
5. Record technical decisions with rationale; update requirements only when the user confirms a change.

## Suggested commands (after bootstrap)
- Host: create a Python 3.12 venv, then `cd apps/host && python -m pip install -c constraints-core.txt -e ".[dev]" && python -m pytest`
- Host health: `cd apps/host && python -m uvicorn recoop_host.app:app --reload --host 127.0.0.1 --port 8000`
- Web: `cd apps/web && npm ci && npm run check && npm test && npm run build`
- Follow `docs/handoff/SETUP_WINDOWS.md` for complete Windows setup.
- Follow `docs/handoff/DEVELOPMENT_WORKFLOW.md` for shared Issue/branch/PR workflow.
