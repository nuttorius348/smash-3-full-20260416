"""Data classes for fighter attributes and attack definitions."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class AttackData:
    """Definition of a single attack move.

    New fields
    ----------
    hitbox_shape : str
        ``"rect"`` (default) or ``"circle"``.  When circle, *hitbox_w* is
        treated as diameter and *hitbox_h* is ignored.
    hitbox_priority : int
        Higher-priority hitbox wins a hitbox-vs-hitbox trade (default 0).
    extra_hitboxes : list[dict] | None
        Optional additional hitboxes for sweetspot / sourspot patterns.
        Each dict may contain: x, y, w, h, damage, base_kb, kb_scaling,
        angle, active_frames, priority.
    """

    name: str
    pose_key: str                   # key into Fighter.poses dict

    # Hitbox (relative to fighter center, facing right)
    hitbox_x: float = 30.0          # x offset from center
    hitbox_y: float = -10.0         # y offset from center
    hitbox_w: float = 60.0
    hitbox_h: float = 40.0
    hitbox_shape: str = "rect"      # "rect" or "circle"
    hitbox_priority: int = 0

    # Damage / knockback
    damage: float = 10.0
    base_knockback: float = 200.0
    kb_scaling: float = 1.0
    angle: float = 45.0             # launch angle in degrees (0=forward, 90=up)

    # Frame data (at 60fps)
    startup_frames: int = 4
    active_frames: int = 3
    endlag_frames: int = 10

    # Multi-hitbox (sweetspot / sourspot)
    extra_hitboxes: Optional[List[dict]] = None

    # Projectile spawning
    spawns_projectile: bool = False
    projectile_type: Optional[str] = None  # 'linear', 'arc', 'beam', etc.
    projectile_speed: float = 600.0
    projectile_lifetime: int = 120         # frames
    projectile_damage: float = 8.0
    projectile_kb: float = 150.0
    projectile_angle: float = 30.0


@dataclass
class FighterData:
    """Static attributes for a character archetype."""
    name: str = "Fighter"
    weight: float = 100.0           # 100 = baseline; higher = harder to KO
    width: int = 50
    height: int = 80

    # Movement
    walk_speed: float = 250.0       # pixels/sec
    run_speed: float = 450.0
    air_speed: float = 300.0
    jump_force: float = 650.0       # initial upward velocity
    short_hop_force: float = 420.0
    double_jump_force: float = 580.0
    max_jumps: int = 2              # total jumps (1 ground + 1 air)
    fall_speed: float = 600.0
    fast_fall_speed: float = 900.0

    # Attacks — keyed by "direction_type" e.g. "neutral_attack", "side_special"
    attacks: Dict[str, AttackData] = field(default_factory=dict)

    # Ultimate
    ultimate_video: str = ""        # path to mp4
    ultimate_attack: Optional[AttackData] = None
    
    # Visual
    idle_sprite: str = ""           # path to character sprite image


def make_default_attacks() -> Dict[str, AttackData]:
    """Generate a balanced default attack set."""
    return {
        # --- Normal attacks ---
        "neutral_attack": AttackData(
            name="Jab", pose_key="idle_attack",
            hitbox_x=35, hitbox_y=-5, hitbox_w=50, hitbox_h=30,
            damage=3.0, base_knockback=80, kb_scaling=0.3, angle=30,
            startup_frames=2, active_frames=2, endlag_frames=6,
        ),
        "side_attack": AttackData(
            name="Side Tilt", pose_key="side_attack",
            hitbox_x=40, hitbox_y=-10, hitbox_w=70, hitbox_h=35,
            damage=9.0, base_knockback=150, kb_scaling=0.8, angle=40,
            startup_frames=5, active_frames=3, endlag_frames=14,
        ),
        "up_attack": AttackData(
            name="Up Tilt", pose_key="up_attack",
            hitbox_x=0, hitbox_y=-50, hitbox_w=60, hitbox_h=55,
            damage=8.0, base_knockback=160, kb_scaling=0.9, angle=80,
            startup_frames=4, active_frames=4, endlag_frames=12,
        ),
        "down_attack": AttackData(
            name="Down Tilt", pose_key="down_attack",
            hitbox_x=35, hitbox_y=10, hitbox_w=65, hitbox_h=25,
            damage=7.0, base_knockback=120, kb_scaling=0.6, angle=20,
            startup_frames=3, active_frames=3, endlag_frames=10,
        ),
        # --- Air attacks ---
        "neutral_air": AttackData(
            name="Neutral Air", pose_key="idle_attack",
            hitbox_x=0, hitbox_y=0, hitbox_w=70, hitbox_h=70,
            damage=7.0, base_knockback=130, kb_scaling=0.5, angle=45,
            startup_frames=3, active_frames=4, endlag_frames=10,
        ),
        "forward_air": AttackData(
            name="Forward Air", pose_key="side_attack",
            hitbox_x=45, hitbox_y=-5, hitbox_w=55, hitbox_h=40,
            damage=10.0, base_knockback=160, kb_scaling=1.0, angle=45,
            startup_frames=6, active_frames=3, endlag_frames=16,
        ),
        "up_air": AttackData(
            name="Up Air", pose_key="up_attack",
            hitbox_x=0, hitbox_y=-50, hitbox_w=55, hitbox_h=50,
            damage=8.0, base_knockback=150, kb_scaling=0.9, angle=85,
            startup_frames=4, active_frames=3, endlag_frames=12,
        ),
        "down_air": AttackData(
            name="Down Air", pose_key="down_attack",
            hitbox_x=0, hitbox_y=30, hitbox_w=50, hitbox_h=50,
            damage=12.0, base_knockback=180, kb_scaling=1.2, angle=270,
            startup_frames=8, active_frames=3, endlag_frames=20,
        ),
        # --- Specials ---
        "neutral_special": AttackData(
            name="Neutral Special", pose_key="neutral_special",
            hitbox_x=40, hitbox_y=-5, hitbox_w=40, hitbox_h=30,
            damage=8.0, base_knockback=140, kb_scaling=0.7, angle=35,
            startup_frames=10, active_frames=2, endlag_frames=18,
            spawns_projectile=True, projectile_type="linear",
        ),
        "side_special": AttackData(
            name="Side Special", pose_key="side_special",
            hitbox_x=50, hitbox_y=-10, hitbox_w=75, hitbox_h=40,
            damage=12.0, base_knockback=200, kb_scaling=1.1, angle=35,
            startup_frames=12, active_frames=4, endlag_frames=22,
        ),
        "up_special": AttackData(
            name="Up Special", pose_key="up_special",
            hitbox_x=0, hitbox_y=-40, hitbox_w=50, hitbox_h=60,
            damage=6.0, base_knockback=170, kb_scaling=0.8, angle=80,
            startup_frames=5, active_frames=6, endlag_frames=15,
        ),
        "down_special": AttackData(
            name="Down Special", pose_key="down_special",
            hitbox_x=0, hitbox_y=0, hitbox_w=80, hitbox_h=20,
            damage=5.0, base_knockback=100, kb_scaling=0.4, angle=70,
            startup_frames=6, active_frames=8, endlag_frames=20,
        ),
    }


def create_default_fighter_data(name: str = "Fighter") -> FighterData:
    """Create a balanced default character."""
    ult_attack = AttackData(
        name="Ultimate", pose_key="ultimate",
        hitbox_x=0, hitbox_y=0, hitbox_w=300, hitbox_h=200,
        damage=30.0, base_knockback=400, kb_scaling=1.5, angle=60,
        startup_frames=0, active_frames=6, endlag_frames=30,
    )
    return FighterData(
        name=name,
        attacks=make_default_attacks(),
        ultimate_attack=ult_attack,
    )
