"""Data-driven fighter configurations — 5 unique characters with complete movesets.

Usage
-----
    from fighter_configs import FIGHTER_ROSTER, build_fighter_data
    
    # Get a fighter by name
    config = FIGHTER_ROSTER["brawler"]
    fighter_data = build_fighter_data(config)
    
    # Or build all fighters
    all_fighters = {name: build_fighter_data(cfg) 
                    for name, cfg in FIGHTER_ROSTER.items()}

Structure
---------
Each fighter config is a nested dictionary:
    - name, weight, dimensions, movement stats
    - attacks: dict keyed by move name (e.g. "neutral_attack")
        - Each attack has: damage, knockback, hitbox geometry, frame data, 
          projectile flags, image path
    - ultimate: special attack config + video path
"""

from entities.fighter_data import FighterData, AttackData


# ======================================================================
#  FIGHTER 1: BRAWLER — Balanced all-rounder
# ======================================================================
BRAWLER_CONFIG = {
    "name": "Brawler",
    "weight": 100.0,
    "width": 50,
    "height": 80,
    "idle_sprite": "assets/sprite_brawler.jpg",
    
    # Movement
    "walk_speed": 250.0,
    "run_speed": 450.0,
    "air_speed": 300.0,
    "jump_force": 650.0,
    "short_hop_force": 420.0,
    "double_jump_force": 580.0,
    "max_jumps": 2,
    
    # Attacks
    "attacks": {
        # --- Ground normals ---
        "neutral_attack": {
            "name": "Jab Combo",
            "pose": "assets/sprites/brawler/jab.png",
            "hitbox": {"x": 35, "y": -5, "w": 50, "h": 30, "shape": "rect", "priority": 0},
            "damage": 3.0,
            "base_kb": 110,
            "kb_scaling": 0.3,
            "angle": 30,
            "frames": {"startup": 2, "active": 2, "endlag": 6},
        },
        "side_attack": {
            "name": "Power Punch",
            "pose": "assets/sprites/brawler/side_attack.png",
            "hitbox": {"x": 40, "y": -10, "w": 70, "h": 35, "shape": "rect", "priority": 0},
            "damage": 9.0,
            "base_kb": 200,
            "kb_scaling": 0.8,
            "angle": 40,
            "frames": {"startup": 5, "active": 3, "endlag": 14},
        },
        "up_attack": {
            "name": "Rising Uppercut",
            "pose": "assets/sprites/brawler/up_attack.png",
            "hitbox": {"x": 0, "y": -50, "w": 60, "h": 55, "shape": "rect", "priority": 0},
            "damage": 8.0,
            "base_kb": 210,
            "kb_scaling": 0.9,
            "angle": 80,
            "frames": {"startup": 4, "active": 4, "endlag": 12},
        },
        "down_attack": {
            "name": "Sweep Kick",
            "pose": "assets/sprites/brawler/down_attack.png",
            "hitbox": {"x": 35, "y": 10, "w": 65, "h": 25, "shape": "rect", "priority": 0},
            "damage": 7.0,
            "base_kb": 165,
            "kb_scaling": 0.6,
            "angle": 20,
            "frames": {"startup": 3, "active": 3, "endlag": 10},
        },
        
        # --- Air attacks ---
        "neutral_air": {
            "name": "Spinning Kick",
            "pose": "assets/sprites/brawler/nair.png",
            "hitbox": {"x": 0, "y": 0, "w": 70, "h": 70, "shape": "circle", "priority": 0},
            "damage": 7.0,
            "base_kb": 175,
            "kb_scaling": 0.5,
            "angle": 45,
            "frames": {"startup": 3, "active": 4, "endlag": 10},
        },
        "forward_air": {
            "name": "Flying Knee",
            "pose": "assets/sprites/brawler/fair.png",
            "hitbox": {"x": 45, "y": -5, "w": 55, "h": 40, "shape": "rect", "priority": 1},
            "extra_hitboxes": [
                {"x": 30, "y": -5, "w": 50, "h": 40, "damage": 6, "priority": -1},
            ],
            "damage": 10.0,
            "base_kb": 215,
            "kb_scaling": 1.0,
            "angle": 45,
            "frames": {"startup": 6, "active": 3, "endlag": 16},
        },
        "up_air": {
            "name": "Bicycle Kick",
            "pose": "assets/sprites/brawler/uair.png",
            "hitbox": {"x": 0, "y": -50, "w": 55, "h": 50, "shape": "rect", "priority": 0},
            "damage": 8.0,
            "base_kb": 200,
            "kb_scaling": 0.9,
            "angle": 85,
            "frames": {"startup": 4, "active": 3, "endlag": 12},
        },
        "down_air": {
            "name": "Meteor Stomp",
            "pose": "assets/sprites/brawler/dair.png",
            "hitbox": {"x": 0, "y": 30, "w": 50, "h": 50, "shape": "rect", "priority": 0},
            "damage": 12.0,
            "base_kb": 240,
            "kb_scaling": 1.2,
            "angle": 270,
            "frames": {"startup": 8, "active": 3, "endlag": 20},
        },
        
        # --- Specials ---
        "neutral_special": {
            "name": "Energy Ball",
            "pose": "assets/sprites/brawler/neutral_special.png",
            "hitbox": {"x": 40, "y": -5, "w": 40, "h": 30, "shape": "rect", "priority": 0},
            "damage": 8.0,
            "base_kb": 140,
            "kb_scaling": 0.7,
            "angle": 35,
            "frames": {"startup": 10, "active": 2, "endlag": 18},
            "projectile": {
                "type": "linear",
                "speed": 600,
                "lifetime": 120,
                "damage": 8.0,
                "kb": 140,
                "angle": 35,
            },
        },
        "side_special": {
            "name": "Dash Punch",
            "pose": "assets/sprites/brawler/side_special.png",
            "hitbox": {"x": 50, "y": -10, "w": 75, "h": 40, "shape": "rect", "priority": 0},
            "damage": 12.0,
            "base_kb": 200,
            "kb_scaling": 1.1,
            "angle": 35,
            "frames": {"startup": 12, "active": 4, "endlag": 22},
        },
        "up_special": {
            "name": "Dragon Uppercut",
            "pose": "assets/sprites/brawler/up_special.png",
            "hitbox": {"x": 0, "y": -40, "w": 50, "h": 60, "shape": "rect", "priority": 0},
            "damage": 6.0,
            "base_kb": 170,
            "kb_scaling": 0.8,
            "angle": 80,
            "frames": {"startup": 5, "active": 6, "endlag": 15},
        },
        "down_special": {
            "name": "Ground Slam",
            "pose": "assets/sprites/brawler/down_special.png",
            "hitbox": {"x": 0, "y": 0, "w": 80, "h": 20, "shape": "rect", "priority": 0},
            "damage": 10.0,
            "base_kb": 150,
            "kb_scaling": 0.9,
            "angle": 70,
            "frames": {"startup": 8, "active": 5, "endlag": 20},
        },
    },
    
    # Ultimate
    "ultimate": {
        "name": "Meteor Strike",
        "pose": "assets/sprites/brawler/ultimate.png",
        "video": "assets/ultimate_brawler.mp4",  # Updated path
        "hitbox": {"x": 0, "y": 0, "w": 300, "h": 200, "shape": "rect", "priority": 10},
        "damage": 60.0,
        "base_kb": 550,
        "kb_scaling": 1.8,
        "angle": 60,
        "frames": {"startup": 0, "active": 6, "endlag": 30},
    },
}


