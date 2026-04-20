"""AI controller — difficulty 1-9 with scaling reaction time and decision quality."""

from __future__ import annotations
import math
import random
from typing import List, Optional, TYPE_CHECKING

from input.controller import Controller, InputState

if TYPE_CHECKING:
    from entities.fighter import Fighter
    from stages.stage import Stage


class AIController(Controller):
    """CPU opponent with configurable difficulty (1=novice, 9=frame-perfect)."""

    # Difficulty scaling tables
    REACTION_FRAMES = {
        1: 30, 2: 24, 3: 18, 4: 14, 5: 12, 6: 8, 7: 5, 8: 3, 9: 1,
    }
    INPUT_ACCURACY = {
        1: 0.40, 2: 0.50, 3: 0.60, 4: 0.68, 5: 0.75,
        6: 0.82, 7: 0.90, 8: 0.95, 9: 0.99,
    }
    AGGRESSION = {
        1: 0.2, 2: 0.3, 3: 0.4, 4: 0.5, 5: 0.55,
        6: 0.65, 7: 0.75, 8: 0.85, 9: 0.95,
    }

    def __init__(self, port: int, difficulty: int = 5):
        self.port = port
        self.difficulty = max(1, min(9, difficulty))
        self.reaction_frames = self.REACTION_FRAMES[self.difficulty]
        self.accuracy = self.INPUT_ACCURACY[self.difficulty]
        self.aggression = self.AGGRESSION[self.difficulty]

        self._target: Optional[Fighter] = None
        self._decision_cooldown: int = 0
        self._current_plan: str = "approach"  # approach, attack, recover, retreat
        self._plan_frames: int = 0

        # Internal state
        self._fighters: List[Fighter] = []
        self._self_fighter: Optional[Fighter] = None
        self._stage: Optional[Stage] = None

    def set_context(self, fighters: List[Fighter], stage: Stage) -> None:
        """Called each frame by the game to give AI world context."""
        self._fighters = fighters
        self._stage = stage
        self._self_fighter = None
        for f in fighters:
            if f.port == self.port:
                self._self_fighter = f
                break

    def poll(self, events: list) -> InputState:
        inp = InputState()
        me = self._self_fighter
        if me is None or not me.is_alive:
            return inp

        # --- Pick target ---
        self._pick_target()
        if self._target is None:
            return inp

        # --- Decision cooldown (simulates reaction time) ---
        self._decision_cooldown -= 1
        if self._decision_cooldown <= 0:
            self._make_decision(me)
            self._decision_cooldown = self.reaction_frames + random.randint(0, 5)

        # --- Execute current plan ---
        self._execute_plan(me, inp)

        # --- Accuracy filter: randomly drop inputs ---
        if random.random() > self.accuracy:
            inp.attack = False
            inp.special = False

        return inp

    # ------------------------------------------------------------------
    def _pick_target(self) -> None:
        me = self._self_fighter
        if me is None:
            return
        alive = [f for f in self._fighters if self._is_enemy(me, f) and f.is_alive]
        if not alive:
            self._target = None
            return

        if self.difficulty >= 7:
            # Target highest damage (closest to KO)
            self._target = max(alive, key=lambda f: f.damage_percent)
        elif self.difficulty >= 4:
            # Target nearest threat
            self._target = min(alive, key=lambda f: abs(f.x - me.x))
        else:
            # Random target, stick to it for a while
            if self._target is None or not self._target.is_alive or random.random() < 0.02:
                self._target = random.choice(alive)

    def _is_enemy(self, me: Fighter, other: Fighter) -> bool:
        if other.port == self.port:
            return False

        my_team = getattr(me, "team", -1)
        other_team = getattr(other, "team", -1)

        # Team IDs are assigned in team mode; if both have a team,
        # only opposite-team fighters are valid targets.
        if isinstance(my_team, int) and isinstance(other_team, int) and my_team >= 0 and other_team >= 0:
            return my_team != other_team
        return True

    # ------------------------------------------------------------------
    def _make_decision(self, me: Fighter) -> None:
        tgt = self._target
        if tgt is None:
            self._current_plan = "idle"
            return

        dx = tgt.x - me.x
        dy = tgt.y - me.y
        dist = math.hypot(dx, dy)

        # Recovery priority: if off-stage, recover
        if self._stage and not me.grounded:
            bz = self._stage.blast_zone
            if me.y > bz.bottom - 200 or me.x < bz.left + 100 or me.x > bz.right - 100:
                self._current_plan = "recover"
                self._plan_frames = 30
                return

        # If high damage, sometimes retreat
        if me.damage_percent > 120 and random.random() > self.aggression:
            self._current_plan = "retreat"
            self._plan_frames = random.randint(20, 60)
            return

        # In range? Attack
        if dist < 150:
            if random.random() < self.aggression:
                self._current_plan = "attack"
                self._plan_frames = random.randint(5, 15)
            else:
                self._current_plan = "retreat"
                self._plan_frames = random.randint(10, 30)
            return

        # Otherwise, approach
        self._current_plan = "approach"
        self._plan_frames = random.randint(10, 40)

    # ------------------------------------------------------------------
    def _execute_plan(self, me: Fighter, inp: InputState) -> None:
        tgt = self._target
        if tgt is None:
            return

        dx = tgt.x - me.x
        dy = tgt.y - me.y
        dist = math.hypot(dx, dy)

        self._plan_frames -= 1

        if self._current_plan == "approach":
            inp.move_x = 1.0 if dx > 0 else -1.0
            # Jump if target is above
            if dy < -80 and me.grounded:
                inp.jump = True
            # Attack when in range
            if dist < 120:
                self._current_plan = "attack"
                self._plan_frames = 8

        elif self._current_plan == "attack":
            # Face target
            inp.move_x = 0.3 if dx > 0 else -0.3

            if dist < 80:
                # Close range: tilt attacks
                if abs(dy) > 40:
                    inp.move_y = -1.0 if dy < 0 else 1.0
                else:
                    inp.move_x = 1.0 if dx > 0 else -1.0
                inp.attack = True
            elif dist < 200:
                # Medium range: specials
                if random.random() < 0.5:
                    inp.special = True
                else:
                    inp.attack = True
                inp.move_x = 1.0 if dx > 0 else -1.0

            if self._plan_frames <= 0:
                self._current_plan = "approach"

        elif self._current_plan == "retreat":
            inp.move_x = -1.0 if dx > 0 else 1.0
            if self._plan_frames <= 0:
                self._current_plan = "approach"

        elif self._current_plan == "recover":
            # Move toward stage center
            if self._stage:
                center_x = self._stage.blast_zone.centerx
                inp.move_x = 1.0 if me.x < center_x else -1.0
            if me.vy > 0 or me.y > (self._stage.blast_zone.bottom - 300 if self._stage else 400):
                inp.jump = True
                # Use up-special at high difficulty if no jumps
                if me.jumps_remaining <= 0 and self.difficulty >= 3:
                    inp.special = True
                    inp.move_y = -1.0

        # Shield at high difficulty when being attacked nearby
        if self.difficulty >= 6 and dist < 100 and not me.is_airborne:
            if random.random() < 0.15 * (self.difficulty / 9):
                inp.shield = True
                inp.attack = False
                inp.special = False
