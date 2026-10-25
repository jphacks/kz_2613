"""Offline structural check: the repository still has its main parts (host, desktop app, screens, game profiles, tests, docs).

Runs in CI (checks.yml) without Rust, so a missing core file is reported quickly. It does not build or test anything (#117).
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
required = [
    "docs/README.md", "docs/frontend-specification.md", "docs/host-specification.md",
    "docs/getting-started.md", "docs/usage.md", "docs/troubleshooting.md", "docs/develop/README.md",
    "README.md", "LICENSE", "AGENTS.md", "CLAUDE.md", "docs/develop/requirements/requirements-v0.3.md",
    "docs/develop/decisions/tech-stack.md", "docs/develop/architecture/system-design.md",
    "docs/protocol-specification.md", "docs/game-profile-specification.md",
    "apps/host-rs/Cargo.toml", "apps/host-rs/Cargo.lock", "apps/host-rs/src/main.rs", "apps/host-rs/src/hub.rs",
    "apps/desktop/Cargo.toml", "apps/desktop/Cargo.lock", "apps/desktop/src/main.rs",
    "apps/web-static/index.html", "apps/web-static/app.html", "apps/web-static/host.html", "apps/web-static/game.html",
    "apps/game-profiles/minecraft-java.json", "docs/develop/data/top500-games.json",
    "scripts/sim/protocol-sim.mjs", "scripts/sim/shutdown-sim.mjs",
    "scripts/sim/app-view-test.mjs", "scripts/sim/check-static-pages.mjs", "apps/web-static/app-view.js",
    ".github/workflows/checks.yml", ".github/workflows/rust.yml",
    "docs/develop/handoff/SETUP_WINDOWS.md", "docs/develop/handoff/DEVELOPMENT_WORKFLOW.md",
    "docs/develop/handoff/ISSUE_PLAN.md",
]
missing = [str(p) for p in required if not (root / p).is_file()]
if missing:
    raise SystemExit("Missing: " + ", ".join(missing))
print(f"PASS: {len(required)} required files found. Minecraft compatibility NOT tested.")
