"""Cutscene player — plays MP4 files via OpenCV frames blitted to Pygame."""

from __future__ import annotations
from pathlib import Path

import pygame
import numpy as np

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("WARNING: opencv-python not installed. Video cutscenes will use fallback effect.")


class CutscenePlayer:
    """Plays an MP4 video as a fullscreen overlay. Falls back to a dramatic effect if video fails."""

    def __init__(self, screen_w: int, screen_h: int):
        self.screen_w = screen_w
        self.screen_h = screen_h
        self._cap = None
        self._playing = False
        self._frame_surface: pygame.Surface | None = None
        self._fallback_timer = 0  # frames for fallback effect
        self._video_fps = 30  # default FPS
        self._frame_counter = 0  # for FPS timing
        pygame.mixer.init()  # ensure mixer is initialized for audio

    def play(self, video_path: str) -> None:
        """Start playing a video. Falls back to dramatic effect if video unavailable."""
        path = Path(video_path)
        
        # Debug: print what we're trying to load
        print(f"[CUTSCENE] Attempting to play: {video_path}")
        print(f"[CUTSCENE] Full path: {path.absolute()}")
        print(f"[CUTSCENE] File exists: {path.exists()}")
        print(f"[CUTSCENE] OpenCV available: {HAS_CV2}")
        
        if HAS_CV2 and path.exists():
            self._cap = cv2.VideoCapture(str(path))
            if self._cap.isOpened():
                # Get video FPS for proper playback timing
                self._video_fps = self._cap.get(cv2.CAP_PROP_FPS) or 30
                self._frame_counter = 0
                self._playing = True
                print(f"[CUTSCENE] Video opened successfully! FPS: {self._video_fps}")
                
                # Try to load and play audio from the video
                self._play_audio(path)
                return
            else:
                print(f"[CUTSCENE] ERROR: Video file could not be opened by OpenCV")
        else:
            if not HAS_CV2:
                print("[CUTSCENE] Falling back: OpenCV not available")
            elif not path.exists():
                print(f"[CUTSCENE] Falling back: File not found at {path.absolute()}")
        
        # Fallback: dramatic flash + pause effect (3 seconds)
        print("[CUTSCENE] Using fallback effect (3 second dramatic pause)")
        self._playing = True
        self._fallback_timer = 180  # 3 seconds at 60fps
        self._frame_surface = None

    def is_playing(self) -> bool:
        return self._playing

    def update(self) -> None:
        """Update cutscene playback (call every frame)."""
        if not self._playing:
            return

        if self._cap is not None:
            self._frame_counter += 1
            # Read and display video frames
            ret, frame = self._cap.read()
            if not ret:
                print("[CUTSCENE] Video playback complete")
                self.stop()
                return
            # BGR → RGB, resize to screen
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = cv2.resize(frame, (self.screen_w, self.screen_h))
            # numpy array → Pygame surface
            self._frame_surface = pygame.surfarray.make_surface(
                np.transpose(frame, (1, 0, 2))
            )
        else:
            # Fallback timer
            self._fallback_timer -= 1
            if self._fallback_timer <= 0:
                print("[CUTSCENE] Fallback effect complete")
                self.stop()
    
    def _play_audio(self, video_path: Path) -> None:
        """Attempt to play audio from the video file using pygame.mixer."""
        try:
            # Try to load and play the video as audio
            # Note: This will only work if the video has an audio track
            # and pygame's mixer supports the format
            pygame.mixer.music.load(str(video_path))
            pygame.mixer.music.play()
            print("[CUTSCENE] Audio playback started")
        except pygame.error as e:
            print(f"[CUTSCENE] Could not play audio: {e}")
            print("[CUTSCENE] Video will play without sound")

    def render(self, screen: pygame.Surface) -> None:
        """Render the current cutscene frame."""
        if not self._playing:
            return
        if self._frame_surface is not None:
            screen.blit(self._frame_surface, (0, 0))
        else:
            # Fallback: dramatic effect with pulsing + text
            progress = 1.0 - (self._fallback_timer / 180.0)
            
            # Pulsing flash effect
            if self._fallback_timer > 150:  # First 0.5 sec: bright flash
                alpha = 255
            elif self._fallback_timer > 120:  # Next 0.5 sec: fade to black
                alpha = int(255 * ((self._fallback_timer - 120) / 30))
            else:  # Last 2 sec: pulse between dark and light
                pulse = (pygame.time.get_ticks() % 500) / 500.0
                alpha = int(30 + 50 * pulse)
            
            overlay = pygame.Surface((self.screen_w, self.screen_h), pygame.SRCALPHA)
            overlay.fill((255, 255, 255, alpha))
            screen.blit(overlay, (0, 0))
            
            # Display "ULTIMATE!" text
            if self._fallback_timer < 150:
                font = pygame.font.SysFont("Arial", 72, bold=True)
                text = font.render("ULTIMATE!", True, (255, 215, 0))  # Gold text
                text_shadow = font.render("ULTIMATE!", True, (0, 0, 0))
                # Shadow
                screen.blit(text_shadow, (
                    self.screen_w // 2 - text.get_width() // 2 + 4,
                    self.screen_h // 2 - text.get_height() // 2 + 4
                ))
                # Main text
                screen.blit(text, (
                    self.screen_w // 2 - text.get_width() // 2,
                    self.screen_h // 2 - text.get_height() // 2
                ))

    def stop(self) -> None:
        """Stop cutscene playback and clean up resources."""
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._playing = False
        self._frame_surface = None
        self._fallback_timer = 0
        self._frame_counter = 0
        
        # Stop audio if playing
        try:
            pygame.mixer.music.stop()
        except:
            pass
