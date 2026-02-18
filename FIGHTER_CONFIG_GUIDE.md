# Fighter Configuration System — Quick Start Guide

## Overview

The `fighter_configs.py` module provides a **data-driven configuration system** for 5 unique fighters. Each fighter is defined as a clean Python dictionary with complete moveset data, making it easy to balance, extend, and plug into the game engine.

## Roster

| Fighter | Weight | Max Jumps | Playstyle |
|---------|--------|-----------|-----------|
| **Brawler** | 100.0 | 2 | Balanced all-rounder with projectile neutral special |
| **Zoner** | 85.0 | 2 | Projectile specialist (plasma, beam, trap, teleport) |
| **Grappler** | 130.0 | 2 | Heavy hitter with super-armor and slow speed |
| **Speedster** | 78.0 | **3** | Fast combo character with triple jump and boomerang |
| **Tank** | 145.0 | 2 | Defensive powerhouse with explosive projectiles |

---

## Quick Start

### 1. Import and Build

```python
from fighter_configs import FIGHTER_ROSTER, build_fighter_data
from entities.fighter import Fighter

# Build a fighter from config
brawler_config = FIGHTER_ROSTER["brawler"]
brawler_data = build_fighter_data(brawler_config)

# Create Fighter instance
fighter = Fighter(port=0, data=brawler_data, spawn_x=400, spawn_y=300)
```

### 2. Build All Fighters

```python
# Create all 5 fighters at once
all_fighters = {
    name: build_fighter_data(cfg) 
    for name, cfg in FIGHTER_ROSTER.items()
}

# Use in character select
selected = all_fighters["speedster"]
```

### 3. Query Move Data

```python
# Get specific attack config
zoner_cfg = FIGHTER_ROSTER["zoner"]
beam_attack = zoner_cfg["attacks"]["side_special"]

print(f"Damage: {beam_attack['damage']}")
print(f"Projectile: {beam_attack['projectile']['type']}")
# Output: Damage: 4.0
#         Projectile: beam
```

---

## Configuration Structure

Each fighter config dictionary contains:

### Top-Level Fields

```python
{
    "name": "Brawler",              # Display name
    "weight": 100.0,                # Knockback resistance (higher = harder to launch)
    "width": 50,                    # Collision box width (pixels)
    "height": 80,                   # Collision box height (pixels)
    
    # Movement stats
    "walk_speed": 250.0,            # Ground walk speed (px/s)
    "run_speed": 450.0,             # Ground run speed (px/s)
    "air_speed": 300.0,             # Air lateral speed (px/s)
    "jump_force": 650.0,            # Full hop velocity (px/s)
    "short_hop_force": 420.0,       # Short hop velocity (px/s)
    "double_jump_force": 580.0,     # Double/triple jump velocity (px/s)
    "max_jumps": 2,                 # Number of jumps (1-3)
    
    "attacks": { ... },             # See below
    "ultimate": { ... },            # See below
}
```

### Attack Structure

Each attack in the `"attacks"` dictionary:

```python
"side_attack": {
    "name": "Power Punch",                    # Display name
    "pose": "assets/sprites/brawler/side.png", # Static PNG image path
    
    # Hitbox geometry
    "hitbox": {
        "x": 40,                              # Offset from fighter position
        "y": -10,
        "w": 70,                              # Width (pixels)
        "h": 35,                              # Height (pixels)
        "shape": "rect",                      # "rect" or "circle"
        "priority": 0,                        # Higher = wins in multi-hit
    },
    
    # Damage & knockback
    "damage": 9.0,                            # Damage dealt (adds to %)
    "base_kb": 150,                           # Base knockback force
    "kb_scaling": 0.8,                        # Scaling with target's %
    "angle": 40,                              # Launch angle (degrees)
    
    # Frame data
    "frames": {
        "startup": 5,                         # Frames before hitbox active
        "active": 3,                          # Frames hitbox is active
        "endlag": 14,                         # Frames after hitbox ends
    },
    
    # Optional: Multi-hitbox (sweetspot / sourspot)
    "extra_hitboxes": [
        {"x": 30, "y": -5, "w": 50, "h": 40, "damage": 6, "priority": -1},
    ],
    
    # Optional: Projectile spawning
    "projectile": {
        "type": "linear",                     # linear, arc, beam, etc.
        "speed": 600,                         # Projectile velocity (px/s)
        "lifetime": 120,                      # Duration (frames)
        "damage": 8.0,                        # Projectile damage
        "kb": 140,                            # Projectile knockback
        "angle": 35,                          # Projectile launch angle
    },
}
```

