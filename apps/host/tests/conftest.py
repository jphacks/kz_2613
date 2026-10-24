import pytest


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption("--require-web-build", action="store_true", default=False)
