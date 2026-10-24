# Re:Cooplay — Claude Code

This repository is shared between **Codex** and **Claude Code**. Read `AGENTS.md` for the common architecture and safety rules, then the files linked below. Do not maintain a divergent second set of requirements here.

1. `docs/requirements/requirements-v0.2.md` — full MVP definition, statuses [D]/[M]/[H]/[P]/[V].
2. `docs/decisions/2026-10-24-user-decisions.md` — user-confirmed behavior and newer UI decisions.
3. `docs/decisions/tech-stack-provisional.md` — full tentative stack and alternatives.
4. `docs/architecture/system-design.md` — module boundaries, authority, safety.
5. `docs/architecture/validation-gates.md` — empirical Go/No-Go checks.
6. `docs/handoff/FIRST_CODEX_TASK.md` — suggested initialization prompt; useful for either assistant.

**Do not falsely report readiness:** there is currently no validated Minecraft input implementation or real 3-phone session. The scaffold health endpoint is not evidence of any game compatibility.

Prefer small reviewed commits, clear test output, and handoffs in `docs/handoff/BUILD_LOG.md`. Keep secrets, personal tokens and environment-specific IPs out of commits. Never overwrite `README.md` or `LICENSE` without explicit user instruction.
