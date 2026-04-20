"""Game orchestrator — ties together all systems into the main game loop."""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum, auto
from typing import List, Optional

import pygame

from settings import (
    SCREEN_WIDTH, SCREEN_HEIGHT, FPS, GAME_TITLE, COLOR_BG,
    DEBUG_HITBOXES,
)
from engine.physics import PhysicsEngine
from engine.camera import Camera
from engine.hud import HUD
from engine.cutscene import CutscenePlayer
from engine.ultimate_manager import UltimateManager
from entities.fighter import Fighter, FighterState
from entities.fighter_data import create_default_fighter_data
from entities.hitbox import Hitbox
from entities.projectile import ProjectileManager
from input.controller import Controller, InputState
from input.keyboard import KeyboardController
from input.gamepad import GamepadController
from input.ai_controller import AIController
from input.claude_ai_controller import ClaudeAIController
from stages.stage import Stage
from stages.stage_library import get_stage

# Import fighter configurations
try:
    from fighter_configs import FIGHTER_ROSTER, build_fighter_data
    HAS_FIGHTER_CONFIGS = True
except ImportError:
    HAS_FIGHTER_CONFIGS = False
    print("WARNING: fighter_configs.py not found. Using default fighter data.")


# ======================================================================
# Player wrapper
# ======================================================================
@dataclass
class Player:
    port: int
    fighter: Fighter
    controller: Controller
    is_ai: bool = False
    ai_difficulty: int = 5


# ======================================================================
# Game states
# ======================================================================
class GamePhase(Enum):
    PLAYING = auto()
    CUTSCENE = auto()
    PAUSED = auto()
    GAME_OVER = auto()


