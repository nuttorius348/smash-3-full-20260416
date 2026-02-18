"""Hitbox / Hurtbox — separated damage and vulnerability regions.

Design
------
* **Hurtbox** — the fighter's vulnerable area. Always exists while alive.
  Supports per-state shrink/grow and crouching offsets.
* **Hitbox** — a transient damage region spawned by attacks. Tracks which
  ports it has already hit so each swing connects at most once per target.
* **HitboxGroup** — holds ≥1 hitboxes for a single attack, so a move can
  have a sweetspot / sourspot or a multi-part swing.
* **CollisionHelper** — pure-function AABB and circle-vs-rect tests used by
  both hitbox and projectile collision.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import List, Set, Tuple, TYPE_CHECKING

import pygame

if TYPE_CHECKING:
    from entities.fighter import Fighter


# ======================================================================
#  Shape helpers
# ======================================================================
class HitboxShape(Enum):
    RECT = auto()
    CIRCLE = auto()


# ======================================================================
#  Collision utilities
# ======================================================================
class CollisionHelper:
    """Pure-function static collision tests."""

    @staticmethod
    def rect_vs_rect(a: pygame.Rect, b: pygame.Rect) -> bool:
        return a.colliderect(b)

    @staticmethod
    def circle_vs_rect(cx: float, cy: float, r: float,
                       rect: pygame.Rect) -> bool:
        """Test circle (cx, cy, r) against axis-aligned rect."""
        # Closest point on rect to circle center
        closest_x = max(rect.left, min(cx, rect.right))
        closest_y = max(rect.top, min(cy, rect.bottom))
        dx = cx - closest_x
        dy = cy - closest_y
        return (dx * dx + dy * dy) <= r * r

    @staticmethod
    def rect_vs_platforms(rect: pygame.Rect, platforms) -> bool:
        """Return True if *rect* overlaps any solid (non-passthrough) platform."""
        for plat in platforms:
            if not plat.is_passthrough and rect.colliderect(plat.rect):
                return True
        return False


# ======================================================================
#  Hurtbox
# ======================================================================
@dataclass
class HurtboxProfile:
    """Per-state size overrides (relative to FighterData width/height)."""
    width_scale: float = 1.0
    height_scale: float = 1.0
    offset_y: float = 0.0           # shift down (+) for crouch, up (-) for jump


# Default profiles for common states
DEFAULT_HURTBOX_PROFILES = {
    "idle":       HurtboxProfile(1.0,  1.0,    0),
    "walking":    HurtboxProfile(1.0,  1.0,    0),
    "running":    HurtboxProfile(1.0,  0.9,    4),
    "crouching":  HurtboxProfile(1.1,  0.65,  14),
    "airborne":   HurtboxProfile(0.9,  0.95,   0),
    "hitstun":    HurtboxProfile(1.0,  1.0,    0),
    "shielding":  HurtboxProfile(0.85, 0.85,   4),
}


class Hurtbox:
    """A fighter's vulnerable collision area.

    The hurtbox is always centred on the fighter's position and sized
    according to the current state profile.
    """

    def __init__(self, fighter: Fighter):
        self.fighter = fighter
        self.profiles = dict(DEFAULT_HURTBOX_PROFILES)

    def get_rect(self, state_name: str | None = None) -> pygame.Rect:
        """Return world-space hurtbox rect for the fighters current state."""
        key = state_name or self.fighter.state.name.lower()
        prof = self.profiles.get(key, HurtboxProfile())
        w = int(self.fighter.data.width * prof.width_scale)
        h = int(self.fighter.data.height * prof.height_scale)
        x = int(self.fighter.x + (self.fighter.data.width - w) / 2)
        y = int(self.fighter.y + (self.fighter.data.height - h) + prof.offset_y)
        return pygame.Rect(x, y, w, h)


# ======================================================================
#  Hitbox
# ======================================================================
class Hitbox:
    """A transient damage region that lives for a set number of active frames.

    Attributes
    ----------
    shape : HitboxShape
        RECT or CIRCLE.  When CIRCLE, *width* is treated as diameter and
        *height* is ignored.
    priority : int
        Higher-priority hitbox wins a hitbox-vs-hitbox trade.
    """

    def __init__(
        self,
        owner_port: int,
        offset_x: float,
        offset_y: float,
        width: float,
        height: float,
        damage: float,
        base_knockback: float,
        kb_scaling: float,
        angle: float,
        active_frames: int,
        shape: HitboxShape = HitboxShape.RECT,
        priority: int = 0,
    ):
        self.owner_port = owner_port
        self.offset_x = offset_x
        self.offset_y = offset_y
        self.width = width
        self.height = height
        self.damage = damage
        self.base_knockback = base_knockback
        self.kb_scaling = kb_scaling
        self.angle = angle              # degrees: 0=right, 90=up, 270=down
        self.shape = shape
        self.priority = priority

        # Active frames bookkeeping
        self.total_active_frames = active_frames
        self.frames_remaining = active_frames
        self.already_hit: Set[int] = set()

    # ----- query ---
    def is_active(self) -> bool:
        return self.frames_remaining > 0

    @property
    def elapsed_frames(self) -> int:
        return self.total_active_frames - self.frames_remaining

    def tick(self) -> None:
        if self.frames_remaining > 0:
            self.frames_remaining -= 1

    # ----- geometry ---
    def get_world_rect(self, anchor_x: float, anchor_y: float,
                       anchor_w: float, anchor_h: float,
                       facing: int) -> pygame.Rect:
        """Compute world-space AABB (bounding box for circle shapes too)."""
        cx = anchor_x + anchor_w / 2
        cy = anchor_y + anchor_h / 2
        ox = self.offset_x * facing
        if self.shape == HitboxShape.CIRCLE:
            r = self.width / 2
            return pygame.Rect(int(cx + ox - r), int(cy + self.offset_y - r),
                               int(self.width), int(self.width))
        x = cx + ox - self.width / 2
        y = cy + self.offset_y - self.height / 2
        return pygame.Rect(int(x), int(y), int(self.width), int(self.height))

    def get_world_center(self, anchor_x: float, anchor_y: float,
                         anchor_w: float, anchor_h: float,
                         facing: int) -> Tuple[float, float]:
        cx = anchor_x + anchor_w / 2 + self.offset_x * facing
        cy = anchor_y + anchor_h / 2 + self.offset_y
        return cx, cy

    # ----- launch direction ---
    def get_launch_angle(self, facing: int) -> float:
        if facing == -1:
            return 180 - self.angle
        return self.angle

    # ----- hit tests ---
    def _overlaps(self, anchor_x: float, anchor_y: float,
                  anchor_w: float, anchor_h: float,
                  facing: int, target_rect: pygame.Rect) -> bool:
        """Shape-aware overlap test against an axis-aligned target rect."""
        if self.shape == HitboxShape.CIRCLE:
            cx, cy = self.get_world_center(
                anchor_x, anchor_y, anchor_w, anchor_h, facing)
            return CollisionHelper.circle_vs_rect(
                cx, cy, self.width / 2, target_rect)
        world_rect = self.get_world_rect(
            anchor_x, anchor_y, anchor_w, anchor_h, facing)
        return CollisionHelper.rect_vs_rect(world_rect, target_rect)

    def check_hit(self, attacker: Fighter, target: Fighter) -> bool:
        """Test collision against *target*'s hurtbox. Returns True on new hit."""
        if target.port in self.already_hit:
            return False
        if target.invincible:
            return False
        if target.port == self.owner_port:
            return False

        target_hurtbox = target.get_hurtbox()
        if self._overlaps(attacker.x, attacker.y,
                          attacker.width, attacker.height,
                          attacker.facing, target_hurtbox):
            self.already_hit.add(target.port)
            return True
        return False

    def check_hit_at(self, wx: float, wy: float, w: float, h: float,
                     facing: int, target: Fighter) -> bool:
        """Test from arbitrary world position (projectiles)."""
        if target.port in self.already_hit:
            return False
        if target.invincible:
            return False
        if target.port == self.owner_port:
            return False

        target_hurtbox = target.get_hurtbox()
        if self._overlaps(wx, wy, w, h, facing, target_hurtbox):
            self.already_hit.add(target.port)
            return True
        return False

    # ----- factory ---
    @staticmethod
    def from_attack_data(owner_port: int, attack_data) -> Hitbox:
        """Create a Hitbox from an AttackData instance."""
        shape = HitboxShape.RECT
        if hasattr(attack_data, "hitbox_shape"):
            shape = {
                "circle": HitboxShape.CIRCLE,
                "rect": HitboxShape.RECT,
            }.get(attack_data.hitbox_shape, HitboxShape.RECT)

        priority = getattr(attack_data, "hitbox_priority", 0)

        return Hitbox(
            owner_port=owner_port,
            offset_x=attack_data.hitbox_x,
            offset_y=attack_data.hitbox_y,
            width=attack_data.hitbox_w,
            height=attack_data.hitbox_h,
            damage=attack_data.damage,
            base_knockback=attack_data.base_knockback,
            kb_scaling=attack_data.kb_scaling,
            angle=attack_data.angle,
            active_frames=attack_data.active_frames,
            shape=shape,
            priority=priority,
        )


