/**
 * settings.js — Global constants and configuration.
 */
window.SMASH = window.SMASH || {};

SMASH.Settings = {
    // Display
    W: 1280,
    H: 720,
    FPS: 60,

    // Physics
    GRAVITY:            1800,
    TERMINAL_VELOCITY:  900,
    GROUND_FRICTION:    8.0,
    AIR_FRICTION:       0.5,
    FAST_FALL_MULT:     1.8,

    // Knockback
    KB_DMG_FACTOR:      0.30,
    KB_PCT_DIVISOR:     150.0,
    KB_HITSTUN_FACTOR:  0.25,

    // Instant KO — specials at this % deal lethal knockback
    INSTANT_KO_THRESHOLD: 250,
    INSTANT_KO_KB:        2000,   // effectively un-survivable

    // Ultimate KO — ultimates auto-KO at a lower threshold
    ULT_KO_THRESHOLD:    150,

    // Reduced stun — cap + decay so hitstun doesn't feel oppressive
    HITSTUN_MAX_FRAMES:   90,     // hard cap on hitstun duration
    HITSTUN_DECAY:        0.85,   // multiplier applied per-hit to consecutive hitstun
    
    // Combo breaker — prevent infinite combos
    COMBO_BREAKER_HIT_THRESHOLD: 3,       // hits before forced knockback + invincibility
    COMBO_BREAKER_INVINCIBILITY_FRAMES: 120,  // 2 seconds at 60fps
    COMBO_BREAKER_KNOCKBACK: 600,         // strong knockback to create separation

    // Ultimate
    ULT_MAX:            100,
    DMG_TO_METER:       0.6,
    ULT_CHARGE_CAP:     200,

    // Stocks
    DEFAULT_STOCKS:     3,

    // Respawn
    RESPAWN_INV_FRAMES: 120,

    // Shield
    SHIELD_MAX_HP:      100,
    SHIELD_DECAY:       0.4,    // per frame while held
    SHIELD_REGEN:       0.12,   // per frame while released
    SHIELD_STUN_FRAMES: 150,    // shield-break stagger
    SHIELD_PUSHBACK:    250,
    SHIELD_RADIUS:      45,

    // Grab mechanic
    GRAB_RANGE:         70,     // how close attacker must be to grab
    GRAB_HITS_TO_THROW: 3,     // hits while grabbed before knockback throw
    GRAB_THROW_KB:      500,   // knockback on throw release
    GRAB_THROW_ANGLE:   55,    // launch angle on throw (degrees)
    GRAB_HIT_DAMAGE:    3,     // damage per pummel hit while grabbed
    GRAB_ESCAPE_FRAMES: 180,   // auto-escape after 3 seconds if no hits

    // Pogo bounce
    POGO_BOUNCE_VY:     -700,  // upward velocity when pogo-bouncing off someone

    // Slippery debuff (Baby Oil)
    SLIPPERY_DURATION_FRAMES: 300,  // 5 seconds at 60fps
    SLIPPERY_FRICTION_MULT:   0.15, // ground friction multiplier when slippery

    // Focus / Super-armor absorb
    FOCUS_ARMOR_HITS:   1,      // hits absorbed during focus startup
    FOCUS_ARMOR_HITS_CHARGED: 2,

    // Player colors
    P_COLORS:   ['#dc3232','#3264dc','#32c850','#f0dc28'],
    P_COLORS_A: ['rgba(220,50,50,','rgba(50,100,220,','rgba(50,200,80,','rgba(240,220,40,'],

    // Debug (toggled from menu)
    DEBUG_HITBOXES:  false,
    DEBUG_HURTBOXES: false,
};