# ======================================================================
# Main Game class
# ======================================================================
class Game:
    """Top-level game object. Manages the full match lifecycle."""

    def __init__(
        self,
        player_configs: List[dict] | None = None,
        stage_name: str = "battlefield",
        stocks: int = 3,
    ):
        # Pygame init
        pygame.init()
        pygame.font.init()
        pygame.joystick.init()  # Initialize joystick subsystem
        
        # Detect connected joysticks/gamepads
        num_joysticks = pygame.joystick.get_count()
        print(f"[GAME] Detected {num_joysticks} gamepad(s)")
        for i in range(num_joysticks):
            joy = pygame.joystick.Joystick(i)
            joy.init()
            print(f"[GAME]   Gamepad {i}: {joy.get_name()}")
        
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption(GAME_TITLE)
        self.clock = pygame.time.Clock()

        # Systems
        self.physics = PhysicsEngine()
        self.camera = Camera()
        self.hud = HUD()
        self.cutscene = CutscenePlayer(SCREEN_WIDTH, SCREEN_HEIGHT)
        self.projectiles = ProjectileManager()
        self.ultimate_manager = UltimateManager()  # NEW: ultimate system

        # Stage
        self.stage: Stage = get_stage(stage_name)
        self.stage.load_assets()

        # Players
        self.players: List[Player] = []
        self._setup_players(player_configs or self._default_config(), stocks)

        # State
        self.phase = GamePhase.PLAYING
        self.running = True
        self._cutscene_port: int = -1  # who triggered the cutscene
        self.match_time: float = 0.0   # elapsed seconds for KB time scaling

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------
    @staticmethod
    def _default_config() -> List[dict]:
        """Default: 1 human + 3 AI."""
        return [
            {"type": "keyboard", "layout": 0},
            {"type": "ai", "difficulty": 5},
            {"type": "ai", "difficulty": 5},
            {"type": "ai", "difficulty": 5},
        ]

    def _setup_players(self, configs: List[dict], stocks: int) -> None:
        """Initialize players with fighters and controllers."""
        # Available fighter names (cycle through roster)
        fighter_names = ["brawler", "zoner", "grappler", "speedster"] if HAS_FIGHTER_CONFIGS else []
        
        for i, cfg in enumerate(configs):
            spawn = self.stage.get_spawn(i)
            
            # Load fighter data from config or use default
            if HAS_FIGHTER_CONFIGS and fighter_names:
                fighter_name = fighter_names[i % len(fighter_names)]
                fighter_config = FIGHTER_ROSTER.get(fighter_name, FIGHTER_ROSTER["brawler"])
                data = build_fighter_data(fighter_config)
                print(f"[GAME] Port {i}: Loaded {data.name} from fighter_configs")
                print(f"[GAME]   Ultimate video: {data.ultimate_video}")
            else:
                data = create_default_fighter_data(f"P{i + 1}")
                print(f"[GAME] Port {i}: Using default fighter data")
            
            fighter = Fighter(port=i, data=data, spawn_x=spawn[0], spawn_y=spawn[1])
            fighter.stocks = stocks

            ctrl_type = cfg.get("type", "ai")
            is_ai = ctrl_type in ("ai", "claude_ai")

            if ctrl_type == "keyboard":
                controller = KeyboardController(layout_index=cfg.get("layout", i))
            elif ctrl_type == "gamepad":
                controller = GamepadController(joystick_index=cfg.get("index", i))
            elif ctrl_type == "claude_ai":
                controller = ClaudeAIController(
                    port=i,
                    difficulty=cfg.get("difficulty", 5),
                    model=cfg.get("model", "claude-opus-4-6"),
                    provider=cfg.get("provider", "claude"),
                    base_url=cfg.get("base_url", "http://127.0.0.1:11434"),
                )
                is_ai = True
            else:
                controller = AIController(port=i, difficulty=cfg.get("difficulty", 5))
                is_ai = True

            self.players.append(Player(
                port=i, fighter=fighter, controller=controller,
                is_ai=is_ai, ai_difficulty=cfg.get("difficulty", 5),
            ))

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------
    def run(self) -> None:
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0
            dt = min(dt, 1 / 30.0)  # cap dt to prevent physics explosion

            events = pygame.event.get()
            for ev in events:
                if ev.type == pygame.QUIT:
                    self.running = False
                if ev.type == pygame.KEYDOWN and ev.key == pygame.K_ESCAPE:
                    if self.phase == GamePhase.PAUSED:
                        self.phase = GamePhase.PLAYING
                    elif self.phase == GamePhase.PLAYING:
                        self.phase = GamePhase.PAUSED

            if self.phase == GamePhase.PLAYING:
                self._update(events, dt)
            elif self.phase == GamePhase.CUTSCENE:
                self._update_cutscene()
            elif self.phase == GamePhase.GAME_OVER:
                self._update_game_over(events)
            # PAUSED: do nothing but render

            self._render()

        pygame.quit()

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------
    def _update(self, events: list, dt: float) -> None:
        fighters = [p.fighter for p in self.players]

        # Track elapsed match time for knockback scaling
        self.match_time += dt

        # 1. Poll input & update fighters
        for player in self.players:
            # Give AI context
            if hasattr(player.controller, "set_context"):
                player.controller.set_context(fighters, self.stage)

            inp = player.controller.poll(events)
            event = player.fighter.update(inp, dt)

            # Handle events from fighter
            if event:
                # Ultimate attempt — check targets and start cutscene if valid
                if event.get("type") == "ultimate_attempt":
                    print(f"[ULTIMATE] Player {player.port} attempting ultimate activation...")
                    activation_result = self.ultimate_manager.attempt_activation(
                        player.fighter, fighters
                    )
                    if activation_result:
                        # Targets detected — start cutscene
                        print(f"[ULTIMATE] Activation successful! Targets detected.")
                        self._cutscene_port = activation_result["port"]
                        video = activation_result.get("video", "")
                        print(f"[ULTIMATE] Video path: {video}")
                        player.fighter.start_ultimate_animation()
                        self.cutscene.play(video)
                        self.phase = GamePhase.CUTSCENE
                        return
                    else:
                        print(f"[ULTIMATE] No targets detected. Refunding 50% meter.")
                
                # Grab attempt - check for nearby opponents
                elif event.get("type") == "grab_attempt":
                    grabber = player.fighter
                    grab_range = 80  # pixels
                    grabbed_opponent = None
                    
                    # Find closest opponent in range
                    for other_player in self.players:
                        if other_player.port == player.port:
                            continue
                        target = other_player.fighter
                        if target.state == FighterState.DEAD:
                            continue
                        
                        # Check distance
                        dx = target.center_x - grabber.center_x
                        dy = target.center_y - grabber.center_y
                        dist = (dx**2 + dy**2) ** 0.5
                        
                        # Check if in front and in range
                        facing_right = grabber.facing_right
                        if (facing_right and dx > 0) or (not facing_right and dx < 0):
                            if dist < grab_range:
                                grabbed_opponent = target
                                break
                    
                    # Execute grab
                    if grabbed_opponent:
                        grabber.start_grab(grabbed_opponent.port)
                        grabbed_opponent.is_grabbed = True
                        grabbed_opponent.grabbed_by_port = grabber.port
                        print(f"[GRAB] Player {player.port} grabbed Player {grabbed_opponent.port}")
                
                # Throw - release and apply knockback
                elif event.get("type") == "throw":
                    thrower = player.fighter
                    victim_port = event.get("victim_port", -1)
                    if victim_port >= 0:
                        victim = next((p.fighter for p in self.players if p.port == victim_port), None)
                        if victim:
                            # Release grab state
                            victim.is_grabbed = False
                            victim.grabbed_by_port = -1
                            
                            # Apply throw knockback
                            throw_kb = 400
                            throw_angle = 45 if thrower.facing_right else 135
                            import math
                            victim.vx = throw_kb * math.cos(math.radians(throw_angle))
                            victim.vy = -throw_kb * math.sin(math.radians(throw_angle))
                            victim.state = FighterState.HITSTUN
                            victim.hitstun_frames = 30
                            print(f"[THROW] Player {player.port} threw Player {victim_port}")
                
                # Release grab - clear grabbed state without knockback
                elif event.get("type") == "release_grab":
                    victim_port = event.get("victim_port", -1)
                    if victim_port >= 0:
                        victim = next((p.fighter for p in self.players if p.port == victim_port), None)
                        if victim:
                            victim.is_grabbed = False
                            victim.grabbed_by_port = -1
                            print(f"[GRAB] Player {player.port} released Player {victim_port}")
                    # else: no targets, meter already refunded by UltimateManager
        
        # 1.5. Update grabbed fighter positions (keep them next to grabber)
        for player in self.players:
            if player.fighter.state == FighterState.GRABBING:
                grabber = player.fighter
                victim_port = grabber.grab_victim_port
                if victim_port >= 0:
                    victim = next((p.fighter for p in self.players if p.port == victim_port), None)
                    if victim and victim.is_grabbed:
                        # Position victim in front of grabber
                        offset = 60 if grabber.facing_right else -60
                        victim.x = grabber.center_x + offset - victim.width / 2
                        victim.y = grabber.y
                        victim.vx = 0
                        victim.vy = 0
                        victim.state = FighterState.HITSTUN  # Prevent victim from acting

        # 2. Resolve hitbox collisions
        self._resolve_combat(fighters)

        # 3. Check for projectile spawning from attacks
        for player in self.players:
            f = player.fighter
            if (f.active_hitbox and f.current_attack and
                    f.current_attack.spawns_projectile and
                    f._attack_phase == "active"):
                # Spawn on the first active frame only
                first_hb = f.active_hitbox.get_first_active()
                if first_hb and first_hb.elapsed_frames == 0:
                    self.projectiles.spawn_from_attack(f, f.current_attack)

        # 4. Update projectiles (with stage collision)
        self.projectiles.update(dt, fighters, stage=self.stage,
                                match_time=self.match_time)

        # 5. Physics (gravity, friction, collisions)
        for player in self.players:
            if player.fighter.is_alive:
                self.physics.update(player.fighter, self.stage, dt)
                # Check for ledge grab
                player.fighter.check_ledge_grab(self.stage)

        # 6. Camera
        self.camera.update(fighters, self.stage, dt)

        # 7. Check game over
        alive = [p for p in self.players if p.fighter.is_alive]
        if len(alive) <= 1:
            self.phase = GamePhase.GAME_OVER

    def _resolve_combat(self, fighters: List[Fighter]) -> None:
        """Check all active hitbox groups against all other fighters."""
        for attacker in fighters:
            hbg = attacker.active_hitbox
            if hbg is None or not hbg.is_active():
                continue
            # Detect whether this is a special / ultimate attack
            is_spec = attacker.state in (
                FighterState.SPECIAL, FighterState.ULTIMATE,
            )
            for target in fighters:
                if target.port == attacker.port or not target.is_alive:
                    continue
                hit = hbg.check_hit(attacker, target)
                if hit is not None:
                    target.take_hit(
                        hit,
                        is_special=is_spec,
                        match_time=self.match_time,
                    )

    # ------------------------------------------------------------------
    # Cutscene
    # ------------------------------------------------------------------
    def _update_cutscene(self) -> None:
        """
        Update cutscene playback. When finished, apply ultimate effects
        to detected targets and resume gameplay.
        """
        self.cutscene.update()
        if not self.cutscene.is_playing():
            # Apply ultimate effects to stored targets only
            self.ultimate_manager.apply_ultimate_effects(self.match_time)
            
            # Resume normal gameplay
            self.phase = GamePhase.PLAYING

    # ------------------------------------------------------------------
    # Game over
    # ------------------------------------------------------------------
    def _update_game_over(self, events: list) -> None:
        for ev in events:
            if ev.type == pygame.KEYDOWN:
                self.running = False

    # ------------------------------------------------------------------
    # Render
    # ------------------------------------------------------------------
    def _render(self) -> None:
        self.screen.fill(COLOR_BG)

        if self.phase == GamePhase.CUTSCENE:
            # Render game behind cutscene
            self._render_game()
            self.cutscene.render(self.screen)
        elif self.phase == GamePhase.GAME_OVER:
            self._render_game()
            self._render_game_over_overlay()
        else:
            self._render_game()

        if self.phase == GamePhase.PAUSED:
            self._render_pause_overlay()

        pygame.display.flip()

    def _render_game(self) -> None:
        self.stage.render_background(self.screen, self.camera)
        self.stage.render_platforms(self.screen, self.camera)

        # Fighters (sorted by port for consistent layering)
        for player in sorted(self.players, key=lambda p: p.port):
            if player.fighter.is_alive:
                player.fighter.render(self.screen, self.camera)

        # Projectiles
        self.projectiles.render(self.screen, self.camera)

        # HUD on top
        self.hud.render(self.screen, self.players)

    def _render_pause_overlay(self) -> None:
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 140))
        self.screen.blit(overlay, (0, 0))

        font = pygame.font.SysFont("Arial", 48, bold=True)
        text = font.render("PAUSED", True, (255, 255, 255))
        self.screen.blit(text, (
            SCREEN_WIDTH // 2 - text.get_width() // 2,
            SCREEN_HEIGHT // 2 - text.get_height() // 2,
        ))

        sub_font = pygame.font.SysFont("Arial", 20)
        sub = sub_font.render("Press ESC to resume", True, (200, 200, 200))
        self.screen.blit(sub, (
            SCREEN_WIDTH // 2 - sub.get_width() // 2,
            SCREEN_HEIGHT // 2 + 40,
        ))

    def _render_game_over_overlay(self) -> None:
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 180))
        self.screen.blit(overlay, (0, 0))

        alive = [p for p in self.players if p.fighter.is_alive]
        winner_text = f"P{alive[0].port + 1} WINS!" if alive else "DRAW!"

        font = pygame.font.SysFont("Arial", 64, bold=True)
        text = font.render(winner_text, True, (255, 215, 0))
        self.screen.blit(text, (
            SCREEN_WIDTH // 2 - text.get_width() // 2,
            SCREEN_HEIGHT // 2 - text.get_height() // 2,
        ))

        sub_font = pygame.font.SysFont("Arial", 20)
        sub = sub_font.render("Press any key to exit", True, (200, 200, 200))
        self.screen.blit(sub, (
            SCREEN_WIDTH // 2 - sub.get_width() // 2,
            SCREEN_HEIGHT // 2 + 50,
        ))
