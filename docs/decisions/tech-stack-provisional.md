# Provisional technical stack — rationale & fallback

**Status: all tentative.** Selection criteria: 1) reliable end-to-end Minecraft demo, 2) UI freedom, 3) fast development/low deployment risk. Do not call it *verified* before real-device gates pass.

| Layer | Provisional choice | Why | Tradeoff / fallback |
|---|---|---|---|
| Windows input | Win32 `SendInput` via Python `ctypes` | Standard Windows API. Screact demonstrates Windows absolute cursor/left-click, no privileged driver; Python can access same API. | Minecraft Java synthetic **relative** camera and keyboard unverified; isolate driver; change version/input approach if blocked. |
| Host runtime | Python **3.12** | Same language for API, session state, input, testing. | C#/.NET is a valid Windows-oriented fallback, but adds a backend stack transition. |
| Host API | FastAPI + Uvicorn **single worker** | HTTP static UI + 3 WebSocket clients, Python in-memory state sufficient. | Do not enable multi-worker/auto-reload in real game; isolates state per worker. |
| Transport | Local HTTP + JSON WebSocket | Simple bi-directional client API and browser support. | No remote relay or cloud. LAN port open is a security surface: authorize every action. |
| Physical network | Windows Mobile Hotspot | Standard Wi-Fi clients on Android/iPhone; network runs locally. | Verify PC actually supports hotspot without upstream. Fallback: local AP/router, then Wi-Fi Direct Legacy AP. |
| Mobile UI | React + TypeScript + Vite | Cross-browser UI control and fast static builds without Node.js on target. | Native iOS/Android unnecessary. Test Safari long-press/multi-touch. |
| CSS | Tailwind CSS + project CSS | Strong custom control layout flexibility. | Custom CSS handles `touch-action: none`, safe areas, gamepad areas. |
| Desktop window | pywebview / WebView2 | Reuse React PC screen with light Python shell. | pywebview UI runs on main thread; host API background server thread. If fails, use localhost browser. |
| Session state | In-memory Python single-process | 1 host/3 clients; avoids database and operational complexity. | Session resets on restart. Tokens and held-keys never persisted. |
| Profiles / settings | Local JSON (later, not implemented in scaffold) | Edit Minecraft fixed mapping without external DB. | Validate schema, restrict writable locations. |
| QR codes | Python `qrcode` | Offline QR generation for access URL. | Wi-Fi join QR and session URL QR are separate actions on some phones. |
| Packaging | PyInstaller **onedir** | Easier to investigate missing files/dependencies than onefile. | Test WebView2 runtime presence; develop with venv if packaging fails. |
| Backend tests | pytest (+ FastAPI TestClient), ruff | Easy deterministic domain/state tests. | Hardware input tests separately on Windows. |
| Web tests | Vitest + TypeScript | Local unit confidence for touch and UI logic. | Manual Android + iPhone + 3-device test still required. |
| Environment | `venv`, `pip`, `npm`, lockfile | Separate Python/JS build; runtime only bundled built assets. | Generate & commit frontend lock; pin exact deps after first successful vertical slice. |
| Logging | `logging`, rotating local logs | Debugs link/session state without data exfiltration. | Do not log tokens/IP addresses/PII. |

## Non-choices for MVP
- Electron/Node input stack: very flexible PC UI but another native bridge/runtime for Windows game input.
- Flutter+C++: Screact experience applies, but cross-browser controller remains a separate product and adds a second native layer.
- Tauri/Rust: capable but adds Rust for the same Windows integration risk.
- `PyDirectInput`: same Win32 SendInput family; not an independent fallback to a game refusing injected input.
- PyAutoGUI: easier pointer scripting but less game-oriented; not first choice.
- ViGEm/virtual gamepad/HID: Minecraft Java does not natively consume generic controller as P0 path; driver installation adds risk.
- Next.js, Redis, SQLite, external account/cloud provider: not required for single session and static browser clients.
- CDN/PWA sensor requirements: offline local HTTP first; browser device motion may require secure context and is not P0.

## OS threading, focus, security
- pywebview on main thread; Uvicorn on a background loop/thread; serialize authoritative mutations in **one** event loop or queue.
- OS SendInput goes to foreground, not a specified HWND. Check expected game focus and release held state on focus loss; do not force unpredictable window switching.
- WS handshake must authorize role and session; don't accept client-declared P1/host/status at face value.
- Handle `pointercancel`, page hidden, stale sessions, network timeout, `release_all` (and prioritize key release over view updates).

## Reference
- Screact Windows input: https://github.com/KIT-DevelopersHub/screact/blob/main/desktop/windows/runner/desktop_input_controller.cpp (absolute mouse/left-click only; not game camera proof)
- Microsoft SendInput: https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput
- FastAPI WS: https://fastapi.tiangolo.com/advanced/websockets/
- Codex AGENTS: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Claude CLAUDE.md: https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts
