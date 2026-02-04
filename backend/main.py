"""
FastAPI service for the Intelligent Workflow Automation System.
This module handles speech-to-text, lightweight intent detection,
entity extraction, and text-to-speech feedback.
"""

from __future__ import annotations

import base64
import io
import json
import tempfile
from typing import Any, Dict, Optional

import pyttsx3
import speech_recognition as sr
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Intelligent Workflow Automation System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class IntentRequest(BaseModel):
    """Payload for intent capture requests."""

    mode: str
    text: Optional[str] = None
    audio_base64: Optional[str] = None
    audio_format: Optional[str] = None


class IntentResponse(BaseModel):
    """Structured response returned to the frontend."""

    recognized_text: str
    intent: str
    parameters: Dict[str, Any]
    status: str
    tts_message: str


class TTSRequest(BaseModel):
    """Payload for text-to-speech synthesis."""

    text: str


class TTSResponse(BaseModel):
    """Audio response encoded in base64."""

    audio_base64: str


INTENT_KEYWORDS = {
    "email": ["email", "mail", "inbox", "send"],
    "job": ["job", "apply", "resume", "interview", "role"],
    "travel": ["travel", "trip", "flight", "hotel", "vacation", "destination"],
    "schedule": ["schedule", "meeting", "calendar", "appointment"],
}


def classify_intent(text: str) -> str:
    """Basic keyword-based intent classification."""
    lowered = text.lower()
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return intent
    return "general"


def extract_entities(text: str, intent: str) -> Dict[str, Any]:
    """Simple entity extraction based on intent."""
    lowered = text.lower()
    entities: Dict[str, Any] = {}

    if intent == "travel":
        if "to" in lowered:
            segments = lowered.split("to", maxsplit=1)
            destination = segments[1].strip().split()[0:3]
            if destination:
                entities["destination"] = " ".join(destination)
        if "$" in lowered:
            budget = lowered.split("$", maxsplit=1)[1].split()[0]
            entities["budget"] = f"${budget}"

    if intent == "job":
        for token in ["engineer", "designer", "analyst", "manager", "intern"]:
            if token in lowered:
                entities["job_role"] = token
                break

    if intent == "email":
        if "to" in lowered:
            recipient = lowered.split("to", maxsplit=1)[1].strip().split()[0]
            entities["recipient"] = recipient

    return entities


def speech_to_text(audio_base64: str, audio_format: str) -> str:
    """
    Convert base64 audio into text using SpeechRecognition.
    Returns a placeholder text when speech processing fails.
    """
    recognizer = sr.Recognizer()

    try:
        audio_bytes = base64.b64decode(audio_base64)
        audio_file = io.BytesIO(audio_bytes)
        with sr.AudioFile(audio_file) as source:
            audio_data = recognizer.record(source)
        return recognizer.recognize_google(audio_data)
    except Exception:
        return "Speech input received, but transcription is unavailable."


def build_status(intent: str) -> str:
    """Mock workflow status based on intent."""
    if intent in {"email", "schedule"}:
        return "Triggered"
    if intent == "travel":
        return "Waiting"
    return "Completed"


def build_tts_message(intent: str, status: str) -> str:
    """Craft a concise response for text-to-speech."""
    return f"{intent.title()} workflow {status.lower()}. Your request is queued."


@app.post("/api/intent", response_model=IntentResponse)
def capture_intent(payload: IntentRequest) -> IntentResponse:
    """Capture user intent from text or speech."""
    if payload.mode not in {"text", "speech"}:
        raise HTTPException(status_code=400, detail="Invalid mode provided.")

    recognized_text = ""

    if payload.mode == "text":
        if not payload.text:
            raise HTTPException(status_code=400, detail="Text is required.")
        recognized_text = payload.text
    else:
        if not payload.audio_base64 or not payload.audio_format:
            raise HTTPException(status_code=400, detail="Audio payload required.")
        recognized_text = speech_to_text(payload.audio_base64, payload.audio_format)

    intent = classify_intent(recognized_text)
    parameters = extract_entities(recognized_text, intent)
    status = build_status(intent)
    tts_message = build_tts_message(intent, status)

    return IntentResponse(
        recognized_text=recognized_text,
        intent=intent,
        parameters=parameters,
        status=status,
        tts_message=tts_message,
    )


@app.post("/api/tts", response_model=TTSResponse)
def synthesize_speech(payload: TTSRequest) -> TTSResponse:
    """Generate speech audio from text using pyttsx3."""
    engine = pyttsx3.init()

    with tempfile.NamedTemporaryFile(suffix=".wav") as temp_file:
        engine.save_to_file(payload.text, temp_file.name)
        engine.runAndWait()
        temp_file.seek(0)
        audio_bytes = temp_file.read()

    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    return TTSResponse(audio_base64=audio_base64)


@app.get("/api/health")
def healthcheck() -> Dict[str, Any]:
    """Simple health check endpoint."""
    return {"status": "ok"}
