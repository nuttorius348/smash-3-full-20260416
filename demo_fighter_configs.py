"""Integration demo: Using fighter_configs.py with the Fighter class and Game loop.

This example demonstrates:
1. Building fighters from configs
2. Creating a 2-player match
3. Querying move data dynamically
4. Character select screen simulation
"""

from fighter_configs import FIGHTER_ROSTER, build_fighter_data


def demo_basic_usage():
    """Demo 1: Basic fighter creation."""
    print("=" * 60)
    print("DEMO 1: Basic Fighter Creation")
    print("=" * 60)
    
    # Build a fighter
    brawler_data = build_fighter_data(FIGHTER_ROSTER["brawler"])
    
    print(f"\nFighter: {brawler_data.name}")
    print(f"  Weight: {brawler_data.weight}")
    print(f"  Speed: walk={brawler_data.walk_speed}, run={brawler_data.run_speed}")
    print(f"  Jumps: {brawler_data.max_jumps}")
    print(f"  Attacks: {len(brawler_data.attacks)}")
    print(f"  Ultimate: {brawler_data.ultimate_attack.name}")
    
    # Access specific attack
    side_atk = brawler_data.attacks["side_attack"]
    print(f"\n  Side Attack: {side_atk.name}")
    print(f"    Damage: {side_atk.damage}")
    print(f"    Knockback: {side_atk.base_knockback} base + {side_atk.kb_scaling}x scaling")
    print(f"    Frames: {side_atk.startup_frames}f startup, {side_atk.active_frames}f active, {side_atk.endlag_frames}f endlag")


def demo_all_fighters():
    """Demo 2: Build all fighters and compare stats."""
    print("\n" + "=" * 60)
    print("DEMO 2: Full Roster Comparison")
    print("=" * 60)
    
    all_fighters = {
        name: build_fighter_data(cfg) 
        for name, cfg in FIGHTER_ROSTER.items()
    }
    
    print(f"\n{'Fighter':<12} {'Weight':>8} {'Run Speed':>10} {'Jump':>8} {'Projectiles':>12}")
    print("-" * 60)
    
    for name, data in all_fighters.items():
        # Count projectile attacks
        proj_count = sum(1 for atk in data.attacks.values() if atk.spawns_projectile)
        
        print(f"{data.name:<12} {data.weight:>8.1f} {data.run_speed:>10.1f} "
              f"{data.max_jumps:>8} {proj_count:>12}")
    
    # Find extremes
    heaviest = max(all_fighters.values(), key=lambda d: d.weight)
    fastest = max(all_fighters.values(), key=lambda d: d.run_speed)
    
    print(f"\n  ⚖️  Heaviest: {heaviest.name} ({heaviest.weight})")
    print(f"  ⚡ Fastest: {fastest.name} ({fastest.run_speed} px/s)")


def demo_projectile_analysis():
    """Demo 3: Analyze projectile attacks across roster."""
    print("\n" + "=" * 60)
    print("DEMO 3: Projectile Attack Analysis")
    print("=" * 60)
    
    all_fighters = {
        name: build_fighter_data(cfg) 
        for name, cfg in FIGHTER_ROSTER.items()
    }
    
    for name, data in all_fighters.items():
        proj_attacks = [
            (move_name, atk) 
            for move_name, atk in data.attacks.items() 
            if atk.spawns_projectile
        ]
        
        if proj_attacks:
            print(f"\n{data.name}:")
            for move_name, atk in proj_attacks:
                print(f"  • {atk.name} ({move_name})")
                print(f"      Type: {atk.projectile_type}")
                print(f"      Speed: {atk.projectile_speed} px/s, Lifetime: {atk.projectile_lifetime}f")
                print(f"      Damage: {atk.projectile_damage}, KB: {atk.projectile_kb}")


