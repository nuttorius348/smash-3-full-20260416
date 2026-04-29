"""UltimateManager — handles ultimate activation, target detection, and post-cutscene effects."""

from __future__ import annotations
from typing import List, Optional, TYPE_CHECKING

import pygame

from settings import ULTIMATE_METER_MAX, ULTIMATE_KO_THRESHOLD, INSTANT_KO_KB

if TYPE_CHECKING:
    from entities.fighter import Fighter


class UltimateManager:
    """
    Manages ultimate activations with target detection and cutscene coordination.
    
    Flow:
    1. Fighter attempts to activate ultimate
    2. UltimateManager detects targets in forward-facing zone
    3. If targets found: store them and play video
    4. If no targets: refund 50% meter, cancel ultimate
    5. After video: apply damage/knockback to stored targets only
    """
    
    # Ultimate detection zone (forward-facing rectangular hit area)
    DETECTION_WIDTH = 400.0   # pixels in front of fighter
    DETECTION_HEIGHT = 250.0  # vertical coverage
    DETECTION_OFFSET_X = 50.0 # start slightly ahead of fighter center
    
    # Post-cutscene damage parameters
    ULTIMATE_DAMAGE = 30.0
    ULTIMATE_BASE_KB = 400.0
    ULTIMATE_KB_SCALING = 1.5
    ULTIMATE_ANGLE = 60.0
    GUARANTEED_KO_THRESHOLD = ULTIMATE_KO_THRESHOLD  # percent at which KO is guaranteed
    
    # Meter refund when no targets detected
    METER_REFUND_PERCENT = 0.5
    
    def __init__(self):
        """Initialize the ultimate manager."""
        self._active_ultimate: Optional[dict] = None
        self._stored_targets: List[Fighter] = []
    
    # ============================================================
    # Activation & Target Detection
    # ============================================================
    
    def attempt_activation(
        self, 
        attacker: Fighter, 
        all_fighters: List[Fighter]
    ) -> Optional[dict]:
        """
        Attempt to activate ultimate for the attacker.
        
        Parameters
        ----------
        attacker : Fighter
            The fighter attempting to use their ultimate.
        all_fighters : List[Fighter]
            All fighters in the match (for target detection).
        
        Returns
        -------
        dict or None
            If activation succeeds, returns event dict with:
                - type: "ultimate"
                - port: attacker's port
                - video: path to video file
            If no targets detected, returns None and refunds meter.
        """
        print(f"[UltimateManager] Detecting targets for port {attacker.port}...")
        print(f"[UltimateManager] Attacker position: ({attacker.center_x:.1f}, {attacker.center_y:.1f})")
        print(f"[UltimateManager] Attacker facing: {'RIGHT' if attacker.facing == 1 else 'LEFT'}")
        
        # Detect targets in front of attacker
        targets = self._detect_targets(attacker, all_fighters)
        
        print(f"[UltimateManager] Targets detected: {len(targets)}")
        for t in targets:
            print(f"  - Port {t.port} at ({t.center_x:.1f}, {t.center_y:.1f})")
        
        if not targets:
            # No targets found — refund meter and cancel
            print(f"[UltimateManager] No targets in detection zone. Refunding 50% meter.")
            attacker.ultimate_meter = ULTIMATE_METER_MAX * self.METER_REFUND_PERCENT
            return None
        
        # Store targets for post-cutscene application
        self._stored_targets = targets[:]
        
        # Create activation event
        video_path = attacker.data.ultimate_video or "assets/ultimate_brawler.mp4"
        print(f"[UltimateManager] Video path from data: {video_path}")
        
        self._active_ultimate = {
            "attacker": attacker,
            "targets": self._stored_targets,
            "video": video_path,
        }
        
        # Reset meter (consumed on successful activation)
        attacker.ultimate_meter = 0.0
        
        return {
            "type": "ultimate",
            "port": attacker.port,
            "video": video_path,
        }
    
    def _detect_targets(
        self, 
        attacker: Fighter, 
        all_fighters: List[Fighter]
    ) -> List[Fighter]:
        """
        Detect all opponents in front of the attacker within the detection zone.
        
        Parameters
        ----------
        attacker : Fighter
            The fighter using the ultimate.
        all_fighters : List[Fighter]
            All fighters in the match.
        
        Returns
        -------
        List[Fighter]
            All valid targets (alive, not self, in detection zone).
        """
        # Build detection rectangle based on facing direction
        zone = self._get_detection_zone(attacker)
        
        targets = []
        for fighter in all_fighters:
            if fighter.port == attacker.port:
                continue  # don't target self
            if not fighter.is_alive:
                continue  # skip dead fighters
            
            # Check if fighter's hurtbox overlaps detection zone
            hurtbox = fighter.get_hurtbox()
            if zone.colliderect(hurtbox):
                targets.append(fighter)
        
        return targets
    
    def _get_detection_zone(self, attacker: Fighter) -> pygame.Rect:
        """
        Build the forward-facing detection rectangle.
        
        Parameters
        ----------
        attacker : Fighter
            The fighter using the ultimate.
        
        Returns
        -------
        pygame.Rect
            The detection zone in world coordinates.
        """
        # Center the zone vertically on the fighter
        zone_y = attacker.center_y - self.DETECTION_HEIGHT / 2
        
        if attacker.facing == 1:  # facing right
            zone_x = attacker.center_x + self.DETECTION_OFFSET_X
        else:  # facing left
            zone_x = attacker.center_x - self.DETECTION_OFFSET_X - self.DETECTION_WIDTH
        
        return pygame.Rect(
            zone_x, 
            zone_y, 
            self.DETECTION_WIDTH, 
            self.DETECTION_HEIGHT
        )
    
    # ============================================================
    # Post-Cutscene Effects
    # ============================================================
    
    def apply_ultimate_effects(self, match_time: float = 0.0) -> None:
        """
        Apply damage and knockback to stored targets after cutscene ends.
        
        Parameters
        ----------
        match_time : float
            Elapsed match time in seconds (for knockback scaling).
        """
        if not self._active_ultimate:
            return
        
        attacker = self._active_ultimate["attacker"]
        targets = self._active_ultimate["targets"]
        
        # Import here to avoid circular dependency
        from entities.hitbox import Hitbox
        from engine.physics import PhysicsEngine
        
        # Build a hitbox from ultimate attack data (if available)
        if attacker.data.ultimate_attack:
            ult_attack = attacker.data.ultimate_attack
            damage = ult_attack.damage
            base_kb = ult_attack.base_knockback
            kb_scaling = ult_attack.kb_scaling
            angle = ult_attack.angle
        else:
            # Fallback to default values
            damage = self.ULTIMATE_DAMAGE
            base_kb = self.ULTIMATE_BASE_KB
            kb_scaling = self.ULTIMATE_KB_SCALING
            angle = self.ULTIMATE_ANGLE
        
        # Apply effects to each stored target
        for target in targets:
            if not target.is_alive:
                continue  # skip if died during cutscene somehow
            
            # Apply damage
            target.damage_percent += damage
            
            # Check for guaranteed KO
            if target.damage_percent >= self.GUARANTEED_KO_THRESHOLD:
                # Set damage to instant KO range and force death on next blast zone check
                target.damage_percent = max(target.damage_percent, 300.0)
                # Apply massive knockback to ensure blast zone exit
                kb_magnitude = INSTANT_KO_KB
            else:
                # Calculate normal knockback
                kb_magnitude = PhysicsEngine.calculate_knockback(
                    damage=damage,
                    percent=target.damage_percent,
                    weight=target.data.weight,
                    base_knockback=base_kb,
                    kb_scaling=kb_scaling,
                    match_time=match_time,
                    is_special=True,
                )
            
            # Apply knockback with ultimate angle
            PhysicsEngine.apply_knockback(
                target, 
                angle, 
                kb_magnitude,
                consecutive_hits=target._consecutive_hits,
            )
            
            # Cancel any attack in progress on the target
            target.current_attack = None
            target.active_hitbox = None
        
        # Clear stored data
        self._active_ultimate = None
        self._stored_targets = []
    
    # ============================================================
    # State Queries
    # ============================================================
    
    def has_active_ultimate(self) -> bool:
        """Check if an ultimate is currently active (cutscene in progress)."""
        return self._active_ultimate is not None
    
    def clear_active_ultimate(self) -> None:
        """Clear active ultimate data (for emergency cleanup)."""
        self._active_ultimate = None
        self._stored_targets = []
    
    # ============================================================
    # Debug Rendering
    # ============================================================
    
    def render_detection_zone(
        self, 
        screen: pygame.Surface, 
        attacker: Fighter, 
        camera
    ) -> None:
        """
        Debug visualization of the ultimate detection zone.
        
        Parameters
        ----------
        screen : pygame.Surface
            The screen surface to draw on.
        attacker : Fighter
            The fighter whose detection zone to visualize.
        camera : Camera
            The camera for world-to-screen conversion.
        """
        zone = self._get_detection_zone(attacker)
        
        # Convert to screen coordinates
        sx, sy = camera.world_to_screen(zone.x, zone.y)
        w = int(zone.width * camera.zoom)
        h = int(zone.height * camera.zoom)
        
        # Draw semi-transparent detection zone
        debug_surf = pygame.Surface((w, h), pygame.SRCALPHA)
        debug_surf.fill((255, 255, 0, 60))  # yellow overlay
        screen.blit(debug_surf, (sx, sy))
        
        # Draw border
        pygame.draw.rect(
            screen, 
            (255, 215, 0),  # gold border
            (sx, sy, w, h), 
            2  # width
        )
