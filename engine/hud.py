"""Heads-up display — damage %, stocks, ultimate meter."""

from __future__ import annotations
from typing import List, TYPE_CHECKING
import math

import pygame

from settings import (
    SCREEN_WIDTH, SCREEN_HEIGHT, COLOR_WHITE, PLAYER_COLORS,
    ULTIMATE_METER_MAX,
)

if TYPE_CHECKING:
    from engine.game import Player


class HUD:
    """Renders player info panels at the bottom of the screen."""

    PANEL_HEIGHT = 100
    PANEL_MARGIN = 10
    METER_HEIGHT = 8
    METER_WIDTH = 120

    def __init__(self):
        self.font_large: pygame.font.Font | None = None
        self.font_small: pygame.font.Font | None = None

    def init_fonts(self) -> None:
        self.font_large = pygame.font.SysFont("Arial", 36, bold=True)
        self.font_small = pygame.font.SysFont("Arial", 16)

    def render(self, screen: pygame.Surface, players: List[Player]) -> None:
        if self.font_large is None:
            self.init_fonts()

        num = len(players)
        panel_w = min(250, (SCREEN_WIDTH - self.PANEL_MARGIN * (num + 1)) // num)
        total_w = panel_w * num + self.PANEL_MARGIN * (num - 1)
        start_x = (SCREEN_WIDTH - total_w) // 2
        panel_y = SCREEN_HEIGHT - self.PANEL_HEIGHT - self.PANEL_MARGIN

        for i, player in enumerate(players):
            x = start_x + i * (panel_w + self.PANEL_MARGIN)
            self._render_panel(screen, player, x, panel_y, panel_w)

    def _render_panel(self, screen: pygame.Surface, player: Player,
                      x: int, y: int, w: int) -> None:
        color = PLAYER_COLORS[player.port % len(PLAYER_COLORS)]

        # Background
        panel_surf = pygame.Surface((w, self.PANEL_HEIGHT), pygame.SRCALPHA)
        panel_surf.fill((0, 0, 0, 160))
        pygame.draw.rect(panel_surf, color, (0, 0, w, self.PANEL_HEIGHT), 2)
        screen.blit(panel_surf, (x, y))

        # Player label
        label = self.font_small.render(
            f"P{player.port + 1} {'AI' if player.is_ai else 'Human'}",
            True, color,
        )
        screen.blit(label, (x + 8, y + 4))

        # Damage %
        fighter = player.fighter
        pct_str = f"{fighter.damage_percent:.0f}%"
        # Color ramp: white → yellow → orange → red
        pct = fighter.damage_percent
        if pct < 50:
            pct_color = COLOR_WHITE
        elif pct < 100:
            t = (pct - 50) / 50
            pct_color = (255, int(255 - 35 * t), int(255 - 215 * t))
        elif pct < 150:
            t = (pct - 100) / 50
            pct_color = (255, int(220 - 70 * t), int(40 - 10 * t))
        else:
            pct_color = (220, 50, 50)

        pct_surf = self.font_large.render(pct_str, True, pct_color)
        screen.blit(pct_surf, (x + w // 2 - pct_surf.get_width() // 2, y + 22))

        # Stocks
        stock_y = y + 65
        stock_radius = 6
        for s in range(fighter.stocks):
            pygame.draw.circle(
                screen, color,
                (x + 20 + s * (stock_radius * 2 + 4), stock_y),
                stock_radius,
            )

        # Ultimate meter bar
        meter_x = x + w - self.METER_WIDTH - 10
        meter_y = y + 65 - self.METER_HEIGHT // 2
        # Background
        pygame.draw.rect(screen, (60, 60, 60),
                         (meter_x, meter_y, self.METER_WIDTH, self.METER_HEIGHT))
        # Fill
        fill_w = int(self.METER_WIDTH * (fighter.ultimate_meter / ULTIMATE_METER_MAX))
        bar_color = (255, 215, 0) if fighter.ultimate_meter >= ULTIMATE_METER_MAX else (100, 180, 255)
        pygame.draw.rect(screen, bar_color,
                         (meter_x, meter_y, fill_w, self.METER_HEIGHT))
        # Border
        pygame.draw.rect(screen, COLOR_WHITE,
                         (meter_x, meter_y, self.METER_WIDTH, self.METER_HEIGHT), 1)

        # "ULT" label when ready or cooldown countdown
        if fighter.ultimate_cooldown > 0:
            secs = int(math.ceil(fighter.ultimate_cooldown))
            ult_label = self.font_small.render(f"ULT CD: {secs}s", True, (255, 200, 100))
            screen.blit(ult_label, (meter_x, meter_y - 16))
        elif fighter.ultimate_meter >= ULTIMATE_METER_MAX:
            ult_label = self.font_small.render("ULT READY", True, (255, 215, 0))
            screen.blit(ult_label, (meter_x, meter_y - 16))
