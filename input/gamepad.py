"""Gamepad / joystick controller using SDL joystick API."""

from __future__ import annotations
from typing import List

import pygame

from input.controller import Controller, InputState
from settings import DEADZONE


class GamepadController(Controller):
    """Maps an SDL joystick/gamepad to InputState."""

    # Button mappings (Xbox-style defaults)
    BTN_JUMP = 0        # A
    BTN_ATTACK = 2      # X
    BTN_SPECIAL = 3     # Y
    BTN_SHIELD = 5      # RB
    BTN_GRAB = 4        # LB

    def __init__(self, joystick_index: int = 0):
        self._joy: pygame.joystick.Joystick | None = None
        self._joy_index = joystick_index
        self._prev_buttons: dict[int, bool] = {}
        self._init_joystick()

    def _init_joystick(self) -> None:
        if pygame.joystick.get_count() > self._joy_index:
            self._joy = pygame.joystick.Joystick(self._joy_index)
            self._joy.init()

    def poll(self, events: List) -> InputState:
        inp = InputState()

        if self._joy is None:
            self._init_joystick()
            if self._joy is None:
                return inp

        # Axes
        lx = self._joy.get_axis(0)  # left stick X
        ly = self._joy.get_axis(1)  # left stick Y
        if abs(lx) < DEADZONE:
            lx = 0.0
        if abs(ly) < DEADZONE:
            ly = 0.0
        inp.move_x = lx
        inp.move_y = ly

        # Buttons — just-pressed
        for btn, attr in (
            (self.BTN_JUMP, "jump"),
            (self.BTN_ATTACK, "attack"),
            (self.BTN_SPECIAL, "special"),
            (self.BTN_GRAB, "grab"),
        ):
            try:
                is_down = self._joy.get_button(btn)
            except Exception:
                is_down = False
            was_down = self._prev_buttons.get(btn, False)
            setattr(inp, attr, is_down and not was_down)
            self._prev_buttons[btn] = is_down

        # Shield — held
        try:
            inp.shield = self._joy.get_button(self.BTN_SHIELD)
        except Exception:
            inp.shield = False

        return inp
