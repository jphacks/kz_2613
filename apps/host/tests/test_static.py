import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from recoop_host.app import app


def test_built_web_assets_are_served_locally(request: pytest.FixtureRequest) -> None:
    dist = Path(__file__).resolve().parents[2] / "web" / "dist"
    if not (dist / "index.html").is_file():
        if request.config.getoption("--require-web-build"):
            pytest.fail("Run npm ci && npm run build in apps/web first")
        pytest.skip("Frontend build is checked by the integrated CI job")

    client = TestClient(app)
    for route in ("/", "/?view=desktop"):
        response = client.get(route)
        assert response.status_code == 200
        assert '<div id="root">' in response.text
        resources = re.findall(r'(?:src|href)="([^"]+)"', response.text)
        assert resources
        for resource in resources:
            assert resource.startswith("/assets/")
            assert client.get(resource).status_code == 200

    assert client.get("/api/health").json()["game_input_ready"] is False
    assert client.get("/api/not-found").status_code == 404
