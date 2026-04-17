/**
 * FighterData.js — Character roster configs + FighterData class.
 *
 * ═══════════════════════════════════════════════════════════════
 *  MOVE SCHEMA — every attack entry must have:
 * ═══════════════════════════════════════════════════════════════
 *  name             string        display name
 *  sprite           string        path to static PNG pose file
 *  hitboxShape      'rect'|'circle'
 *  hitboxX/Y        number        offset from fighter center (facing right)
 *  hitboxW/H        number        bounding box of hitbox
 *  hitboxR          number        radius (used when shape='circle')
 *  damage           number        base damage dealt
 *  baseKB           number        minimum knockback units
 *  kbScaling        number        how fast KB scales with %
 *  angle            number        launch angle (degrees, 0=right 90=up 270=spike)
 *  startupFrames    number        frames before hitbox appears
 *  activeFrames     number        frames hitbox stays out
 *  endlagFrames     number        recovery frames after active ends
 *  spawnsProjectile boolean       does this move fire a projectile?
 *
 *  Optional projectile sub-fields (when spawnsProjectile=true):
 *  projectileType   'linear'|'arc'|'boomerang'|'piercing'|'stationary'
 *  projSpeed        number
 *  projLifetime     number (frames)
 *  projDamage       number
 *  projKB           number
 *  projAngle        number
 *  projShape        'rect'|'circle'
 *  projW/H/R        number
 *
 *  Optional armor sub-fields (focus / super-armor moves):
 *  isArmored        boolean
 *  armorHits        number
 *  armorDuringStartup boolean
 *
 *  Optional movement sub-fields:
 *  boostVX          number   horizontal velocity applied on startup
 *  boostVY          number   vertical velocity applied on startup
 *
 * ═══════════════════════════════════════════════════════════════
 *  ULTIMATE:
 *    cutsceneVideo    path to mp4 placeholder
 *    meterCost        always = ULT_MAX (100) — see settings.js
 *    Meter charges via DMG_TO_METER (0.6 per 1 dmg taken)
 *    Stops charging once damagePercent >= ULT_CHARGE_CAP (200%)
 * ═══════════════════════════════════════════════════════════════
 */