# ======================================================================
#  HitboxGroup  — multi-hitbox per attack (sweetspot / sourspot)
# ======================================================================
class HitboxGroup:
    """Container for ≥1 hitboxes that belong to the same attack swing.

    Only the first hitbox to connect on a given target applies (highest
    priority wins when multiple overlap the same hurtbox on the same frame).
    """

    def __init__(self, hitboxes: List[Hitbox]):
        self._hitboxes = sorted(hitboxes, key=lambda h: -h.priority)

    @property
    def hitboxes(self) -> List[Hitbox]:
        return self._hitboxes

    def is_active(self) -> bool:
        return any(h.is_active() for h in self._hitboxes)

    def tick(self) -> None:
        for h in self._hitboxes:
            h.tick()

    def check_hit(self, attacker: Fighter,
                  target: Fighter) -> Hitbox | None:
        """Return the highest-priority hitbox that connects, or None."""
        for hb in self._hitboxes:
            if not hb.is_active():
                continue
            if hb.check_hit(attacker, target):
                # Mark other hitboxes so target isn't hit twice
                for other in self._hitboxes:
                    other.already_hit.add(target.port)
                return hb
        return None

    @staticmethod
    def from_attack_data(owner_port: int, attack_data) -> HitboxGroup:
        """Build from AttackData.  If the attack defines *extra_hitboxes*
        (list of dicts) they become additional hitboxes; otherwise a
        single-hitbox group is created."""
        primary = Hitbox.from_attack_data(owner_port, attack_data)
        extras: List[Hitbox] = []

        if hasattr(attack_data, "extra_hitboxes"):
            for ex in (attack_data.extra_hitboxes or []):
                extras.append(Hitbox(
                    owner_port=owner_port,
                    offset_x=ex.get("x", 0),
                    offset_y=ex.get("y", 0),
                    width=ex.get("w", 40),
                    height=ex.get("h", 40),
                    damage=ex.get("damage", primary.damage * 0.6),
                    base_knockback=ex.get("base_kb", primary.base_knockback * 0.5),
                    kb_scaling=ex.get("kb_scaling", primary.kb_scaling),
                    angle=ex.get("angle", primary.angle),
                    active_frames=ex.get("active_frames", primary.total_active_frames),
                    shape=HitboxShape.RECT,
                    priority=ex.get("priority", -1),
                ))

        return HitboxGroup([primary, *extras])

    def get_first_active(self) -> Hitbox | None:
        """Return the first still-active hitbox (for rendering / debug)."""
        for h in self._hitboxes:
            if h.is_active():
                return h
        return None
