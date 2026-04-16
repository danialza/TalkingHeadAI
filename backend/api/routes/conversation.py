"""
WebSocket endpoint for real-time voice conversation.
Also includes a REST POST /chat endpoint for text-based testing.
"""
import asyncio
import base64
import json
import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import app_state as _app_state
from models.database import get_db
from models.schemas import TextChatRequest, TextChatResponse
from core.session_manager import session_manager
from services.stt.base import BaseSTTService

log = structlog.get_logger()
router = APIRouter(tags=["conversation"])


@router.post("/chat", response_model=TextChatResponse)
async def text_chat(request: TextChatRequest):
    """Text-based chat endpoint — useful for testing without voice."""
    orchestrator = _app_state.get_orchestrator()
    result = await orchestrator.process_text(
        user_message=request.message,
        session_id=request.session_id,
        mentor_id=request.mentor_id,
        user_id=request.user_id,
    )
    return TextChatResponse(**result)


@router.websocket("/ws/{session_id}")
async def websocket_conversation(websocket: WebSocket, session_id: str):
    """
    Real-time voice conversation WebSocket.

    Client → Server:
      {"type": "text_message", "data": "What is..."}
      {"type": "audio_chunk", "data": "<base64 audio>"}
      {"type": "start_recording"}
      {"type": "stop_recording"}

    Server → Client:
      {"type": "transcription", "data": "User said...", "is_final": true}
      {"type": "thinking", "status": "routing"}
      {"type": "response_text", "data": "...", "case": "A"}
      {"type": "audio_chunk", "data": "<base64 audio>"}
      {"type": "avatar_url", "data": "https://...mp4"}
      {"type": "error", "data": "Something went wrong"}
    """
    await websocket.accept()
    user_id = websocket.query_params.get("user_id", "anon")
    log.info("ws_connected", session_id=session_id, user_id=user_id)
    session_manager.create_session()

    audio_buffer = bytearray()
    is_recording = False

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "text_message":
                user_text = msg.get("data", "")
                if not user_text.strip():
                    continue

                await websocket.send_json({"type": "thinking", "status": "routing"})

                orchestrator = _app_state.get_orchestrator()
                async for event in orchestrator.process_with_voice(
                    user_message=user_text,
                    session_id=session_id,
                    user_id=user_id,
                ):
                    await websocket.send_json(event)

            elif msg_type == "start_recording":
                audio_buffer = bytearray()
                is_recording = True
                await websocket.send_json({"type": "status", "data": "recording"})

            elif msg_type == "audio_chunk":
                if is_recording:
                    chunk_b64 = msg.get("data", "")
                    if chunk_b64:
                        audio_buffer.extend(base64.b64decode(chunk_b64))

            elif msg_type == "stop_recording":
                is_recording = False
                if not audio_buffer:
                    continue

                # Transcribe the collected audio
                await websocket.send_json({"type": "thinking", "status": "transcribing"})
                try:
                    stt: BaseSTTService = _app_state.get_stt()
                    transcription = await stt.transcribe_audio(bytes(audio_buffer))
                    user_text = transcription.text.strip()

                    if not user_text:
                        await websocket.send_json({"type": "error", "data": "Could not transcribe audio"})
                        continue

                    await websocket.send_json({
                        "type": "transcription",
                        "data": user_text,
                        "is_final": True,
                    })

                    # Process through orchestrator
                    orchestrator = _app_state.get_orchestrator()
                    async for event in orchestrator.process_with_voice(
                        user_message=user_text,
                        session_id=session_id,
                        user_id=user_id,
                    ):
                        await websocket.send_json(event)

                except Exception as e:
                    log.error("stt_error", error=str(e))
                    await websocket.send_json({"type": "error", "data": f"Transcription failed: {e}"})

                audio_buffer = bytearray()

    except WebSocketDisconnect:
        log.info("ws_disconnected", session_id=session_id)
        session_manager.remove_session(session_id)
    except Exception as e:
        log.error("ws_error", session_id=session_id, error=str(e))
        try:
            await websocket.send_json({"type": "error", "data": str(e)})
        except Exception:
            pass
