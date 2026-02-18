"""Controller abstraction layer — unified InputState for all control types."""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class InputState:
    """Snapshot of all inputs for one frame."""
    move_x: float = 0.0      # -1.0 (left) to +1.0 (right)
    move_y: float = 0.0      # -1.0 (up)   to +1.0 (down)
    jump: bool = False        # just pressed this frame
    attack: bool = False      # just pressed
    special: bool = False     # just pressed
    shield: bool = False      # held
    grab: bool = False        # just pressed

    def reset(self) -> None:
        self.move_x = 0.0
        self.move_y = 0.0
        self.jump = False
        self.attack = False
        self.special = False
        self.shield = False
        self.grab = False


class Controller(ABC):
    """Abstract base — all input sources produce an InputState."""

    @abstractmethod
    def poll(self, events: list) -> InputState:
        """Read hardware/AI state and return an InputState for this frame."""
        ...