### Ultimate Structure

```python
"ultimate": {
    "name": "Meteor Strike",
    "pose": "assets/sprites/brawler/ultimate.png",  # Static PNG
    "video": "assets/videos/brawler_ultimate.mp4",  # Cutscene video
    
    "hitbox": {
        "x": 0, "y": 0, "w": 300, "h": 200,
        "shape": "rect", "priority": 10,
    },
    
    "damage": 30.0,
    "base_kb": 400,
    "kb_scaling": 1.5,
    "angle": 60,
    
    "frames": {
        "startup": 0,     # Ultimates typically have 0 startup
        "active": 6,
        "endlag": 30,
    },
}
```

---

## Attack Types by Fighter

### Brawler (Balanced)

- **Ground**: Jab, Power Punch, Rising Uppercut, Sweep Kick
- **Air**: Spinning Kick, Flying Knee (sweetspot), Bicycle Kick, Meteor Stomp
- **Specials**: Energy Ball (linear projectile), Dash Punch, Dragon Uppercut, Ground Slam
- **Ultimate**: Meteor Strike (300×200 AoE)

### Zoner (Projectile Specialist)

- **Ground**: Quick Jab, Staff Swing, Arc Blast, Low Poke
- **Air**: Air Spin, Forward Thrust, Upward Slash, Drill Kick
- **Specials**:
  - Plasma Shot (linear, 700 px/s)
  - **Charged Beam** (beam type, 120×25 hitbox, multi-hit)
  - Teleport Strike (recovery)
  - **Gravity Trap** (stationary, 180f lifetime)
- **Ultimate**: Orbital Cannon (350×220 AoE)

### Grappler (Heavy Hitter)

- **Ground**: Palm Strike, Heavy Haymaker (sweetspot), Uppercut Slam, Low Sweep
- **Air**: Body Splash, Hammer Fist, Rising Headbutt, Earthquake Drop (spike)
- **Specials**:
  - **Power Wave** (energy_wave type, follows ground)
  - Charging Bull (armor)
  - Rising Slam (recovery)
  - Ground Shatter (armor, AoE)
- **Ultimate**: Titanic Slam (320×240 AoE)

### Speedster (Fast Combo)

- **Unique**: **Triple jump** (max_jumps=3)
- **Ground**: Lightning Jab (1f startup!), Quick Slash, Flash Kick, Leg Sweep
- **Air**: Spin Kick, Dash Strike, Air Scissors, Drill Dive
- **Specials**:
  - **Shuriken Toss** (boomerang type, returns)
  - Sonic Dash (fast approach)
  - Rising Spin (multi-hit recovery)
  - Counter Slash (counter window)
- **Ultimate**: Time Rift Barrage (280×200 AoE)

### Tank (Defensive Powerhouse)

- **Unique**: Heaviest weight (145.0), slowest movement
- **Ground**: Shield Bash, Mace Swing (sweetspot), Skyward Thrust, Ground Stomp
- **Air**: Spinning Armor, Heavy Strike, Overhead Smash, Anvil Drop (spike)
- **Specials**:
  - **Boulder Toss** (barrel type, bounces off platforms)
  - Shield Ram (armor)
  - Rocket Launch (recovery)
  - **Explosive Mine** (blast type, spawns explosion on hit)
- **Ultimate**: Fortress Barrage (340×260 AoE, highest damage)

---

## Projectile Types Reference

