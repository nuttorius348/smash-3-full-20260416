"""LLM-powered AI controller (Claude API or local Ollama) with fallback."""

from __future__ import annotations

from typing import List, Optional, TYPE_CHECKING

from engine.ai_claude import get_claude_action, get_ollama_action
from input.ai_controller import AIController
from input.controller import Controller, InputState

if TYPE_CHECKING:
    from entities.fighter import Fighter
    from stages.stage import Stage


class ClaudeAIController(Controller):
    """Controller that queries an LLM periodically for decisions."""

    def __init__(
        self,
        port: int,
        difficulty: int = 5,
        model: str = "claude-opus-4-6",
        provider: str = "claude",
        base_url: str = "http://127.0.0.1:11434",
    ):
        self.port = port
        self.model = model
        self.provider = provider
        self.base_url = base_url
        self._fighters: List[Fighter] = []
        self._self_fighter: Optional[Fighter] = None
        self._stage: Optional[Stage] = None

        # Keep Claude calls sparse for latency and API-cost control.
        self._decision_interval = 10
        self._frame_counter = 0
        self._last_payload = {
            "move_x": 0,
            "move_y": 0,
            "jump": False,
            "attack": False,
            "special": False,
            "shield": False,
            "grab": False,
        }

        # Fallback stays playable when key/API is unavailable.
        self._fallback = AIController(port=port, difficulty=difficulty)

    def set_context(self, fighters: List[Fighter], stage: Stage) -> None:
        self._fighters = fighters
        self._stage = stage
        self._self_fighter = None
        for f in fighters:
            if f.port == self.port:
                self._self_fighter = f
                break

        self._fallback.set_context(fighters, stage)

    def poll(self, events: list) -> InputState:
        me = self._self_fighter
        if me is None or not me.is_alive:
            return InputState()

        self._frame_counter += 1
        if self._frame_counter % self._decision_interval == 0:
            game_state = self._build_game_state(me)
            if self.provider == "ollama":
                payload = get_ollama_action(
                    game_state,
                    model=self.model,
                    base_url=self.base_url,
                )
            else:
                payload = get_claude_action(game_state, model=self.model)
            if isinstance(payload, dict):
                self._last_payload = payload

        inp = self._to_input_state(self._last_payload)

        # If Claude returns a full neutral action repeatedly, use fallback AI.
        if (
            inp.move_x == 0
            and inp.move_y == 0
            and not inp.jump
            and not inp.attack
            and not inp.special
            and not inp.shield
            and not inp.grab
        ):
            return self._fallback.poll(events)

        return inp

    def _build_game_state(self, me: Fighter) -> dict:
        enemy = self._pick_enemy(me)
        bz = self._stage.blast_zone if self._stage else None

        return {
            "ai_pos": {
                "x": round(me.center_x, 1),
                "y": round(me.center_y, 1),
                "vx": round(me.vx, 2),
                "vy": round(me.vy, 2),
            },
            "enemy_pos": {
                "x": round(enemy.center_x, 1) if enemy else None,
                "y": round(enemy.center_y, 1) if enemy else None,
                "vx": round(enemy.vx, 2) if enemy else None,
                "vy": round(enemy.vy, 2) if enemy else None,
            },
            "ai_damage": round(me.damage_percent, 1),
            "enemy_damage": round(enemy.damage_percent, 1) if enemy else 0,
            "ai_stocks": me.stocks,
            "enemy_stocks": enemy.stocks if enemy else 0,
            "ai_grounded": bool(me.grounded),
            "enemy_airborne": bool(enemy.is_airborne) if enemy else False,
            "stage_bounds": {
                "left": bz.left if bz else None,
                "right": bz.right if bz else None,
                "top": bz.top if bz else None,
                "bottom": bz.bottom if bz else None,
            },
        }

    def _pick_enemy(self, me: Fighter) -> Optional[Fighter]:
        enemies = [f for f in self._fighters if self._is_enemy(me, f) and f.is_alive]
        if not enemies:
            return None
        return min(enemies, key=lambda f: abs(f.center_x - me.center_x) + abs(f.center_y - me.center_y))

    def _is_enemy(self, me: Fighter, other: Fighter) -> bool:
        if other.port == self.port:
            return False

        my_team = getattr(me, "team", -1)
        other_team = getattr(other, "team", -1)
        if isinstance(my_team, int) and isinstance(other_team, int) and my_team >= 0 and other_team >= 0:
            return my_team != other_team
        return True

    @staticmethod
    def _to_input_state(payload: dict) -> InputState:
        inp = InputState()

        move_x = payload.get("move_x", 0)
        move_y = payload.get("move_y", 0)
        try:
            inp.move_x = float(max(-1, min(1, int(move_x))))
        except Exception:
            inp.move_x = 0.0
        try:
            inp.move_y = float(max(-1, min(1, int(move_y))))
        except Exception:
            inp.move_y = 0.0

        inp.jump = bool(payload.get("jump", False))
        inp.attack = bool(payload.get("attack", False))
        inp.special = bool(payload.get("special", False))
        inp.shield = bool(payload.get("shield", False))
        inp.grab = bool(payload.get("grab", False))
        return inp
