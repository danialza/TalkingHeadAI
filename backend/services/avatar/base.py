from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class AvatarResult:
    video_url: Optional[str] = None
    video_bytes: Optional[bytes] = None
    duration_ms: Optional[int] = None
    job_id: Optional[str] = None


class BaseAvatarService(ABC):
    @abstractmethod
    async def generate(self, audio_bytes: bytes, image_url: str) -> AvatarResult:
        """Generate a talking-head video from audio bytes and an avatar image URL."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
