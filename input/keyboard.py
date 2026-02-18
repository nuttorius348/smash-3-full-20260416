"""Keyboard controller — two preset layouts for local multiplayer."""

from __future__ import annotations
from typing import Dict, List

import pygame

from input.controller import Controller, InputState


# Default key layouts
LAYOUT_WASD = {
    "left": pygame.K_a,
    "right": pygame.K_d,
    "up": pygame.K_w,
    "down": pygame.K_s,
    "jump": pygame.K_w,
    "attack": pygame.K_f,
    "special": pygame.K_g,
    "shield": pygame.K_h,
    "grab": pygame.K_t,
}

LAYOUT_ARROWS = {
    "left": pygame.K_LEFT,
    "right": pygame.K_RIGHT,
    "up": pygame.K_UP,
    "down": pygame.K_DOWN,
    "jump": pygame.K_UP,
    "attack": pygame.K_KP1,
    "special": pygame.K_KP2,
    "shield": pygame.K_KP3,
    "grab": pygame.K_KP0,
}

LAYOUT_IJKL = {
    "left": pygame.K_j,
    "right": pygame.K_l,
    "up": pygame.K_i,
    "down": pygame.K_k,
    "jump": pygame.K_i,
    "attack": pygame.K_o,
    "special": pygame.K_p,
    "shield": pygame.K_SEMICOLON,
    "grab": pygame.K_u,
}

LAYOUT_NUMPAD = {
    "left": pygame.K_KP4,
    "right": pygame.K_KP6,
    "up": pygame.K_KP8,
    "down": pygame.K_KP5,
    "jump": pygame.K_KP8,
    "attack": pygame.K_KP7,
    "special": pygame.K_KP9,
    "shield": pygame.K_KP_PLUS,
    "grab": pygame.K_KP_MINUS,
}

KEYBOARD_LAYOUTS = [LAYOUT_WASD, LAYOUT_ARROWS, LAYOUT_IJKL, LAYOUT_NUMPAD]


class KeyboardController(Controller):
    """Keyboard-based controller using a key mapping dict."""

    def __init__(self, layout: Dict[str, int] | None = None, layout_index: int = 0):
        if layout is not None:
            self.keys = layout
        else:
            self.keys = KEYBOARD_LAYOUTS[layout_index % len(KEYBOARD_LAYOUTS)]

        # Track just-pressed for button actions
        self._prev_keys: Dict[str, bool] = {}

    def poll(self, events: List) -> InputState:
        pressed = pygame.key.get_pressed()
        inp = InputState()

        # Movement axes
        if pressed[self.keys["left"]]:
            inp.move_x -= 1.0
        if pressed[self.keys["right"]]:
            inp.move_x += 1.0
        if pressed[self.keys["up"]]:
            inp.move_y -= 1.0
        if pressed[self.keys["down"]]:
            inp.move_y += 1.0

        # Just-pressed detection for action buttons
        for action in ("jump", "attack", "special", "grab"):
            is_down = pressed[self.keys[action]]
            was_down = self._prev_keys.get(action, False)
            setattr(inp, action, is_down and not was_down)
            self._prev_keys[action] = is_down

        # Shield is held, not just-pressed
        inp.shield = pressed[self.keys["shield"]]

        return inp