# ======================================================================
#  FIGHTER 2: ZONER — Projectile specialist
# ======================================================================
ZONER_CONFIG = {
    "name": "Zoner",
    "weight": 85.0,
    "width": 48,
    "height": 78,
    "idle_sprite": "assets/sprite_zoner.png",
    
    "walk_speed": 230.0,
    "run_speed": 420.0,
    "air_speed": 320.0,
    "jump_force": 640.0,
    "short_hop_force": 410.0,
    "double_jump_force": 570.0,
    "max_jumps": 2,
    
    "attacks": {
        "neutral_attack": {
            "name": "Quick Jab",
            "pose": "assets/sprites/zoner/jab.png",
            "hitbox": {"x": 30, "y": -5, "w": 45, "h": 28, "shape": "rect", "priority": 0},
            "damage": 2.5,
            "base_kb": 70,
            "kb_scaling": 0.25,
            "angle": 25,
            "frames": {"startup": 2, "active": 2, "endlag": 5},
        },
        "side_attack": {
            "name": "Staff Swing",
            "pose": "assets/sprites/zoner/side_attack.png",
            "hitbox": {"x": 50, "y": -10, "w": 80, "h": 30, "shape": "rect", "priority": 0},
            "damage": 7.0,
            "base_kb": 130,
            "kb_scaling": 0.6,
            "angle": 35,
            "frames": {"startup": 6, "active": 3, "endlag": 15},
        },
        "up_attack": {
            "name": "Arc Blast",
            "pose": "assets/sprites/zoner/up_attack.png",
            "hitbox": {"x": 0, "y": -55, "w": 70, "h": 60, "shape": "circle", "priority": 0},
            "damage": 6.0,
            "base_kb": 140,
            "kb_scaling": 0.7,
            "angle": 85,
            "frames": {"startup": 5, "active": 4, "endlag": 14},
        },
        "down_attack": {
            "name": "Low Poke",
            "pose": "assets/sprites/zoner/down_attack.png",
            "hitbox": {"x": 40, "y": 8, "w": 70, "h": 22, "shape": "rect", "priority": 0},
            "damage": 5.5,
            "base_kb": 110,
            "kb_scaling": 0.5,
            "angle": 15,
            "frames": {"startup": 4, "active": 3, "endlag": 11},
        },
        
        "neutral_air": {
            "name": "Air Spin",
            "pose": "assets/sprites/zoner/nair.png",
            "hitbox": {"x": 0, "y": 0, "w": 65, "h": 65, "shape": "circle", "priority": 0},
            "damage": 6.5,
            "base_kb": 120,
            "kb_scaling": 0.45,
            "angle": 40,
            "frames": {"startup": 3, "active": 5, "endlag": 11},
        },
        "forward_air": {
            "name": "Forward Thrust",
            "pose": "assets/sprites/zoner/fair.png",
            "hitbox": {"x": 55, "y": -5, "w": 60, "h": 35, "shape": "rect", "priority": 0},
            "damage": 8.5,
            "base_kb": 145,
            "kb_scaling": 0.85,
            "angle": 40,
            "frames": {"startup": 7, "active": 3, "endlag": 17},
        },
        "up_air": {
            "name": "Upward Slash",
            "pose": "assets/sprites/zoner/uair.png",
            "hitbox": {"x": 0, "y": -52, "w": 58, "h": 52, "shape": "rect", "priority": 0},
            "damage": 7.5,
            "base_kb": 145,
            "kb_scaling": 0.8,
            "angle": 88,
            "frames": {"startup": 5, "active": 3, "endlag": 13},
        },
        "down_air": {
            "name": "Drill Kick",
            "pose": "assets/sprites/zoner/dair.png",
            "hitbox": {"x": 0, "y": 28, "w": 48, "h": 52, "shape": "rect", "priority": 0},
            "damage": 9.0,
            "base_kb": 160,
            "kb_scaling": 0.95,
            "angle": 275,
            "frames": {"startup": 9, "active": 4, "endlag": 21},
        },
        
        # --- Specials (heavy projectile focus) ---
        "neutral_special": {
            "name": "Plasma Shot",
            "pose": "assets/sprites/zoner/neutral_special.png",
            "hitbox": {"x": 35, "y": -5, "w": 35, "h": 28, "shape": "rect", "priority": 0},
            "damage": 7.0,
            "base_kb": 120,
            "kb_scaling": 0.6,
            "angle": 30,
            "frames": {"startup": 8, "active": 2, "endlag": 16},
            "projectile": {
                "type": "linear",
                "speed": 700,
                "lifetime": 150,
                "damage": 7.0,
                "kb": 120,
                "angle": 30,
            },
        },
        "side_special": {
            "name": "Charged Beam",
            "pose": "assets/sprites/zoner/side_special.png",
            "hitbox": {"x": 45, "y": -8, "w": 120, "h": 25, "shape": "rect", "priority": 0},
            "damage": 4.0,
            "base_kb": 90,
            "kb_scaling": 0.4,
            "angle": 25,
            "frames": {"startup": 14, "active": 8, "endlag": 20},
            "projectile": {
                "type": "beam",
                "speed": 0,
                "lifetime": 45,
                "damage": 4.0,
                "kb": 90,
                "angle": 25,
            },
        },
        "up_special": {
            "name": "Teleport Strike",
            "pose": "assets/sprites/zoner/up_special.png",
            "hitbox": {"x": 0, "y": -38, "w": 52, "h": 58, "shape": "rect", "priority": 0},
            "damage": 5.0,
            "base_kb": 150,
            "kb_scaling": 0.7,
            "angle": 78,
            "frames": {"startup": 6, "active": 5, "endlag": 16},
        },
        "down_special": {
            "name": "Gravity Trap",
            "pose": "assets/sprites/zoner/down_special.png",
            "hitbox": {"x": 0, "y": 0, "w": 90, "h": 90, "shape": "circle", "priority": 0},
            "damage": 3.0,
            "base_kb": 80,
            "kb_scaling": 0.3,
            "angle": 65,
            "frames": {"startup": 12, "active": 10, "endlag": 18},
            "projectile": {
                "type": "stationary",
                "speed": 0,
                "lifetime": 180,
                "damage": 3.0,
                "kb": 80,
                "angle": 65,
            },
        },
    },
    
    "ultimate": {
        "name": "Orbital Cannon",
        "pose": "assets/sprites/zoner/ultimate.png",
        "video": "assets/ultimate_zoner.mp4",
        "hitbox": {"x": 0, "y": 0, "w": 350, "h": 220, "shape": "rect", "priority": 10},
        "damage": 55.0,
        "base_kb": 520,
        "kb_scaling": 1.7,
        "angle": 55,
        "frames": {"startup": 0, "active": 8, "endlag": 28},
    },
}


