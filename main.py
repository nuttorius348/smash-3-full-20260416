"""Smash 3 — Entry point.

Usage:
    python main.py                        # 1 human (WASD) + 3 AI (diff 5)
    python main.py --players 2            # 2 humans (WASD + Arrows) + 2 AI
    python main.py --ai-only              # 4 AI players
    python main.py --stage wide_arena     # choose stage
    python main.py --difficulty 9         # set AI difficulty (1-9)
    python main.py --ai-backend claude    # use Claude AI with fallback
    python main.py --ai-backend ollama    # use local Ollama model with fallback
    python main.py --stocks 5             # stocks per player
    python main.py --debug                # show hitboxes/hurtboxes
"""

from __future__ import annotations
import argparse
import sys

import settings
from engine.game import Game


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smash 3 — Platform Fighter")
    parser.add_argument("--players", type=int, default=1, choices=[0, 1, 2, 3, 4],
                        help="Number of human players (0-4)")
    parser.add_argument("--ai-only", action="store_true",
                        help="All 4 players are AI")
    parser.add_argument("--stage", type=str, default="battlefield",
                        choices=["battlefield", "final_destination", "wide_arena"],
                        help="Stage to play on")
    parser.add_argument("--difficulty", type=int, default=5,
                        help="AI difficulty (1-9)")
    parser.add_argument("--ai-backend", type=str, default="classic",
                        choices=["classic", "claude", "ollama"],
                        help="AI backend for CPU players")
    parser.add_argument("--claude-model", type=str, default="claude-opus-4-6",
                        help="Claude model name when --ai-backend claude is used")
    parser.add_argument("--ollama-model", type=str, default="llama3",
                        help="Ollama model name when --ai-backend ollama is used")
    parser.add_argument("--ollama-url", type=str, default="http://127.0.0.1:11434",
                        help="Ollama base URL when --ai-backend ollama is used")
    parser.add_argument("--stocks", type=int, default=3,
                        help="Stocks per player")
    parser.add_argument("--total-players", type=int, default=4,
                        help="Total number of players (2-4)")
    parser.add_argument("--debug", action="store_true",
                        help="Show hitbox/hurtbox debug overlay")
    return parser.parse_args()


def build_player_configs(args: argparse.Namespace) -> list[dict]:
    total = max(2, min(4, args.total_players))
    humans = 0 if args.ai_only else min(args.players, total)
    difficulty = max(1, min(9, args.difficulty))

    configs = []
    
    # Initialize pygame joystick to detect gamepads
    import pygame
    if not pygame.get_init():
        pygame.init()
    if not pygame.joystick.get_init():
        pygame.joystick.init()
    
    num_gamepads = pygame.joystick.get_count()
    print(f"[SETUP] Detected {num_gamepads} gamepad(s)")

    # Human players - prioritize gamepads
    gamepad_index = 0
    keyboard_index = 0
    for i in range(humans):
        # Use gamepad if available, otherwise keyboard
        if gamepad_index < num_gamepads:
            configs.append({"type": "gamepad", "index": gamepad_index})
            print(f"[SETUP] Player {i+1}: Gamepad {gamepad_index}")
            gamepad_index += 1
        else:
            configs.append({"type": "keyboard", "layout": keyboard_index})
            print(f"[SETUP] Player {i+1}: Keyboard layout {keyboard_index}")
            keyboard_index += 1

    # AI players to fill remaining slots
    for i in range(total - humans):
        if args.ai_backend == "claude":
            configs.append({
                "type": "claude_ai",
                "difficulty": difficulty,
                "model": args.claude_model,
                "provider": "claude",
            })
            print(
                f"[SETUP] Player {humans+i+1}: Claude AI "
                f"(model {args.claude_model}, fallback diff {difficulty})"
            )
        elif args.ai_backend == "ollama":
            configs.append({
                "type": "claude_ai",
                "difficulty": difficulty,
                "model": args.ollama_model,
                "provider": "ollama",
                "base_url": args.ollama_url,
            })
            print(
                f"[SETUP] Player {humans+i+1}: Ollama AI "
                f"(model {args.ollama_model}, url {args.ollama_url}, fallback diff {difficulty})"
            )
        else:
            configs.append({"type": "ai", "difficulty": difficulty})
            print(f"[SETUP] Player {humans+i+1}: AI (difficulty {difficulty})")

    return configs


def main() -> None:
    args = parse_args()

    # Debug mode
    if args.debug:
        settings.DEBUG_HITBOXES = True
        settings.DEBUG_HURTBOXES = True

    configs = build_player_configs(args)

    game = Game(
        player_configs=configs,
        stage_name=args.stage,
        stocks=args.stocks,
    )
    game.run()


if __name__ == "__main__":
    main()
