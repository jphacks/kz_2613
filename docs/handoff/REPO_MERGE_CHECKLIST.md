# Safe merge checklist

- [ ] Clone/pull `jphacks/kz_2613` and inspect `git status`; do not overwrite teammate changes.
- [ ] Extract this zip, copy only `repo_overlay` **contents** into repo root.
- [ ] Confirm original `README.md` and `LICENSE` are unchanged.
- [ ] Read AGENTS.md and CLAUDE.md (persistent agent guidance).
- [ ] Read `docs/requirements/requirements-v0.2.md` (exact shared document snapshot from 2026-10-24).
- [ ] Confirm `docs/decisions/` captures the newer input/tech-stack decisions.
- [ ] `py -3 scripts/verify_overlay.py` passes.
- [ ] Setup Python 3.12 environment; host pytest passes (not a Minecraft test).
- [ ] `npm install && npm run check && npm test && npm run build` (then commit lockfile; use `npm ci` thereafter) pass.
- [ ] Record actual results and exact versions in `docs/handoff/BUILD_LOG.md`.
- [ ] Run real-device gates before making any game-input compatibility claim.
- [ ] Review changes before commit/PR (this ZIP does not push or submit code).
