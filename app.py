"""Local Chat: a small, private chat UI for Ollama-compatible models."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, AsyncIterator

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen2:7b")
DEFAULT_SYSTEM_PROMPT = """You are Local Chat, a helpful, polite, and capable AI assistant.

Follow these principles in every response:
- Answer the user's actual question directly. Lead with the useful result, then add explanation when it helps.
- Be warm, respectful, patient, and natural. Never be condescending or unnecessarily formal.
- Be concise by default, but give enough detail to make the answer genuinely useful.
- Use clear structure, short paragraphs, and lists only when they improve readability.
- For technical work, provide correct, practical examples and explain important assumptions or tradeoffs.
- If a request is ambiguous, make a reasonable assumption and state it briefly. Ask a question only when the missing detail would materially change the answer.
- Never invent facts, sources, actions, files, or results. If you are uncertain, say so clearly and suggest how to verify.
- Remember and use relevant details from earlier messages in the conversation.
- Do not claim to be ChatGPT or to have capabilities you do not have. You are a local AI model running on the user's computer.
- Protect privacy and avoid exposing secrets or personal data.
- Refuse requests that would meaningfully facilitate harm, and offer a safer alternative when possible.

Match the user's language and level of expertise. When the user asks for code, prefer complete runnable code unless they request only an explanation."""

app = FastAPI(title="Local Chat", version="1.0.0")


class Message(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1, max_length=100_000)


class ChatRequest(BaseModel):
    model: str = Field(default=DEFAULT_MODEL, min_length=1, max_length=200)
    messages: list[Message] = Field(min_length=1, max_length=200)
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, gt=0, le=1)


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            response.raise_for_status()
            models = [item["name"] for item in response.json().get("models", [])]
        return {"ok": True, "models": models, "default_model": DEFAULT_MODEL, "default_system_prompt": DEFAULT_SYSTEM_PROMPT}
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        return {"ok": False, "models": [], "default_model": DEFAULT_MODEL, "default_system_prompt": DEFAULT_SYSTEM_PROMPT, "error": str(exc)}


@app.post("/api/chat")
async def chat(body: ChatRequest, request: Request) -> StreamingResponse:
    messages = [message.model_dump() for message in body.messages]
    if not messages or messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": DEFAULT_SYSTEM_PROMPT})

    payload = {
        "model": body.model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": body.temperature, "top_p": body.top_p},
    }

    async def generate() -> AsyncIterator[str]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10)) as client:
                async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as response:
                    if response.status_code >= 400:
                        raw = await response.aread()
                        detail = raw.decode(errors="replace")[:1000]
                        yield json.dumps({"error": detail or f"Ollama returned {response.status_code}"}) + "\n"
                        return
                    async for line in response.aiter_lines():
                        if await request.is_disconnected():
                            return
                        if not line:
                            continue
                        item = json.loads(line)
                        if item.get("error"):
                            yield json.dumps({"error": item["error"]}) + "\n"
                            return
                        content = item.get("message", {}).get("content", "")
                        if content:
                            yield json.dumps({"content": content}) + "\n"
                        if item.get("done"):
                            yield json.dumps({"done": True}) + "\n"
        except httpx.ConnectError:
            yield json.dumps({"error": "Cannot connect to Ollama. Start it, then try again."}) + "\n"
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            yield json.dumps({"error": f"Model request failed: {exc}"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/{path:path}")
async def static_files(path: str) -> FileResponse:
    candidate = (ROOT / "static" / path).resolve()
    static_root = (ROOT / "static").resolve()
    if static_root not in candidate.parents or not candidate.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(candidate)
