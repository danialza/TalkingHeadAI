"""Session state tracking — manages active WebSocket sessions."""
from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class SessionState:
    session_id: str
    mentor_id: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    message_count: int = 0
    is_recording: bool = False


class SessionManager:
    def __init__(self):
        self._sessions: dict[str, SessionState] = {}

    def create_session(self, mentor_id: str = "default") -> str:
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = SessionState(session_id=session_id, mentor_id=mentor_id)
        return session_id

    def get_session(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)

    def update_activity(self, session_id: str):
        if session := self._sessions.get(session_id):
            session.last_activity = datetime.utcnow()
            session.message_count += 1

    def remove_session(self, session_id: str):
        self._sessions.pop(session_id, None)

    def active_count(self) -> int:
        return len(self._sessions)


session_manager = SessionManager()
