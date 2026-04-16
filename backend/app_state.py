"""Shared application state — avoids circular imports between main.py and routes."""
from typing import Any

state: dict[str, Any] = {}

# Short-lived audio buffer: {uuid → bytes}  consumed by avatar_stream /talk endpoint
pending_audio: dict[str, bytes] = {}


def get_orchestrator():
    return state["orchestrator"]


def get_stt():
    return state["stt"]
