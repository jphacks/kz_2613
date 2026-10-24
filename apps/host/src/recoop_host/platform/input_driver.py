"""Deliberately unimplemented port; never silently acknowledge an OS input action.

Codex/Claude should first prove Windows SendInput against Minecraft using a separate
manual probe, then implement this port with focus checks and held-key tracking.
"""

from typing import Protocol


class InputDriver(Protocol):
    def key_down(self, key: str) -> None: ...
    def key_up(self, key: str) -> None: ...
    def mouse_down(self, button: str) -> None: ...
    def mouse_up(self, button: str) -> None: ...
    def mouse_relative(self, dx: int, dy: int) -> None: ...
    def release_all(self) -> None: ...


class UnimplementedInputDriver:
    def __getattr__(self, name: str):
        raise NotImplementedError(
            f"{name} is intentionally unavailable: Windows/Minecraft input gate has not passed"
        )
