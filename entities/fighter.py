"""Fighter entity — state machine, attacks, movement, rendering."""

from __future__ import annotations
from enum import Enum, auto
from pathlib import Path
from typing import Dict, Optional, List, TYPE_CHECKING

import pygame

from settings import (
    DEFAULT_STOCKS, ULTIMATE_METER_MAX, DAMAGE_TO_METER_RATIO,
    ULTIMATE_CHARGE_CAP, RESPAWN_INVINCIBILITY_FRAMES,
    DEBUG_HITBOXES, DEBUG_HURTBOXES, COLOR_RED, COLOR_GREEN,
    HITSTUN_COMBO_RESET_FRAMES, COMBO_BREAKER_HIT_THRESHOLD,
    COMBO_BREAKER_INVINCIBILITY_FRAMES, COMBO_BREAKER_KNOCKBACK,
)
from entities.fighter_data import FighterData, AttackData, create_default_fighter_data
from entities.hitbox import Hitbox, Hurtbox, HitboxGroup
from engine.physics import PhysicsEngine

if TYPE_CHECKING:
    from input.controller import InputState


# ======================================================================
# Fighter states
# ======================================================================
class FighterState(Enum):
    IDLE = auto()
    WALKING = auto()
    RUNNING = auto()
    JUMPSQUAT = auto()
    AIRBORNE = auto()
    ATTACK = auto()
    SPECIAL = auto()
    HITSTUN = auto()
    HELPLESS = auto()
    SHIELDING = auto()
    GRABBING = auto()
    ULTIMATE = auto()
    LEDGE_HANG = auto()
    DEAD = auto()


# States where the fighter cannot act
LOCKED_STATES = {
    FighterState.ATTACK, FighterState.SPECIAL, FighterState.HITSTUN,
    FighterState.HELPLESS, FighterState.ULTIMATE, FighterState.DEAD,
    FighterState.JUMPSQUAT, FighterState.LEDGE_HANG, FighterState.GRABBING,
}

AERIAL_STATES = {
    FighterState.AIRBORNE, FighterState.HELPLESS,
}