# ======================================================================
#  FIGHTER 3: GRAPPLER — Heavy hitter with super-armor
# ======================================================================
GRAPPLER_CONFIG = {
    "name": "Grappler",
    "weight": 130.0,
    "width": 56,
    "height": 88,
    "idle_sprite": "assets/sprite_grappler.jpg",
    
    "walk_speed": 200.0,
    "run_speed": 380.0,
    "air_speed": 260.0,
    "jump_force": 600.0,
    "short_hop_force": 390.0,
    "double_jump_force": 540.0,
    "max_jumps": 2,
    
    "attacks": {
        "neutral_attack": {
            "name": "Palm Strike",
            "pose": "assets/sprites/grappler/jab.png",
            "hitbox": {"x": 38, "y": -8, "w": 55, "h": 38, "shape": "rect", "priority": 0},
            "damage": 5.0,
            "base_kb": 100,
            "kb_scaling": 0.4,
            "angle": 35,
            "frames": {"startup": 4, "active": 3, "endlag": 8},
        },
        "side_attack": {
            "name": "Heavy Haymaker",
            "pose": "assets/sprites/grappler/side_attack.png",
            "hitbox": {"x": 48, "y": -12, "w": 80, "h": 45, "shape": "rect", "priority": 1},
            "extra_hitboxes": [
                {"x": 35, "y": -10, "w": 60, "h": 40, "damage": 9, "priority": -1},
            ],
            "damage": 14.0,
            "base_kb": 190,
            "kb_scaling": 1.1,
            "angle": 42,
            "frames": {"startup": 8, "active": 4, "endlag": 18},
        },
        "up_attack": {
            "name": "Uppercut Slam",
            "pose": "assets/sprites/grappler/up_attack.png",
            "hitbox": {"x": 0, "y": -58, "w": 68, "h": 62, "shape": "rect", "priority": 0},
            "damage": 12.0,
            "base_kb": 180,
            "kb_scaling": 1.05,
            "angle": 82,
            "frames": {"startup": 6, "active": 5, "endlag": 16},
        },
        "down_attack": {
            "name": "Low Sweep",
            "pose": "assets/sprites/grappler/down_attack.png",
            "hitbox": {"x": 38, "y": 12, "w": 72, "h": 28, "shape": "rect", "priority": 0},
            "damage": 9.0,
            "base_kb": 140,
            "kb_scaling": 0.75,
            "angle": 18,
            "frames": {"startup": 5, "active": 4, "endlag": 13},
        },
        
        "neutral_air": {
            "name": "Body Splash",
            "pose": "assets/sprites/grappler/nair.png",
            "hitbox": {"x": 0, "y": 0, "w": 80, "h": 80, "shape": "circle", "priority": 0},
            "damage": 10.0,
            "base_kb": 150,
            "kb_scaling": 0.7,
            "angle": 50,
            "frames": {"startup": 5, "active": 6, "endlag": 14},
        },
        "forward_air": {
            "name": "Hammer Fist",
            "pose": "assets/sprites/grappler/fair.png",
            "hitbox": {"x": 50, "y": -8, "w": 65, "h": 48, "shape": "rect", "priority": 0},
            "damage": 13.0,
            "base_kb": 180,
            "kb_scaling": 1.15,
            "angle": 48,
            "frames": {"startup": 8, "active": 4, "endlag": 19},
        },
        "up_air": {
            "name": "Rising Headbutt",
            "pose": "assets/sprites/grappler/uair.png",
            "hitbox": {"x": 0, "y": -55, "w": 62, "h": 58, "shape": "rect", "priority": 0},
            "damage": 11.0,
            "base_kb": 170,
            "kb_scaling": 1.0,
            "angle": 87,
            "frames": {"startup": 6, "active": 4, "endlag": 15},
        },
        "down_air": {
            "name": "Earthquake Drop",
            "pose": "assets/sprites/grappler/dair.png",
            "hitbox": {"x": 0, "y": 32, "w": 58, "h": 58, "shape": "rect", "priority": 1},
            "damage": 16.0,
            "base_kb": 210,
            "kb_scaling": 1.4,
            "angle": 270,
            "frames": {"startup": 10, "active": 4, "endlag": 25},
        },
        
        "neutral_special": {
            "name": "Power Wave",
            "pose": "assets/sprites/grappler/neutral_special.png",
            "hitbox": {"x": 42, "y": -6, "w": 45, "h": 35, "shape": "rect", "priority": 0},
            "damage": 10.0,
            "base_kb": 160,
            "kb_scaling": 0.85,
            "angle": 38,
            "frames": {"startup": 14, "active": 3, "endlag": 22},
            "projectile": {
                "type": "energy_wave",
                "speed": 450,
                "lifetime": 100,
                "damage": 10.0,
                "kb": 160,
                "angle": 38,
            },
        },
        "side_special": {
            "name": "Charging Bull",
            "pose": "assets/sprites/grappler/side_special.png",
            "hitbox": {"x": 55, "y": -15, "w": 85, "h": 50, "shape": "rect", "priority": 1},
            "damage": 15.0,
            "base_kb": 220,
            "kb_scaling": 1.25,
            "angle": 38,
            "frames": {"startup": 16, "active": 6, "endlag": 26},
        },
        "up_special": {
            "name": "Rising Slam",
            "pose": "assets/sprites/grappler/up_special.png",
            "hitbox": {"x": 0, "y": -45, "w": 58, "h": 68, "shape": "rect", "priority": 0},
            "damage": 8.0,
            "base_kb": 180,
            "kb_scaling": 0.9,
            "angle": 80,
            "frames": {"startup": 7, "active": 8, "endlag": 18},
        },
        "down_special": {
            "name": "Ground Shatter (Armor)",
            "pose": "assets/sprites/grappler/down_special.png",
            "hitbox": {"x": 0, "y": 0, "w": 100, "h": 25, "shape": "rect", "priority": 0},
            "damage": 12.0,
            "base_kb": 170,
            "kb_scaling": 1.0,
            "angle": 72,
            "frames": {"startup": 10, "active": 8, "endlag": 24},
        },
    },
    
    "ultimate": {
        "name": "Titanic Slam",
        "pose": "assets/sprites/grappler/ultimate.png",
        "video": "assets/ultimate_grappler.mp4",
        "hitbox": {"x": 0, "y": 0, "w": 320, "h": 240, "shape": "rect", "priority": 10},
        "damage": 70.0,
        "base_kb": 600,
        "kb_scaling": 1.9,
        "angle": 65,
        "frames": {"startup": 0, "active": 7, "endlag": 35},
    },
}


