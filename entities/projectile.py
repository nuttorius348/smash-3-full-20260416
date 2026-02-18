"""Projectile system — base class, 9 subtypes, manager, stage collision.

Hierarchy
---------
Projectile  (base — straight line, single hit, destroyed on contact)
├── LinearProjectile      — alias for base
├── ArcProjectile         — gravity-affected arc
├── BoomerangProjectile   — returns to origin
├── PiercingProjectile    — passes through fighters
├── StationaryProjectile  — static trap / zone
├── BeamProjectile        — wide laser beam, multi-hit, ignores stage
├── EnergyWaveProjectile  — follows ground surface, slides along platforms
├── BarrelProjectile      — bounces off solid platforms
└── BlastProjectile       — explodes on hit / stage contact → radial AoE
    └── ExplosionEffect   — stationary AoE lingering from a blast

Stage collision modes (per subtype)
-----------------------------------
none     — ignores platforms entirely
destroy  — killed on solid platform contact
bounce   — reflects velocity off surfaces (limited bounces)
slide    — snaps to ground surface, follows it
"""

from __future__ import annotations
import math
from enum import Enum, auto
from typing import List, Optional, TYPE_CHECKING

import pygame

from entities.hitbox import Hitbox, HitboxShape, CollisionHelper
from settings import GRAVITY

if TYPE_CHECKING:
    from entities.fighter import Fighter
    from stages.stage import Stage, Platform


# ======================================================================
#  Stage collision mode
# ======================================================================
class StageCollisionMode(Enum):
    NONE = auto()      # ignores platforms
    DESTROY = auto()   # dies on contact with solid platform
    BOUNCE = auto()    # reflects velocity
    SLIDE = auto()     # follows ground surface


# ======================================================================
#  Base Projectile
# ======================================================================
class Projectile:
    """Base projectile — travels in a straight line, hits once,
    destroyed on any fighter hit or solid-platform contact (default)."""

    stage_collision: StageCollisionMode = StageCollisionMode.DESTROY

    def __init__(
        self,
        owner_port: int,
        x: float,
        y: float,
        vx: float,
        vy: float,
        damage: float,
        base_knockback: float,
        kb_scaling: float,
        angle: float,
        width: float = 20,
        height: float = 20,
        lifetime: int = 120,
        priority: int = 0,
        sprite: Optional[pygame.Surface] = None,
    ):
        self.owner_port = owner_port
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.width = width
        self.height = height
        self.lifetime = lifetime
        self.max_lifetime = lifetime
        self.alive = True
        self.facing = 1 if vx >= 0 else -1
        self.priority = priority

        # Hitbox that travels with the projectile
        self.hitbox = Hitbox(
            owner_port=owner_port,
            offset_x=0, offset_y=0,
            width=width, height=height,
            damage=damage,
            base_knockback=base_knockback,
            kb_scaling=kb_scaling,
            angle=angle,
            active_frames=lifetime,
            priority=priority,
        )

        self.sprite = sprite
        if self.sprite is None:
            self.sprite = self._make_placeholder()

    # ---- placeholder visual ----
    def _make_placeholder(self) -> pygame.Surface:
        from settings import PLAYER_COLORS
        color = PLAYER_COLORS[self.owner_port % len(PLAYER_COLORS)]
        surf = pygame.Surface((int(self.width), int(self.height)), pygame.SRCALPHA)
        pygame.draw.ellipse(surf, (*color, 200),
                            (0, 0, int(self.width), int(self.height)))
        return surf

    # ---- frame update ----
    def update(self, dt: float) -> None:
        if not self.alive:
            return
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.lifetime -= 1
        if self.lifetime <= 0:
            self.alive = False

    # ---- stage collision ----
    def collide_stage(self, stage: Stage) -> None:
        """Handle collision with solid platforms.  Subtypes override for bounce / slide."""
        if self.stage_collision == StageCollisionMode.NONE:
            return
        if not self.alive:
            return

        proj_rect = self.get_rect()
        for plat in stage.platforms:
            if plat.is_passthrough:
                continue
            if not proj_rect.colliderect(plat.rect):
                continue

            if self.stage_collision == StageCollisionMode.DESTROY:
                self.on_stage_hit(plat)
                return
            elif self.stage_collision == StageCollisionMode.BOUNCE:
                self._bounce_off(plat)
                return
            elif self.stage_collision == StageCollisionMode.SLIDE:
                self._slide_on(plat)
                return

    def on_stage_hit(self, platform) -> None:
        """Called when the projectile hits a solid platform (DESTROY mode)."""
        self.alive = False

    def _bounce_off(self, platform) -> None:
        """Reflect velocity off a platform surface."""
        pass  # overridden by BarrelProjectile

    def _slide_on(self, platform) -> None:
        """Snap to platform surface and follow it."""
        pass  # overridden by EnergyWaveProjectile

    # ---- fighter collision ----
    def check_hits(self, fighters: List[Fighter],
                   match_time: float = 0.0) -> None:
        if not self.alive:
            return
        for f in fighters:
            if f.port == self.owner_port or not f.is_alive:
                continue
            if self.hitbox.check_hit_at(
                self.x, self.y, self.width, self.height, self.facing, f
            ):
                f.take_hit(self.hitbox, is_special=True,
                           match_time=match_time)
                self.on_hit(f)

    def on_hit(self, target: Fighter) -> None:
        """Override for custom hit behavior. Default: destroy on hit."""
        self.alive = False

    # ---- projectile-vs-projectile ----
    def collide_projectile(self, other: Projectile) -> None:
        """Mutual annihilation check.  Higher priority survives."""
        if not self.alive or not other.alive:
            return
        if self.owner_port == other.owner_port:
            return
        r1 = self.get_rect()
        r2 = other.get_rect()
        if not r1.colliderect(r2):
            return
        if self.priority > other.priority:
            other.alive = False
        elif other.priority > self.priority:
            self.alive = False
        else:
            self.alive = False
            other.alive = False

    # ---- rendering ----
    def render(self, screen: pygame.Surface, camera) -> None:
        if not self.alive:
            return
        camera.apply_surface(self.sprite, self.x, self.y, screen)

    # ---- helpers ----
    def get_rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x), int(self.y),
                           int(self.width), int(self.height))

    def kill(self) -> None:
        self.alive = False


