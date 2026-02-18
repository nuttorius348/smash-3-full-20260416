"""Character roster — registry and loader for character configs."""

from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, Optional

from entities.fighter_data import FighterData, AttackData, create_default_fighter_data


def load_character(folder: str) -> FighterData:
    """Load a character from a folder containing config.json and poses/."""
    config_path = Path(folder) / "config.json"

    if not config_path.exists():
        # Return default if no config found
        name = Path(folder).stem
        return create_default_fighter_data(name)

    with open(config_path, "r") as f:
        cfg = json.load(f)

    attacks: Dict[str, AttackData] = {}
    for key, atk_cfg in cfg.get("attacks", {}).items():
        attacks[key] = AttackData(
            name=atk_cfg.get("name", key),
            pose_key=atk_cfg.get("pose_key", key),
            hitbox_x=atk_cfg.get("hitbox_x", 30),
            hitbox_y=atk_cfg.get("hitbox_y", -10),
            hitbox_w=atk_cfg.get("hitbox_w", 60),
            hitbox_h=atk_cfg.get("hitbox_h", 40),
            damage=atk_cfg.get("damage", 10),
            base_knockback=atk_cfg.get("base_knockback", 200),
            kb_scaling=atk_cfg.get("kb_scaling", 1.0),
            angle=atk_cfg.get("angle", 45),
            startup_frames=atk_cfg.get("startup_frames", 4),
            active_frames=atk_cfg.get("active_frames", 3),
            endlag_frames=atk_cfg.get("endlag_frames", 10),
            spawns_projectile=atk_cfg.get("spawns_projectile", False),
            projectile_type=atk_cfg.get("projectile_type"),
            projectile_speed=atk_cfg.get("projectile_speed", 600),
            projectile_lifetime=atk_cfg.get("projectile_lifetime", 120),
            projectile_damage=atk_cfg.get("projectile_damage", 8),
            projectile_kb=atk_cfg.get("projectile_kb", 150),
            projectile_angle=atk_cfg.get("projectile_angle", 30),
        )

    ult_cfg = cfg.get("ultimate_attack")
    ult_attack: Optional[AttackData] = None
    if ult_cfg:
        ult_attack = AttackData(
            name=ult_cfg.get("name", "Ultimate"),
            pose_key=ult_cfg.get("pose_key", "ultimate"),
            hitbox_x=ult_cfg.get("hitbox_x", 0),
            hitbox_y=ult_cfg.get("hitbox_y", 0),
            hitbox_w=ult_cfg.get("hitbox_w", 300),
            hitbox_h=ult_cfg.get("hitbox_h", 200),
            damage=ult_cfg.get("damage", 30),
            base_knockback=ult_cfg.get("base_knockback", 400),
            kb_scaling=ult_cfg.get("kb_scaling", 1.5),
            angle=ult_cfg.get("angle", 60),
            startup_frames=ult_cfg.get("startup_frames", 0),
            active_frames=ult_cfg.get("active_frames", 6),
            endlag_frames=ult_cfg.get("endlag_frames", 30),
        )

    data = FighterData(
        name=cfg.get("name", Path(folder).stem),
        weight=cfg.get("weight", 100),
        width=cfg.get("width", 50),
        height=cfg.get("height", 80),
        walk_speed=cfg.get("walk_speed", 250),
        run_speed=cfg.get("run_speed", 450),
        air_speed=cfg.get("air_speed", 300),
        jump_force=cfg.get("jump_force", 650),
        short_hop_force=cfg.get("short_hop_force", 420),
        double_jump_force=cfg.get("double_jump_force", 580),
        max_jumps=cfg.get("max_jumps", 2),
        fall_speed=cfg.get("fall_speed", 600),
        fast_fall_speed=cfg.get("fast_fall_speed", 900),
        attacks=attacks if attacks else create_default_fighter_data().attacks,
        ultimate_video=cfg.get("ultimate_video", ""),
        ultimate_attack=ult_attack,
    )

    return data


def get_roster(characters_dir: str = "characters") -> Dict[str, str]:
    """Scan characters directory and return {name: folder_path}."""
    base = Path(characters_dir)
    roster: Dict[str, str] = {}
    if not base.exists():
        return roster
    for child in base.iterdir():
        if child.is_dir() and child.name not in ("__pycache__", "template"):
            roster[child.name] = str(child)
    return roster