# ======================================================================
#  FIGHTER 4: SPEEDSTER — Fast combo character
# ======================================================================
SPEEDSTER_CONFIG = {
    "name": "Speedster",
    "weight": 78.0,
    "width": 46,
    "height": 74,
    "idle_sprite": "assets/sprite_speedster.jpg",
    
    "walk_speed": 280.0,
    "run_speed": 520.0,
    "air_speed": 360.0,
    "jump_force": 680.0,
    "short_hop_force": 440.0,
    "double_jump_force": 600.0,
    "max_jumps": 3,  # Triple jump!
    
    "attacks": {
        "neutral_attack": {
            "name": "Lightning Jab",
            "pose": "assets/sprites/speedster/jab.png",
            "hitbox": {"x": 32, "y": -4, "w": 42, "h": 26, "shape": "rect", "priority": 0},
            "damage": 2.0,
            "base_kb": 60,
            "kb_scaling": 0.2,
            "angle": 28,
            "frames": {"startup": 1, "active": 2, "endlag": 4},
        },
        "side_attack": {
            "name": "Quick Slash",
            "pose": "assets/sprites/speedster/side_attack.png",
            "hitbox": {"x": 42, "y": -8, "w": 62, "h": 32, "shape": "rect", "priority": 0},
            "damage": 6.5,
            "base_kb": 125,
            "kb_scaling": 0.65,
            "angle": 36,
            "frames": {"startup": 4, "active": 3, "endlag": 11},
        },
        "up_attack": {
            "name": "Flash Kick",
            "pose": "assets/sprites/speedster/up_attack.png",
            "hitbox": {"x": 0, "y": -48, "w": 56, "h": 52, "shape": "rect", "priority": 0},
            "damage": 7.0,
            "base_kb": 145,
            "kb_scaling": 0.8,
            "angle": 84,
            "frames": {"startup": 3, "active": 4, "endlag": 10},
        },
        "down_attack": {
            "name": "Leg Sweep",
            "pose": "assets/sprites/speedster/down_attack.png",
            "hitbox": {"x": 36, "y": 9, "w": 60, "h": 23, "shape": "rect", "priority": 0},
            "damage": 5.5,
            "base_kb": 105,
            "kb_scaling": 0.5,
            "angle": 22,
            "frames": {"startup": 2, "active": 3, "endlag": 8},
        },
        
        "neutral_air": {
            "name": "Spin Kick",
            "pose": "assets/sprites/speedster/nair.png",
            "hitbox": {"x": 0, "y": 0, "w": 62, "h": 62, "shape": "circle", "priority": 0},
            "damage": 5.5,
            "base_kb": 110,
            "kb_scaling": 0.4,
            "angle": 42,
            "frames": {"startup": 2, "active": 5, "endlag": 8},
        },
        "forward_air": {
            "name": "Dash Strike",
            "pose": "assets/sprites/speedster/fair.png",
            "hitbox": {"x": 48, "y": -6, "w": 52, "h": 36, "shape": "rect", "priority": 0},
            "damage": 8.0,
            "base_kb": 140,
            "kb_scaling": 0.85,
            "angle": 43,
            "frames": {"startup": 5, "active": 3, "endlag": 13},
        },
        "up_air": {
            "name": "Air Scissors",
            "pose": "assets/sprites/speedster/uair.png",
            "hitbox": {"x": 0, "y": -50, "w": 54, "h": 48, "shape": "rect", "priority": 0},
            "damage": 6.5,
            "base_kb": 135,
            "kb_scaling": 0.75,
            "angle": 86,
            "frames": {"startup": 3, "active": 3, "endlag": 10},
        },
        "down_air": {
            "name": "Drill Dive",
            "pose": "assets/sprites/speedster/dair.png",
            "hitbox": {"x": 0, "y": 26, "w": 46, "h": 50, "shape": "rect", "priority": 0},
            "damage": 7.0,
            "base_kb": 130,
            "kb_scaling": 0.8,
            "angle": 278,
            "frames": {"startup": 6, "active": 5, "endlag": 18},
        },
        
        "neutral_special": {
            "name": "Shuriken Toss",
            "pose": "assets/sprites/speedster/neutral_special.png",
            "hitbox": {"x": 38, "y": -5, "w": 38, "h": 28, "shape": "rect", "priority": 0},
            "damage": 6.0,
            "base_kb": 115,
            "kb_scaling": 0.55,
            "angle": 32,
            "frames": {"startup": 7, "active": 2, "endlag": 14},
            "projectile": {
                "type": "boomerang",
                "speed": 750,
                "lifetime": 100,
                "damage": 6.0,
                "kb": 115,
                "angle": 32,
            },
        },
        "side_special": {
            "name": "Sonic Dash",
            "pose": "assets/sprites/speedster/side_special.png",
            "hitbox": {"x": 52, "y": -10, "w": 70, "h": 38, "shape": "rect", "priority": 0},
            "damage": 9.0,
            "base_kb": 170,
            "kb_scaling": 0.95,
            "angle": 34,
            "frames": {"startup": 8, "active": 5, "endlag": 18},
        },
        "up_special": {
            "name": "Rising Spin",
            "pose": "assets/sprites/speedster/up_special.png",
            "hitbox": {"x": 0, "y": -42, "w": 50, "h": 62, "shape": "rect", "priority": 0},
            "damage": 4.0,
            "base_kb": 140,
            "kb_scaling": 0.65,
            "angle": 79,
            "frames": {"startup": 4, "active": 8, "endlag": 14},
        },
        "down_special": {
            "name": "Counter Slash",
            "pose": "assets/sprites/speedster/down_special.png",
            "hitbox": {"x": 0, "y": 0, "w": 75, "h": 22, "shape": "rect", "priority": 0},
            "damage": 8.0,
            "base_kb": 155,
            "kb_scaling": 0.85,
            "angle": 68,
            "frames": {"startup": 5, "active": 10, "endlag": 16},
        },
    },
    
    "ultimate": {
        "name": "Time Rift Barrage",
        "pose": "assets/sprites/speedster/ultimate.png",
        "video": "assets/ultimate_speedster.mp4",
        "hitbox": {"x": 0, "y": 0, "w": 280, "h": 200, "shape": "rect", "priority": 10},
        "damage": 50.0,
        "base_kb": 480,
        "kb_scaling": 1.6,
        "angle": 58,
        "frames": {"startup": 0, "active": 10, "endlag": 25},
    },
}


