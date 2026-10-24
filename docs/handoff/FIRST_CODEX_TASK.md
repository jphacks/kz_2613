# Ready-to-use first Codex / Claude Code task

Copy and use this prompt from the existing `jphacks/kz_2613` repository root **after merging the overlay**.

---

You are initializing Re:Cooplay (`jphacks/kz_2613`) on Windows 11.

Read root `AGENTS.md`, `CLAUDE.md`, `docs/requirements/requirements-v0.2.md`, `docs/decisions/2026-10-24-user-decisions.md`, `docs/decisions/tech-stack-provisional.md`, and `docs/architecture/validation-gates.md` first. The product must work; optimize for a reliable Minecraft Java Edition demo before UI polish.

**Task:** complete the repository's basic developer environment and check that both host and web scaffold can build/test on the available machine. This is Phase 00, not full gameplay implementation. Preserve the existing JPHACKS README structure and LICENSE. Inspect existing files and git status; don't overwrite teammates' changes.

1. Confirm Python 3.12 / Node 22 versions and install requirements locally. Run `npm install` to generate and commit `package-lock.json` (not supplied; package registry was unavailable when this ZIP was built), then use `npm ci` in CI; pin reproducible versions actually resolved on this machine.
2. Run `python scripts/verify_overlay.py`, host pytest/ruff, web typecheck/Vitest/Vite build. Repair any environment/build issues; document exact commands and PASS/FAIL.
3. Confirm `http://127.0.0.1:8000/api/health` and bundled `apps/web/dist` static page serve without cloud/CDN. Health must continue reporting `game_input_ready:false` until real manual game testing.
4. Design the shortest end-to-end manual input probe as an isolated script, **but do not send OS input without explicit operator action**. Check `SendInput` scan-code keys and relative camera in a real Minecraft Java client. Report untested until physically run.
5. Define the next implementation slice: authenticated 3-phone role/session handshake, a reliable held-key/timeout/epoch model, and safe release. Do not open unauthenticated LAN OS-control endpoints.
6. Add a clear `docs/handoff/BUILD_LOG.md` entry with environment, modifications, tests, blockers, and next action. Do not claim any device gate passed unless directly observed.
7. Avoid a large framework migration or custom game autodetection. pywebview packaging and rich UI are subsequent stages; manual Minecraft launching is allowed P0.

Before making changes, provide a concise plan. After finishing, summarize files changed, commands/tests, unresolved device gates and exact next task.

---

**Optional next task once Phase 00 passes:** Build a real Windows SendInput probe behind an explicit keyboard/manual activation guard; then validate against the installed Minecraft Java version. No browser or 3-phone networking is needed for this isolated gate.