| Type | Behavior | Stage Collision | Example |
|------|----------|-----------------|---------|
| **linear** | Straight line, constant velocity | DESTROY | Brawler's Energy Ball |
| **arc** | Gravity-affected parabola | DESTROY | (Not used in roster) |
| **beam** | Wide laser, multi-hit, pulsing render | NONE | Zoner's Charged Beam |
| **energy_wave** | Follows ground surface, snaps to platforms | SLIDE | Grappler's Power Wave |
| **boomerang** | Returns to origin after max distance | NONE | Speedster's Shuriken |
| **barrel** | Bounces off platforms with dampening | BOUNCE | Tank's Boulder Toss |
| **blast** | Explodes into radial AoE on hit/stage | DESTROY | Tank's Explosive Mine |
| **stationary** | Static trap, no movement | NONE | Zoner's Gravity Trap |
| **piercing** | Passes through fighters | NONE | (Not used in roster) |

---

## Frame Data Glossary

- **Startup**: Frames before hitbox becomes active (cannot act during this)
- **Active**: Frames the hitbox can hit opponents
- **Endlag**: Frames after hitbox ends before returning to idle state
- **Total frames**: `startup + active + endlag`

### Example: Brawler's Side Attack

```python
"frames": {"startup": 5, "active": 3, "endlag": 14}
# Total: 22 frames (0.37 seconds at 60 FPS)
```

**Timeline**:
- Frames 0-4: Startup (no hitbox)
- Frames 5-7: Active (can hit)
- Frames 8-21: Endlag (cannot act)
- Frame 22: Return to idle

---

## Sweetspot / Sourspot System

Multi-hitbox attacks use `extra_hitboxes` for tipper/sweetspot mechanics:

```python
"forward_air": {
    "hitbox": {..., "damage": 10.0, "priority": 1},  # Sweetspot (tip)
    "extra_hitboxes": [
        {"x": 30, "damage": 6, "priority": -1},      # Sourspot (base)
    ],
}
```

**Collision priority**:
1. System checks all hitboxes against target
2. Selects **highest priority** hitbox that connects
3. Applies that hitbox's damage/knockback
4. If priorities tie, earlier in list wins

---

## Adding New Fighters

### Step 1: Create Config Dictionary

```python
MY_FIGHTER_CONFIG = {
    "name": "Wizard",
    "weight": 90.0,
    "width": 48,
    "height": 76,
    "walk_speed": 240.0,
    "run_speed": 430.0,
    "air_speed": 310.0,
    "jump_force": 660.0,
    "short_hop_force": 420.0,
    "double_jump_force": 590.0,
    "max_jumps": 2,
    
    "attacks": {
        "neutral_attack": { ... },
        "side_attack": { ... },
        # ... define all 12 attacks (8 normals + 4 specials)
    },
    
    "ultimate": { ... },
}
```

### Step 2: Add to Roster

```python
FIGHTER_ROSTER = {
    "brawler": BRAWLER_CONFIG,
    "zoner": ZONER_CONFIG,
    "grappler": GRAPPLER_CONFIG,
    "speedster": SPEEDSTER_CONFIG,
    "tank": TANK_CONFIG,
    "wizard": MY_FIGHTER_CONFIG,  # ← Add here
}
```

### Step 3: Build and Test

```python
wizard_data = build_fighter_data(MY_FIGHTER_CONFIG)
wizard = Fighter(port=0, data=wizard_data, spawn_x=640, spawn_y=360)
```

---

## Export / Import

### Export as JSON

```python
import json

# Export single fighter
with open("brawler.json", "w") as f:
    json.dump(FIGHTER_ROSTER["brawler"], f, indent=2)

# Export entire roster
with open("roster.json", "w") as f:
    json.dump(FIGHTER_ROSTER, f, indent=2)
```

### Import from JSON

```python
import json

with open("custom_fighter.json", "r") as f:
    custom_config = json.load(f)

custom_data = build_fighter_data(custom_config)
```

---

## Integration with Existing Systems