# ======================================================================
#  FIGHTER 5: TANK — Defensive powerhouse
# ======================================================================
TANK_CONFIG = {
    "name": "Tank",
    "weight": 145.0,
    "width": 60,
    "height": 92,
    
    "walk_speed": 180.0,
    "run_speed": 350.0,
    "air_speed": 240.0,
    "jump_force": 580.0,
    "short_hop_force": 370.0,
    "double_jump_force": 520.0,
    "max_jumps": 2,
    
    "attacks": {
        "neutral_attack": {
            "name": "Shield Bash",
            "pose": "assets/sprites/tank/jab.png",
            "hitbox": {"x": 40, "y": -10, "w": 60, "h": 42, "shape": "rect", "priority": 0},
            "damage": 6.0,
            "base_kb": 110,
            "kb_scaling": 0.5,
            "angle": 40,
            "frames": {"startup": 5, "active": 4, "endlag": 10},
        },
        "side_attack": {
            "name": "Mace Swing",
            "pose": "assets/sprites/tank/side_attack.png",
            "hitbox": {"x": 52, "y": -14, "w": 88, "h": 48, "shape": "rect", "priority": 1},
            "extra_hitboxes": [
                {"x": 38, "y": -12, "w": 65, "h": 45, "damage": 11, "priority": -1},
            ],
            "damage": 16.0,
            "base_kb": 210,
            "kb_scaling": 1.2,
            "angle": 44,
            "frames": {"startup": 10, "active": 5, "endlag": 22},
        },
        "up_attack": {
            "name": "Skyward Thrust",
            "pose": "assets/sprites/tank/up_attack.png",
            "hitbox": {"x": 0, "y": -62, "w": 72, "h": 68, "shape": "rect", "priority": 0},
            "damage": 13.0,
            "base_kb": 185,
            "kb_scaling": 1.1,
            "angle": 83,
            "frames": {"startup": 7, "active": 6, "endlag": 18},
        },
        "down_attack": {
            "name": "Ground Stomp",
            "pose": "assets/sprites/tank/down_attack.png",
            "hitbox": {"x": 0, "y": 0, "w": 95, "h": 30, "shape": "rect", "priority": 0},
            "damage": 11.0,
            "base_kb": 155,
            "kb_scaling": 0.85,
            "angle": 20,
            "frames": {"startup": 6, "active": 5, "endlag": 16},
        },
        
        "neutral_air": {
            "name": "Spinning Armor",
            "pose": "assets/sprites/tank/nair.png",
            "hitbox": {"x": 0, "y": 0, "w": 85, "h": 85, "shape": "circle", "priority": 0},
            "damage": 11.0,
            "base_kb": 155,
            "kb_scaling": 0.75,
            "angle": 52,
            "frames": {"startup": 6, "active": 7, "endlag": 16},
        },
        "forward_air": {
            "name": "Heavy Strike",
            "pose": "assets/sprites/tank/fair.png",
            "hitbox": {"x": 54, "y": -10, "w": 70, "h": 52, "shape": "rect", "priority": 0},
            "damage": 15.0,
            "base_kb": 195,
            "kb_scaling": 1.25,
            "angle": 50,
            "frames": {"startup": 10, "active": 5, "endlag": 22},
        },
        "up_air": {
            "name": "Overhead Smash",
            "pose": "assets/sprites/tank/uair.png",
            "hitbox": {"x": 0, "y": -58, "w": 68, "h": 62, "shape": "rect", "priority": 0},
            "damage": 12.0,
            "base_kb": 175,
            "kb_scaling": 1.05,
            "angle": 88,
            "frames": {"startup": 7, "active": 5, "endlag": 17},
        },
        "down_air": {
            "name": "Anvil Drop",
            "pose": "assets/sprites/tank/dair.png",
            "hitbox": {"x": 0, "y": 34, "w": 62, "h": 62, "shape": "rect", "priority": 1},
            "damage": 18.0,
            "base_kb": 230,
            "kb_scaling": 1.5,
            "angle": 270,
            "frames": {"startup": 12, "active": 5, "endlag": 28},
        },
        
        "neutral_special": {
            "name": "Boulder Toss",
            "pose": "assets/sprites/tank/neutral_special.png",
            "hitbox": {"x": 44, "y": -8, "w": 48, "h": 38, "shape": "rect", "priority": 0},
            "damage": 12.0,
            "base_kb": 170,
            "kb_scaling": 0.95,
            "angle": 40,
            "frames": {"startup": 16, "active": 3, "endlag": 24},
            "projectile": {
                "type": "barrel",
                "speed": 520,
                "lifetime": 120,
                "damage": 12.0,
                "kb": 170,
                "angle": 40,
            },
        },
        "side_special": {
            "name": "Shield Ram",
            "pose": "assets/sprites/tank/side_special.png",
            "hitbox": {"x": 58, "y": -16, "w": 90, "h": 55, "shape": "rect", "priority": 1},
            "damage": 17.0,
            "base_kb": 235,
            "kb_scaling": 1.3,
            "angle": 40,
            "frames": {"startup": 18, "active": 7, "endlag": 28},
        },
        "up_special": {
            "name": "Rocket Launch",
            "pose": "assets/sprites/tank/up_special.png",
            "hitbox": {"x": 0, "y": -48, "w": 62, "h": 72, "shape": "rect", "priority": 0},
            "damage": 10.0,
            "base_kb": 190,
            "kb_scaling": 0.95,
            "angle": 81,
            "frames": {"startup": 8, "active": 10, "endlag": 20},
        },
        "down_special": {
            "name": "Explosive Mine",
            "pose": "assets/sprites/tank/down_special.png",
            "hitbox": {"x": 0, "y": 0, "w": 50, "h": 35, "shape": "rect", "priority": 0},
            "damage": 8.0,
            "base_kb": 140,
            "kb_scaling": 0.8,
            "angle": 70,
            "frames": {"startup": 14, "active": 6, "endlag": 22},
            "projectile": {
                "type": "blast",
                "speed": 250,
                "lifetime": 90,
                "damage": 8.0,
                "kb": 140,
                "angle": 70,
            },
        },
    },
    
    "ultimate": {
        "name": "Fortress Barrage",
        "pose": "assets/sprites/tank/ultimate.png",
        "video": "assets/videos/tank_ultimate.mp4",
        "hitbox": {"x": 0, "y": 0, "w": 340, "h": 260, "shape": "rect", "priority": 10},
        "damage": 38.0,
        "base_kb": 480,
        "kb_scaling": 1.7,
        "angle": 68,
        "frames": {"startup": 0, "active": 8, "endlag": 38},
    },
}


