"""Shared typed vocabulary. No session behavior is implemented in this scaffold."""

from enum import Enum


class Role(str, Enum):
    P1_MOVEMENT = "p1_movement"
    P2_CAMERA = "p2_camera"
    P3_ACTION = "p3_action"


class SessionMode(str, Enum):
    WAITING = "waiting"
    HOST_REMOTE = "host_remote"
    COOP_PLAY = "coop_play"
    PAUSED_REMOTE = "paused_remote"
    WAITING_RECONNECT = "waiting_reconnect"
    HOST_LOST = "host_lost"