### With Fighter Class

```python
from entities.fighter import Fighter
from fighter_configs import FIGHTER_ROSTER, build_fighter_data

# Character select
fighter_name = "speedster"
fighter_data = build_fighter_data(FIGHTER_ROSTER[fighter_name])

# Spawn in game
player = Fighter(
    port=0,
    data=fighter_data,
    spawn_x=640,
    spawn_y=360
)
```

### With Game Loop

```python
from engine.game import Game

# Build all fighters
all_fighters = {
    name: build_fighter_data(cfg) 
    for name, cfg in FIGHTER_ROSTER.items()
}

# Character select
p1_data = all_fighters["brawler"]
p2_data = all_fighters["tank"]

# Start game
game = Game(fighter_data_list=[p1_data, p2_data], stage_name="battlefield")
game.run()
```

### With Projectile System

Attacks with `"projectile"` keys automatically spawn projectiles:

```python
# When fighter uses neutral_special:
# 1. HitboxGroup created from attack data
# 2. On first active frame, Game.py checks `spawns_projectile`
# 3. Creates projectile via ProjectileFactory
# 4. ProjectileManager.spawn() adds to active list

# From game.py:
if attack_data.spawns_projectile and first_hb.elapsed_frames == 0:
    proj = ProjectileFactory.create(
        proj_type=attack_data.projectile_type,
        owner_port=fighter.port,
        # ... uses projectile_speed, projectile_damage, etc.
    )
    self.projectiles.spawn(proj)
```

---

## Best Practices

### Balance Guidelines

1. **Damage**: 2-5 (jabs), 6-10 (tilts), 12-18 (heavy attacks), 25-40 (ultimates)
2. **Knockback**: Base 60-120 (combo), 150-220 (kill moves), 350-500 (ultimates)
3. **Startup**: 1-4 (fast), 5-8 (medium), 10-18 (slow)
4. **Weight**: 75-95 (light), 95-115 (medium), 115-150 (heavy)

### File Paths

Use relative paths from `smash 3/` root:

```python
"pose": "assets/sprites/brawler/jab.png"
"video": "assets/videos/brawler_ultimate.mp4"
```

### Projectile Lifetimes

- **Fast projectiles** (600+ px/s): 90-150 frames (1.5-2.5s)
- **Slow projectiles** (300-500 px/s): 60-120 frames
- **Stationary traps**: 120-240 frames (2-4s)
- **Beams**: 30-60 frames (0.5-1s)

---

## Troubleshooting

### "KeyError: 'neutral_attack'"

Ensure all 12 required attacks are defined:
- Ground: `neutral_attack`, `side_attack`, `up_attack`, `down_attack`
- Air: `neutral_air`, `forward_air`, `up_air`, `down_air`
- Specials: `neutral_special`, `side_special`, `up_special`, `down_special`

### Projectile Not Spawning

Check:
1. Attack has `"projectile"` key
2. `projectile_type` matches ProjectileFactory types
3. Game loop calls `projectiles.update()` with `stage` parameter

### Hitbox Not Connecting

Verify:
1. Hitbox offset/size appropriate for character dimensions
2. `active_frames > 0`
3. Shape is `"rect"` or `"circle"`
4. Priority doesn't conflict with other hitboxes

---

## Summary

✅ **5 fully-configured fighters** with distinct playstyles  
✅ **12 attacks per fighter** (8 normals + 4 specials)  
✅ **Ultimate with MP4 placeholder** paths  
✅ **Projectile system integration** (8 projectile attacks across roster)  
✅ **Sweetspot/sourspot support** (Brawler's fair, Grappler's side, Tank's side)  
✅ **Clean Python dict format** (JSON-exportable)  
✅ **Pluggable into Fighter class** via `build_fighter_data()`  
✅ **Modular and expandable** (add new fighters by copying structure)  

**Total attack definitions**: 60 attacks + 5 ultimates = **65 moves** configured

**All systems operational.** Ready for character select, balancing, and expansion! 🎮