# ======================================================================
#  ROSTER  — Lookup dictionary
# ======================================================================
FIGHTER_ROSTER = {
    "brawler": BRAWLER_CONFIG,
    "zoner": ZONER_CONFIG,
    "grappler": GRAPPLER_CONFIG,
    "speedster": SPEEDSTER_CONFIG,
    "tank": TANK_CONFIG,
}


# ======================================================================
#  Builder function  — Convert dict → FighterData instance
# ======================================================================
def build_fighter_data(config: dict) -> FighterData:
    """Convert a fighter config dictionary into a FighterData instance.
    
    Parameters
    ----------
    config : dict
        Fighter configuration (see FIGHTER_ROSTER for examples).
    
    Returns
    -------
    FighterData
        Ready-to-use fighter data object.
    
    Example
    -------
        config = FIGHTER_ROSTER["brawler"]
        fighter_data = build_fighter_data(config)
        fighter = Fighter(port=0, data=fighter_data, spawn_x=400, spawn_y=300)
    """
    # Build attacks
    attacks = {}
    for move_name, atk_cfg in config["attacks"].items():
        hb = atk_cfg["hitbox"]
        frames = atk_cfg["frames"]
        
        atk = AttackData(
            name=atk_cfg["name"],
            pose_key=atk_cfg["pose"],
            hitbox_x=hb["x"],
            hitbox_y=hb["y"],
            hitbox_w=hb["w"],
            hitbox_h=hb["h"],
            hitbox_shape=hb.get("shape", "rect"),
            hitbox_priority=hb.get("priority", 0),
            damage=atk_cfg["damage"],
            base_knockback=atk_cfg["base_kb"],
            kb_scaling=atk_cfg["kb_scaling"],
            angle=atk_cfg["angle"],
            startup_frames=frames["startup"],
            active_frames=frames["active"],
            endlag_frames=frames["endlag"],
        )
        
        # Extra hitboxes (sweetspot / sourspot)
        if "extra_hitboxes" in atk_cfg:
            atk.extra_hitboxes = atk_cfg["extra_hitboxes"]
        
        # Projectile spawning
        if "projectile" in atk_cfg:
            proj = atk_cfg["projectile"]
            atk.spawns_projectile = True
            atk.projectile_type = proj["type"]
            atk.projectile_speed = proj["speed"]
            atk.projectile_lifetime = proj["lifetime"]
            atk.projectile_damage = proj["damage"]
            atk.projectile_kb = proj["kb"]
            atk.projectile_angle = proj["angle"]
        
        attacks[move_name] = atk
    
    # Build ultimate
    ult_cfg = config["ultimate"]
    hb_ult = ult_cfg["hitbox"]
    fr_ult = ult_cfg["frames"]
    
    ultimate_attack = AttackData(
        name=ult_cfg["name"],
        pose_key=ult_cfg["pose"],
        hitbox_x=hb_ult["x"],
        hitbox_y=hb_ult["y"],
        hitbox_w=hb_ult["w"],
        hitbox_h=hb_ult["h"],
        hitbox_shape=hb_ult.get("shape", "rect"),
        hitbox_priority=hb_ult.get("priority", 10),
        damage=ult_cfg["damage"],
        base_knockback=ult_cfg["base_kb"],
        kb_scaling=ult_cfg["kb_scaling"],
        angle=ult_cfg["angle"],
        startup_frames=fr_ult["startup"],
        active_frames=fr_ult["active"],
        endlag_frames=fr_ult["endlag"],
    )
    
    # Build FighterData
    return FighterData(
        name=config["name"],
        weight=config["weight"],
        width=config["width"],
        height=config["height"],
        walk_speed=config["walk_speed"],
        run_speed=config["run_speed"],
        air_speed=config["air_speed"],
        jump_force=config["jump_force"],
        short_hop_force=config["short_hop_force"],
        double_jump_force=config["double_jump_force"],
        max_jumps=config["max_jumps"],
        attacks=attacks,
        ultimate_video=ult_cfg["video"],
        ultimate_attack=ultimate_attack,
        idle_sprite=config.get("idle_sprite", ""),
    )