(function() {

// ─────────────────────────────────────────────────────────────────
//  CHARACTER ROSTER — add new characters by copying a block
// ─────────────────────────────────────────────────────────────────

const ROSTER = {};

// ═════════════════════════════════════════════════════════════════
//  1. BRAWLER   (balanced all-rounder)
// ═════════════════════════════════════════════════════════════════
ROSTER.brawler = {
    name:            'Lazer',
    color:           '#e74c3c',
    description:     'Balanced fighter with strong fundamentals',
    idleSprite:      'assets/sprite_brawler.jpg',
    weight:          100,
    width:           50,
    height:          80,
    walkSpeed:       250,
    runSpeed:        450,
    airSpeed:        300,
    jumpForce:       650,
    shortHopForce:   420,
    doubleJumpForce: 580,
    maxJumps:        2,
    fallSpeed:       600,
    fastFallSpeed:   900,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Jab',
            sprite: 'sprites/brawler/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 35, hitboxY: -5, hitboxW: 50, hitboxH: 30, hitboxR: 25,
            damage: 3,  baseKB: 110,  kbScaling: 0.3, angle: 30,
            startupFrames: 2, activeFrames: 2, endlagFrames: 6,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Tilt',
            sprite: 'sprites/brawler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -8, hitboxW: 72, hitboxH: 36, hitboxR: 36,
            damage: 9,  baseKB: 200, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Up Tilt',
            sprite: 'sprites/brawler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -45, hitboxW: 60, hitboxH: 55, hitboxR: 32,
            damage: 8,  baseKB: 210, kbScaling: 0.9, angle: 82,
            startupFrames: 4, activeFrames: 4, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Down Tilt',
            sprite: 'sprites/brawler/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 35, hitboxY: 12, hitboxW: 66, hitboxH: 22, hitboxR: 22,
            damage: 7,  baseKB: 165, kbScaling: 0.6, angle: 20,
            startupFrames: 3, activeFrames: 3, endlagFrames: 10,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Nair',
            sprite: 'sprites/brawler/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 70, hitboxH: 70, hitboxR: 38,
            damage: 7,  baseKB: 175, kbScaling: 0.5, angle: 45,
            startupFrames: 3, activeFrames: 4, endlagFrames: 10,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Fair',
            sprite: 'sprites/brawler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 46, hitboxY: -4, hitboxW: 56, hitboxH: 38, hitboxR: 28,
            damage: 10, baseKB: 215, kbScaling: 1.0, angle: 45,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Uair',
            sprite: 'sprites/brawler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -48, hitboxW: 54, hitboxH: 50, hitboxR: 30,
            damage: 8,  baseKB: 200, kbScaling: 0.9, angle: 86,
            startupFrames: 4, activeFrames: 3, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Dair (Spike)',
            sprite: 'sprites/brawler/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 32, hitboxW: 46, hitboxH: 46, hitboxR: 26,
            damage: 12, baseKB: 240, kbScaling: 1.2, angle: 270,
            startupFrames: 8, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Energy Blast',
            sprite: 'sprites/brawler/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 40, hitboxY: -5, hitboxW: 40, hitboxH: 30, hitboxR: 18,
            damage: 8,  baseKB: 140, kbScaling: 0.7, angle: 35,
            startupFrames: 10, activeFrames: 2, endlagFrames: 18,
            spawnsProjectile: true,
            projectileType: 'linear',
            projSpeed: 650, projLifetime: 100, projDamage: 8, projKB: 150, projAngle: 30,
            projShape: 'circle', projW: 22, projH: 22, projR: 11,
        },
        side_special: {
            name: 'Rushing Elbow',
            sprite: 'sprites/brawler/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 50, hitboxY: -8, hitboxW: 78, hitboxH: 42, hitboxR: 35,
            damage: 12, baseKB: 200, kbScaling: 1.1, angle: 35,
            startupFrames: 12, activeFrames: 4, endlagFrames: 22,
            spawnsProjectile: false,
            boostVX: 500,
        },
        up_special: {
            name: 'Rising Uppercut',
            sprite: 'sprites/brawler/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -35, hitboxW: 50, hitboxH: 60, hitboxR: 30,
            damage: 6,  baseKB: 170, kbScaling: 0.8, angle: 80,
            startupFrames: 5, activeFrames: 6, endlagFrames: 15,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -700,
        },
        down_special: {
            name: 'Focus Attack',
            sprite: 'sprites/brawler/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 30, hitboxY: 0,  hitboxW: 80, hitboxH: 50, hitboxR: 40,
            damage: 14, baseKB: 220, kbScaling: 1.3, angle: 50,
            startupFrames: 18, activeFrames: 4, endlagFrames: 24,
            spawnsProjectile: false,
            isArmored: true, armorHits: 1, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Lazer Nuke',
        sprite: 'sprites/brawler/ultimate.png',
        cutsceneVideo: 'assets/ultimate_brawler.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 300, hitboxH: 200, hitboxR: 160,
        damage: 80, baseKB: 550, kbScaling: 1.8, angle: 60,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  2. ZONER   (long-range projectile specialist)
// ═════════════════════════════════════════════════════════════════
ROSTER.zoner = {
    name:            'Slaveish',    color:           '#3498db',
    description:     'Projectile specialist with long-range control',
    idleSprite:      'assets/sprite_zoner.png',    weight:          85,
    width:           46,
    height:          78,
    walkSpeed:       220,
    runSpeed:        400,
    airSpeed:        280,
    jumpForce:       620,
    shortHopForce:   400,
    doubleJumpForce: 560,
    maxJumps:        2,
    fallSpeed:       550,
    fastFallSpeed:   850,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Spark Jab',
            sprite: 'sprites/zoner/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 42, hitboxH: 26, hitboxR: 20,
            damage: 2,  baseKB: 60,  kbScaling: 0.2, angle: 25,
            startupFrames: 3, activeFrames: 2, endlagFrames: 5,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Rod Swing',
            sprite: 'sprites/zoner/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 80, hitboxH: 28, hitboxR: 35,
            damage: 7,  baseKB: 130, kbScaling: 0.7, angle: 38,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Spark Pillar',
            sprite: 'sprites/zoner/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -50, hitboxW: 50, hitboxH: 60, hitboxR: 28,
            damage: 6,  baseKB: 140, kbScaling: 0.8, angle: 88,
            startupFrames: 5, activeFrames: 5, endlagFrames: 14,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/zoner/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 32, hitboxY: 14, hitboxW: 60, hitboxH: 18, hitboxR: 20,
            damage: 5,  baseKB: 100, kbScaling: 0.5, angle: 15,
            startupFrames: 4, activeFrames: 3, endlagFrames: 10,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spark Ring',
            sprite: 'sprites/zoner/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 60, hitboxH: 60, hitboxR: 34,
            damage: 5,  baseKB: 110, kbScaling: 0.4, angle: 50,
            startupFrames: 4, activeFrames: 5, endlagFrames: 10,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Arc Shot',
            sprite: 'sprites/zoner/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -2, hitboxW: 48, hitboxH: 30, hitboxR: 24,
            damage: 8,  baseKB: 140, kbScaling: 0.8, angle: 42,
            startupFrames: 7, activeFrames: 3, endlagFrames: 18,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Anti-Air Bolt',
            sprite: 'sprites/zoner/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -40, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 6,  baseKB: 130, kbScaling: 0.7, angle: 85,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Thunder Drop',
            sprite: 'sprites/zoner/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 28, hitboxW: 40, hitboxH: 40, hitboxR: 22,
            damage: 10, baseKB: 160, kbScaling: 1.0, angle: 270,
            startupFrames: 10, activeFrames: 3, endlagFrames: 22,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Plasma Laser',
            sprite: 'sprites/zoner/neutral_special.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -4, hitboxW: 80, hitboxH: 10, hitboxR: 16,
            damage: 6, baseKB: 80, kbScaling: 0.3, angle: 15,
            startupFrames: 6, activeFrames: 2, endlagFrames: 12,
            spawnsProjectile: true,
            projectileType: 'laser',
            projSpeed: 1200, projLifetime: 40, projDamage: 6, projKB: 80, projAngle: 15,
            projShape: 'rect', projW: 80, projH: 8, projR: 40,
            projPiercing: true, projMaxHits: 3, projTrail: 12,
        },
        side_special: {
            name: 'Photon Blast',
            sprite: 'sprites/zoner/side_special.png',
            hitboxShape: 'circle',
            hitboxX: 44, hitboxY: 0,  hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 18,  baseKB: 300, kbScaling: 1.2, angle: 55,
            startupFrames: 18, activeFrames: 2, endlagFrames: 22,
            spawnsProjectile: true,
            projectileType: 'blast',
            projSpeed: 350, projLifetime: 90, projDamage: 18, projKB: 300, projAngle: 55,
            projShape: 'circle', projW: 40, projH: 40, projR: 20,
            projTrail: 8, projStageCollision: 'destroy',
            projExplosionRadius: 60, projExplosionDamage: 9, projExplosionKB: 180,
        },
        up_special: {
            name: 'Warp Pad',
            sprite: 'sprites/zoner/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -30, hitboxW: 40, hitboxH: 40, hitboxR: 22,
            damage: 4,  baseKB: 100, kbScaling: 0.4, angle: 75,
            startupFrames: 6, activeFrames: 4, endlagFrames: 18,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -750,
        },
        down_special: {
            name: 'Shockwave',
            sprite: 'sprites/zoner/down_special.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: 10, hitboxW: 60, hitboxH: 50, hitboxR: 30,
            damage: 10,  baseKB: 180,  kbScaling: 0.8, angle: 35,
            startupFrames: 14, activeFrames: 2, endlagFrames: 20,
            spawnsProjectile: true,
            projectileType: 'wave',
            projSpeed: 400, projLifetime: 150, projDamage: 10, projKB: 180, projAngle: 35,
            projShape: 'rect', projW: 60, projH: 50,
            projGravity: 0.8, projGroundSnap: true,
            projStageCollision: 'slide', projTrail: 6,
        },
    },

    ultimateAttack: {
        name: 'Goyslop Overload',
        sprite: 'sprites/zoner/ultimate.png',
        cutsceneVideo: 'assets/ultimate_zoner.mp4',
        hitboxShape: 'rect',
        hitboxX: 0,  hitboxY: -60, hitboxW: 400, hitboxH: 300, hitboxR: 200,
        damage: 75, baseKB: 520, kbScaling: 1.7, angle: 70,
        startupFrames: 0, activeFrames: 8, endlagFrames: 35,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  3. GRAPPLER   (heavy, high damage, slow)
// ═════════════════════════════════════════════════════════════════
ROSTER.grappler = {
    name:            'Frankie',    color:           '#2ecc71',
    description:     'Heavy hitter with super armor and command grabs',
    idleSprite:      'assets/sprite_grappler.jpg',    weight:          130,
    width:           58,
    height:          86,
    walkSpeed:       190,
    runSpeed:        370,
    airSpeed:        230,
    jumpForce:       580,
    shortHopForce:   370,
    doubleJumpForce: 510,
    maxJumps:        2,
    fallSpeed:       700,
    fastFallSpeed:   1050,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Heavy Chop',
            sprite: 'sprites/grappler/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -6, hitboxW: 56, hitboxH: 38, hitboxR: 28,
            damage: 4,  baseKB: 90,  kbScaling: 0.3, angle: 28,
            startupFrames: 4, activeFrames: 3, endlagFrames: 8,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Haymaker',
            sprite: 'sprites/grappler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -10, hitboxW: 85, hitboxH: 44, hitboxR: 40,
            damage: 14, baseKB: 200, kbScaling: 1.0, angle: 38,
            startupFrames: 8, activeFrames: 4, endlagFrames: 20,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Headbutt',
            sprite: 'sprites/grappler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -42, hitboxW: 64, hitboxH: 56, hitboxR: 34,
            damage: 11, baseKB: 190, kbScaling: 1.0, angle: 80,
            startupFrames: 6, activeFrames: 4, endlagFrames: 16,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Ground Pound',
            sprite: 'sprites/grappler/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 0, hitboxY: 10,  hitboxW: 90, hitboxH: 28, hitboxR: 30,
            damage: 10, baseKB: 140,  kbScaling: 0.7, angle: 22,
            startupFrames: 5, activeFrames: 4, endlagFrames: 14,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Body Press',
            sprite: 'sprites/grappler/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 80, hitboxH: 80, hitboxR: 42,
            damage: 9,  baseKB: 150, kbScaling: 0.6, angle: 50,
            startupFrames: 5, activeFrames: 5, endlagFrames: 12,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Hammer Fist',
            sprite: 'sprites/grappler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 44, hitboxY: 0,  hitboxW: 64, hitboxH: 48, hitboxR: 32,
            damage: 13, baseKB: 190, kbScaling: 1.1, angle: 40,
            startupFrames: 10, activeFrames: 3, endlagFrames: 22,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Slam',
            sprite: 'sprites/grappler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -46, hitboxW: 58, hitboxH: 54, hitboxR: 32,
            damage: 10, baseKB: 170, kbScaling: 1.0, angle: 84,
            startupFrames: 6, activeFrames: 4, endlagFrames: 16,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Meteor Stomp',
            sprite: 'sprites/grappler/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 36, hitboxW: 52, hitboxH: 52, hitboxR: 28,
            damage: 15, baseKB: 210, kbScaling: 1.4, angle: 270,
            startupFrames: 12, activeFrames: 3, endlagFrames: 26,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Short-Range Blast',
            sprite: 'sprites/grappler/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 36, hitboxY: 0,  hitboxW: 60, hitboxH: 50, hitboxR: 30,
            damage: 14, baseKB: 180, kbScaling: 0.9, angle: 32,
            startupFrames: 14, activeFrames: 3, endlagFrames: 22,
            spawnsProjectile: false,
        },
        side_special: {
            name: 'Charging Tackle',
            sprite: 'sprites/grappler/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 100, hitboxH: 56, hitboxR: 44,
            damage: 16, baseKB: 240, kbScaling: 1.2, angle: 30,
            startupFrames: 14, activeFrames: 6, endlagFrames: 28,
            spawnsProjectile: false,
            boostVX: 600,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
        up_special: {
            name: 'Rising Lariat',
            sprite: 'sprites/grappler/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -30, hitboxW: 56, hitboxH: 64, hitboxR: 32,
            damage: 8,  baseKB: 180, kbScaling: 0.8, angle: 78,
            startupFrames: 6, activeFrames: 8, endlagFrames: 18,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -620,
        },
        down_special: {
            name: 'Barrel Toss',
            sprite: 'sprites/grappler/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 26, hitboxY: 0,  hitboxW: 36, hitboxH: 36, hitboxR: 18,
            damage: 14, baseKB: 200, kbScaling: 1.2, angle: 45,
            startupFrames: 18, activeFrames: 3, endlagFrames: 24,
            spawnsProjectile: true,
            projectileType: 'barrel',
            projSpeed: 300, projLifetime: 200, projDamage: 14, projKB: 200, projAngle: 45,
            projShape: 'rect', projW: 36, projH: 36, projR: 18,
            projGravity: 1.2, projStageCollision: 'bounce',
            projTrail: 4,
        },
    },

    ultimateAttack: {
        name: 'Israeli Spirit Detonation',
        sprite: 'sprites/grappler/ultimate.png',
        cutsceneVideo: 'assets/ultimate_grappler.mp4',
        hitboxShape: 'circle',
        hitboxX: 0,  hitboxY: 0,  hitboxW: 350, hitboxH: 250, hitboxR: 180,
        damage: 85, baseKB: 600, kbScaling: 1.9, angle: 55,
        startupFrames: 0, activeFrames: 8, endlagFrames: 36,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  4. SPEEDSTER   (fast, light, combo-oriented)
// ═════════════════════════════════════════════════════════════════
ROSTER.speedster = {
    name:            'Nutsack',    color:           '#f39c12',
    description:     'Lightning-fast rushdown with triple jump',
    idleSprite:      'assets/sprite_speedster.jpg',    weight:          78,
    width:           44,
    height:          74,
    walkSpeed:       310,
    runSpeed:        550,
    airSpeed:        360,
    jumpForce:       680,
    shortHopForce:   460,
    doubleJumpForce: 620,
    maxJumps:        3,
    fallSpeed:       520,
    fastFallSpeed:   800,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Slash',
            sprite: 'sprites/speedster/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -3, hitboxW: 44, hitboxH: 24, hitboxR: 18,
            damage: 2,  baseKB: 50,  kbScaling: 0.2, angle: 32,
            startupFrames: 1, activeFrames: 2, endlagFrames: 4,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Blade Dash',
            sprite: 'sprites/speedster/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -6, hitboxW: 68, hitboxH: 30, hitboxR: 32,
            damage: 6,  baseKB: 110, kbScaling: 0.6, angle: 35,
            startupFrames: 3, activeFrames: 2, endlagFrames: 10,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Flip Kick',
            sprite: 'sprites/speedster/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -42, hitboxW: 48, hitboxH: 48, hitboxR: 26,
            damage: 5,  baseKB: 130, kbScaling: 0.7, angle: 85,
            startupFrames: 3, activeFrames: 3, endlagFrames: 8,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Slide Kick',
            sprite: 'sprites/speedster/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: 12, hitboxW: 58, hitboxH: 18, hitboxR: 18,
            damage: 4,  baseKB: 80,  kbScaling: 0.4, angle: 18,
            startupFrames: 2, activeFrames: 3, endlagFrames: 8,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Slash',
            sprite: 'sprites/speedster/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 56, hitboxH: 56, hitboxR: 30,
            damage: 5,  baseKB: 100, kbScaling: 0.4, angle: 48,
            startupFrames: 2, activeFrames: 4, endlagFrames: 8,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Multi-Kick',
            sprite: 'sprites/speedster/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -2, hitboxW: 50, hitboxH: 28, hitboxR: 22,
            damage: 7,  baseKB: 120, kbScaling: 0.8, angle: 42,
            startupFrames: 4, activeFrames: 3, endlagFrames: 12,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Bicycle Kick',
            sprite: 'sprites/speedster/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -44, hitboxW: 42, hitboxH: 42, hitboxR: 24,
            damage: 6,  baseKB: 120, kbScaling: 0.7, angle: 88,
            startupFrames: 3, activeFrames: 3, endlagFrames: 10,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Divekick',
            sprite: 'sprites/speedster/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 24, hitboxW: 36, hitboxH: 36, hitboxR: 20,
            damage: 9, baseKB: 150, kbScaling: 1.0, angle: 270,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Shuriken',
            sprite: 'sprites/speedster/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 36, hitboxY: -2, hitboxW: 28, hitboxH: 28, hitboxR: 14,
            damage: 5,  baseKB: 90,  kbScaling: 0.4, angle: 28,
            startupFrames: 6, activeFrames: 2, endlagFrames: 10,
            spawnsProjectile: true,
            projectileType: 'boomerang',
            projSpeed: 700, projLifetime: 120, projDamage: 5, projKB: 90, projAngle: 25,
            projShape: 'circle', projW: 20, projH: 20, projR: 10,
            projPiercing: true, projTrail: 6,
        },
        side_special: {
            name: 'Shadow Step',
            sprite: 'sprites/speedster/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 48, hitboxY: -4, hitboxW: 60, hitboxH: 36, hitboxR: 28,
            damage: 8,  baseKB: 140, kbScaling: 0.7, angle: 32,
            startupFrames: 4, activeFrames: 2, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 700,
        },
        up_special: {
            name: 'Vanishing Slash',
            sprite: 'sprites/speedster/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -28, hitboxW: 44, hitboxH: 50, hitboxR: 24,
            damage: 5,  baseKB: 140, kbScaling: 0.6, angle: 78,
            startupFrames: 3, activeFrames: 4, endlagFrames: 12,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Counter Stance',
            sprite: 'sprites/speedster/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 24, hitboxY: 0,  hitboxW: 60, hitboxH: 44, hitboxR: 30,
            damage: 10, baseKB: 180, kbScaling: 1.1, angle: 55,
            startupFrames: 14, activeFrames: 4, endlagFrames: 20,
            spawnsProjectile: false,
            isArmored: true, armorHits: 1, armorDuringStartup: true,
        },
    },

    ultimateAttack: {
        name: 'Asian Spirit',
        sprite: 'sprites/speedster/ultimate.png',
        cutsceneVideo: 'assets/ultimate_speedster.mp4',
        hitboxShape: 'circle',
        hitboxX: 0,  hitboxY: 0,  hitboxW: 260, hitboxH: 180, hitboxR: 140,
        damage: 70, baseKB: 480, kbScaling: 1.6, angle: 65,
        startupFrames: 0, activeFrames: 5, endlagFrames: 24,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  5. METABOT   (heavy robot with ranged specials and flight)
// ═════════════════════════════════════════════════════════════════
ROSTER.metabot = {
    name:            'Metabot',
    color:           '#8e44ad',
    description:     'Heavy robot with a laser beam, barrel bombs, and flight',
    idleSprite:      'assets/sprite_metabot.png',
    weight:          115,
    width:           54,
    height:          84,
    walkSpeed:       210,
    runSpeed:        380,
    airSpeed:        260,
    jumpForce:       600,
    shortHopForce:   390,
    doubleJumpForce: 540,
    maxJumps:        2,
    fallSpeed:       620,
    fastFallSpeed:   920,

    attacks: {
        // ── Ground Normals (standard robot punches/kicks) ────────
        neutral_attack: {
            name: 'Piston Jab',
            sprite: 'sprites/metabot/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: -5, hitboxW: 48, hitboxH: 30, hitboxR: 24,
            damage: 3,  baseKB: 100,  kbScaling: 0.3, angle: 30,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Arm Hammer',
            sprite: 'sprites/metabot/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -8, hitboxW: 70, hitboxH: 38, hitboxR: 35,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 38,
            startupFrames: 6, activeFrames: 3, endlagFrames: 15,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Antenna Swipe',
            sprite: 'sprites/metabot/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -46, hitboxW: 58, hitboxH: 54, hitboxR: 30,
            damage: 8,  baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep Kick',
            sprite: 'sprites/metabot/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 64, hitboxH: 22, hitboxR: 22,
            damage: 7,  baseKB: 160, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Rotor Spin',
            sprite: 'sprites/metabot/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 68, hitboxH: 68, hitboxR: 36,
            damage: 7,  baseKB: 170, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 5, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Rocket Punch',
            sprite: 'sprites/metabot/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 44, hitboxY: -4, hitboxW: 58, hitboxH: 36, hitboxR: 28,
            damage: 11, baseKB: 220, kbScaling: 1.0, angle: 42,
            startupFrames: 7, activeFrames: 3, endlagFrames: 17,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Thruster Burst',
            sprite: 'sprites/metabot/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -44, hitboxW: 50, hitboxH: 50, hitboxR: 28,
            damage: 8,  baseKB: 190, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Stomp Drill',
            sprite: 'sprites/metabot/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 30, hitboxW: 46, hitboxH: 46, hitboxR: 26,
            damage: 13, baseKB: 250, kbScaling: 1.2, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 21,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Laser Beam',
            sprite: 'sprites/metabot/neutral_special.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -4, hitboxW: 90, hitboxH: 12, hitboxR: 18,
            damage: 10, baseKB: 120, kbScaling: 0.5, angle: 20,
            startupFrames: 12, activeFrames: 4, endlagFrames: 16,
            spawnsProjectile: true,
            projectileType: 'laser',
            projSpeed: 1400, projLifetime: 35, projDamage: 10, projKB: 120, projAngle: 20,
            projShape: 'rect', projW: 90, projH: 10, projR: 45,
            projPiercing: true, projMaxHits: 2, projTrail: 14,
        },
        side_special: {
            name: 'Barrel Toss',
            sprite: 'sprites/metabot/side_special.png',
            hitboxShape: 'circle',
            hitboxX: 44, hitboxY: 0,  hitboxW: 36, hitboxH: 36, hitboxR: 18,
            damage: 14, baseKB: 260, kbScaling: 1.1, angle: 50,
            startupFrames: 14, activeFrames: 2, endlagFrames: 20,
            spawnsProjectile: true,
            projectileType: 'arc',
            projSpeed: 500, projLifetime: 120, projDamage: 14, projKB: 260, projAngle: 50,
            projShape: 'circle', projW: 30, projH: 30, projR: 15,
            projGravity: 1.0, projStageCollision: 'destroy',
            projExplosionRadius: 80, projExplosionDamage: 12, projExplosionKB: 220,
            projTrail: 6,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/metabot/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -30, hitboxW: 44, hitboxH: 44, hitboxR: 22,
            damage: 3,  baseKB: 80,  kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 12,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -800,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/metabot/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 20, hitboxW: 90, hitboxH: 60, hitboxR: 48,
            damage: 16, baseKB: 280, kbScaling: 1.4, angle: 50,
            startupFrames: 16, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 600,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate (placeholder — sprite/video coming later) ───────
    ultimateAttack: {
        name: 'No More Meta',
        sprite: 'sprites/metabot/ultimate.png',
        cutsceneVideo: 'assets/ultimate_metabot.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 320, hitboxH: 220, hitboxR: 170,
        damage: 78, baseKB: 560, kbScaling: 1.8, angle: 58,
        startupFrames: 0, activeFrames: 7, endlagFrames: 32,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  6. NETANYAHU   (cunning politician with counters and money moves)
// ═════════════════════════════════════════════════════════════════
ROSTER.netanyahu = {
    name:            'Netanyahu',
    color:           '#1a5276',
    description:     'Cunning fighter who charges ultimate with cash and counters attacks',
    idleSprite:      'assets/sprite_netanyahu.png',
    weight:          105,
    width:           50,
    height:          82,
    walkSpeed:       235,
    runSpeed:        420,
    airSpeed:        290,
    jumpForce:       630,
    shortHopForce:   410,
    doubleJumpForce: 570,
    maxJumps:        2,
    fallSpeed:       580,
    fastFallSpeed:   880,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Backhand',
            sprite: 'sprites/netanyahu/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 32, hitboxY: -5, hitboxW: 48, hitboxH: 28, hitboxR: 24,
            damage: 3,  baseKB: 100,  kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Briefcase Swing',
            sprite: 'sprites/netanyahu/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -6, hitboxW: 68, hitboxH: 36, hitboxR: 34,
            damage: 9,  baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Gavel Uppercut',
            sprite: 'sprites/netanyahu/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8,  baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/netanyahu/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6,  baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Kick',
            sprite: 'sprites/netanyahu/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7,  baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Diplomatic Slap',
            sprite: 'sprites/netanyahu/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Toss',
            sprite: 'sprites/netanyahu/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8,  baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Stomp',
            sprite: 'sprites/netanyahu/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Reel in Cash',
            sprite: 'sprites/netanyahu/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0,  baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,  // charges 25 ultimate meter on use
        },
        side_special: {
            name: 'JEW',
            sprite: 'sprites/netanyahu/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 44, hitboxY: -2, hitboxW: 50, hitboxH: 40, hitboxR: 22,
            damage: 14, baseKB: 240, kbScaling: 1.0, angle: 42,
            startupFrames: 10, activeFrames: 2, endlagFrames: 18,
            spawnsProjectile: true,
            projectileType: 'linear',
            projSpeed: 600, projLifetime: 90, projDamage: 14, projKB: 240, projAngle: 42,
            projShape: 'rect', projW: 44, projH: 32, projR: 22,
            projTrail: 8, projStageCollision: 'destroy',
            soundEffect: 'assets/soundeffect_netanyahu.mp3',
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/netanyahu/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3,  baseKB: 80,  kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Counter',
            sprite: 'sprites/netanyahu/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 30, hitboxY: 0,  hitboxW: 80, hitboxH: 50, hitboxR: 40,
            damage: 18, baseKB: 300, kbScaling: 1.4, angle: 48,
            startupFrames: 6, activeFrames: 4, endlagFrames: 28,
            spawnsProjectile: false,
            isArmored: true, armorHits: 1, armorDuringStartup: true,
            isCounter: true,  // counter flag: stored damage boosts attack
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Final Settlement',
        sprite: 'sprites/netanyahu/ultimate.png',
        cutsceneVideo: 'assets/ultimate_netanyahu.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 300, hitboxH: 210, hitboxR: 160,
        damage: 78, baseKB: 540, kbScaling: 1.8, angle: 60,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  7. BOMBER   (explosive heavy-hitter with projectiles and dives)
// ═════════════════════════════════════════════════════════════════
ROSTER.bomber = {
    name:            'Bomber',
    color:           '#c0392b',
    description:     'Explosive fighter who rains fire from above and hammers foes with nukes',
    idleSprite:      'assets/sprite_bomber.png',
    weight:          110,
    width:           52,
    height:          84,
    walkSpeed:       210,
    runSpeed:        390,
    airSpeed:        270,
    jumpForce:       610,
    shortHopForce:   400,
    doubleJumpForce: 550,
    maxJumps:        2,
    fallSpeed:       600,
    fastFallSpeed:   900,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Jab',
            sprite: 'sprites/bomber/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3,  baseKB: 95,  kbScaling: 0.3, angle: 30,
            startupFrames: 3, activeFrames: 2, endlagFrames: 8,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Haymaker',
            sprite: 'sprites/bomber/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 38, hitboxR: 32,
            damage: 10, baseKB: 200, kbScaling: 0.85, angle: 38,
            startupFrames: 6, activeFrames: 3, endlagFrames: 15,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Mortar Uppercut',
            sprite: 'sprites/bomber/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -42, hitboxW: 54, hitboxH: 50, hitboxR: 28,
            damage: 9,  baseKB: 210, kbScaling: 0.85, angle: 82,
            startupFrames: 5, activeFrames: 4, endlagFrames: 14,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Sweep Kick',
            sprite: 'sprites/bomber/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 32, hitboxY: 14, hitboxW: 60, hitboxH: 18, hitboxR: 20,
            damage: 7,  baseKB: 160, kbScaling: 0.6, angle: 20,
            startupFrames: 4, activeFrames: 3, endlagFrames: 12,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Explosion Spin',
            sprite: 'sprites/bomber/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 70, hitboxH: 70, hitboxR: 38,
            damage: 8,  baseKB: 170, kbScaling: 0.55, angle: 45,
            startupFrames: 5, activeFrames: 4, endlagFrames: 12,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Bomb Toss',
            sprite: 'sprites/bomber/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -4, hitboxW: 56, hitboxH: 36, hitboxR: 28,
            damage: 11, baseKB: 220, kbScaling: 0.9, angle: 42,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Blast',
            sprite: 'sprites/bomber/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -40, hitboxW: 48, hitboxH: 46, hitboxR: 26,
            damage: 9,  baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Plunge Kick',
            sprite: 'sprites/bomber/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 28, hitboxW: 46, hitboxH: 46, hitboxR: 24,
            damage: 13, baseKB: 250, kbScaling: 1.1, angle: 270,
            startupFrames: 8, activeFrames: 3, endlagFrames: 19,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Fire Projectile',
            sprite: 'sprites/bomber/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 40, hitboxY: 0, hitboxW: 36, hitboxH: 36, hitboxR: 18,
            damage: 10, baseKB: 180, kbScaling: 0.7, angle: 35,
            startupFrames: 12, activeFrames: 2, endlagFrames: 16,
            spawnsProjectile: true,
            projectileType: 'linear',
            projSpeed: 700, projLifetime: 80, projDamage: 10, projKB: 180, projAngle: 35,
            projShape: 'circle', projW: 28, projH: 28, projR: 14,
            projTrail: 10, projStageCollision: 'destroy',
        },
        side_special: {
            name: 'Nuke Hammer',
            sprite: 'sprites/bomber/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -8, hitboxW: 72, hitboxH: 50, hitboxR: 36,
            damage: 18, baseKB: 320, kbScaling: 1.3, angle: 46,
            startupFrames: 14, activeFrames: 4, endlagFrames: 24,
            spawnsProjectile: false,
            isArmored: true, armorHits: 1, armorDuringStartup: true,
            soundEffect: 'assets/soundeffect_bomber.mp3',
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/bomber/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -28, hitboxW: 42, hitboxH: 42, hitboxR: 22,
            damage: 4,  baseKB: 90,  kbScaling: 0.3, angle: 78,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Dive',
            sprite: 'sprites/bomber/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 24, hitboxW: 90, hitboxH: 60, hitboxR: 48,
            damage: 16, baseKB: 290, kbScaling: 1.4, angle: 52,
            startupFrames: 10, activeFrames: 6, endlagFrames: 28,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 700,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
            projExplosionRadius: 90, projExplosionDamage: 14, projExplosionKB: 240,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Terrorist Nuke',
        sprite: 'sprites/bomber/ultimate.png',
        cutsceneVideo: 'assets/ultimate_bomber.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 340, hitboxH: 230, hitboxR: 180,
        damage: 82, baseKB: 560, kbScaling: 1.8, angle: 55,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  8. ARU   (explosive brawler with bombs and blade work)
// ═════════════════════════════════════════════════════════════════
ROSTER.aru = {
    name:            'Aru',
    color:           '#e67e22',
    description:     'Explosive brawler who tosses bombs and strikes with a knife',
    idleSprite:      'assets/sprite_aru.png',
    weight:          100,
    width:           50,
    height:          80,
    walkSpeed:       240,
    runSpeed:        430,
    airSpeed:        300,
    jumpForce:       640,
    shortHopForce:   420,
    doubleJumpForce: 580,
    maxJumps:        2,
    fallSpeed:       580,
    fastFallSpeed:   880,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Slash',
            sprite: 'sprites/aru/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Slash',
            sprite: 'sprites/aru/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 9, baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Rising Slash',
            sprite: 'sprites/aru/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8, baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Kick',
            sprite: 'sprites/aru/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Slash',
            sprite: 'sprites/aru/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Stab',
            sprite: 'sprites/aru/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Slash',
            sprite: 'sprites/aru/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Plunge Stab',
            sprite: 'sprites/aru/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Bomb Toss',
            sprite: 'sprites/aru/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 40, hitboxY: 0, hitboxW: 36, hitboxH: 36, hitboxR: 18,
            damage: 12, baseKB: 200, kbScaling: 0.8, angle: 50,
            startupFrames: 10, activeFrames: 2, endlagFrames: 16,
            spawnsProjectile: true,
            projectileType: 'arc',
            projSpeed: 500, projLifetime: 90, projDamage: 12, projKB: 200, projAngle: 50,
            projShape: 'circle', projW: 24, projH: 24, projR: 12,
            projTrail: 6, projStageCollision: 'destroy',
            projExplosionRadius: 70, projExplosionDamage: 10, projExplosionKB: 190,
        },
        side_special: {
            name: 'Knife Jab',
            sprite: 'sprites/aru/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 36, hitboxY: -4, hitboxW: 60, hitboxH: 30, hitboxR: 30,
            damage: 14, baseKB: 250, kbScaling: 1.1, angle: 35,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
            boostVX: 350, boostVY: 0,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/aru/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/aru/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 15, baseKB: 270, kbScaling: 1.3, angle: 50,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Late Arrival',
        sprite: 'sprites/aru/ultimate.png',
        cutsceneVideo: 'assets/ultimate_aru.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 320, hitboxH: 220, hitboxR: 170,
        damage: 80, baseKB: 550, kbScaling: 1.8, angle: 58,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  9. KIRKY   (patriotic rallier with bombs and ground pounds)
// ═════════════════════════════════════════════════════════════════
ROSTER.kirky = {
    name:            'Kirky',
    color:           '#3b5998',
    description:     'Patriotic fighter who rallies power and tosses American bombs',
    idleSprite:      'assets/sprite_kirky.png',
    weight:          105,
    width:           50,
    height:          82,
    walkSpeed:       230,
    runSpeed:        410,
    airSpeed:        280,
    jumpForce:       620,
    shortHopForce:   410,
    doubleJumpForce: 560,
    maxJumps:        2,
    fallSpeed:       590,
    fastFallSpeed:   890,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Jab',
            sprite: 'sprites/kirky/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Flag Swing',
            sprite: 'sprites/kirky/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 9, baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Uppercut',
            sprite: 'sprites/kirky/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8, baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/kirky/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Kick',
            sprite: 'sprites/kirky/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Punch',
            sprite: 'sprites/kirky/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Smash',
            sprite: 'sprites/kirky/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Stomp',
            sprite: 'sprites/kirky/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Rally',
            sprite: 'sprites/kirky/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
            soundEffect: 'assets/soundeffect_kirky.mp3',
        },
        side_special: {
            name: 'America',
            sprite: 'sprites/kirky/side_special.png',
            hitboxShape: 'circle',
            hitboxX: 40, hitboxY: 0, hitboxW: 38, hitboxH: 38, hitboxR: 19,
            damage: 13, baseKB: 220, kbScaling: 0.9, angle: 48,
            startupFrames: 12, activeFrames: 2, endlagFrames: 18,
            spawnsProjectile: true,
            projectileType: 'arc',
            projSpeed: 520, projLifetime: 85, projDamage: 13, projKB: 220, projAngle: 48,
            projShape: 'circle', projW: 28, projH: 28, projR: 14,
            projTrail: 8, projStageCollision: 'destroy',
            projExplosionRadius: 75, projExplosionDamage: 11, projExplosionKB: 200,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/kirky/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/kirky/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 15, baseKB: 270, kbScaling: 1.3, angle: 50,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Freedom Strike',
        sprite: 'sprites/kirky/ultimate.png',
        cutsceneVideo: 'assets/ultimate_kirky.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 320, hitboxH: 220, hitboxR: 170,
        damage: 80, baseKB: 550, kbScaling: 1.8, angle: 56,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  10. EPSTEIN   (slippery schemer with debuffs and dirty tricks)
// ═════════════════════════════════════════════════════════════════
ROSTER.epstein = {
    name:            'Epstein',
    color:           '#8e44ad',
    description:     'Devious fighter who charges power and makes opponents slippery',
    idleSprite:      'assets/sprite_epstein.png',
    weight:          95,
    width:           50,
    height:          80,
    walkSpeed:       225,
    runSpeed:        400,
    airSpeed:        285,
    jumpForce:       630,
    shortHopForce:   415,
    doubleJumpForce: 570,
    maxJumps:        2,
    fallSpeed:       575,
    fastFallSpeed:   870,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Slap',
            sprite: 'sprites/epstein/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Swipe',
            sprite: 'sprites/epstein/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 9, baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Uppercut',
            sprite: 'sprites/epstein/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8, baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Kick',
            sprite: 'sprites/epstein/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Kick',
            sprite: 'sprites/epstein/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Swipe',
            sprite: 'sprites/epstein/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Toss',
            sprite: 'sprites/epstein/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Plunge Kick',
            sprite: 'sprites/epstein/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Child Essence',
            sprite: 'sprites/epstein/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
            soundEffect: 'assets/soundeffect_epstein.mp3',
        },
        side_special: {
            name: 'Baby Oil',
            sprite: 'sprites/epstein/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 44, hitboxY: -2, hitboxW: 56, hitboxH: 38, hitboxR: 28,
            damage: 8, baseKB: 160, kbScaling: 0.6, angle: 30,
            startupFrames: 10, activeFrames: 3, endlagFrames: 18,
            spawnsProjectile: true,
            projectileType: 'linear',
            projSpeed: 550, projLifetime: 70, projDamage: 8, projKB: 160, projAngle: 30,
            projShape: 'circle', projW: 26, projH: 26, projR: 13,
            projTrail: 6, projStageCollision: 'destroy',
            makesSlippery: true,  // hit targets become slippery
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/epstein/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/epstein/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 15, baseKB: 270, kbScaling: 1.3, angle: 50,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Island Lockdown',
        sprite: 'sprites/epstein/ultimate.png',
        cutsceneVideo: 'assets/ultimate_epstein.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 310, hitboxH: 210, hitboxR: 165,
        damage: 78, baseKB: 540, kbScaling: 1.8, angle: 58,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};


// ═════════════════════════════════════════════════════════════════
//  11. FAZBEAR   (animatronic horror fighter — screams to charge ult)
// ═════════════════════════════════════════════════════════════════
ROSTER.fazbear = {
    name:            'Fazbear',
    color:           '#8B4513',
    description:     'Terrifying animatronic that charges power with screams and jumpscares',
    idleSprite:      'assets/sprite_fazbear.png',
    weight:          110,
    width:           52,
    height:          82,
    walkSpeed:       220,
    runSpeed:        400,
    airSpeed:        280,
    jumpForce:       620,
    shortHopForce:   400,
    doubleJumpForce: 560,
    maxJumps:        2,
    fallSpeed:       600,
    fastFallSpeed:   900,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Slash',
            sprite: 'sprites/fazbear/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Swipe',
            sprite: 'sprites/fazbear/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 9, baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Rising Claw',
            sprite: 'sprites/fazbear/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8, baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Bite',
            sprite: 'sprites/fazbear/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Claw',
            sprite: 'sprites/fazbear/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Bite',
            sprite: 'sprites/fazbear/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Claw',
            sprite: 'sprites/fazbear/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Plunge Bite',
            sprite: 'sprites/fazbear/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Scream',
            sprite: 'sprites/fazbear/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
            soundEffect: 'assets/soundeffect_fazbear.mp3',
        },
        side_special: {
            name: 'Jumpscare',
            sprite: 'sprites/fazbear/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 36, hitboxY: -8, hitboxW: 65, hitboxH: 50, hitboxR: 32,
            damage: 16, baseKB: 300, kbScaling: 1.3, angle: 40,
            startupFrames: 4, activeFrames: 2, endlagFrames: 22,
            spawnsProjectile: false,
            boostVX: 400, boostVY: 0,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/fazbear/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/fazbear/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 15, baseKB: 270, kbScaling: 1.3, angle: 50,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Power Stack',
        sprite: 'sprites/fazbear/ultimate.png',
        cutsceneVideo: 'assets/ultimate_fazbear.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 320, hitboxH: 220, hitboxR: 170,
        damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
        damageBoostMultiplier: 10,  // All future attacks do 10x damage (stacks)
    },
};

// ═════════════════════════════════════════════════════════════════
//  12. DROID   (robotic fighter — drains air to charge ult, fires lasers)
// ═════════════════════════════════════════════════════════════════
ROSTER.droid = {
    name:            'Droid',
    color:           '#607D8B',
    description:     'Mechanical menace that drains the air and fires devastating laser beams',
    idleSprite:      'assets/sprite_droid.jpg',
    weight:          105,
    width:           50,
    height:          80,
    walkSpeed:       230,
    runSpeed:        420,
    airSpeed:        290,
    jumpForce:       630,
    shortHopForce:   410,
    doubleJumpForce: 570,
    maxJumps:        2,
    fallSpeed:       590,
    fastFallSpeed:   890,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Jab',
            sprite: 'sprites/droid/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Slash',
            sprite: 'sprites/droid/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 9, baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Rising Strike',
            sprite: 'sprites/droid/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8, baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/droid/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Strike',
            sprite: 'sprites/droid/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Slash',
            sprite: 'sprites/droid/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Strike',
            sprite: 'sprites/droid/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Plunge Strike',
            sprite: 'sprites/droid/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'No Air',
            sprite: 'sprites/droid/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
            soundEffect: 'assets/soundeffect_droid.mp3',
        },
        side_special: {
            name: 'Laser Beam',
            sprite: 'sprites/droid/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -4, hitboxW: 90, hitboxH: 12, hitboxR: 18,
            damage: 10, baseKB: 120, kbScaling: 0.5, angle: 20,
            startupFrames: 12, activeFrames: 4, endlagFrames: 16,
            spawnsProjectile: true,
            projectileType: 'laser',
            projSpeed: 1400, projLifetime: 35, projDamage: 10, projKB: 120, projAngle: 20,
            projShape: 'rect', projW: 90, projH: 10, projR: 45,
            projPiercing: true, projMaxHits: 2, projTrail: 14,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/droid/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/droid/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 15, baseKB: 270, kbScaling: 1.3, angle: 50,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'System Override',
        sprite: 'sprites/droid/ultimate.png',
        cutsceneVideo: 'assets/ultimate_droid.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 310, hitboxH: 210, hitboxR: 165,
        damage: 78, baseKB: 540, kbScaling: 1.8, angle: 58,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};


// ═════════════════════════════════════════════════════════════════
//  13. DIDDY   (oily grappler who charges power and slicks up foes)
// ═════════════════════════════════════════════════════════════════
ROSTER.diddy = {
    name:            'Diddy',
    color:           '#D4A017',
    description:     'Slippery showman who oils up to power himself and slicks his enemies',
    idleSprite:      'assets/sprite_diddy.jpg',
    weight:          95,
    width:           48,
    height:          78,
    walkSpeed:       250,
    runSpeed:        450,
    airSpeed:        310,
    jumpForce:       640,
    shortHopForce:   420,
    doubleJumpForce: 580,
    maxJumps:        2,
    fallSpeed:       570,
    fastFallSpeed:   860,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Jab',
            sprite: 'sprites/diddy/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Slap',
            sprite: 'sprites/diddy/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 9, baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Rising Uppercut',
            sprite: 'sprites/diddy/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8, baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/diddy/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Kick',
            sprite: 'sprites/diddy/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Slap',
            sprite: 'sprites/diddy/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Flip',
            sprite: 'sprites/diddy/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Plunge Kick',
            sprite: 'sprites/diddy/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Oil Up',
            sprite: 'sprites/diddy/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
        },
        side_special: {
            name: 'Oil Throw',
            sprite: 'sprites/diddy/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 44, hitboxY: -2, hitboxW: 56, hitboxH: 38, hitboxR: 28,
            damage: 6, baseKB: 140, kbScaling: 0.5, angle: 25,
            startupFrames: 10, activeFrames: 3, endlagFrames: 18,
            spawnsProjectile: true,
            projectileType: 'linear',
            projSpeed: 500, projLifetime: 65, projDamage: 6, projKB: 140, projAngle: 25,
            projShape: 'circle', projW: 24, projH: 24, projR: 12,
            projTrail: 6, projStageCollision: 'destroy',
            makesSlippery: true,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/diddy/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/diddy/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 15, baseKB: 270, kbScaling: 1.3, angle: 50,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Maximum Oil',
        sprite: 'sprites/diddy/ultimate.png',
        cutsceneVideo: 'assets/ultimate_diddy.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 310, hitboxH: 210, hitboxR: 165,
        damage: 78, baseKB: 540, kbScaling: 1.8, angle: 58,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};


// ═════════════════════════════════════════════════════════════════
//  14. TRUMP   (political powerhouse with nukes and national rallying)
// ═════════════════════════════════════════════════════════════════
ROSTER.trump = {
    name:            'Trump',
    color:           '#CC0000',
    description:     'Political powerhouse who rallies strength and calls in nuclear support',
    idleSprite:      'assets/sprite_trump.jpg',
    weight:          115,
    width:           54,
    height:          84,
    walkSpeed:       210,
    runSpeed:        380,
    airSpeed:        260,
    jumpForce:       600,
    shortHopForce:   390,
    doubleJumpForce: 550,
    maxJumps:        2,
    fallSpeed:       600,
    fastFallSpeed:   900,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Jab',
            sprite: 'sprites/trump/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 32, hitboxY: -5, hitboxW: 48, hitboxH: 28, hitboxR: 24,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Power Swing',
            sprite: 'sprites/trump/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 40, hitboxY: -6, hitboxW: 68, hitboxH: 36, hitboxR: 34,
            damage: 10, baseKB: 200, kbScaling: 0.85, angle: 42,
            startupFrames: 6, activeFrames: 3, endlagFrames: 15,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Executive Uppercut',
            sprite: 'sprites/trump/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 9, baseKB: 210, kbScaling: 0.85, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 14,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/trump/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Strike',
            sprite: 'sprites/trump/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Slam',
            sprite: 'sprites/trump/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 11, baseKB: 220, kbScaling: 0.95, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Toss',
            sprite: 'sprites/trump/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Stomp',
            sprite: 'sprites/trump/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 13, baseKB: 250, kbScaling: 1.15, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'I\'m Gonna Invade Greenland',
            sprite: 'sprites/trump/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
        },
        side_special: {
            name: 'Israel Support',
            sprite: 'sprites/trump/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 44, hitboxY: -4, hitboxW: 56, hitboxH: 44, hitboxR: 28,
            damage: 16, baseKB: 280, kbScaling: 1.1, angle: 44,
            startupFrames: 14, activeFrames: 4, endlagFrames: 22,
            spawnsProjectile: true,
            projectileType: 'linear',
            projSpeed: 550, projLifetime: 80, projDamage: 16, projKB: 280, projAngle: 44,
            projShape: 'circle', projW: 36, projH: 36, projR: 18,
            projTrail: 10, projStageCollision: 'destroy',
            projExplosionRadius: 85, projExplosionDamage: 12, projExplosionKB: 220,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/trump/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/trump/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 16, baseKB: 280, kbScaling: 1.35, angle: 52,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Presidential Nuke',
        sprite: 'sprites/trump/ultimate.png',
        cutsceneVideo: 'assets/ultimate_trump.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 340, hitboxH: 230, hitboxR: 180,
        damage: 85, baseKB: 570, kbScaling: 1.9, angle: 56,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};


// ═════════════════════════════════════════════════════════════════
//  15. KIDDO   (number-crunching fighter with instant knockback)
// ═════════════════════════════════════════════════════════════════
ROSTER.kiddo = {
    name:            'Kiddo',
    color:           '#E06030',
    description:     'Number-crunching scrapper who counts up power and slams foes away',
    idleSprite:      'assets/sprite_kiddo.jpg',
    weight:          100,
    width:           50,
    height:          80,
    walkSpeed:       240,
    runSpeed:        430,
    airSpeed:        300,
    jumpForce:       630,
    shortHopForce:   415,
    doubleJumpForce: 575,
    maxJumps:        2,
    fallSpeed:       580,
    fastFallSpeed:   870,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Jab',
            sprite: 'sprites/kiddo/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 3, activeFrames: 2, endlagFrames: 7,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Swing',
            sprite: 'sprites/kiddo/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 9, baseKB: 195, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Rising Strike',
            sprite: 'sprites/kiddo/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 8, baseKB: 200, kbScaling: 0.8, angle: 84,
            startupFrames: 5, activeFrames: 4, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/kiddo/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 6, baseKB: 150, kbScaling: 0.6, angle: 18,
            startupFrames: 4, activeFrames: 3, endlagFrames: 11,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Kick',
            sprite: 'sprites/kiddo/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 7, baseKB: 165, kbScaling: 0.5, angle: 45,
            startupFrames: 4, activeFrames: 4, endlagFrames: 11,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Swing',
            sprite: 'sprites/kiddo/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 10, baseKB: 210, kbScaling: 0.9, angle: 44,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Strike',
            sprite: 'sprites/kiddo/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 8, baseKB: 195, kbScaling: 0.8, angle: 86,
            startupFrames: 5, activeFrames: 3, endlagFrames: 13,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Plunge Kick',
            sprite: 'sprites/kiddo/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 12, baseKB: 240, kbScaling: 1.1, angle: 270,
            startupFrames: 9, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Six Seven',
            sprite: 'sprites/kiddo/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
            soundEffect: 'assets/soundeffect_kiddo.mp3',
        },
        side_special: {
            name: '41',
            sprite: 'sprites/kiddo/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -6, hitboxW: 70, hitboxH: 46, hitboxR: 35,
            damage: 16, baseKB: 310, kbScaling: 1.2, angle: 44,
            startupFrames: 8, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/kiddo/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/kiddo/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 15, baseKB: 270, kbScaling: 1.3, angle: 50,
            startupFrames: 14, activeFrames: 5, endlagFrames: 26,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: '67 Overload',
        sprite: 'sprites/kiddo/ultimate.png',
        cutsceneVideo: 'assets/ultimate_kiddo.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 310, hitboxH: 210, hitboxR: 165,
        damage: 78, baseKB: 540, kbScaling: 1.8, angle: 58,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};


// ═════════════════════════════════════════════════════════════════
//  16. SPEED   (fast canine fighter with lunging attacks)
// ═════════════════════════════════════════════════════════════════
ROSTER.speed = {
    name:            'Speed',
    color:           '#88CC44',
    description:     'Lightning-fast canine who barks to power up and lunges at foes',
    idleSprite:      'assets/sprite_speed.jpg',
    weight:          85,
    width:           46,
    height:          72,
    walkSpeed:       270,
    runSpeed:        490,
    airSpeed:        340,
    jumpForce:       660,
    shortHopForce:   440,
    doubleJumpForce: 600,
    maxJumps:        2,
    fallSpeed:       550,
    fastFallSpeed:   840,

    attacks: {
        // ── Ground Normals ───────────────────────────────────────
        neutral_attack: {
            name: 'Quick Bite',
            sprite: 'sprites/speed/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 30, hitboxY: -4, hitboxW: 46, hitboxH: 26, hitboxR: 23,
            damage: 3, baseKB: 100, kbScaling: 0.3, angle: 28,
            startupFrames: 2, activeFrames: 2, endlagFrames: 6,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Paw Swipe',
            sprite: 'sprites/speed/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 38, hitboxY: -6, hitboxW: 64, hitboxH: 36, hitboxR: 32,
            damage: 8, baseKB: 185, kbScaling: 0.75, angle: 38,
            startupFrames: 4, activeFrames: 3, endlagFrames: 12,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Rising Snap',
            sprite: 'sprites/speed/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -44, hitboxW: 56, hitboxH: 52, hitboxR: 30,
            damage: 7, baseKB: 190, kbScaling: 0.75, angle: 84,
            startupFrames: 4, activeFrames: 4, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Low Sweep',
            sprite: 'sprites/speed/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 34, hitboxY: 12, hitboxW: 62, hitboxH: 20, hitboxR: 22,
            damage: 5, baseKB: 140, kbScaling: 0.55, angle: 18,
            startupFrames: 3, activeFrames: 3, endlagFrames: 10,
            spawnsProjectile: false,
        },

        // ── Aerials ──────────────────────────────────────────────
        neutral_air: {
            name: 'Spin Bite',
            sprite: 'sprites/speed/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 0, hitboxW: 66, hitboxH: 66, hitboxR: 36,
            damage: 6, baseKB: 155, kbScaling: 0.45, angle: 45,
            startupFrames: 3, activeFrames: 4, endlagFrames: 10,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Aerial Lunge',
            sprite: 'sprites/speed/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -4, hitboxW: 54, hitboxH: 34, hitboxR: 28,
            damage: 9, baseKB: 200, kbScaling: 0.85, angle: 42,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Overhead Snap',
            sprite: 'sprites/speed/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -42, hitboxW: 50, hitboxH: 48, hitboxR: 28,
            damage: 7, baseKB: 185, kbScaling: 0.75, angle: 86,
            startupFrames: 4, activeFrames: 3, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Dive Kick',
            sprite: 'sprites/speed/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 30, hitboxW: 44, hitboxH: 44, hitboxR: 24,
            damage: 11, baseKB: 230, kbScaling: 1.0, angle: 270,
            startupFrames: 7, activeFrames: 3, endlagFrames: 18,
            spawnsProjectile: false,
        },

        // ── Specials ─────────────────────────────────────────────
        neutral_special: {
            name: 'Bark',
            sprite: 'sprites/speed/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 6, activeFrames: 18, endlagFrames: 10,
            spawnsProjectile: false,
            chargesUlt: 25,
            soundEffect: 'assets/soundeffect_speed.mp3',
        },
        side_special: {
            name: 'Jump Attack',
            sprite: 'sprites/speed/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 44, hitboxY: -10, hitboxW: 64, hitboxH: 48, hitboxR: 32,
            damage: 12, baseKB: 230, kbScaling: 0.9, angle: 38,
            startupFrames: 6, activeFrames: 4, endlagFrames: 16,
            spawnsProjectile: false,
            boostVX: 400, boostVY: -200,
        },
        up_special: {
            name: 'Flight',
            sprite: 'sprites/speed/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: -28, hitboxW: 40, hitboxH: 40, hitboxR: 20,
            damage: 3, baseKB: 80, kbScaling: 0.3, angle: 80,
            startupFrames: 4, activeFrames: 8, endlagFrames: 14,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pound',
            sprite: 'sprites/speed/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 0, hitboxY: 22, hitboxW: 88, hitboxH: 58, hitboxR: 46,
            damage: 14, baseKB: 260, kbScaling: 1.25, angle: 50,
            startupFrames: 12, activeFrames: 5, endlagFrames: 24,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 650,
            isArmored: true, armorHits: 2, armorDuringStartup: true,
        },
    },

    // ── Ultimate ─────────────────────────────────────────────────
    ultimateAttack: {
        name: 'Hyperspeed',
        sprite: 'sprites/speed/ultimate.png',
        cutsceneVideo: 'assets/ultimate_speed.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 310, hitboxH: 210, hitboxR: 165,
        damage: 75, baseKB: 530, kbScaling: 1.8, angle: 55,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  17. VAUGHAN   (transforms into Von after 2 ultimates)
// ═════════════════════════════════════════════════════════════════
ROSTER.vaughan = {
    name:            'Vaughan',
    color:           '#7f5af0',
    description:     'Builds to a second ultimate, then transforms into Von for massive damage.',
    idleSprite:      'assets/sprite_vaughan1.PNG',
    weight:          100,
    width:           50,
    height:          80,
    walkSpeed:       250,
    runSpeed:        450,
    airSpeed:        300,
    jumpForce:       650,
    shortHopForce:   420,
    doubleJumpForce: 580,
    maxJumps:        2,
    fallSpeed:       600,
    fastFallSpeed:   900,

    // Baseline attacks mirror the standard all-rounder template.
    attacks: {
        neutral_attack: {
            name: 'Jab',
            sprite: 'sprites/brawler/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 35, hitboxY: -5, hitboxW: 50, hitboxH: 30, hitboxR: 25,
            damage: 3,  baseKB: 110,  kbScaling: 0.3, angle: 30,
            startupFrames: 2, activeFrames: 2, endlagFrames: 6,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Tilt',
            sprite: 'sprites/brawler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -8, hitboxW: 72, hitboxH: 36, hitboxR: 36,
            damage: 9,  baseKB: 200, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Up Tilt',
            sprite: 'sprites/brawler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -45, hitboxW: 60, hitboxH: 55, hitboxR: 32,
            damage: 8,  baseKB: 210, kbScaling: 0.9, angle: 82,
            startupFrames: 4, activeFrames: 4, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Down Tilt',
            sprite: 'sprites/brawler/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 35, hitboxY: 12, hitboxW: 66, hitboxH: 22, hitboxR: 22,
            damage: 7,  baseKB: 165, kbScaling: 0.6, angle: 20,
            startupFrames: 3, activeFrames: 3, endlagFrames: 10,
            spawnsProjectile: false,
        },
        neutral_air: {
            name: 'Nair',
            sprite: 'sprites/brawler/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 70, hitboxH: 70, hitboxR: 38,
            damage: 7,  baseKB: 175, kbScaling: 0.5, angle: 45,
            startupFrames: 3, activeFrames: 4, endlagFrames: 10,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Fair',
            sprite: 'sprites/brawler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 46, hitboxY: -4, hitboxW: 56, hitboxH: 38, hitboxR: 28,
            damage: 10, baseKB: 215, kbScaling: 1.0, angle: 45,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Uair',
            sprite: 'sprites/brawler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -48, hitboxW: 54, hitboxH: 50, hitboxR: 30,
            damage: 8,  baseKB: 200, kbScaling: 0.9, angle: 86,
            startupFrames: 4, activeFrames: 3, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Dair (Spike)',
            sprite: 'sprites/brawler/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 32, hitboxW: 46, hitboxH: 46, hitboxR: 26,
            damage: 12, baseKB: 240, kbScaling: 1.2, angle: 270,
            startupFrames: 8, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // Requested specials.
        neutral_special: {
            name: 'Charge ultimate',
            sprite: 'sprites/brawler/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
        },
        side_special: {
            name: 'Pew Pew',
            sprite: 'sprites/brawler/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 50, hitboxY: -8, hitboxW: 78, hitboxH: 42, hitboxR: 35,
            damage: 12, baseKB: 200, kbScaling: 1.1, angle: 35,
            startupFrames: 12, activeFrames: 4, endlagFrames: 22,
            spawnsProjectile: false,
            boostVX: 500,
        },
        up_special: {
            name: 'Uppercut',
            sprite: 'sprites/brawler/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -35, hitboxW: 50, hitboxH: 60, hitboxR: 30,
            damage: 6,  baseKB: 170, kbScaling: 0.8, angle: 80,
            startupFrames: 5, activeFrames: 6, endlagFrames: 15,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -700,
        },
        down_special: {
            name: 'Ground Pownd',
            sprite: 'sprites/brawler/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 30, hitboxY: 0,  hitboxW: 80, hitboxH: 50, hitboxR: 40,
            damage: 14, baseKB: 220, kbScaling: 1.3, angle: 50,
            startupFrames: 18, activeFrames: 4, endlagFrames: 24,
            spawnsProjectile: false,
            isArmored: true, armorHits: 1, armorDuringStartup: true,
        },
    },

    ultimateAttack: {
        name: 'King Von',
        sprite: 'sprites/brawler/ultimate.png',
        cutsceneVideo: 'assets/Von_ultimate.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 320, hitboxH: 220, hitboxR: 170,
        damage: 82, baseKB: 560, kbScaling: 1.85, angle: 58,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};

// ═════════════════════════════════════════════════════════════════
//  18. SAHUR   (A-tier bat fighter with ultimate charge utility)
// ═════════════════════════════════════════════════════════════════
ROSTER.sahur = {
    name:            'Sahur',
    color:           '#4ade80',
    description:     'A-tier bruiser with a bat-focused kit and reliable ultimate charging.',
    idleSprite:      'assets/sprite_Sahur.jfif',
    weight:          100,
    width:           50,
    height:          80,
    walkSpeed:       250,
    runSpeed:        450,
    airSpeed:        300,
    jumpForce:       650,
    shortHopForce:   420,
    doubleJumpForce: 580,
    maxJumps:        2,
    fallSpeed:       600,
    fastFallSpeed:   900,

    // Standard moves remain unchanged from the baseline all-rounder template.
    attacks: {
        neutral_attack: {
            name: 'Jab',
            sprite: 'sprites/brawler/idle_attack.png',
            hitboxShape: 'rect',
            hitboxX: 35, hitboxY: -5, hitboxW: 50, hitboxH: 30, hitboxR: 25,
            damage: 3,  baseKB: 110,  kbScaling: 0.3, angle: 30,
            startupFrames: 2, activeFrames: 2, endlagFrames: 6,
            spawnsProjectile: false,
        },
        side_attack: {
            name: 'Side Tilt',
            sprite: 'sprites/brawler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 42, hitboxY: -8, hitboxW: 72, hitboxH: 36, hitboxR: 36,
            damage: 9,  baseKB: 200, kbScaling: 0.8, angle: 40,
            startupFrames: 5, activeFrames: 3, endlagFrames: 14,
            spawnsProjectile: false,
        },
        up_attack: {
            name: 'Up Tilt',
            sprite: 'sprites/brawler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -45, hitboxW: 60, hitboxH: 55, hitboxR: 32,
            damage: 8,  baseKB: 210, kbScaling: 0.9, angle: 82,
            startupFrames: 4, activeFrames: 4, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_attack: {
            name: 'Down Tilt',
            sprite: 'sprites/brawler/down_attack.png',
            hitboxShape: 'rect',
            hitboxX: 35, hitboxY: 12, hitboxW: 66, hitboxH: 22, hitboxR: 22,
            damage: 7,  baseKB: 165, kbScaling: 0.6, angle: 20,
            startupFrames: 3, activeFrames: 3, endlagFrames: 10,
            spawnsProjectile: false,
        },
        neutral_air: {
            name: 'Nair',
            sprite: 'sprites/brawler/idle_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 0,  hitboxW: 70, hitboxH: 70, hitboxR: 38,
            damage: 7,  baseKB: 175, kbScaling: 0.5, angle: 45,
            startupFrames: 3, activeFrames: 4, endlagFrames: 10,
            spawnsProjectile: false,
        },
        forward_air: {
            name: 'Fair',
            sprite: 'sprites/brawler/side_attack.png',
            hitboxShape: 'rect',
            hitboxX: 46, hitboxY: -4, hitboxW: 56, hitboxH: 38, hitboxR: 28,
            damage: 10, baseKB: 215, kbScaling: 1.0, angle: 45,
            startupFrames: 6, activeFrames: 3, endlagFrames: 16,
            spawnsProjectile: false,
        },
        up_air: {
            name: 'Uair',
            sprite: 'sprites/brawler/up_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -48, hitboxW: 54, hitboxH: 50, hitboxR: 30,
            damage: 8,  baseKB: 200, kbScaling: 0.9, angle: 86,
            startupFrames: 4, activeFrames: 3, endlagFrames: 12,
            spawnsProjectile: false,
        },
        down_air: {
            name: 'Dair (Spike)',
            sprite: 'sprites/brawler/down_attack.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: 32, hitboxW: 46, hitboxH: 46, hitboxR: 26,
            damage: 12, baseKB: 240, kbScaling: 1.2, angle: 270,
            startupFrames: 8, activeFrames: 3, endlagFrames: 20,
            spawnsProjectile: false,
        },

        // Requested specials.
        neutral_special: {
            name: 'Charge ultimate',
            sprite: 'sprites/brawler/neutral_special.png',
            hitboxShape: 'circle',
            hitboxX: 20, hitboxY: 0, hitboxW: 30, hitboxH: 30, hitboxR: 15,
            damage: 0, baseKB: 0, kbScaling: 0, angle: 0,
            startupFrames: 8, activeFrames: 20, endlagFrames: 12,
            spawnsProjectile: false,
            chargesUlt: 25,
        },
        side_special: {
            name: 'Bat swing',
            sprite: 'sprites/brawler/side_special.png',
            hitboxShape: 'rect',
            hitboxX: 50, hitboxY: -8, hitboxW: 78, hitboxH: 42, hitboxR: 35,
            damage: 12, baseKB: 200, kbScaling: 1.1, angle: 35,
            startupFrames: 12, activeFrames: 4, endlagFrames: 22,
            spawnsProjectile: false,
            boostVX: 520,
            chargeable: true,
            maxChargeFrames: 120,
        },
        up_special: {
            name: 'Fly',
            sprite: 'sprites/brawler/up_special.png',
            hitboxShape: 'circle',
            hitboxX: 0,  hitboxY: -35, hitboxW: 50, hitboxH: 60, hitboxR: 30,
            damage: 6,  baseKB: 170, kbScaling: 0.8, angle: 80,
            startupFrames: 5, activeFrames: 6, endlagFrames: 15,
            spawnsProjectile: false,
            boostVX: 0, boostVY: -780,
        },
        down_special: {
            name: 'Ground Pownd',
            sprite: 'sprites/brawler/down_special.png',
            hitboxShape: 'circle',
            hitboxX: 30, hitboxY: 0,  hitboxW: 80, hitboxH: 50, hitboxR: 40,
            damage: 14, baseKB: 220, kbScaling: 1.3, angle: 50,
            startupFrames: 18, activeFrames: 4, endlagFrames: 24,
            spawnsProjectile: false,
            boostVX: 0, boostVY: 700,
            isArmored: true, armorHits: 1, armorDuringStartup: true,
        },
    },

    ultimateAttack: {
        name: 'Bat Breaker',
        sprite: 'sprites/brawler/ultimate.png',
        cutsceneVideo: 'assets/Sahur_Ultimate.mp4',
        hitboxShape: 'circle',
        hitboxX: 0, hitboxY: 0, hitboxW: 320, hitboxH: 220, hitboxR: 170,
        damage: 82, baseKB: 560, kbScaling: 1.85, angle: 58,
        startupFrames: 0, activeFrames: 6, endlagFrames: 30,
        spawnsProjectile: false,
    },
};


// ─────────────────────────────────────────────────────────────────
//  FighterData class — wraps a roster entry for use by Fighter
// ─────────────────────────────────────────────────────────────────

class FighterData {
    /**
     * @param {string} characterKey  key into ROSTER (e.g. 'brawler')
     * @param {object} [overrides]   per-field overrides
     */
    constructor(characterKey, overrides) {
        const base = ROSTER[characterKey] || ROSTER.brawler;
        const d = Object.assign({}, base, overrides || {});

        this.key             = characterKey || 'brawler';
        this.name            = d.name;
        this.weight          = d.weight;
        this.width           = d.width;
        this.height          = d.height;
        this.walkSpeed       = d.walkSpeed;
        this.runSpeed        = d.runSpeed;
        this.airSpeed        = d.airSpeed;
        this.jumpForce       = d.jumpForce;
        this.shortHopForce   = d.shortHopForce;
        this.doubleJumpForce = d.doubleJumpForce;
        this.maxJumps        = d.maxJumps;
        this.fallSpeed       = d.fallSpeed;
        this.fastFallSpeed   = d.fastFallSpeed;

        // Sprite image
        this.idleSprite      = d.idleSprite;
        this.spriteImage     = null;  // loaded Image object
        this.spriteLoaded    = false;

        // Load sprite image
        if (this.idleSprite) {
            this.spriteImage = new Image();
            this.spriteImage.onload = () => { this.spriteLoaded = true; };
            this.spriteImage.onerror = () => { 
                console.warn(`Failed to load sprite: ${this.idleSprite}`); 
                this.spriteLoaded = false;
            };
            this.spriteImage.src = this.idleSprite;
        }

        // Deep-copy attacks so per-instance mutation is safe
        this.attacks = {};
        const srcAtk = d.attacks || ROSTER.brawler.attacks;
        for (const key of Object.keys(srcAtk)) {
            this.attacks[key] = Object.assign({}, srcAtk[key]);
        }

        this.ultimateAttack = Object.assign({},
            d.ultimateAttack || ROSTER.brawler.ultimateAttack
        );
    }
}

// ── Quick helper: returns list of available character keys ───────
function getCharacterKeys() {
    return Object.keys(ROSTER);
}

// ── Exports ──────────────────────────────────────────────────────
SMASH.ROSTER           = ROSTER;
SMASH.FighterData      = FighterData;
SMASH.getCharacterKeys = getCharacterKeys;

})();
