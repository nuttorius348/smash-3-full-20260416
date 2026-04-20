"""Claude API helper for AI controller decisions."""

from __future__ import annotations

import json
import os
from urllib import request
from typing import Any, Dict

try:
    import anthropic
except Exception:  # pragma: no cover
    anthropic = None


DEFAULT_ACTION: Dict[str, Any] = {
    "move_x": 0,
    "move_y": 0,
    "jump": False,
    "attack": False,
    "special": False,
    "shield": False,
    "grab": False,
}


def _extract_json(text: str) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return dict(DEFAULT_ACTION)

    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:].strip()

    if "{" in text and "}" in text:
        start = text.find("{")
        end = text.rfind("}")
        text = text[start:end + 1]

    try:
        payload = json.loads(text)
    except Exception:
        return dict(DEFAULT_ACTION)

    if not isinstance(payload, dict):
        return dict(DEFAULT_ACTION)
    return payload


def get_claude_action(
    game_state: Dict[str, Any],
    *,
    model: str = "claude-opus-4-6",
    api_key: str | None = None,
) -> Dict[str, Any]:
    """Send game state to Claude and return action dict.

    Returns DEFAULT_ACTION when Anthropic SDK or API key is unavailable,
    or when response parsing fails.
    """
    if anthropic is None:
        return dict(DEFAULT_ACTION)

    key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        return dict(DEFAULT_ACTION)

    prompt = f"""You are playing a smash-style platform fighter game.

Game state:
- Your position: {game_state.get('ai_pos')}
- Enemy position: {game_state.get('enemy_pos')}
- Your health/damage: {game_state.get('ai_damage')}%
- Enemy health/damage: {game_state.get('enemy_damage')}%
- Your stocks left: {game_state.get('ai_stocks')}
- Enemy stocks left: {game_state.get('enemy_stocks')}
- Stage bounds: {game_state.get('stage_bounds')}
- Is on ground: {game_state.get('ai_grounded')}
- Is enemy airborne: {game_state.get('enemy_airborne')}

Respond ONLY with valid JSON using this shape:
{{"move_x": -1|0|1, "move_y": -1|0|1, "jump": true|false, "attack": true|false, "special": true|false, "shield": true|false, "grab": true|false}}

Be aggressive when enemy damage is high. Survive when your damage is high."""

    try:
        client = anthropic.Anthropic(api_key=key)
        message = client.messages.create(
            model=model,
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}],
        )
        text = ""
        if getattr(message, "content", None):
            first = message.content[0]
            text = getattr(first, "text", "") or ""
        return _extract_json(text)
    except Exception:
        return dict(DEFAULT_ACTION)


def get_ollama_action(
    game_state: Dict[str, Any],
    *,
    model: str = "llama3",
    base_url: str = "http://127.0.0.1:11434",
) -> Dict[str, Any]:
    """Send game state to a local Ollama model and return action dict."""
    prompt = f"""You are playing a smash-style platform fighter game.

Game state:
- Your position: {game_state.get('ai_pos')}
- Enemy position: {game_state.get('enemy_pos')}
- Your health/damage: {game_state.get('ai_damage')}%
- Enemy health/damage: {game_state.get('enemy_damage')}%
- Your stocks left: {game_state.get('ai_stocks')}
- Enemy stocks left: {game_state.get('enemy_stocks')}
- Stage bounds: {game_state.get('stage_bounds')}
- Is on ground: {game_state.get('ai_grounded')}
- Is enemy airborne: {game_state.get('enemy_airborne')}

Respond ONLY with valid JSON using this shape:
{{"move_x": -1|0|1, "move_y": -1|0|1, "jump": true|false, "attack": true|false, "special": true|false, "shield": true|false, "grab": true|false}}

Be aggressive when enemy damage is high. Survive when your damage is high."""

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.3,
        },
    }
    body = json.dumps(payload).encode("utf-8")
    endpoint = f"{base_url.rstrip('/')}/api/generate"

    try:
        req = request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=2.0) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        data = json.loads(raw)
        text = data.get("response", "") if isinstance(data, dict) else ""
        return _extract_json(text)
    except Exception:
        return dict(DEFAULT_ACTION)
