/**
 * StageLibrary.js — Pre-built stage configurations.
 *
 * ══════════════════════════════════════════════════════════════════
 *  6 STAGES:  3 classic (small/medium) + 3 new large-scale maps
 * ══════════════════════════════════════════════════════════════════
 *
 *  CLASSIC:
 *    battlefield       — 3 floating platforms above solid ground
 *    final_destination — single flat stage
 *    wide_arena        — wide 3-ground layout with platforms
 *
 *  LARGE-SCALE:
 *    sky_fortress       — 5 vertical levels with moving platforms
 *    crystal_caverns    — underground cave with tunnels & elevators
 *    orbital_station    — space station with rotating platforms
 *
 *  All large maps use ~3000-4500px world space, multiple vertical
 *  levels (ground → sky / deep → surface), moving platforms, and
 *  wider blast zones.
 *
 * ══════════════════════════════════════════════════════════════════
 */
(function() {
const P = SMASH.Platform;
const Stage = SMASH._StageClass;

const Library = {

    // ══════════════════════════════════════════════════════════════
    //  CLASSIC STAGES (updated to new constructor)
    // ══════════════════════════════════════════════════════════════

    battlefield() {
        return new Stage({
            name: 'Battlefield',
            platforms: [
                new P(200, 600, 900, 40, false),   // main ground
                new P(280, 450, 180, 14, true),    // left plat
                new P(560, 360, 180, 14, true),    // center plat
                new P(840, 450, 180, 14, true),    // right plat
            ],
            blastZone: { x: -400, y: -500, w: 2100, h: 1600 },
            spawns: [[350,520],[600,520],[850,520],[560,280]],
            bgColor: '#191932',
        });
    },

    final_destination() {
        return new Stage({
            name: 'Final Destination',
            platforms: [
                new P(150, 600, 1000, 40, false),
            ],
            blastZone: { x: -400, y: -500, w: 2100, h: 1600 },
            spawns: [[300,520],[500,520],[700,520],[900,520]],
            bgColor: '#0f0a23',
        });
    },

    wide_arena() {
        return new Stage({
            name: 'Wide Arena',
            platforms: [
                new P(0, 700, 600, 40, false),
                new P(800, 700, 600, 40, false),
                new P(1600, 700, 600, 40, false),
                new P(550, 650, 300, 14, true),
                new P(1350, 650, 300, 14, true),
                new P(200, 500, 200, 14, true),
                new P(700, 480, 250, 14, true),
                new P(1250, 480, 250, 14, true),
                new P(1800, 500, 200, 14, true),
                new P(450, 320, 180, 14, true),
                new P(1000, 280, 200, 14, true),
                new P(1550, 320, 180, 14, true),
            ],
            blastZone: { x: -500, y: -600, w: 3200, h: 2000 },
            spawns: [[200,620],[900,620],[1700,620],[1100,200]],
            bgColor: '#141e14',
        });
    },

    // ══════════════════════════════════════════════════════════════
    //  LARGE-SCALE MAP 1:  SKY FORTRESS
    // ══════════════════════════════════════════════════════════════
    //  A towering fortress with 5 vertical levels rising from a
    //  ground courtyard up to sky-high turrets. Moving elevator
    //  platforms connect the levels.
    //
    //  World: ~3200 x 3600
    //  Levels:
    //    Ground (y ≈ 2800)  — wide courtyard
    //    Low    (y ≈ 2200)  — ramparts & walls
    //    Mid    (y ≈ 1600)  — battlements
    //    High   (y ≈ 1000)  — tower tops
    //    Sky    (y ≈  500)  — floating turret platforms
    //
    sky_fortress() {
        return new Stage({
            name: 'Sky Fortress',
            platforms: [
                // ── GROUND LEVEL (y ≈ 2800) ──────────────────────
                new P(200, 2800, 1000, 50, false, null,
                    { fill: '#3a3a4e', stroke: '#6a6a8e', label: 'Courtyard' }),
                new P(1400, 2800, 600, 50, false, null,
                    { fill: '#3a3a4e', stroke: '#6a6a8e' }),
                new P(2200, 2800, 800, 50, false, null,
                    { fill: '#3a3a4e', stroke: '#6a6a8e' }),

                // Bridge connecting ground sections
                new P(1100, 2750, 350, 16, true, null,
                    { fill: '#5a5040', stroke: '#8a7a5a', label: 'Bridge' }),
                new P(1950, 2750, 300, 16, true),

                // ── LOW LEVEL (y ≈ 2200) ramparts ────────────────
                new P(100, 2250, 500, 36, false, null,
                    { fill: '#4a4a5e', stroke: '#7a7a9e', label: 'Left Rampart' }),
                new P(800, 2200, 400, 36, false, null,
                    { fill: '#4a4a5e', stroke: '#7a7a9e' }),
                new P(1500, 2250, 400, 36, false, null,
                    { fill: '#4a4a5e', stroke: '#7a7a9e' }),
                new P(2200, 2200, 500, 36, false, null,
                    { fill: '#4a4a5e', stroke: '#7a7a9e', label: 'Right Rampart' }),

                // Stairs / ramps (passthrough)
                new P(580, 2400, 160, 14, true),
                new P(1200, 2350, 180, 14, true),
                new P(1900, 2400, 160, 14, true),

                // ── MID LEVEL (y ≈ 1600) battlements ─────────────
                new P(300, 1650, 350, 30, false, null,
                    { fill: '#555570', stroke: '#8585a0', label: 'Left Tower' }),
                new P(900, 1550, 500, 30, false, null,
                    { fill: '#555570', stroke: '#8585a0', label: 'Keep' }),
                new P(1650, 1600, 300, 30, false, null,
                    { fill: '#555570', stroke: '#8585a0' }),
                new P(2200, 1650, 350, 30, false, null,
                    { fill: '#555570', stroke: '#8585a0', label: 'Right Tower' }),

                // Mid passthrough ledges
                new P(650, 1750, 180, 14, true),
                new P(1450, 1720, 180, 14, true),
                new P(2000, 1750, 180, 14, true),

                // ── LEFT ELEVATOR (ground → mid) ─────────────────
                new P(50, 2700, 120, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 50, y: 2700 },
                        { x: 50, y: 1700 },
                    ],
                    speed: 120,
                    pauseFrames: 90,
                }, { fill: '#706030', stroke: '#c0a050', label: '⬆ Lift' }),

                // ── RIGHT ELEVATOR (ground → mid) ────────────────
                new P(2700, 2700, 120, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 2700, y: 2700 },
                        { x: 2700, y: 1700 },
                    ],
                    speed: 120,
                    pauseFrames: 90,
                }, { fill: '#706030', stroke: '#c0a050', label: '⬆ Lift' }),

                // ── HIGH LEVEL (y ≈ 1000) tower tops ─────────────
                new P(450, 1050, 280, 24, false, null,
                    { fill: '#606080', stroke: '#9090b0' }),
                new P(1000, 950, 350, 24, false, null,
                    { fill: '#606080', stroke: '#9090b0', label: 'High Keep' }),
                new P(1700, 1000, 250, 24, false, null,
                    { fill: '#606080', stroke: '#9090b0' }),
                new P(2300, 1050, 280, 24, false, null,
                    { fill: '#606080', stroke: '#9090b0' }),

                // Connectors mid → high
                new P(750, 1200, 160, 14, true),
                new P(1400, 1250, 200, 14, true),
                new P(2050, 1200, 160, 14, true),

                // ── CENTER ELEVATOR (mid → sky) ──────────────────
                new P(1100, 1500, 140, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 1100, y: 1500 },
                        { x: 1100, y: 550 },
                    ],
                    speed: 150,
                    pauseFrames: 120,
                }, { fill: '#504080', stroke: '#9070d0', label: '⬆ Sky Lift' }),

                // ── SKY LEVEL (y ≈ 500) floating turrets ─────────
                new P(400, 500, 220, 20, true, null,
                    { fill: '#7070a0', stroke: '#b0b0e0', label: 'Sky Left' }),
                new P(850, 420, 180, 20, true),
                new P(1300, 350, 250, 20, true, null,
                    { fill: '#7070a0', stroke: '#b0b0e0', label: 'Apex' }),
                new P(1750, 420, 180, 20, true),
                new P(2200, 500, 220, 20, true, null,
                    { fill: '#7070a0', stroke: '#b0b0e0', label: 'Sky Right' }),

                // Horizontal moving platform at sky level
                new P(700, 550, 130, 16, true, {
                    type: 'loop',
                    waypoints: [
                        { x: 700, y: 550 },
                        { x: 1600, y: 550 },
                        { x: 2100, y: 450 },
                        { x: 700, y: 450 },
                    ],
                    speed: 100,
                    pauseFrames: 30,
                }, { fill: '#a080c0', stroke: '#d0b0f0' }),
            ],
            blastZone: { x: -400, y: -200, w: 3600, h: 3600 },
            spawns: [
                [400, 2720],   // courtyard left
                [1600, 2720],  // courtyard right
                [2500, 2720],  // courtyard far right
                [1100, 870],   // high keep
            ],
            bgColor: '#0c0c1e',
            bgLayers: [
                { color: 'rgba(60,60,120,0.08)', parallax: 0.15,
                  rects: [{x:-200,y:600,w:3800,h:300},{x:500,y:1200,w:2000,h:200}] },
                { color: 'rgba(30,30,80,0.06)', parallax: 0.08,
                  rects: [{x:-500,y:200,w:4500,h:400}] },
            ],
            cameraBounds: { minX: -200, maxX: 3100, minY: -100, maxY: 3100 },
        });
    },

    // ══════════════════════════════════════════════════════════════
    //  LARGE-SCALE MAP 2:  CRYSTAL CAVERNS
    // ══════════════════════════════════════════════════════════════
    //  Massive underground cave system. Fighters start on the
    //  surface and can drop down through multiple cavern layers.
    //  Stalactite platforms, crystal bridges, and vertical
    //  elevator shafts.
    //
    //  World: ~4000 x 3200
    //  Levels:
    //    Surface   (y ≈  600)  — open cliff edge
    //    Upper     (y ≈ 1100)  — cavern entrance
    //    Mid       (y ≈ 1700)  — crystal bridges
    //    Deep      (y ≈ 2300)  — lava cavern floor
    //    Abyss     (y ≈ 2800)  — isolated floating crystals
    //
    crystal_caverns() {
        return new Stage({
            name: 'Crystal Caverns',
            platforms: [
                // ── SURFACE (y ≈ 600) ────────────────────────────
                new P(100, 620, 700, 45, false, null,
                    { fill: '#4a5a3a', stroke: '#7a8a5a', label: 'Left Cliff' }),
                new P(1000, 580, 500, 45, false, null,
                    { fill: '#4a5a3a', stroke: '#7a8a5a' }),
                new P(1700, 620, 500, 45, false, null,
                    { fill: '#4a5a3a', stroke: '#7a8a5a' }),
                new P(2500, 580, 700, 45, false, null,
                    { fill: '#4a5a3a', stroke: '#7a8a5a', label: 'Right Cliff' }),

                // Surface passthrough
                new P(780, 540, 240, 14, true),
                new P(1480, 540, 240, 14, true),
                new P(2200, 530, 300, 14, true),

                // ── UPPER CAVERN (y ≈ 1100) ──────────────────────
                // Cave walls (solid)
                new P(50, 1100, 480, 40, false, null,
                    { fill: '#3a3a48', stroke: '#5a5a78', label: 'Cave Left' }),
                new P(750, 1050, 600, 40, false, null,
                    { fill: '#3a3a48', stroke: '#5a5a78', label: 'Upper Ledge' }),
                new P(1600, 1100, 500, 40, false, null,
                    { fill: '#3a3a48', stroke: '#5a5a78' }),
                new P(2350, 1050, 450, 40, false, null,
                    { fill: '#3a3a48', stroke: '#5a5a78' }),
                new P(3050, 1100, 400, 40, false, null,
                    { fill: '#3a3a48', stroke: '#5a5a78', label: 'Cave Right' }),

                // Stalactite platforms (passthrough, hanging from above)
                new P(520, 900, 200, 14, true, null,
                    { fill: '#6a50a0', stroke: '#a080e0' }),
                new P(1400, 880, 180, 14, true, null,
                    { fill: '#6a50a0', stroke: '#a080e0' }),
                new P(2100, 900, 200, 14, true, null,
                    { fill: '#6a50a0', stroke: '#a080e0' }),
                new P(2850, 880, 180, 14, true, null,
                    { fill: '#6a50a0', stroke: '#a080e0' }),

                // Drops between cavern sections
                new P(400, 800, 100, 14, true),
                new P(1650, 780, 120, 14, true),

                // ── MID CAVERN (y ≈ 1700) crystal bridges ────────
                new P(200, 1700, 350, 30, false, null,
                    { fill: '#4050a0', stroke: '#7080e0', label: 'Crystal L' }),
                new P(700, 1650, 500, 30, false, null,
                    { fill: '#4050a0', stroke: '#7080e0', label: 'Crystal Bridge' }),
                new P(1400, 1720, 300, 30, false, null,
                    { fill: '#4050a0', stroke: '#7080e0' }),
                new P(1900, 1650, 500, 30, false, null,
                    { fill: '#4050a0', stroke: '#7080e0', label: 'Crystal Bridge' }),
                new P(2600, 1700, 400, 30, false, null,
                    { fill: '#4050a0', stroke: '#7080e0', label: 'Crystal R' }),
                new P(3200, 1700, 300, 30, false, null,
                    { fill: '#4050a0', stroke: '#7080e0' }),

                // Crystal hangings
                new P(550, 1550, 150, 14, true, null,
                    { fill: '#8060c0', stroke: '#c0a0ff' }),
                new P(1200, 1520, 180, 14, true, null,
                    { fill: '#8060c0', stroke: '#c0a0ff' }),
                new P(1750, 1550, 150, 14, true, null,
                    { fill: '#8060c0', stroke: '#c0a0ff' }),
                new P(2450, 1520, 180, 14, true, null,
                    { fill: '#8060c0', stroke: '#c0a0ff' }),
                new P(3100, 1550, 160, 14, true, null,
                    { fill: '#8060c0', stroke: '#c0a0ff' }),

                // ── LEFT SHAFT ELEVATOR (surface → deep) ─────────
                new P(0, 600, 130, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 0, y: 600 },
                        { x: 0, y: 2200 },
                    ],
                    speed: 140,
                    pauseFrames: 100,
                }, { fill: '#706030', stroke: '#c0a050', label: '⬇ Shaft' }),

                // ── RIGHT SHAFT ELEVATOR (surface → deep) ────────
                new P(3350, 600, 130, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 3350, y: 600 },
                        { x: 3350, y: 2200 },
                    ],
                    speed: 140,
                    pauseFrames: 100,
                }, { fill: '#706030', stroke: '#c0a050', label: '⬇ Shaft' }),

                // ── DEEP CAVERN (y ≈ 2300) lava floor ────────────
                new P(300, 2300, 600, 40, false, null,
                    { fill: '#5a3030', stroke: '#a05040', label: 'Lava Left' }),
                new P(1100, 2350, 500, 40, false, null,
                    { fill: '#5a3030', stroke: '#a05040', label: 'Lava Center' }),
                new P(1800, 2300, 600, 40, false, null,
                    { fill: '#5a3030', stroke: '#a05040', label: 'Lava Right' }),
                new P(2600, 2350, 500, 40, false, null,
                    { fill: '#5a3030', stroke: '#a05040' }),

                // Stepping stones over "lava"
                new P(900, 2250, 180, 14, true, null,
                    { fill: '#806040', stroke: '#c0a060' }),
                new P(1620, 2250, 160, 14, true, null,
                    { fill: '#806040', stroke: '#c0a060' }),
                new P(2420, 2250, 160, 14, true, null,
                    { fill: '#806040', stroke: '#c0a060' }),

                // ── ABYSS (y ≈ 2800) floating crystals ──────────
                new P(500, 2800, 200, 20, true, null,
                    { fill: '#3040c0', stroke: '#6080ff', label: 'Abyss' }),
                new P(1100, 2750, 180, 20, true, null,
                    { fill: '#3040c0', stroke: '#6080ff' }),
                new P(1600, 2820, 200, 20, true, null,
                    { fill: '#3040c0', stroke: '#6080ff' }),

                // Moving crystal at abyss
                new P(900, 2850, 120, 16, true, {
                    type: 'loop',
                    waypoints: [
                        { x: 900, y: 2850 },
                        { x: 1400, y: 2750 },
                        { x: 1900, y: 2850 },
                        { x: 1400, y: 2900 },
                    ],
                    speed: 80,
                    pauseFrames: 20,
                }, { fill: '#5060e0', stroke: '#a0b0ff' }),
            ],
            blastZone: { x: -400, y: -200, w: 4400, h: 3600 },
            spawns: [
                [300, 540],    // left cliff
                [1200, 500],   // center surface
                [2100, 540],   // right surface approach
                [2800, 500],   // right cliff
            ],
            bgColor: '#0a0a14',
            bgLayers: [
                { color: 'rgba(60,40,100,0.06)', parallax: 0.1,
                  rects: [{x:-200,y:400,w:4200,h:500},{x:500,y:1500,w:3000,h:400}] },
                { color: 'rgba(100,40,30,0.04)', parallax: 0.05,
                  rects: [{x:0,y:2000,w:4000,h:600}] },
            ],
            cameraBounds: { minX: -200, maxX: 3700, minY: -100, maxY: 3100 },
        });
    },

    // ══════════════════════════════════════════════════════════════
    //  LARGE-SCALE MAP 3:  ORBITAL STATION
    // ══════════════════════════════════════════════════════════════
    //  A space station built across 3 main ring sections connected
    //  by moving transport platforms. Zero-G floaty areas near the
    //  outer edges. Rotating ring platform in the center.
    //
    //  World: ~4500 x 2800
    //  Sections:
    //    Left Wing   (x ≈  200-1200)  — crew quarters
    //    Center Hub  (x ≈ 1400-2600)  — command deck
    //    Right Wing  (x ≈ 2800-4000)  — engine room
    //    Sky Deck    (y ≈  400-800)   — observation platforms
    //
    orbital_station() {
        return new Stage({
            name: 'Orbital Station',
            platforms: [
                // ══ LEFT WING — CREW QUARTERS ════════════════════
                // Main deck
                new P(100, 1600, 500, 40, false, null,
                    { fill: '#3a4a5e', stroke: '#6a8aae', label: 'Crew Deck' }),
                new P(700, 1650, 400, 40, false, null,
                    { fill: '#3a4a5e', stroke: '#6a8aae' }),

                // Lower crew area
                new P(200, 2000, 350, 36, false, null,
                    { fill: '#3a4050', stroke: '#5a7090' }),
                new P(650, 2050, 300, 36, false, null,
                    { fill: '#3a4050', stroke: '#5a7090' }),

                // Upper crew catwalks
                new P(150, 1350, 280, 14, true, null,
                    { fill: '#4a6a7a', stroke: '#7aaaba' }),
                new P(500, 1280, 250, 14, true, null,
                    { fill: '#4a6a7a', stroke: '#7aaaba' }),
                new P(850, 1350, 220, 14, true, null,
                    { fill: '#4a6a7a', stroke: '#7aaaba' }),

                // Bunks (passthrough)
                new P(100, 1800, 180, 14, true),
                new P(500, 1830, 200, 14, true),
                new P(900, 1800, 180, 14, true),

                // ══ CENTER HUB — COMMAND DECK ════════════════════
                // Main command platform (largest solid)
                new P(1400, 1550, 700, 50, false, null,
                    { fill: '#4a4a6e', stroke: '#8a8aae', label: 'Command Deck' }),

                // Tactical level above
                new P(1500, 1250, 500, 30, false, null,
                    { fill: '#505078', stroke: '#9090c0', label: 'Bridge' }),

                // Observation ring (passthrough)
                new P(1350, 1050, 200, 14, true, null,
                    { fill: '#5a7a90', stroke: '#8aaac0' }),
                new P(1700, 980, 250, 14, true, null,
                    { fill: '#5a7a90', stroke: '#8aaac0', label: 'Viewpoint' }),
                new P(2100, 1050, 200, 14, true, null,
                    { fill: '#5a7a90', stroke: '#8aaac0' }),

                // Lower hub
                new P(1500, 1900, 450, 36, false, null,
                    { fill: '#3a3a50', stroke: '#6060a0' }),
                new P(1350, 2100, 300, 14, true),
                new P(1800, 2100, 300, 14, true),

                // Center rotating platform
                new P(1650, 1400, 180, 16, true, {
                    type: 'loop',
                    waypoints: [
                        { x: 1650, y: 1400 },
                        { x: 1850, y: 1300 },
                        { x: 1850, y: 1100 },
                        { x: 1650, y: 1000 },
                        { x: 1450, y: 1100 },
                        { x: 1450, y: 1300 },
                    ],
                    speed: 90,
                    pauseFrames: 15,
                }, { fill: '#7070b0', stroke: '#b0b0f0', label: '⟳ Ring' }),

                // ══ RIGHT WING — ENGINE ROOM ═════════════════════
                // Engine deck
                new P(2800, 1600, 500, 40, false, null,
                    { fill: '#5a3a3a', stroke: '#ae6a6a', label: 'Engine Deck' }),
                new P(3400, 1650, 450, 40, false, null,
                    { fill: '#5a3a3a', stroke: '#ae6a6a' }),

                // Engine lower
                new P(2900, 2000, 400, 36, false, null,
                    { fill: '#503030', stroke: '#905050' }),
                new P(3500, 2050, 350, 36, false, null,
                    { fill: '#503030', stroke: '#905050' }),

                // Catwalks
                new P(2850, 1350, 250, 14, true, null,
                    { fill: '#7a4a4a', stroke: '#ba7a7a' }),
                new P(3200, 1280, 280, 14, true, null,
                    { fill: '#7a4a4a', stroke: '#ba7a7a' }),
                new P(3600, 1350, 250, 14, true, null,
                    { fill: '#7a4a4a', stroke: '#ba7a7a' }),

                // Engine pipes (passthrough ledges)
                new P(2900, 1800, 200, 14, true),
                new P(3300, 1830, 220, 14, true),
                new P(3700, 1800, 200, 14, true),

                // ══ CONNECTING TRANSPORTS ════════════════════════
                // Left wing → Center hub transport
                new P(1100, 1600, 140, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 1050, y: 1600 },
                        { x: 1350, y: 1500 },
                    ],
                    speed: 80,
                    pauseFrames: 60,
                }, { fill: '#406080', stroke: '#80b0e0', label: '⟷ Tram' }),

                // Center hub → Right wing transport
                new P(2300, 1600, 140, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 2150, y: 1500 },
                        { x: 2700, y: 1600 },
                    ],
                    speed: 80,
                    pauseFrames: 60,
                }, { fill: '#406080', stroke: '#80b0e0', label: '⟷ Tram' }),

                // Vertical lift left → sky deck
                new P(400, 1300, 120, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 400, y: 1300 },
                        { x: 400, y: 600 },
                    ],
                    speed: 130,
                    pauseFrames: 80,
                }, { fill: '#408060', stroke: '#80c0a0', label: '⬆ Lift' }),

                // Vertical lift right → sky deck
                new P(3500, 1300, 120, 18, true, {
                    type: 'pendulum',
                    waypoints: [
                        { x: 3500, y: 1300 },
                        { x: 3500, y: 600 },
                    ],
                    speed: 130,
                    pauseFrames: 80,
                }, { fill: '#408060', stroke: '#80c0a0', label: '⬆ Lift' }),

                // ══ SKY DECK — OBSERVATION PLATFORMS ═════════════
                new P(300, 650, 250, 20, true, null,
                    { fill: '#506090', stroke: '#90a0e0', label: 'Sky Left' }),
                new P(800, 580, 200, 20, true, null,
                    { fill: '#506090', stroke: '#90a0e0' }),
                new P(1300, 500, 280, 20, true, null,
                    { fill: '#506090', stroke: '#90a0e0', label: 'Apex' }),
                new P(1800, 450, 250, 20, true, null,
                    { fill: '#506090', stroke: '#90a0e0', label: 'Zenith' }),
                new P(2350, 500, 250, 20, true, null,
                    { fill: '#506090', stroke: '#90a0e0' }),
                new P(2900, 580, 200, 20, true, null,
                    { fill: '#506090', stroke: '#90a0e0' }),
                new P(3400, 650, 250, 20, true, null,
                    { fill: '#506090', stroke: '#90a0e0', label: 'Sky Right' }),

                // Horizontal sky patrol
                new P(1000, 700, 120, 14, true, {
                    type: 'loop',
                    waypoints: [
                        { x: 600, y: 700 },
                        { x: 1200, y: 650 },
                        { x: 1800, y: 700 },
                        { x: 2400, y: 650 },
                        { x: 3000, y: 700 },
                        { x: 2400, y: 750 },
                        { x: 1800, y: 700 },
                        { x: 1200, y: 750 },
                    ],
                    speed: 110,
                    pauseFrames: 0,
                }, { fill: '#70a0c0', stroke: '#b0e0ff', label: '⟷ Patrol' }),
            ],
            blastZone: { x: -400, y: -300, w: 4800, h: 3000 },
            spawns: [
                [350, 1520],    // crew quarters
                [1700, 1470],   // command deck
                [3100, 1520],   // engine room
                [1800, 370],    // zenith sky deck
            ],
            bgColor: '#050510',
            bgLayers: [
                { color: 'rgba(20,30,60,0.05)', parallax: 0.03,
                  rects: [{x:-500,y:-300,w:5500,h:3200}] },
                { color: 'rgba(40,60,100,0.04)', parallax: 0.08,
                  rects: [{x:0,y:300,w:4200,h:600},{x:200,y:1200,w:3800,h:400}] },
            ],
            cameraBounds: { minX: -200, maxX: 4200, minY: -200, maxY: 2500 },
        });
    },
};

SMASH.StageLibrary = Library;
})();
