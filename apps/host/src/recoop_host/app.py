"""Minimal bootstrap host: health + optional local assets. NO game input API yet."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Re:Cooplay host (bootstrap)", version="0.0.1")


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "phase": "scaffold",
        "game_input_ready": False,
        "session_ready": False,
    }


def _static_dir() -> Path | None:
    candidate = os.getenv("RECOOP_STATIC_DIR")
    if candidate:
        target = Path(candidate)
    else:
        # apps/host/src/recoop_host/app.py -> repo root
        target = Path(__file__).resolve().parents[4] / "apps" / "web" / "dist"
    return target if (target / "index.html").is_file() else None


assets = _static_dir()
if assets is not None:
    app.mount("/assets", StaticFiles(directory=assets / "assets"), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(assets / "index.html")
