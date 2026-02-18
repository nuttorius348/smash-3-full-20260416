"""Dynamic camera that tracks all active fighters."""

from __future__ import annotations
from typing import List, TYPE_CHECKING

import pygame

from settings import SCREEN_WIDTH, SCREEN_HEIGHT

if TYPE_CHECKING:
    from entities.fighter import Fighter
    from stages.stage import Stage


class Camera:
    """Smoothly follows the midpoint of all fighters with dynamic zoom."""

    PADDING = 200       # extra pixels around fighters
    MIN_ZOOM = 0.35
    MAX_ZOOM = 1.0
    LERP_SPEED = 4.0    # how fast camera catches up (per second)

    def __init__(self):
        self.x: float = 0.0
        self.y: float = 0.0
        self.zoom: float = 1.0
        self._target_x: float = 0.0
        self._target_y: float = 0.0
        self._target_zoom: float = 1.0

    # ------------------------------------------------------------------
    def update(self, fighters: List[Fighter], stage: Stage, dt: float) -> None:
        alive = [f for f in fighters if f.stocks > 0]
        if not alive:
            return

        # Bounding box of all fighters
        min_x = min(f.x for f in alive)
        max_x = max(f.x + f.width for f in alive)
        min_y = min(f.y for f in alive)
        max_y = max(f.y + f.height for f in alive)

        # Target center
        self._target_x = (min_x + max_x) / 2
        self._target_y = (min_y + max_y) / 2

        # Zoom to fit all fighters
        span_x = (max_x - min_x) + self.PADDING * 2
        span_y = (max_y - min_y) + self.PADDING * 2
        zoom_x = SCREEN_WIDTH / max(span_x, 1)
        zoom_y = SCREEN_HEIGHT / max(span_y, 1)
        self._target_zoom = max(self.MIN_ZOOM, min(self.MAX_ZOOM, min(zoom_x, zoom_y)))

        # Lerp towards target
        t = min(1.0, self.LERP_SPEED * dt)
        self.x += (self._target_x - self.x) * t
        self.y += (self._target_y - self.y) * t
        self.zoom += (self._target_zoom - self.zoom) * t

    # ------------------------------------------------------------------
    def world_to_screen(self, wx: float, wy: float) -> tuple[float, float]:
        """Convert world coordinates to screen coordinates."""
        sx = (wx - self.x) * self.zoom + SCREEN_WIDTH / 2
        sy = (wy - self.y) * self.zoom + SCREEN_HEIGHT / 2
        return sx, sy

    def screen_to_world(self, sx: float, sy: float) -> tuple[float, float]:
        wx = (sx - SCREEN_WIDTH / 2) / self.zoom + self.x
        wy = (sy - SCREEN_HEIGHT / 2) / self.zoom + self.y
        return wx, wy

    def apply_surface(self, surface: pygame.Surface, world_x: float, world_y: float,
                      dest: pygame.Surface) -> None:
        """Blit a surface at world coords onto the destination surface."""
        sx, sy = self.world_to_screen(world_x, world_y)
        w = int(surface.get_width() * self.zoom)
        h = int(surface.get_height() * self.zoom)
        if w < 1 or h < 1:
            return
        scaled = pygame.transform.scale(surface, (w, h))
        dest.blit(scaled, (sx, sy))

    def get_visible_rect(self) -> pygame.Rect:
        """Return world-space rect of what's currently visible."""
        half_w = (SCREEN_WIDTH / 2) / self.zoom
        half_h = (SCREEN_HEIGHT / 2) / self.zoom
        return pygame.Rect(
            int(self.x - half_w), int(self.y - half_h),
            int(half_w * 2), int(half_h * 2),
        )
