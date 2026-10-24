from fastapi.testclient import TestClient

from recoop_host.app import app
from recoop_host.domain.models import Role, SessionMode
from recoop_host.platform.input_driver import UnimplementedInputDriver


def test_health_cannot_masquerade_as_game_ready():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json()["game_input_ready"] is False
    assert response.json()["session_ready"] is False


def test_noop_driver_is_not_silent():
    driver = UnimplementedInputDriver()
    try:
        driver.key_down("W")
    except NotImplementedError:
        pass
    else:
        raise AssertionError("unimplemented input must never appear successful")


def test_vocabulary():
    assert Role.P1_MOVEMENT.value == "p1_movement"
    assert SessionMode.COOP_PLAY.value == "coop_play"
