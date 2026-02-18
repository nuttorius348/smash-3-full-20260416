"""Pre-built stage configurations."""

from __future__ import annotations

import pygame
from stages.stage import Stage, Platform


def create_battlefield() -> Stage:
    """Classic Battlefield-style: one main platform + three floating ones."""
    main = Platform(
        rect=pygame.Rect(200, 600, 900, 40),
        is_passthrough=False,
    )
    left_plat = Platform(
        rect=pygame.Rect(280, 450, 180, 15),
        is_passthrough=True,
    )
    center_plat = Platform(
        rect=pygame.Rect(560, 360, 180, 15),
        is_passthrough=True,
    )
    right_plat = Platform(
        rect=pygame.Rect(840, 450, 180, 15),
        is_passthrough=True,
    )

    blast_zone = pygame.Rect(-400, -500, 2100, 1600)

    spawns = [
        (350, 500), (600, 500), (850, 500), (500, 260),
    ]

    return Stage(
        name="Battlefield",
        platforms=[main, left_plat, center_plat, right_plat],
        blast_zone=blast_zone,
        spawn_points=spawns,
        bg_color=(25, 25, 50),
    )


def create_final_destination() -> Stage:
    """Flat stage — one large solid platform, no others."""
    main = Platform(
        rect=pygame.Rect(150, 600, 1000, 40),
        is_passthrough=False,
    )

    blast_zone = pygame.Rect(-400, -500, 2100, 1600)

    spawns = [
        (300, 500), (550, 500), (800, 500), (1050, 500),
    ]

    return Stage(
        name="Final Destination",
        platforms=[main],
        blast_zone=blast_zone,
        spawn_points=spawns,
        bg_color=(15, 10, 35),
    )


def create_wide_arena() -> Stage:
    """Extra-large map with many platforms for 4-player chaos."""
    platforms = [
        # Ground level
        Platform(rect=pygame.Rect(0, 700, 600, 40), is_passthrough=False),
        Platform(rect=pygame.Rect(800, 700, 600, 40), is_passthrough=False),
        Platform(rect=pygame.Rect(1600, 700, 600, 40), is_passthrough=False),

        # Bridge connecting ground
        Platform(rect=pygame.Rect(550, 650, 300, 15), is_passthrough=True),
        Platform(rect=pygame.Rect(1350, 650, 300, 15), is_passthrough=True),

        # Mid level
        Platform(rect=pygame.Rect(200, 500, 200, 15), is_passthrough=True),
        Platform(rect=pygame.Rect(700, 480, 250, 15), is_passthrough=True),
        Platform(rect=pygame.Rect(1250, 480, 250, 15), is_passthrough=True),
        Platform(rect=pygame.Rect(1800, 500, 200, 15), is_passthrough=True),

        # High level
        Platform(rect=pygame.Rect(450, 320, 180, 15), is_passthrough=True),
        Platform(rect=pygame.Rect(1000, 280, 200, 15), is_passthrough=True),
        Platform(rect=pygame.Rect(1550, 320, 180, 15), is_passthrough=True),
    ]

    blast_zone = pygame.Rect(-500, -600, 3200, 2000)

    spawns = [
        (200, 600), (900, 600), (1700, 600), (1100, 180),
    ]

    return Stage(
        name="Wide Arena",
        platforms=platforms,
        blast_zone=blast_zone,
        spawn_points=spawns,
        bg_color=(20, 30, 20),
    )


STAGE_LIBRARY = {
    "battlefield": create_battlefield,
    "final_destination": create_final_destination,
    "wide_arena": create_wide_arena,
}


def get_stage(name: str) -> Stage:
    factory = STAGE_LIBRARY.get(name, create_battlefield)
    return factory()
