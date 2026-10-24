"""Offline structural smoke-check for the copied repository scaffold."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
required = [
    "README.md", "LICENSE", "AGENTS.md", "CLAUDE.md", "docs/requirements/requirements-v0.2.md",
    "docs/decisions/tech-stack-provisional.md", "docs/architecture/system-design.md",
    "apps/host/pyproject.toml", "apps/host/src/recoop_host/app.py",
    "apps/web/package.json", "apps/web/package-lock.json", "apps/web/src/main.tsx",
    ".github/workflows/checks.yml", "apps/host/constraints-core.txt",
    "docs/handoff/SETUP_WINDOWS.md", "docs/handoff/DEVELOPMENT_WORKFLOW.md",
    "docs/handoff/ISSUE_PLAN.md",
]
missing = [str(p) for p in required if not (root / p).is_file()]
if missing:
    raise SystemExit("Missing: " + ", ".join(missing))
print(f"PASS: {len(required)} required starter files found. Minecraft compatibility NOT tested.")