# ======================================================================
#  USAGE EXAMPLES
# ======================================================================
if __name__ == "__main__":
    import json
    
    # Example 1: Build a single fighter
    brawler_data = build_fighter_data(FIGHTER_ROSTER["brawler"])
    print(f"✓ Built {brawler_data.name}: {len(brawler_data.attacks)} attacks, weight={brawler_data.weight}")
    
    # Example 2: Build all fighters
    all_fighters = {name: build_fighter_data(cfg) 
                    for name, cfg in FIGHTER_ROSTER.items()}
    print(f"\n✓ Built {len(all_fighters)} fighters:")
    for name, data in all_fighters.items():
        print(f"  - {data.name:12s} | weight={data.weight:5.1f} | jumps={data.max_jumps}")
    
    # Example 3: Export roster as JSON (for external tools / editors)
    print("\n✓ JSON export sample (first 10 lines):")
    json_export = json.dumps(FIGHTER_ROSTER["speedster"], indent=2)
    print("\n".join(json_export.split("\n")[:10]) + "\n  ...")
    
    # Example 4: Query specific move data
    zoner = FIGHTER_ROSTER["zoner"]
    beam = zoner["attacks"]["side_special"]
    print(f"\n✓ {zoner['name']}'s {beam['name']}:")
    print(f"    Damage: {beam['damage']}, KB: {beam['base_kb']}, Frames: {beam['frames']}")
    print(f"    Projectile: {beam['projectile']['type']} (lifetime={beam['projectile']['lifetime']}f)")
    
    print("\n✓ All configuration systems operational.")