# ======================================================================
#  LinearProjectile  (alias for base)
# ======================================================================
class LinearProjectile(Projectile):
    """Straight-line projectile (fireball, energy ball)."""
    stage_collision = StageCollisionMode.DESTROY


# ======================================================================
#  ArcProjectile (gravity-affected)
# ======================================================================
class ArcProjectile(Projectile):
    """Gravity-affected lobbed projectile (grenade, bomb)."""

    stage_collision = StageCollisionMode.DESTROY

    def __init__(self, *args, gravity_scale: float = 1.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.gravity_scale = gravity_scale

    def update(self, dt: float) -> None:
        if not self.alive:
            return
        self.vy += GRAVITY * self.gravity_scale * dt
        super().update(dt)


# ======================================================================
#  BoomerangProjectile
# ======================================================================
class BoomerangProjectile(Projectile):
    """Returns to spawn point after reaching max distance."""

    stage_collision = StageCollisionMode.NONE

    def __init__(self, *args, max_distance: float = 400, **kwargs):
        super().__init__(*args, **kwargs)
        self.origin_x = self.x
        self.origin_y = self.y
        self.max_distance = max_distance
        self.returning = False
        self.speed = math.hypot(self.vx, self.vy)

    def update(self, dt: float) -> None:
        if not self.alive:
            return
        dx = self.x - self.origin_x
        dy = self.y - self.origin_y
        dist = math.hypot(dx, dy)

        if not self.returning and dist >= self.max_distance:
            self.returning = True
            self.hitbox.already_hit.clear()

        if self.returning:
            tx = self.origin_x - self.x
            ty = self.origin_y - self.y
            d = math.hypot(tx, ty)
            if d < 20:
                self.alive = False
                return
            self.vx = (tx / d) * self.speed
            self.vy = (ty / d) * self.speed

        super().update(dt)


# ======================================================================
#  PiercingProjectile
# ======================================================================
class PiercingProjectile(Projectile):
    """Passes through fighters, hitting each once."""

    stage_collision = StageCollisionMode.NONE

    def on_hit(self, target: Fighter) -> None:
        pass  # do NOT destroy


# ======================================================================
#  StationaryProjectile
# ======================================================================
class StationaryProjectile(Projectile):
    """Static hitbox / trap that lingers in place."""

    stage_collision = StageCollisionMode.NONE

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.vx = 0.0
        self.vy = 0.0

    def update(self, dt: float) -> None:
        if not self.alive:
            return
        self.lifetime -= 1
        if self.lifetime <= 0:
            self.alive = False


# ======================================================================
#  BeamProjectile — wide laser, multi-hit, ignores stage
# ======================================================================
class BeamProjectile(Projectile):
    """A wide laser beam that pierces all fighters and stage geometry.

    * Multi-hit: resets ``already_hit`` every *tick_interval* frames.
    * Ignores stage collision entirely.
    * Rendered as a pulsing neon rectangle.
    """

    stage_collision = StageCollisionMode.NONE

    def __init__(self, *args, tick_interval: int = 8, **kwargs):
        super().__init__(*args, **kwargs)
        self.tick_interval = tick_interval
        self._tick_counter = 0

    def update(self, dt: float) -> None:
        if not self.alive:
            return
        self._tick_counter += 1
        if self._tick_counter >= self.tick_interval:
            self._tick_counter = 0
            self.hitbox.already_hit.clear()
        super().update(dt)

    def on_hit(self, target: Fighter) -> None:
        pass  # multi-hit, don't destroy

    def _make_placeholder(self) -> pygame.Surface:
        from settings import PLAYER_COLORS
        color = PLAYER_COLORS[self.owner_port % len(PLAYER_COLORS)]
        surf = pygame.Surface((int(self.width), int(self.height)), pygame.SRCALPHA)
        # Neon glow effect
        inner = (*color, 255)
        outer = (*color, 80)
        pygame.draw.rect(surf, outer, (0, 0, int(self.width), int(self.height)))
        margin = max(2, int(self.height * 0.2))
        pygame.draw.rect(surf, inner,
                         (0, margin, int(self.width), int(self.height) - margin * 2))
        return surf

    def render(self, screen: pygame.Surface, camera) -> None:
        if not self.alive:
            return
        # Pulsing opacity
        alpha = 160 + int(60 * math.sin(self._tick_counter * 0.5))
        temp = self.sprite.copy()
        temp.set_alpha(max(0, min(255, alpha)))
        camera.apply_surface(temp, self.x, self.y, screen)


# ======================================================================
#  EnergyWaveProjectile — follows ground surface
# ======================================================================
class EnergyWaveProjectile(Projectile):
    """A wave that slides along the ground surface.

    * Snaps Y to the top of whatever solid platform it's on.
    * Light gravity keeps it grounded if it walks off an edge.
    * Destroyed if it falls into the blast zone (no platform below).
    """

    stage_collision = StageCollisionMode.SLIDE
    SNAP_GRAVITY = 400.0

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._grounded = False

    def update(self, dt: float) -> None:
        if not self.alive:
            return
        # Light gravity to stay grounded
        if not self._grounded:
            self.vy += self.SNAP_GRAVITY * dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.lifetime -= 1
        if self.lifetime <= 0:
            self.alive = False

    def collide_stage(self, stage: Stage) -> None:
        if not self.alive:
            return
        self._grounded = False
        proj_rect = self.get_rect()
        for plat in stage.platforms:
            if plat.is_passthrough:
                continue
            if not proj_rect.colliderect(plat.rect):
                continue
            # Snap to top of platform
            self.y = plat.rect.top - self.height
            self.vy = 0
            self._grounded = True
            return

    def _make_placeholder(self) -> pygame.Surface:
        from settings import PLAYER_COLORS
        color = PLAYER_COLORS[self.owner_port % len(PLAYER_COLORS)]
        surf = pygame.Surface((int(self.width), int(self.height)), pygame.SRCALPHA)
        # Wave shape
        pts = [
            (0, int(self.height)),
            (int(self.width * 0.25), 0),
            (int(self.width * 0.5), int(self.height * 0.6)),
            (int(self.width * 0.75), 0),
            (int(self.width), int(self.height)),
        ]
        pygame.draw.polygon(surf, (*color, 200), pts)
        return surf


# ======================================================================
#  BarrelProjectile — bounces off solid platforms
# ======================================================================
class BarrelProjectile(Projectile):
    """A rolling barrel-like projectile that bounces off surfaces.

    Gravity-affected like ArcProjectile, but reflects velocity on contact
    with solid platforms (up to *max_bounces* times).
    """

    stage_collision = StageCollisionMode.BOUNCE
    BARREL_GRAVITY = 800.0
    BOUNCE_DAMPENING = 0.7   # velocity retained per bounce

    def __init__(self, *args, max_bounces: int = 3, **kwargs):
        super().__init__(*args, **kwargs)
        self.max_bounces = max_bounces
        self.bounces = 0
        self._rotation = 0.0

    def update(self, dt: float) -> None:
        if not self.alive:
            return
        self.vy += self.BARREL_GRAVITY * dt
        self._rotation += self.vx * dt * 0.05  # spin
        super().update(dt)

    def collide_stage(self, stage: Stage) -> None:
        if not self.alive:
            return
        proj_rect = self.get_rect()
        for plat in stage.platforms:
            if plat.is_passthrough:
                continue
            if not proj_rect.colliderect(plat.rect):
                continue
            self._bounce_off(plat)
            return

    def _bounce_off(self, platform) -> None:
        self.bounces += 1
        if self.bounces > self.max_bounces:
            self.alive = False
            return

        pr = self.get_rect()
        pl = platform.rect

        # Determine dominant collision axis
        overlap_top = pr.bottom - pl.top
        overlap_bottom = pl.bottom - pr.top
        overlap_left = pr.right - pl.left
        overlap_right = pl.right - pr.left

        min_ov = min(overlap_top, overlap_bottom, overlap_left, overlap_right)
        if min_ov == overlap_top or min_ov == overlap_bottom:
            self.vy = -self.vy * self.BOUNCE_DAMPENING
            if min_ov == overlap_top:
                self.y = pl.top - self.height
            else:
                self.y = pl.bottom
        else:
            self.vx = -self.vx * self.BOUNCE_DAMPENING
            if min_ov == overlap_left:
                self.x = pl.left - self.width
            else:
                self.x = pl.right

        # Reset hitbox so it can hit again after each bounce
        self.hitbox.already_hit.clear()

    def _make_placeholder(self) -> pygame.Surface:
        from settings import PLAYER_COLORS
        color = PLAYER_COLORS[self.owner_port % len(PLAYER_COLORS)]
        size = max(int(self.width), int(self.height))
        surf = pygame.Surface((size, size), pygame.SRCALPHA)
        pygame.draw.circle(surf, (*color, 200), (size // 2, size // 2), size // 2)
        # Cross-hatch to indicate spinning
        pygame.draw.line(surf, (255, 255, 255, 120),
                         (size // 4, size // 4), (3 * size // 4, 3 * size // 4), 2)
        pygame.draw.line(surf, (255, 255, 255, 120),
                         (3 * size // 4, size // 4), (size // 4, 3 * size // 4), 2)
        return surf

    def render(self, screen: pygame.Surface, camera) -> None:
        if not self.alive:
            return
        rotated = pygame.transform.rotate(self.sprite, -math.degrees(self._rotation))
        camera.apply_surface(rotated, self.x, self.y, screen)


# ======================================================================
#  BlastProjectile — explodes on contact → spawns ExplosionEffect
# ======================================================================
class BlastProjectile(Projectile):
    """Explosive projectile.  On hit or stage contact, dies and spawns a
    radial :class:`ExplosionEffect` at its position."""

    stage_collision = StageCollisionMode.DESTROY

    def __init__(self, *args,
                 explosion_radius: float = 80,
                 explosion_damage: float = 12,
                 explosion_kb: float = 250,
                 explosion_lifetime: int = 15,
                 **kwargs):
        super().__init__(*args, **kwargs)
        self.explosion_radius = explosion_radius
        self.explosion_damage = explosion_damage
        self.explosion_kb = explosion_kb
        self.explosion_lifetime = explosion_lifetime
        self._spawn_list: List[Projectile] = []  # filled on death

    def on_hit(self, target: Fighter) -> None:
        self._explode()
        self.alive = False

    def on_stage_hit(self, platform) -> None:
        self._explode()
        self.alive = False

    def _explode(self) -> None:
        """Queue an ExplosionEffect to be picked up by the ProjectileManager."""
        eff = ExplosionEffect(
            owner_port=self.owner_port,
            x=self.x + self.width / 2 - self.explosion_radius,
            y=self.y + self.height / 2 - self.explosion_radius,
            vx=0, vy=0,
            damage=self.explosion_damage,
            base_knockback=self.explosion_kb,
            kb_scaling=1.0,
            angle=70,
            width=self.explosion_radius * 2,
            height=self.explosion_radius * 2,
            lifetime=self.explosion_lifetime,
        )
        self._spawn_list.append(eff)

    def _make_placeholder(self) -> pygame.Surface:
        from settings import PLAYER_COLORS
        color = PLAYER_COLORS[self.owner_port % len(PLAYER_COLORS)]
        surf = pygame.Surface((int(self.width), int(self.height)), pygame.SRCALPHA)
        # Bomb-like circle with fuse
        r = min(int(self.width), int(self.height)) // 2
        cx, cy = int(self.width) // 2, int(self.height) // 2
        pygame.draw.circle(surf, (*color, 220), (cx, cy), r)
        pygame.draw.circle(surf, (40, 40, 40), (cx, cy), r, 2)
        # Little fuse
        pygame.draw.line(surf, (200, 200, 50),
                         (cx, cy - r), (cx + 5, cy - r - 6), 2)
        return surf


# ======================================================================
#  ExplosionEffect — radial AoE from BlastProjectile
# ======================================================================
class ExplosionEffect(StationaryProjectile):
    """Lingering AoE zone spawned by a BlastProjectile on death.
    Multi-hit (resets every few frames so nearby fighters take damage)."""

    def __init__(self, *args, tick_interval: int = 5, **kwargs):
        super().__init__(*args, **kwargs)
        self.tick_interval = tick_interval
        self._tick_counter = 0
        self.hitbox.shape = HitboxShape.CIRCLE
        self.hitbox.width = self.width  # diameter

    def update(self, dt: float) -> None:
        if not self.alive:
            return
        self._tick_counter += 1
        if self._tick_counter >= self.tick_interval:
            self._tick_counter = 0
            self.hitbox.already_hit.clear()
        super().update(dt)

    def _make_placeholder(self) -> pygame.Surface:
        size = int(max(self.width, self.height))
        surf = pygame.Surface((size, size), pygame.SRCALPHA)
        r = size // 2
        pygame.draw.circle(surf, (255, 160, 30, 140), (r, r), r)
        pygame.draw.circle(surf, (255, 255, 100, 200), (r, r), r // 2)
        return surf

    def render(self, screen: pygame.Surface, camera) -> None:
        if not self.alive:
            return
        # Fading out
        frac = self.lifetime / max(1, self.max_lifetime)
        temp = self.sprite.copy()
        temp.set_alpha(int(255 * frac))
        camera.apply_surface(temp, self.x, self.y, screen)


# ======================================================================
#  ProjectileManager
# ======================================================================
class ProjectileManager:
    """Owns and updates all active projectiles."""

    def __init__(self):
        self.projectiles: List[Projectile] = []

    def spawn(self, projectile: Projectile) -> None:
        self.projectiles.append(projectile)

    def update(self, dt: float, fighters: List[Fighter],
               stage: Stage | None = None,
               match_time: float = 0.0) -> None:
        """Full per-frame projectile pipeline:

        1. Move each projectile (subtype-specific physics).
        2. Stage collision (destroy / bounce / slide).
        3. Fighter collision → knockback trigger.
        4. Projectile-vs-projectile cancellation.
        5. Collect child spawns (blast → explosion).
        6. Prune dead projectiles.
        """
        # 1 + 2: update and stage collide
        for p in self.projectiles:
            p.update(dt)
            if stage is not None:
                p.collide_stage(stage)

        # 3: fighter hits
        for p in self.projectiles:
            p.check_hits(fighters, match_time=match_time)

        # 4: proj-vs-proj
        n = len(self.projectiles)
        for i in range(n):
            for j in range(i + 1, n):
                self.projectiles[i].collide_projectile(self.projectiles[j])

        # 5: gather child spawns (e.g. explosions from BlastProjectile)
        children: List[Projectile] = []
        for p in self.projectiles:
            if hasattr(p, "_spawn_list"):
                children.extend(p._spawn_list)
                p._spawn_list.clear()

        # 6: prune dead, add children
        self.projectiles = [p for p in self.projectiles if p.alive]
        self.projectiles.extend(children)

    def render(self, screen: pygame.Surface, camera) -> None:
        for p in self.projectiles:
            p.render(screen, camera)

    def clear(self) -> None:
        self.projectiles.clear()

    def spawn_from_attack(self, fighter: Fighter, attack_data) -> None:
        """Spawn a projectile based on an AttackData definition."""
        if not attack_data.spawns_projectile:
            return

        spawn_x = fighter.x + fighter.width / 2 + 30 * fighter.facing
        spawn_y = fighter.y + fighter.height / 2

        vx = attack_data.projectile_speed * fighter.facing
        vy = 0.0

        ptype = attack_data.projectile_type or "linear"
        cls_map = {
            "linear": LinearProjectile,
            "arc": ArcProjectile,
            "boomerang": BoomerangProjectile,
            "piercing": PiercingProjectile,
            "stationary": StationaryProjectile,
            "beam": BeamProjectile,
            "energy_wave": EnergyWaveProjectile,
            "barrel": BarrelProjectile,
            "blast": BlastProjectile,
        }
        cls = cls_map.get(ptype, LinearProjectile)

        proj = cls(
            owner_port=fighter.port,
            x=spawn_x, y=spawn_y,
            vx=vx, vy=vy,
            damage=attack_data.projectile_damage,
            base_knockback=attack_data.projectile_kb,
            kb_scaling=attack_data.kb_scaling,
            angle=attack_data.projectile_angle,
            lifetime=attack_data.projectile_lifetime,
        )
        self.spawn(proj)
