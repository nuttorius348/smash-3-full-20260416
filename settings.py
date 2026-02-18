"""Global constants and configuration."""

# Display
SCREEN_WIDTH = 1280
SCREEN_HEIGHT = 720
FPS = 60
GAME_TITLE = "Smash 3"

# Physics
GRAVITY = 1800.0            # pixels/sec^2
TERMINAL_VELOCITY = 900.0   # pixels/sec
GROUND_FRICTION = 8.0       # decel multiplier
AIR_FRICTION = 0.5          # decel multiplier
FAST_FALL_MULTIPLIER = 1.8

# Knockback — core formula
KB_DAMAGE_FACTOR = 0.30
KB_PERCENT_DIVISOR = 150.0
KB_HITSTUN_FACTOR = 0.25          # hitstun frames = KB * this (reduced for less stun)

# Knockback — non-linear scaling
KB_CURVE_EXPONENT = 1.4           # >1 = super-linear growth at high %
KB_MATCH_TIME_SCALE = 0.0004      # extra KB per elapsed second of match
KB_MATCH_TIME_CAP = 1.25          # max time multiplier (caps at +25%)

# Knockback — instant KO
INSTANT_KO_THRESHOLD = 250.0      # damage % at which specials insta-kill
INSTANT_KO_KB = 2000.0            # guaranteed blast-zone exit magnitude

# Knockback — reduced stun
HITSTUN_MAX_FRAMES = 90           # hard cap (~1.5 s at 60 fps)
HITSTUN_DECAY = 0.85              # per-consecutive-hit multiplier
HITSTUN_COMBO_RESET_FRAMES = 60   # frames w/o being hit to reset combo

# Combo breaker — prevent infinite combos
COMBO_BREAKER_HIT_THRESHOLD = 3   # hits before forced knockback + invincibility
COMBO_BREAKER_INVINCIBILITY_FRAMES = 120  # 2 seconds at 60fps
COMBO_BREAKER_KNOCKBACK = 600     # strong knockback to create separation

# Knockback — launch vector
VERTICAL_LAUNCH_BIAS = 1.15       # multiply vertical component
VELOCITY_CAP = 2400.0             # hard speed cap (px/s)

# Ultimate
ULTIMATE_METER_MAX = 100.0
DAMAGE_TO_METER_RATIO = 0.6  # meter gained per 1% damage taken
ULTIMATE_CHARGE_CAP = 200.0   # no charging above this %

# Respawn
RESPAWN_INVINCIBILITY_FRAMES = 120  # 2 seconds at 60fps
DEFAULT_STOCKS = 3

# Ledge grab
LEDGE_GRAB_RANGE = 40             # horizontal distance to detect ledge
LEDGE_GRAB_HEIGHT = 60            # vertical distance above ledge
LEDGE_HANG_TIME = 180             # frames before auto-drop (3 seconds)

# Colors
COLOR_BG = (20, 20, 30)
COLOR_WHITE = (255, 255, 255)
COLOR_RED = (220, 50, 50)
COLOR_BLUE = (50, 100, 220)
COLOR_GREEN = (50, 200, 80)
COLOR_YELLOW = (240, 220, 40)
COLOR_ORANGE = (240, 150, 30)
COLOR_HUD_BG = (0, 0, 0, 180)

PLAYER_COLORS = [COLOR_RED, COLOR_BLUE, COLOR_GREEN, COLOR_YELLOW]

# Input
DEADZONE = 0.2
INPUT_BUFFER_FRAMES = 6

# Debug
DEBUG_HITBOXES = False
DEBUG_HURTBOXES = False
DEBUG_POSITIONS = False
