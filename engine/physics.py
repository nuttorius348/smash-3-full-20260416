"""Physics engine — gravity, friction, platform collision, blast zones."""

from __future__ import annotations
import math
from typing import TYPE_CHECKING

import pygame

from settings import (
    GRAVITY, TERMINAL_VELOCITY, GROUND_FRICTION, AIR_FRICTION,
    FAST_FALL_MULTIPLIER,
    KB_DAMAGE_FACTOR, KB_PERCENT_DIVISOR, KB_HITSTUN_FACTOR,
    KB_CURVE_EXPONENT, KB_MATCH_TIME_SCALE, KB_MATCH_TIME_CAP,
    INSTANT_KO_THRESHOLD, INSTANT_KO_KB,
    HITSTUN_MAX_FRAMES, HITSTUN_DECAY,
    VERTICAL_LAUNCH_BIAS, VELOCITY_CAP,
)

if TYPE_CHECKING:
    from entities.fighter import Fighter
    from stages.stage import Stage, Platform


class PhysicsEngine:
    """Handles movement integration, collisions, and knockback math."""

    def __init__(self):
        self.gravity = GRAVITY
        self.terminal_velocity = TERMINAL_VELOCITY
        self.ground_friction = GROUND_FRICTION
        self.air_friction = AIR_FRICTION

    # ------------------------------------------------------------------
    # Per-frame update
    # ------------------------------------------------------------------
    def update(self, fighter: Fighter, stage: Stage, dt: float) -> None:
        # --- Gravity ---
        if not fighter.grounded:
            grav = self.gravity
            if fighter.fast_falling:
                grav *= FAST_FALL_MULTIPLIER
            fighter.vy += grav * dt
            if fighter.vy > self.terminal_velocity:
                fighter.vy = self.terminal_velocity

        # --- Friction ---
        if fighter.grounded:
            fighter.vx *= max(0.0, 1.0 - self.ground_friction * dt)
        else:
            fighter.vx *= max(0.0, 1.0 - self.air_friction * dt)

        # --- Integrate position ---
        fighter.prev_y = fighter.y
        fighter.x += fighter.vx * dt
        fighter.y += fighter.vy * dt

        # --- Platform collisions ---
        fighter.grounded = False
        for plat in stage.platforms:
            if self._collide_platform(fighter, plat):
                break  # resolved onto a platform

        # --- Blast zone ---
        if self._check_blast_zone(fighter, stage):
            fighter.die()

    # ------------------------------------------------------------------
    # Platform collision
    # ------------------------------------------------------------------
    def _collide_platform(self, fighter: Fighter, plat: Platform) -> bool:
        f_rect = fighter.get_hurtbox()
        p_rect = plat.rect

        if not f_rect.colliderect(p_rect):
            return False

        if plat.is_passthrough:
            # Only land from above
            if fighter.vy >= 0 and fighter.prev_y + fighter.height <= p_rect.top + 4:
                if not fighter.dropping_through:
                    fighter.y = p_rect.top - fighter.height
                    fighter.vy = 0
                    fighter.grounded = True
                    fighter.jumps_remaining = fighter.data.max_jumps
                    fighter.fast_falling = False
                    return True
            return False

        # Solid platform — resolve from all sides
        overlap_left = (f_rect.right) - p_rect.left
        overlap_right = p_rect.right - (f_rect.left)
        overlap_top = (f_rect.bottom) - p_rect.top
        overlap_bottom = p_rect.bottom - (f_rect.top)

        min_overlap = min(overlap_left, overlap_right, overlap_top, overlap_bottom)

        if min_overlap == overlap_top and fighter.vy >= 0:
            fighter.y = p_rect.top - fighter.height
            fighter.vy = 0
            fighter.grounded = True
            fighter.jumps_remaining = fighter.data.max_jumps
            fighter.fast_falling = False
        elif min_overlap == overlap_bottom and fighter.vy < 0:
            fighter.y = p_rect.bottom
            fighter.vy = 0
        elif min_overlap == overlap_left:
            fighter.x = p_rect.left - fighter.width
            fighter.vx = 0
        elif min_overlap == overlap_right:
            fighter.x = p_rect.right
            fighter.vx = 0

        return fighter.grounded

    # ------------------------------------------------------------------
    # Blast zones
    # ------------------------------------------------------------------
    def _check_blast_zone(self, fighter: Fighter, stage: Stage) -> bool:
        bz = stage.blast_zone
        cx = fighter.x + fighter.width / 2
        cy = fighter.y + fighter.height / 2
        return not bz.collidepoint(cx, cy)

    # ------------------------------------------------------------------
    # Knockback formula  (non-linear, time-scaled)
    # ------------------------------------------------------------------
    @staticmethod
    def calculate_knockback(
        damage: float,
        percent: float,
        weight: float,
        base_knockback: float,
        kb_scaling: float,
        match_time: float = 0.0,
        is_special: bool = False,
    ) -> float:
        """
        Percent-based knockback with non-linear growth and match-time scaling.

        Formula
        -------
        raw          = dmg × KB_DMG_FACTOR  +  dmg × (pct / KB_PCT_DIV)
        weight_f     = weight × 0.1 + 1.0
        linear_kb    = (raw / weight_f) × kb_scaling + base_kb
        curved_kb    = linear_kb ^ KB_CURVE_EXPONENT          # super-linear
        time_mult    = min(1 + match_time × TIME_SCALE, TIME_CAP)
        final_kb     = curved_kb × time_mult

        Instant KO override: if is_special and pct ≥ 250 → KB = 2000
        """
        # Instant KO at 250 %+ from specials
        if is_special and percent >= INSTANT_KO_THRESHOLD:
            return INSTANT_KO_KB

        raw = damage * KB_DAMAGE_FACTOR + damage * (percent / KB_PERCENT_DIVISOR)
        weight_factor = weight * 0.1 + 1.0
        linear_kb = (raw / weight_factor) * kb_scaling + base_knockback

        # Non-linear curve: gentle at low %, explosive at high %
        curved_kb = math.copysign(abs(linear_kb) ** KB_CURVE_EXPONENT, linear_kb)

        # Match time scaling (fights get deadlier over time)
        time_mult = min(1.0 + match_time * KB_MATCH_TIME_SCALE, KB_MATCH_TIME_CAP)

        return curved_kb * time_mult

    @staticmethod
    def apply_knockback(
        fighter: Fighter,
        angle_deg: float,
        knockback: float,
        consecutive_hits: int = 0,
    ) -> None:
        """
        Apply directional knockback velocity with vertical bias,
        velocity cap, and reduced hitstun to *fighter*.

        Parameters
        ----------
        angle_deg : float
            Launch angle in degrees (0 = right, 90 = up, 270 = down).
        knockback : float
            Scalar knockback magnitude from calculate_knockback().
        consecutive_hits : int
            Running combo counter (used for hitstun decay).
        """
        angle_rad = math.radians(angle_deg)

        vx = math.cos(angle_rad) * knockback
        vy = -math.sin(angle_rad) * knockback  # screen-Y is inverted

        # Vertical launch bias — encourage upward launches for more entertaining play
        vy *= VERTICAL_LAUNCH_BIAS

        # Hard velocity cap so fighters don't teleport through blast zones
        speed = math.hypot(vx, vy)
        if speed > VELOCITY_CAP:
            scale = VELOCITY_CAP / speed
            vx *= scale
            vy *= scale

        fighter.vx = vx
        fighter.vy = vy

        # Reduced hitstun  — decays with each successive hit in a combo
        raw_stun = int(knockback * KB_HITSTUN_FACTOR)
        if consecutive_hits > 0:
            decay_mult = HITSTUN_DECAY ** consecutive_hits
            raw_stun = int(raw_stun * decay_mult)
        fighter.hitstun_frames = min(raw_stun, HITSTUN_MAX_FRAMES)
        fighter.set_state("hitstun")

    @staticmethod
    def calculate_hitstun(knockback: float, consecutive_hits: int = 0) -> int:
        raw = max(1, int(knockback * KB_HITSTUN_FACTOR))
        if consecutive_hits > 0:
            raw = int(raw * HITSTUN_DECAY ** consecutive_hits)
        return min(max(1, raw), HITSTUN_MAX_FRAMES)
