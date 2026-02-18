"""Stage and Platform definitions."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

import pygame


@dataclass
class Platform:
    """A rectangular collision surface."""
    rect: pygame.Rect
    is_passthrough: bool = True   # can drop through / land from above only

    def render(self, screen: pygame.Surface, camera) -> None:
        sx, sy = camera.world_to_screen(self.rect.x, self.rect.y)
        w = int(self.rect.width * camera.zoom)
        h = int(self.rect.height * camera.zoom)

        color = (100, 140, 100) if self.is_passthrough else (80, 80, 90)
        pygame.draw.rect(screen, color, (sx, sy, w, h))
        # Top edge highlight
        edge_color = (160, 200, 160) if self.is_passthrough else (140, 140, 160)
        pygame.draw.line(screen, edge_color, (sx, sy), (sx + w, sy), 2)


class Stage:
    """A playable stage with platforms, blast zone, spawn points, and background."""

    def __init__(
        self,
        name: str,
        platforms: List[Platform],
        blast_zone: pygame.Rect,
        spawn_points: List[Tuple[float, float]],
        bg_color: Tuple[int, int, int] = (30, 30, 50),
        bg_image_path: Optional[str] = None,
    ):
        self.name = name
        self.platforms = platforms
        self.blast_zone = blast_zone
        self.spawn_points = spawn_points  # up to 4
        self.bg_color = bg_color
        self.bg_image: Optional[pygame.Surface] = None
        self._bg_path = bg_image_path

    def load_assets(self) -> None:
        if self._bg_path:
            try:
                self.bg_image = pygame.image.load(self._bg_path).convert()
            except (pygame.error, FileNotFoundError):
                pass

    def render_background(self, screen: pygame.Surface, camera) -> None:
        screen.fill(self.bg_color)
        if self.bg_image:
            # Parallax scroll
            vis = camera.get_visible_rect()
            # Scale bg to fill visible area
            bw = int(self.bg_image.get_width() * camera.zoom)
            bh = int(self.bg_image.get_height() * camera.zoom)
            bg_scaled = pygame.transform.scale(self.bg_image, (max(1, bw), max(1, bh)))
            sx, sy = camera.world_to_screen(
                vis.centerx - self.bg_image.get_width() / 2,
                vis.centery - self.bg_image.get_height() / 2,
            )
            screen.blit(bg_scaled, (sx * 0.3, sy * 0.3))  # Parallax factor

    def render_platforms(self, screen: pygame.Surface, camera) -> None:
        for plat in self.platforms:
            plat.render(screen, camera)

    def get_spawn(self, index: int) -> Tuple[float, float]:
        if index < len(self.spawn_points):
            return self.spawn_points[index]
        # Fallback: spread across main platform
        return (200 + index * 200, 0)