class Fighter:
    """A playable character with state machine, attacks, and rendering."""

    JUMPSQUAT_FRAMES = 3

    def __init__(self, port: int, data: FighterData | None = None,
                 spawn_x: float = 400, spawn_y: float = 300):
        self.port = port
        self.data = data or create_default_fighter_data()

        # Physics state
        self.x: float = spawn_x
        self.y: float = spawn_y
        self.vx: float = 0.0
        self.vy: float = 0.0
        self.prev_y: float = spawn_y
        self.grounded: bool = False
        self.fast_falling: bool = False
        self.dropping_through: bool = False
        self.facing: int = 1  # +1=right, -1=left

        # Dimensions (from data)
        self.width: int = self.data.width
        self.height: int = self.data.height

        # Combat state
        self.damage_percent: float = 0.0
        self.ultimate_meter: float = 0.0
        self.ultimate_cooldown: float = 0.0
        self.stocks: int = DEFAULT_STOCKS
        self.invincible: bool = False
        self._invincible_frames: int = 0

        # State machine
        self.state: FighterState = FighterState.IDLE
        self._state_timer: int = 0  # frames remaining in current locked state

        # Jump tracking
        self.jumps_remaining: int = self.data.max_jumps

        # Attack tracking
        self.current_attack: Optional[AttackData] = None
        self.active_hitbox: Optional[HitboxGroup] = None
        self._attack_phase: str = "startup"  # startup→active→endlag
        self._attack_timer: int = 0

        # Hitstun
        self.hitstun_frames: int = 0
        self._consecutive_hits: int = 0       # combo counter for stun decay
        self._stun_decay_timer: int = 0       # frames since last hit

        # Spawn
        self._spawn_x = spawn_x
        self._spawn_y = spawn_y

        # Hurtbox (separate from hitbox)
        self._hurtbox = Hurtbox(self)

        # Poses (static images)
        self.poses: Dict[str, pygame.Surface] = {}
        self._current_pose_key: str = "idle"
        self._placeholder_surface: Optional[pygame.Surface] = None
        
        # Load idle sprite if provided
        self.idle_sprite_surface: Optional[pygame.Surface] = None
        if self.data.idle_sprite:
            self._load_idle_sprite()
        
        # Input direction tracking for arrow display
        self.input_direction: tuple[float, float] = (0.0, 0.0)  # (x, y)
        
        # Ledge grab tracking
        self.ledge_hang_timer: int = 0
        self.grabbed_ledge: Optional[tuple[float, float]] = None  # (x, y) of ledge
        
        # Grabbed state (for displaying "grabbed" text)
        self.is_grabbed: bool = False
        self.grabbed_by_port: int = -1
        
        # Grabbing state (for the grabber)
        self.grab_victim_port: int = -1
        self.grab_timer: int = 0
        self.grab_duration: int = 60  # frames to hold before auto-release

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------
    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    @property
    def is_alive(self) -> bool:
        return self.stocks > 0

    @property
    def can_act(self) -> bool:
        return self.state not in LOCKED_STATES

    @property
    def is_airborne(self) -> bool:
        return not self.grounded

    # ------------------------------------------------------------------
    # Hurtbox  (delegated to Hurtbox instance)
    # ------------------------------------------------------------------
    def get_hurtbox(self) -> pygame.Rect:
        return self._hurtbox.get_rect()

    # ------------------------------------------------------------------
    # State transitions
    # ------------------------------------------------------------------
    def set_state(self, state_name: str) -> None:
        mapping = {
            "idle": FighterState.IDLE,
            "walking": FighterState.WALKING,
            "running": FighterState.RUNNING,
            "jumpsquat": FighterState.JUMPSQUAT,
            "airborne": FighterState.AIRBORNE,
            "attack": FighterState.ATTACK,
            "special": FighterState.SPECIAL,
            "hitstun": FighterState.HITSTUN,
            "helpless": FighterState.HELPLESS,
            "shielding": FighterState.SHIELDING,
            "ultimate": FighterState.ULTIMATE,
            "dead": FighterState.DEAD,
        }
        new_state = mapping.get(state_name, FighterState.IDLE)
        self.state = new_state

    # ------------------------------------------------------------------
    # Main update (called each frame)
    # ------------------------------------------------------------------
    def update(self, inp: InputState, dt: float) -> Optional[dict]:
        """Process input and advance state. Returns event dict if something happens."""
        event = None
        
        # Track input direction for arrow display
        self.input_direction = (inp.move_x, inp.move_y)

        # Tick invincibility
        if self._invincible_frames > 0:
            self._invincible_frames -= 1
            self.invincible = self._invincible_frames > 0

        # Tick ultimate cooldown (seconds)
        if self.ultimate_cooldown > 0:
            self.ultimate_cooldown = max(0.0, self.ultimate_cooldown - dt)

        # Dead fighters don't update
        if self.state == FighterState.DEAD:
            return None

        # Combo reset: if enough frames pass without being hit, reset counter
        if self.state != FighterState.HITSTUN and self._consecutive_hits > 0:
            self._stun_decay_timer += 1
            if self._stun_decay_timer >= HITSTUN_COMBO_RESET_FRAMES:
                self._consecutive_hits = 0
                self._stun_decay_timer = 0

        # Dropping through platforms
        self.dropping_through = False

        # --- State-specific logic ---
        event = None
        if self.state == FighterState.HITSTUN:
            self._update_hitstun()
        elif self.state in (FighterState.ATTACK, FighterState.SPECIAL):
            self._update_attack()
        elif self.state == FighterState.ULTIMATE:
            self._update_attack()
        elif self.state == FighterState.GRABBING:
            event = self._update_grabbing(inp)
        elif self.state == FighterState.JUMPSQUAT:
            self._update_jumpsquat(inp)
        elif self.state == FighterState.HELPLESS:
            self._update_helpless(inp)
        elif self.state == FighterState.LEDGE_HANG:
            self._update_ledge_hang(inp)
        else:
            event = self._update_actionable(inp, dt)

        # Update pose key
        self._update_pose_key()

        return event

    # ------------------------------------------------------------------
    # Actionable states (idle, walking, running, airborne, shielding)
    # ------------------------------------------------------------------
    def _update_actionable(self, inp: InputState, dt: float) -> Optional[dict]:
        event = None
        move_x = inp.move_x

        # --- Shield ---
        if inp.shield and self.grounded:
            self.state = FighterState.SHIELDING
            self.vx = 0
            return None

        if self.state == FighterState.SHIELDING:
            if not inp.shield:
                self.state = FighterState.IDLE
            return None

        # --- Jump ---
        if inp.jump and self.jumps_remaining > 0:
            if self.grounded:
                self.state = FighterState.JUMPSQUAT
                self._state_timer = self.JUMPSQUAT_FRAMES
                self._short_hop = False  # will check on release
                return None
            else:
                # Air jump
                self.jumps_remaining -= 1
                self.vy = -self.data.double_jump_force
                self.fast_falling = False
                self.state = FighterState.AIRBORNE
                return None

        # --- Attack ---
        if inp.attack:
            direction = self._get_attack_direction(inp)
            return self._start_attack(direction, is_special=False)

        # --- Special (or Ultimate) ---
        if inp.special:
            if self.ultimate_meter >= ULTIMATE_METER_MAX and self.ultimate_cooldown <= 0:
                # Signal ultimate attempt (target detection handled by Game/UltimateManager)
                return {"type": "ultimate_attempt", "port": self.port}
            direction = self._get_attack_direction(inp)
            return self._start_attack(direction, is_special=True)
        
        # --- Grab ---
        if inp.grab and self.grounded:
            return {"type": "grab_attempt", "port": self.port}

        # --- Fast fall ---
        if not self.grounded and inp.move_y > 0.5 and self.vy > 0:
            self.fast_falling = True

        # --- Drop through platform ---
        if self.grounded and inp.move_y > 0.7:
            self.dropping_through = True
            self.grounded = False
            self.y += 4  # push through

        # --- Horizontal movement ---
        if self.grounded:
            if abs(move_x) > 0.1:
                self.facing = 1 if move_x > 0 else -1
                speed = self.data.walk_speed if abs(move_x) < 0.7 else self.data.run_speed
                self.vx = move_x * speed
                self.state = FighterState.WALKING if abs(move_x) < 0.7 else FighterState.RUNNING
            else:
                self.state = FighterState.IDLE
        else:
            self.state = FighterState.AIRBORNE
            # Enhanced air control - more responsive directional movement
            if abs(move_x) > 0.1:
                self.facing = 1 if move_x > 0 else -1
                # Direct air control instead of just acceleration
                target_vx = move_x * self.data.air_speed
                self.vx = self.vx * 0.85 + target_vx * 0.15  # Smooth transition
            
            # Vertical air control (move_y for up/down drift)
            if abs(inp.move_y) > 0.1:
                # Up input: slight upward drift
                if inp.move_y < 0:
                    self.vy -= self.data.air_speed * 0.3 * dt
                # Down input: faster fall (beyond fast-fall)
                elif inp.move_y > 0 and self.vy > 0:
                    self.vy += self.data.air_speed * 0.5 * dt

        return event

    # ------------------------------------------------------------------
    # Attack system
    # ------------------------------------------------------------------
    def _get_attack_direction(self, inp: InputState) -> str:
        if abs(inp.move_y) > 0.5:
            return "up" if inp.move_y < 0 else "down"
        if abs(inp.move_x) > 0.5:
            return "side" if self.grounded else "forward"
        return "neutral"

    def _start_attack(self, direction: str, is_special: bool) -> Optional[dict]:
        # Build attack key
        if is_special:
            if direction == "side" or direction == "forward":
                key = "side_special"
            elif direction == "up":
                key = "up_special"
            elif direction == "down":
                key = "down_special"
            else:
                key = "neutral_special"
        else:
            if self.is_airborne:
                if direction == "forward" or direction == "side":
                    key = "forward_air"
                elif direction == "up":
                    key = "up_air"
                elif direction == "down":
                    key = "down_air"
                else:
                    key = "neutral_air"
            else:
                if direction == "side":
                    key = "side_attack"
                elif direction == "up":
                    key = "up_attack"
                elif direction == "down":
                    key = "down_attack"
                else:
                    key = "neutral_attack"

        attack_data = self.data.attacks.get(key)
        if attack_data is None:
            return None

        self.current_attack = attack_data
        self._attack_phase = "startup"
        self._attack_timer = attack_data.startup_frames
        self.active_hitbox = None
        self.state = FighterState.SPECIAL if is_special else FighterState.ATTACK

        return None

    def start_ultimate_animation(self) -> None:
        """
        Begin ultimate animation state (called after target detection succeeds).
        Meter is already consumed by UltimateManager.
        """
        ult_data = self.data.ultimate_attack
        if ult_data:
            self.current_attack = ult_data
            self._attack_phase = "startup"
            self._attack_timer = ult_data.startup_frames
        self.state = FighterState.ULTIMATE

    def _update_attack(self) -> None:
        self._attack_timer -= 1

        if self._attack_phase == "startup":
            if self._attack_timer <= 0:
                # Activate hitbox group (supports sweetspot / sourspot)
                self._attack_phase = "active"
                self._attack_timer = self.current_attack.active_frames
                self.active_hitbox = HitboxGroup.from_attack_data(
                    self.port, self.current_attack)

        elif self._attack_phase == "active":
            if self.active_hitbox:
                self.active_hitbox.tick()
            if self._attack_timer <= 0:
                self._attack_phase = "endlag"
                self._attack_timer = self.current_attack.endlag_frames
                self.active_hitbox = None

        elif self._attack_phase == "endlag":
            if self._attack_timer <= 0:
                self._end_attack()

    def _end_attack(self) -> None:
        is_up_special = (self.current_attack and
                         self.current_attack.name == self.data.attacks.get("up_special", object()).name
                         if self.current_attack else False)

        self.current_attack = None
        self.active_hitbox = None

        if self.state == FighterState.ULTIMATE:
            self.state = FighterState.IDLE if self.grounded else FighterState.AIRBORNE
        elif is_up_special and not self.grounded:
            self.state = FighterState.HELPLESS
        elif self.grounded:
            self.state = FighterState.IDLE
        else:
            self.state = FighterState.AIRBORNE

    # ------------------------------------------------------------------
    # Hitstun
    # ------------------------------------------------------------------
    def _update_hitstun(self) -> None:
        self.hitstun_frames -= 1
        # Track time since last hit for combo reset
        self._stun_decay_timer += 1
        if self.hitstun_frames <= 0:
            if self.grounded:
                self.state = FighterState.IDLE
            else:
                self.state = FighterState.AIRBORNE
            # Continue tracking decay timer in actionable states
            # (reset happens in update if timer exceeds threshold)

    # ------------------------------------------------------------------
    # Jumpsquat
    # ------------------------------------------------------------------
    def _update_jumpsquat(self, inp: InputState) -> None:
        self._state_timer -= 1
        if self._state_timer <= 0:
            self.jumps_remaining -= 1
            self.vy = -self.data.jump_force
            self.grounded = False
            self.state = FighterState.AIRBORNE

    # ------------------------------------------------------------------
    # Helpless (after up-B)
    # ------------------------------------------------------------------
    def _update_helpless(self, inp: InputState) -> None:
        # Can drift but not attack
        if abs(inp.move_x) > 0.1:
            self.vx += inp.move_x * self.data.air_speed * 0.02
        if self.grounded:
            self.state = FighterState.IDLE
    
    def _update_ledge_hang(self, inp: InputState) -> None:
        """Update ledge hanging state."""
        from settings import LEDGE_HANG_TIME
        
        self.ledge_hang_timer += 1
        
        # Auto-drop after timeout
        if self.ledge_hang_timer >= LEDGE_HANG_TIME:
            self._release_ledge()
            return
        
        # Hold position at ledge
        if self.grabbed_ledge:
            self.x, self.y = self.grabbed_ledge
            self.vx = 0
            self.vy = 0
        
        # Jump from ledge
        if inp.jump:
            self._release_ledge()
            self.state = FighterState.AIRBORNE
            self.vy = -self.data.jump_force
            self.jumps_remaining = self.data.max_jumps - 1
            return
        
        # Drop from ledge
        if inp.move_y > 0.5:  # Down input
            self._release_ledge()
            self.state = FighterState.AIRBORNE
            return
    
    def _release_ledge(self) -> None:
        """Release from ledge hang."""
        self.grabbed_ledge = None
        self.ledge_hang_timer = 0
        self.state = FighterState.AIRBORNE
    
    def _update_grabbing(self, inp: InputState) -> Optional[dict]:
        """Update grabbing state - holding an opponent."""
        self.grab_timer += 1
        
        # Auto-release after duration
        if self.grab_timer >= self.grab_duration:
            return self.release_grab()
        
        # Allow throw with attack button
        if inp.attack or inp.special:
            # Knock opponent away based on facing direction
            return self.release_grab(throw=True)
        
        return None
    
    def start_grab(self, victim_port: int) -> None:
        """Start grabbing an opponent."""
        self.state = FighterState.GRABBING
        self.grab_victim_port = victim_port
        self.grab_timer = 0
        self.vx = 0  # Stop movement while grabbing
    
    def release_grab(self, throw: bool = False) -> dict:
        """Release the grabbed opponent."""
        victim_port = self.grab_victim_port
        self.grab_victim_port = -1
        self.grab_timer = 0
        self.state = FighterState.IDLE
        
        # Return event for Game to handle
        if throw:
            return {"type": "throw", "port": self.port, "victim_port": victim_port}
        else:
            return {"type": "release_grab", "port": self.port, "victim_port": victim_port}
    
    def check_ledge_grab(self, stage) -> bool:
        """Check if fighter can grab a ledge. Returns True if grabbed."""
        from settings import LEDGE_GRAB_RANGE, LEDGE_GRAB_HEIGHT
        
        # Only grab while falling and facing away from stage
        if self.vy <= 0 or self.state == FighterState.LEDGE_HANG:
            return False
        
        # Check each solid platform for ledges
        for platform in stage.platforms:
            if platform.is_passthrough:
                continue
            
            plat_left = platform.rect.left
            plat_right = platform.rect.right
            plat_top = platform.rect.top
            
            # Check right ledge (facing left)
            if self.facing == -1:
                if (plat_right - LEDGE_GRAB_RANGE < self.center_x < plat_right + 20 and
                    plat_top - LEDGE_GRAB_HEIGHT < self.y < plat_top + 20):
                    self._grab_ledge(plat_right, plat_top)
                    return True
            
            # Check left ledge (facing right)
            else:
                if (plat_left - 20 < self.center_x < plat_left + LEDGE_GRAB_RANGE and
                    plat_top - LEDGE_GRAB_HEIGHT < self.y < plat_top + 20):
                    self._grab_ledge(plat_left, plat_top)
                    return True
        
        return False
    
    def _grab_ledge(self, ledge_x: float, ledge_y: float) -> None:
        """Grab onto a ledge."""
        self.state = FighterState.LEDGE_HANG
        self.grabbed_ledge = (ledge_x - self.width if self.facing == 1 else ledge_x, ledge_y - self.height + 10)
        self.ledge_hang_timer = 0
        self.vx = 0
        self.vy = 0
        self.jumps_remaining = self.data.max_jumps  # Restore jumps on ledge grab

    # ------------------------------------------------------------------
    # Taking hits
    # ------------------------------------------------------------------
    def take_hit(self, hitbox: Hitbox, is_special: bool = False,
                  match_time: float = 0.0) -> None:
        """Apply damage and knockback from a hitbox.

        Parameters
        ----------
        hitbox : Hitbox
            The active hitbox that connected.
        is_special : bool
            True when the source attack is a special or ultimate (triggers
            the 250 % instant-KO rule).
        match_time : float
            Elapsed match time in seconds (for time-scaled knockback).
        """
        # Release from grab if being held
        if self.is_grabbed:
            self.is_grabbed = False
            self.grabbed_by_port = -1
        
        self.damage_percent += hitbox.damage

        # Charge ultimate meter (only below cap)
        if self.damage_percent <= ULTIMATE_CHARGE_CAP:
            self.ultimate_meter = min(
                ULTIMATE_METER_MAX,
                self.ultimate_meter + hitbox.damage * DAMAGE_TO_METER_RATIO,
            )

        # Track consecutive hits for stun decay
        self._consecutive_hits += 1
        self._stun_decay_timer = 0
        
        # Combo breaker — after 3rd hit, force knockback and grant invincibility
        if self._consecutive_hits >= COMBO_BREAKER_HIT_THRESHOLD:
            # Apply strong knockback away from attacker (45-degree angle)
            combo_break_angle = 45  # Launch upward and away
            kb = COMBO_BREAKER_KNOCKBACK
            
            # Apply the combo break knockback
            PhysicsEngine.apply_knockback(
                self, combo_break_angle, kb,
                consecutive_hits=1,  # Use 1 to get full hitstun, not decayed
            )
            
            # Grant invincibility
            self.invincible = True
            self._invincible_frames = COMBO_BREAKER_INVINCIBILITY_FRAMES
            
            # Reset consecutive hit counter
            self._consecutive_hits = 0
            
            # Cancel attack in progress
            self.current_attack = None
            self.active_hitbox = None
            return  # Skip normal knockback calculation

        # Calculate knockback (non-linear, time-scaled, instant-KO aware)
        kb = PhysicsEngine.calculate_knockback(
            damage=hitbox.damage,
            percent=self.damage_percent,
            weight=self.data.weight,
            base_knockback=hitbox.base_knockback,
            kb_scaling=hitbox.kb_scaling,
            match_time=match_time,
            is_special=is_special,
        )

        # Apply velocity, vertical bias, velocity cap, and reduced stun
        PhysicsEngine.apply_knockback(
            self, hitbox.angle, kb,
            consecutive_hits=self._consecutive_hits,
        )

        # Cancel attack in progress
        self.current_attack = None
        self.active_hitbox = None

    # ------------------------------------------------------------------
    # Death / respawn
    # ------------------------------------------------------------------
    def die(self) -> None:
        self.stocks -= 1
        if self.stocks <= 0:
            self.state = FighterState.DEAD
            return
        self._respawn()

    def _respawn(self) -> None:
        self.x = self._spawn_x
        self.y = self._spawn_y - 200  # spawn above
        self.vx = 0
        self.vy = 0
        self.damage_percent = 0.0
        self.state = FighterState.AIRBORNE
        self.invincible = True
        self._invincible_frames = RESPAWN_INVINCIBILITY_FRAMES
        self.hitstun_frames = 0
        self._consecutive_hits = 0
        self._stun_decay_timer = 0
        self.current_attack = None
        self.active_hitbox = None
        self.fast_falling = False
        self.jumps_remaining = self.data.max_jumps

    # ------------------------------------------------------------------
    # Pose key for rendering
    # ------------------------------------------------------------------
    def _update_pose_key(self) -> None:
        state_to_pose = {
            FighterState.IDLE: "idle",
            FighterState.WALKING: "walk",
            FighterState.RUNNING: "dash",
            FighterState.JUMPSQUAT: "idle",
            FighterState.AIRBORNE: "jump",
            FighterState.HITSTUN: "hitstun",
            FighterState.HELPLESS: "hitstun",
            FighterState.SHIELDING: "shield",
            FighterState.DEAD: "hitstun",
        }

        if self.state in (FighterState.ATTACK, FighterState.SPECIAL, FighterState.ULTIMATE):
            if self.current_attack:
                self._current_pose_key = self.current_attack.pose_key
            return

        self._current_pose_key = state_to_pose.get(self.state, "idle")

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------
    def get_current_surface(self) -> pygame.Surface:
        """Return the current pose surface (or a colored placeholder)."""
        surf = self.poses.get(self._current_pose_key)
        if surf is not None:
            if self.facing == -1:
                surf = pygame.transform.flip(surf, True, False)
            return surf
        
        # Use idle sprite if available
        if self.idle_sprite_surface is not None:
            result = self.idle_sprite_surface
            if self.facing == -1:
                result = pygame.transform.flip(result, True, False)
            
            # Flash when invincible
            if self.invincible and (self._invincible_frames % 6 < 3):
                result = result.copy()
                result.set_alpha(100)
            
            return result

        # Placeholder rectangle
        if (self._placeholder_surface is None or
                self._placeholder_surface.get_size() != (self.width, self.height)):
            from settings import PLAYER_COLORS
            color = PLAYER_COLORS[self.port % len(PLAYER_COLORS)]
            self._placeholder_surface = pygame.Surface(
                (self.width, self.height), pygame.SRCALPHA)
            self._placeholder_surface.fill((*color, 200))
            # Eyes to show facing
            eye_y = 15
            pygame.draw.circle(self._placeholder_surface, (255, 255, 255),
                               (self.width // 2 + 8, eye_y), 5)
            pygame.draw.circle(self._placeholder_surface, (0, 0, 0),
                               (self.width // 2 + 10, eye_y), 3)

        result = self._placeholder_surface.copy()
        if self.facing == -1:
            result = pygame.transform.flip(result, True, False)

        # Flash when invincible
        if self.invincible and (self._invincible_frames % 6 < 3):
            result.set_alpha(100)

        return result

    def render(self, screen: pygame.Surface, camera) -> None:
        surf = self.get_current_surface()
        camera.apply_surface(surf, self.x, self.y, screen)
        
        # Draw directional arrow
        self._render_direction_arrow(screen, camera)
        
        # Draw "GRABBED" text if being grabbed
        if self.is_grabbed:
            self._render_grabbed_text(screen, camera)

        if DEBUG_HITBOXES and self.active_hitbox and self.active_hitbox.is_active():
            hb = self.active_hitbox.get_first_active()
            if hb:
                r = hb.get_world_rect(
                    self.x, self.y, self.width, self.height, self.facing)
                sx, sy = camera.world_to_screen(r.x, r.y)
                w = int(r.width * camera.zoom)
                h = int(r.height * camera.zoom)
                debug_surf = pygame.Surface((w, h), pygame.SRCALPHA)
                debug_surf.fill((255, 0, 0, 80))
                screen.blit(debug_surf, (sx, sy))

        if DEBUG_HURTBOXES:
            hr = self.get_hurtbox()
            sx, sy = camera.world_to_screen(hr.x, hr.y)
            w = int(hr.width * camera.zoom)
            h = int(hr.height * camera.zoom)
            debug_surf = pygame.Surface((w, h), pygame.SRCALPHA)
            debug_surf.fill((0, 255, 0, 50))
            screen.blit(debug_surf, (sx, sy))
    
    def _render_direction_arrow(self, screen: pygame.Surface, camera) -> None:
        """Draw arrow showing current input direction."""
        move_x, move_y = self.input_direction
        
        # Only draw if there's input
        if abs(move_x) < 0.1 and abs(move_y) < 0.1:
            return
        
        # Arrow position above fighter
        arrow_world_x = self.center_x
        arrow_world_y = self.y - 30
        arrow_sx, arrow_sy = camera.world_to_screen(arrow_world_x, arrow_world_y)
        
        # Arrow size
        arrow_size = 20 * camera.zoom
        
        # Determine arrow direction and draw triangle
        # Normalize direction
        import math
        mag = math.sqrt(move_x**2 + move_y**2)
        if mag > 0:
            dx = move_x / mag
            dy = move_y / mag
        else:
            return
        
        # Arrow color (bright yellow)
        arrow_color = (255, 255, 50)
        
        # Calculate arrow points - pointing in the input direction
        # Tip of arrow
        tip_x = arrow_sx + dx * arrow_size
        tip_y = arrow_sy + dy * arrow_size
        
        # Base corners perpendicular to direction
        perp_x = -dy
        perp_y = dx
        base_offset = arrow_size * 0.5
        base_back = arrow_size * 0.3
        
        corner1_x = arrow_sx + perp_x * base_offset - dx * base_back
        corner1_y = arrow_sy + perp_y * base_offset - dy * base_back
        corner2_x = arrow_sx - perp_x * base_offset - dx * base_back
        corner2_y = arrow_sy - perp_y * base_offset - dy * base_back
        
        # Draw filled triangle
        points = [(tip_x, tip_y), (corner1_x, corner1_y), (corner2_x, corner2_y)]
        pygame.draw.polygon(screen, arrow_color, points)
        pygame.draw.polygon(screen, (0, 0, 0), points, max(1, int(2 * camera.zoom)))  # Black outline
    
    def _render_grabbed_text(self, screen: pygame.Surface, camera) -> None:
        """Draw 'GRABBED' text above the fighter."""
        # Text position above fighter (higher than arrow)
        text_world_x = self.center_x
        text_world_y = self.y - 50
        text_sx, text_sy = camera.world_to_screen(text_world_x, text_world_y)
        
        # Create font and render text
        font_size = max(14, int(18 * camera.zoom))
        font = pygame.font.Font(None, font_size)
        
        # Render text with background
        text_surface = font.render("GRABBED", True, (255, 50, 50))  # Red text
        text_rect = text_surface.get_rect(center=(text_sx, text_sy))
        
        # Draw semi-transparent background
        bg_rect = text_rect.inflate(8, 4)
        bg_surface = pygame.Surface((bg_rect.width, bg_rect.height), pygame.SRCALPHA)
        bg_surface.fill((0, 0, 0, 180))
        screen.blit(bg_surface, bg_rect.topleft)
        
        # Draw text
        screen.blit(text_surface, text_rect)

    # ------------------------------------------------------------------
    # Pose loading
    # ------------------------------------------------------------------
    def load_poses(self, folder: str) -> None:
        """Load PNG/JPG poses from a folder."""
        path = Path(folder)
        if not path.exists():
            return
        for img_file in path.iterdir():
            if img_file.suffix.lower() in (".png", ".jpg", ".jpeg"):
                key = img_file.stem  # filename without extension
                try:
                    surf = pygame.image.load(str(img_file)).convert_alpha()
                    # Scale to fighter dimensions
                    surf = pygame.transform.scale(surf, (self.width, self.height))
                    self.poses[key] = surf
                except pygame.error:
                    pass
    
    def _load_idle_sprite(self) -> None:
        """Load the character's idle sprite image."""
        if not self.data.idle_sprite:
            return
        
        path = Path(self.data.idle_sprite)
        if not path.exists():
            print(f"Warning: Idle sprite not found: {self.data.idle_sprite}")
            return
        
        try:
            surf = pygame.image.load(str(path)).convert_alpha()
            # Scale to fighter dimensions
            surf = pygame.transform.scale(surf, (self.width, self.height))
            self.idle_sprite_surface = surf
            print(f"Loaded idle sprite for {self.data.name}: {self.data.idle_sprite}")
        except pygame.error as e:
            print(f"Error loading idle sprite for {self.data.name}: {e}")