def demo_character_select():
    """Demo 4: Simulate character select screen."""
    print("\n" + "=" * 60)
    print("DEMO 4: Character Select Simulation")
    print("=" * 60)
    
    # Available fighters
    roster_names = list(FIGHTER_ROSTER.keys())
    
    print("\nAvailable Fighters:")
    for i, name in enumerate(roster_names, 1):
        cfg = FIGHTER_ROSTER[name]
        print(f"  {i}. {cfg['name']} (Weight: {cfg['weight']}, "
              f"Run Speed: {cfg['run_speed']}, Max Jumps: {cfg['max_jumps']})")
    
    # Simulate selections
    p1_choice = "speedster"
    p2_choice = "tank"
    
    print(f"\nPlayer 1 selects: {p1_choice.upper()}")
    print(f"Player 2 selects: {p2_choice.upper()}")
    
    # Build selected fighters
    p1_data = build_fighter_data(FIGHTER_ROSTER[p1_choice])
    p2_data = build_fighter_data(FIGHTER_ROSTER[p2_choice])
    
    print("\n--- Match Preview ---")
    print(f"{p1_data.name} vs {p2_data.name}")
    print(f"  Weight: {p1_data.weight} vs {p2_data.weight}")
    print(f"  Speed: {p1_data.run_speed} vs {p2_data.run_speed}")
    print(f"  Jumps: {p1_data.max_jumps} vs {p2_data.max_jumps}")
    
    # Compare attacks
    p1_neutral = p1_data.attacks["neutral_attack"]
    p2_neutral = p2_data.attacks["neutral_attack"]
    
    print(f"\n  Neutral Attack:")
    print(f"    {p1_data.name}: {p1_neutral.name} ({p1_neutral.damage} damage, {p1_neutral.startup_frames}f startup)")
    print(f"    {p2_data.name}: {p2_neutral.name} ({p2_neutral.damage} damage, {p2_neutral.startup_frames}f startup)")


def demo_sweetspot_system():
    """Demo 5: Show sweetspot/sourspot mechanics."""
    print("\n" + "=" * 60)
    print("DEMO 5: Sweetspot/Sourspot Analysis")
    print("=" * 60)
    
    all_fighters = {
        name: build_fighter_data(cfg) 
        for name, cfg in FIGHTER_ROSTER.items()
    }
    
    for name, data in all_fighters.items():
        sweetspot_moves = [
            (move_name, atk) 
            for move_name, atk in data.attacks.items() 
            if atk.extra_hitboxes
        ]
        
        if sweetspot_moves:
            print(f"\n{data.name}:")
            for move_name, atk in sweetspot_moves:
                print(f"  • {atk.name} ({move_name})")
                print(f"      Sweetspot: {atk.damage} damage (priority {atk.hitbox_priority})")
                for i, extra_hb in enumerate(atk.extra_hitboxes, 1):
                    print(f"      Sourspot {i}: {extra_hb.get('damage', atk.damage)} damage "
                          f"(priority {extra_hb.get('priority', 0)})")


def demo_frame_data():
    """Demo 6: Frame data comparison."""
    print("\n" + "=" * 60)
    print("DEMO 6: Frame Data — Fastest Moves by Category")
    print("=" * 60)
    
    all_fighters = {
        name: build_fighter_data(cfg) 
        for name, cfg in FIGHTER_ROSTER.items()
    }
    
    categories = {
        "Jabs": ["neutral_attack"],
        "Aerials": ["neutral_air", "forward_air", "up_air", "down_air"],
        "Specials": ["neutral_special", "side_special", "up_special", "down_special"],
    }
    
    for category, move_names in categories.items():
        print(f"\n{category}:")
        
        fastest_moves = []
        for fighter_name, data in all_fighters.items():
            for move_name in move_names:
                if move_name in data.attacks:
                    atk = data.attacks[move_name]
                    total_frames = atk.startup_frames + atk.active_frames + atk.endlag_frames
                    fastest_moves.append((data.name, atk.name, atk.startup_frames, total_frames))
        
        # Sort by startup frames
        fastest_moves.sort(key=lambda x: x[2])
        
        # Show top 3
        for i, (fighter, move, startup, total) in enumerate(fastest_moves[:3], 1):
            print(f"  {i}. {fighter}'s {move}: {startup}f startup ({total}f total)")


def demo_export_json():
    """Demo 7: Export fighter config as JSON."""
    print("\n" + "=" * 60)
    print("DEMO 7: JSON Export Example")
    print("=" * 60)
    
    import json
    
    # Export one fighter's neutral special
    zoner_cfg = FIGHTER_ROSTER["zoner"]
    beam_attack = zoner_cfg["attacks"]["side_special"]
    
    print(f"\n{zoner_cfg['name']}'s {beam_attack['name']} (JSON):")
    print(json.dumps(beam_attack, indent=2))


# ======================================================================
#  RUN ALL DEMOS
# ======================================================================
if __name__ == "__main__":
    demo_basic_usage()
    demo_all_fighters()
    demo_projectile_analysis()
    demo_character_select()
    demo_sweetspot_system()
    demo_frame_data()
    demo_export_json()
    
    print("\n" + "=" * 60)
    print("✅ All integration demos completed successfully!")
    print("=" * 60)
