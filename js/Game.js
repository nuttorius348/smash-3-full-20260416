/**
 * Game.js — Core match loop with full lifecycle management.
 *
 * ══════════════════════════════════════════════════════════════════
 *  GAME STATE MACHINE
 * ══════════════════════════════════════════════════════════════════
 *  countdown → playing ⇄ paused
 *                      → gameover
 *
 *  countdown: portal pop-out intro + 3-2-1-GO sequence, fighters frozen
 *  playing:   normal gameplay loop
 *  paused:    overlay menu (Resume / Restart / Quit)
 *  gameover:  results + overlay menu (Rematch / Char Select / Menu)
 *
 *  EXIT CALLBACK
 *    game.onExit(reason) — fired when player picks a menu option
 *    reason: 'menu' | 'charSelect'
 *    main.js handles the actual scene transition.
 *
 *  MATCH STATS
 *    Per-player: kills, falls (self-destructs), damage dealt
 *    Kill credit via fighter._lastHitBy (set by combat + projectiles)
 * ══════════════════════════════════════════════════════════════════
 */
(function () {
const S  = SMASH.Settings;
const ST = SMASH.Fighter.States;

const PAUSE_OPTS    = ['Resume', 'Move List', 'Restart', 'Quit to Menu'];
const GAMEOVER_OPTS = ['Rematch', 'Character Select', 'Main Menu'];

// ══════════════════════════════════════════════════════════════════
//  Game
// ══════════════════════════════════════════════════════════════════

class Game {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Array}  playerConfigs — from CharacterSelectScene or legacy menu
     * @param {object} settings
     *   stageKey {string}
     *   stocks   {number}
     *   debug    {boolean}
     *   onExit   {function(reason)} — callback when player exits match
     */
    constructor(canvas, playerConfigs, settings) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');

        this._configs  = playerConfigs;
        this._settings = settings;
        this.onExit    = settings.onExit || null;

        S.DEBUG_HITBOXES  = !!settings.debug;
        S.DEBUG_HURTBOXES = !!settings.debug;

        // ── Game mode ─────────────────────────────────────────────
        this.gameMode = settings.gameMode || 'stock';  // stock|stamina|team|wave

        // ── Core systems ──────────────────────────────────────────
        this.physics = new SMASH.Physics();
        this.camera  = new SMASH.Camera();
        this.hud     = new SMASH.HUD();
        this.projMgr = new SMASH.ProjectileManager();
        this.ultMgr  = new SMASH.UltimateManager();
        this._soundsEnabled = settings.soundsEnabled !== false;
        this._ultimateVideos = settings.ultimateVideos !== false;
        this.ultMgr.setSoundEnabled(this._soundsEnabled);
        this.ultMgr.setVideoEnabled(this._ultimateVideos);

        // ── Stage ─────────────────────────────────────────────────
        const fact = SMASH.StageLibrary[settings.stageKey];
        this.stage = fact ? fact() : SMASH.StageLibrary.battlefield();

        // ── Players ───────────────────────────────────────────────
        this.players  = [];
        this.fighters = [];
        this._buildPlayers(playerConfigs, settings.stocks || S.DEFAULT_STOCKS);

        // ── Stamina mode: set HP ──────────────────────────────────
        if (this.gameMode === 'stamina') {
            const hp = settings.staminaHP || 150;
            for (const f of this.fighters) {
                f.staminaHP    = hp;
                f.maxStaminaHP = hp;
            }
        }

        // ── Team mode: assign teams ───────────────────────────────
        if (this.gameMode === 'team') {
            this._assignTeams();
        }

        // ── Match stats (init early for wave defense) ────────────
        this._stats = {};  // Initialize empty, will be populated by _initStats and _spawnWaveEnemy

        // ── Wave defense mode ─────────────────────────────────────
        this._waveNumber      = 0;
        this._waveEnemies     = [];   // AI fighter references
        this._waveSpawnTimer  = 0;
        this._waveClearTimer  = 0;
        this._waveTargetCount = 0;    // total enemies to spawn this wave
        this._waveSpawned     = 0;    // how many spawned so far
        this._waveKills       = 0;
        if (this.gameMode === 'wave') {
            // Wave mode: 1 stock for human players (die once = lose)
            for (const f of this.fighters) {
                f.stocks = 1;
            }
            this._startWave(1);
        }

        // ── Draft mode queues ─────────────────────────────────────
        // Populated via setDraftQueues() before start()
        this._draftQueues = playerConfigs.map(() => []);
        this._draftCurrent = playerConfigs.map(() => 0);
        if (this.gameMode === 'draft') {
            // Each fighter gets 1 stock (death = swap character)
            for (const f of this.fighters) f.stocks = 1;
        }

        // ── Game state ────────────────────────────────────────────
        this.state           = 'countdown';
        this._countdownTimer = 195;
        this._winner         = null;
        this._winTeam        = -1;
        this._matchTime      = 0;

        // Populate player stats
        this._initStats();

        // ── Menu cursor ───────────────────────────────────────────
        this._menuIdx = 0;

        // ── KO notification ───────────────────────────────────────
        this._koAlpha = 0;
        this._koMsg   = '';

        // ── Mini cutscene (character transformations) ────────────
        this._miniCutscene = {
            active: false,
            timer: 0,
            duration: 1.8,
            title: '',
            subtitle: '',
            port: -1,
        };

        // ── Match intro (portal pop-out) ─────────────────────────
        this._intro = {
            active: false,
            timer: 0,
            duration: 3.0,
            playerCount: 0,
            entries: [],
            bursts: [],
            shakeTimer: 0,
            shakeStrength: 0,
        };
        this._setupBattleIntro();

        // ── Timing ────────────────────────────────────────────────
        this._lastTime = 0;
        this._raf      = null;

        // ── Overlay key tracking (independent of gameplay input) ──
        this._mk  = {};     // current frame
        this._mkp = {};     // previous frame
        this._onKD = e => { this._mk[e.code] = true;  };
        this._onKU = e => { this._mk[e.code] = false; };
        window.addEventListener('keydown', this._onKD);
        window.addEventListener('keyup',   this._onKU);

        // ── Multiplayer guest mode ────────────────────────────────
        // When true, the game only renders — no simulation.
        // Host sends authoritative state via applyState().
        this._guestMode = !!settings.guestMode;
    }

    // ── Helpers ──────────────────────────────────────────────────
    /** Just-pressed check for overlay/menu keys. */
    _jp(code) { return !!this._mk[code] && !this._mkp[code]; }

    _initStats() {
        // Don't reset this._stats, just add/update player entries
        for (const p of this.players) {
            // Skip wave enemies (they add their own stats)
            if (p.isWaveEnemy) continue;
            
            this._stats[p.port] = {
                port:  p.port,
                name:  p.fighter.data.name || '???',
                color: S.P_COLORS[p.port % 4],
                kills: 0,
                falls: 0,
                damageDealt: 0,
            };
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  PLAYER SETUP
    // ═════════════════════════════════════════════════════════════

    _buildPlayers(configs, stocks) {
        const spawns = this.stage.spawns;

        for (const cfg of configs) {
            const sp   = spawns[cfg.port % spawns.length];
            const data = new SMASH.FighterData(cfg.character || 'brawler');
            const fighter = new SMASH.Fighter(cfg.port, data, sp[0], sp[1]);
            fighter.stocks = stocks;

            const firstOpponentCfg = configs.find(c => c.port !== cfg.port) || null;
            const fallbackEnemyPort = firstOpponentCfg ? firstOpponentCfg.port : null;

            let ctrl;
            if (cfg._netController) {
                // Multiplayer: use the pre-built NetworkController
                ctrl = cfg._netController;
            } else if (cfg.deviceConfig) {
                ctrl = new SMASH.InputManager(cfg.deviceConfig);
            } else {
                switch (cfg.type) {
                    case 'keyboard':  ctrl = new SMASH.KeyboardController('wasd');   break;
                    case 'arrows':    ctrl = new SMASH.KeyboardController('arrows'); break;
                    case 'keyboard2': ctrl = new SMASH.KeyboardController('ijkl');   break;
                    case 'gamepad':   ctrl = new SMASH.GamepadController(cfg.padIndex || cfg.port); break;
                    case 'ai':        ctrl = new SMASH.AIController(cfg.port, cfg.level || 5); break;
                    case 'ollama_ai': ctrl = new SMASH.OllamaAIController(cfg.port, cfg.level || 5); break;
                    case 'learned_ai':
                        if (typeof SMASH.createLearnedAIController === 'function') {
                            ctrl = SMASH.createLearnedAIController(this, cfg.port, fallbackEnemyPort, {
                                epsilon: 0.05,
                            });
                        } else {
                            console.warn('learned_ai selected but learned controller factory is unavailable; falling back to scripted AI.');
                            ctrl = new SMASH.AIController(cfg.port, Math.min(12, cfg.level || 10));
                        }
                        break;
                    default:          ctrl = new SMASH.KeyboardController('wasd');
                }
            }

            const player = {
                port:       cfg.port,
                fighter:    fighter,
                controller: ctrl,
                isAI:       cfg.type === 'ai' || cfg.type === 'ollama_ai' || cfg.type === 'learned_ai',
                characterKey: cfg.character || 'brawler',
            };
            this.players.push(player);
            this.fighters.push(fighter);
        }

        // Give AI references to the world
        for (const p of this.players) {
            if (p.controller && typeof p.controller.setContext === 'function') {
                p.controller.setContext(this.fighters, this.stage, this.projMgr.list);
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  TEAM ASSIGNMENT
    // ═════════════════════════════════════════════════════════════

    _assignTeams() {
        // Read team assignments from player configs (set in character select)
        for (const p of this.players) {
            const cfg = this._configs.find(c => c.port === p.port);
            if (cfg && cfg.team >= 0) {
                p.fighter.team = cfg.team;  // 0=A, 1=B, 2=C, 3=D
            } else {
                p.fighter.team = p.port % 2;  // fallback: alternate A/B
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  DRAFT MODE
    // ═════════════════════════════════════════════════════════════

    /**
     * Set draft character queues for each player.
     * @param {string[]} p1Queue — character keys for P1 (8 entries)
     * @param {string[]} p2Queue — character keys for P2 (8 entries)
     */
    setDraftQueues(p1QueueOrAll, p2Queue) {
        if (p2Queue !== undefined) {
            // Legacy 2-player: setDraftQueues(p1, p2)
            this._draftQueues = [p1QueueOrAll || [], p2Queue || []];
        } else if (Array.isArray(p1QueueOrAll)) {
            // Array-of-queues for N players: setDraftQueues([q0, q1, ...])
            this._draftQueues = p1QueueOrAll.map(q => q || []);
        }
        this._draftCurrent = this._draftQueues.map(() => 0);
    }

    /**
     * Swap a fighter's character data to the next in their draft queue.
     * Returns false if no more characters remain.
     */
    _draftSwapNext(playerIdx) {
        const queue = this._draftQueues[playerIdx];
        const cur   = this._draftCurrent[playerIdx];
        if (cur >= queue.length) return false; // no more characters

        const nextKey  = queue[cur];
        const newData  = new SMASH.FighterData(nextKey);
        const player   = this.players[playerIdx];
        const fighter  = player.fighter;
        const spawns   = this.stage.spawns;
        const sp       = spawns[player.port % spawns.length];

        // Swap character data
        fighter.data   = newData;
        fighter.width  = newData.width;
        fighter.height = newData.height;

        // Reset fighter state
        fighter.stocks         = 1;
        fighter.damagePercent  = 0;
        fighter.ultimateMeter  = 0;
        fighter.x              = sp[0];
        fighter.y              = sp[1] - 200;
        fighter.vx             = 0;
        fighter.vy             = 0;
        fighter.state          = ST.AIRBORNE;
        fighter.invincible     = true;
        fighter._invFrames     = S.RESPAWN_INV_FRAMES;
        fighter.hitstunFrames  = 0;
        fighter.currentAttack  = null;
        fighter.activeHitbox   = null;
        fighter.fastFalling    = false;
        fighter.jumpsRemaining = newData.maxJumps;
        fighter.shieldHP       = S.SHIELD_MAX_HP;
        fighter._armorHitsLeft = 0;
        fighter.grounded       = false;
        if (fighter.maxStaminaHP > 0) {
            fighter.staminaHP    = fighter.maxStaminaHP;
        }

        // Update player's characterKey
        player.characterKey = nextKey;

        // Advance queue pointer
        this._draftCurrent[playerIdx] = cur + 1;
        return true;
    }

    /** How many characters remain in a player's draft queue (including current). */
    _draftRemaining(playerIdx) {
        return this._draftQueues[playerIdx].length - this._draftCurrent[playerIdx];
    }

    _sameTeam(a, b) {
        if (this.gameMode !== 'team') return false;
        return a.team >= 0 && a.team === b.team;
    }

    // ═════════════════════════════════════════════════════════════
    //  WAVE DEFENSE
    // ═════════════════════════════════════════════════════════════

    _startWave(num) {
        this._waveNumber = num;
        this._waveSpawnTimer  = 0;
        this._waveClearTimer  = 0;
        this._waveTargetCount = 1 + num;  // wave 1 = 2, wave 2 = 3, etc.
        this._waveSpawned     = 0;

        // Remove old dead wave enemies from fighters/players
        this.players  = this.players.filter(p => !p.isWaveEnemy || p.fighter.isAlive);
        this.fighters = this.fighters.filter(f => !this._waveEnemies.includes(f) || f.isAlive);
        this._waveEnemies = [];

        // Spawn the first enemy immediately
        this._spawnWaveEnemy();
    }

    /** Spawn a single wave enemy with random character. */
    _spawnWaveEnemy() {
        const num  = this._waveNumber;
        const idx  = this._waveSpawned;
        const keys   = SMASH.getCharacterKeys();
        const spawns = this.stage.spawns;
        const difficulty = Math.min(10, 2 + num);

        const wavePort = 10 + (num - 1) * 20 + idx;
        const charKey  = keys[Math.floor(Math.random() * keys.length)];
        const sp       = spawns[(idx + 2) % spawns.length];
        const data     = new SMASH.FighterData(charKey);
        const fighter  = new SMASH.Fighter(wavePort, data, sp[0], sp[1]);
        fighter.stocks = 1;

        // Wave enemies get stamina HP that scales with wave
        fighter.staminaHP    = 80 + num * 20;
        fighter.maxStaminaHP = 80 + num * 20;

        const ctrl = new SMASH.AIController(wavePort, difficulty);
        const player = {
            port:       wavePort,
            fighter:    fighter,
            controller: ctrl,
            isAI:       true,
            isWaveEnemy: true,
        };

        this.players.push(player);
        this.fighters.push(fighter);
        this._waveEnemies.push(fighter);
        this._waveSpawned++;

        // Init stats for this enemy
        this._stats[wavePort] = {
            port: wavePort, name: data.name || '???',
            color: '#888', kills: 0, falls: 0, damageDealt: 0,
        };

        // Re-link ALL AI context so everyone sees the new fighter
        for (const p of this.players) {
            if (p.controller instanceof SMASH.AIController) {
                p.controller.setContext(this.fighters, this.stage, this.projMgr.list);
            }
        }
    }

    _tickWaveDefense() {
        // ── Staggered spawning during the wave ────────────────────
        if (this._waveSpawned < this._waveTargetCount) {
            this._waveSpawnTimer++;
            // Spawn interval: 90 frames (~1.5s) between each enemy
            const spawnInterval = Math.max(45, 90 - this._waveNumber * 3);
            if (this._waveSpawnTimer >= spawnInterval) {
                this._waveSpawnTimer = 0;
                this._spawnWaveEnemy();
            }
        }

        // ── Check if all wave enemies for this wave are dead ──────
        const allSpawned = this._waveSpawned >= this._waveTargetCount;
        const allDead    = allSpawned && this._waveEnemies.length > 0 &&
            this._waveEnemies.every(f => !f.isAlive);

        if (allDead) {
            this._waveClearTimer++;
            if (this._waveClearTimer > 120) {  // 2 second pause
                this._startWave(this._waveNumber + 1);
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ═════════════════════════════════════════════════════════════

    start() {
        this._running  = true;
        this._lastTime = performance.now();
        this._raf = requestAnimationFrame(t => this._loop(t));
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        window.removeEventListener('keydown', this._onKD);
        window.removeEventListener('keyup',   this._onKU);
    }

    _loop(now) {
        if (!this._running) return;           // ← ensures stop() works mid-frame

        const dt = Math.min((now - this._lastTime) / 1000, 1 / 30);
        this._lastTime = now;

        // Guest mode: only render, no simulation (host state arrives via applyState)
        if (this._guestMode) {
            // Update camera to track fighters (normally done in _tickPlaying)
            this.camera.update(this.fighters, this.stage, dt);
            this._render();
            this._mkp = Object.assign({}, this._mk);

            // MUST clear one-shot keyboard actions even in guestMode,
            // otherwise _framePressed accumulates and sends phantom inputs forever
            if (SMASH.KeyboardController)  SMASH.KeyboardController.clearFrame();
            if (SMASH.InputManager && SMASH.InputManager.clearFrame) SMASH.InputManager.clearFrame();

            if (this._running) this._raf = requestAnimationFrame(t => this._loop(t));
            return;
        }

        this._update(dt);
        this._render();

        // Sync overlay key state (prev = current after frame)
        this._mkp = Object.assign({}, this._mk);

        // Clear per-frame gameplay input
        if (SMASH.KeyboardController)  SMASH.KeyboardController.clearFrame();
        if (SMASH.InputManager && SMASH.InputManager.clearFrame) SMASH.InputManager.clearFrame();

        if (this._running) this._raf = requestAnimationFrame(t => this._loop(t));
    }

    // ═════════════════════════════════════════════════════════════
    //  UPDATE DISPATCH
    // ═════════════════════════════════════════════════════════════

    _update(dt) {
        // KO overlay fade
        if (this._koAlpha > 0) this._koAlpha = Math.max(0, this._koAlpha - dt * 1.5);

        switch (this.state) {
            case 'countdown': return this._tickCountdown(dt);
            case 'playing':   return this._tickPlaying(dt);
            case 'paused':    return this._tickPause();
            case 'movelist':  return this._tickMoveList();
            case 'gameover':  return this._tickGameOver();
        }
    }

    _setupBattleIntro() {
        const activePlayers = this.players.filter(p => !p.isWaveEnemy);
        const liveFighters = this.fighters.filter(f => f && f.stocks > 0);
        const mapBaseY = this._getMapBaseY();

        this._intro.entries = [];
        this._intro.bursts = [];
        this._intro.shakeTimer = 0;
        this._intro.shakeStrength = 0;
        this._intro.duration = 1.2;
        this._intro.timer = this._intro.duration;
        this._intro.active = true;
        this._intro.playerCount = Math.max(1, activePlayers.length);

        for (let i = 0; i < liveFighters.length; i++) {
            const f = liveFighters[i];
            const endX = f._spawnX || f.x;
            const endY = f._spawnY || f.y;
            const startX = endX;
            const startY = mapBaseY + f.height + 120;

            this._intro.entries.push({
                port: f.port,
                startX,
                startY,
                endX,
                endY,
                portalY: mapBaseY + 10,
                delay: i * 0.08,
                popDuration: 0.72 + i * 0.06,
                burstStart: 0.72,
                popped: false,
            });

            f.x = startX;
            f.y = startY;
            f.vx = 0;
            f.vy = 0;
            f.grounded = true;
            f.state = ST.AIRBORNE;
        }
    }

    _getMapBaseY() {
        let platformBottom = -Infinity;
        if (this.stage && Array.isArray(this.stage.platforms)) {
            for (const p of this.stage.platforms) {
                if (!p || !p.rect) continue;
                const b = p.rect.y + p.rect.h;
                if (b > platformBottom) platformBottom = b;
            }
        }

        if (!Number.isFinite(platformBottom)) {
            const fallbackSpawnBottom = this.fighters.length
                ? Math.max(...this.fighters.map(f => (f._spawnY || f.y) + f.height + 60))
                : 680;
            return fallbackSpawnBottom;
        }

        const blastBottom = this.stage && this.stage.blastZone
            ? this.stage.blastZone.y + this.stage.blastZone.h - 30
            : platformBottom + 200;
        return Math.min(blastBottom, platformBottom);
    }

    _animateCountdownIntro(dt) {
        if (!this._intro.active) return;

        this._intro.timer = Math.max(0, this._intro.timer - dt);
        const elapsed = this._intro.duration - this._intro.timer;

        for (const e of this._intro.entries) {
            const f = this.fighters.find(x => x.port === e.port);
            if (!f) continue;

            const tRaw = (elapsed - e.delay) / e.popDuration;
            const t = Math.max(0, Math.min(1, tRaw));
            const burstStart = e.burstStart != null ? e.burstStart : 0.72;

            f.x = e.endX;
            if (t < burstStart) {
                const windup = burstStart > 0 ? t / burstStart : 1;
                const rumble = Math.sin((windup + f.port * 0.17) * Math.PI * 10) * 1.8;
                f.y = e.startY + rumble;
            } else {
                const bt = Math.max(0, Math.min(1, (t - burstStart) / Math.max(0.001, 1 - burstStart)));
                const blast = 1 - Math.pow(1 - bt, 4);
                const overshoot = Math.sin(bt * Math.PI) * 24 * (1 - bt);
                f.y = e.startY + (e.endY - e.startY) * blast - overshoot;
            }
            f.vx = 0;
            f.vy = 0;
            f.grounded = true;
            f.state = t < 0.95 ? ST.AIRBORNE : ST.IDLE;

            if (t >= burstStart && !e.popped) {
                e.popped = true;
                this._intro.bursts.push({
                    x: e.endX + f.width / 2,
                    y: e.portalY,
                    age: 0,
                    life: 0.38,
                    maxR: 104,
                });
                this._intro.shakeTimer = Math.max(this._intro.shakeTimer, 0.22);
                this._intro.shakeStrength = Math.max(this._intro.shakeStrength, 13);
            }
        }

        if (this._intro.bursts.length) {
            for (const b of this._intro.bursts) b.age += dt;
            this._intro.bursts = this._intro.bursts.filter(b => b.age < b.life);
        }
        if (this._intro.shakeTimer > 0) {
            this._intro.shakeTimer = Math.max(0, this._intro.shakeTimer - dt);
            this._intro.shakeStrength = Math.max(0, this._intro.shakeStrength - dt * 44);
        }

        if (this._intro.timer <= 0) {
            this._intro.active = false;
            for (const e of this._intro.entries) {
                const f = this.fighters.find(x => x.port === e.port);
                if (!f) continue;
                f.x = e.endX;
                f.y = e.endY;
                f.vx = 0;
                f.vy = 0;
                f.grounded = true;
                f.state = ST.IDLE;
            }
        }
    }

    _getIntroEntryForFighter(f) {
        if (!f || !this._intro.active) return false;
        const e = this._intro.entries.find(x => x.port === f.port);
        return e || null;
    }

    _getIntroProgress(e) {
        if (!e || !this._intro.active) return 1;
        const elapsed = this._intro.duration - this._intro.timer;
        const tRaw = (elapsed - e.delay) / e.popDuration;
        return Math.max(0, Math.min(1, tRaw));
    }

    _getIntroClipYForFighter(f, cam) {
        const e = this._getIntroEntryForFighter(f);
        if (!e) return null;
        const t = this._getIntroProgress(e);
        if (t >= 1) return null;

        const burstStart = e.burstStart != null ? e.burstStart : 0.72;
        // Hard burst: completely hidden until eruption starts.
        if (t < burstStart) return -999999;

        const fy = e.portalY;
        return (fy - cam.y) * cam.zoom + S.H / 2 + 7;
    }

    // ── Countdown ────────────────────────────────────────────────

    _tickCountdown(dt) {
        this._animateCountdownIntro(dt);

        const prevSec = Math.ceil(this._countdownTimer / 60);
        this._countdownTimer--;
        const sec = Math.ceil(this._countdownTimer / 60);

        if (SMASH.SFX && sec > 0 && sec <= 3 && sec !== prevSec) {
            SMASH.SFX.playCountdown();
        }

        // Camera tracks fighters even during countdown
        this.camera.update(this.fighters, this.stage, dt);
        if (this._countdownTimer <= 0) this.state = 'playing';
    }

    // ── Main gameplay tick ───────────────────────────────────────

    _tickPlaying(dt) {
        this._matchTime += dt;

        // 0. Ultimate cutscene — blocks all normal updates
        if (this.ultMgr.active) {
            this.ultMgr.update(dt);
            return;
        }

        // 0b. Mini transformation cutscene
        if (this._miniCutscene.active) {
            this._miniCutscene.timer -= dt;
            if (this._miniCutscene.timer <= 0) {
                this._miniCutscene.active = false;
            }
            return;
        }

        // Pause toggle (Escape / P)
        if (this._jp('Escape') || this._jp('KeyP')) {
            this.state    = 'paused';
            this._menuIdx = 0;
            return;
        }

        // Snapshot stocks for death detection
        const preStocks = this.fighters.map(f => f.stocks);

        // 1. Poll input + fighter updates
        for (const p of this.players) {
            if (!p.fighter.isAlive) continue;

            const raw = p.controller.poll();
            const inp = raw.input || raw;   // backward compat

            // Gamepad-triggered pause
            if (raw.pause && !this._pauseHeld) {
                this.state = 'paused';
                this._menuIdx = 0;
                this._pauseHeld = true;
                return;
            }
            if (!raw.pause) this._pauseHeld = false;

            const event = p.fighter.update(inp, dt);
            if (event && event.type === 'ultimate') this._onUltimate(p.fighter);
            this._checkProjSpawn(p.fighter);

            if (p.fighter.consumeVaughanTransformCutsceneEvent && p.fighter.consumeVaughanTransformCutsceneEvent()) {
                if (SMASH.SFX) SMASH.SFX.playNewChallenger();
                this._startMiniCutscene('VON AWAKENED', `${p.fighter.data.name.toUpperCase()} TRANSFORMS`, p.fighter.port);
                return;
            }
        }

        // 2. Melee combat resolution
        this._resolveCombat();

        // 3. Snapshot damage before projectile step (for stat tracking)
        const preDmg = this.fighters.map(f => f.damagePercent);

        // 4. Projectiles (includes stage + fighter + proj-vs-proj)
        this.projMgr.update(dt, this.fighters, this.stage);

        // Track projectile damage dealt
        for (let i = 0; i < this.fighters.length; i++) {
            const delta = this.fighters[i].damagePercent - preDmg[i];
            if (delta > 0) {
                const src = this.fighters[i]._lastHitBy;
                if (src !== undefined && this._stats[src]) {
                    this._stats[src].damageDealt += delta;
                }
            }
        }

        // 5. Stage tick (moving platforms)
        if (this.stage.update) this.stage.update(dt);

        // 6. Physics (gravity, friction, platforms, blast zones → die)
        for (const f of this.fighters) {
            if (f.isAlive) {
                this.physics.update(f, this.stage, dt);
                // Check for ledge grab
                f.checkLedgeGrab(this.stage);
            }
        }

        // 7. Detect deaths + credit kills
        for (let i = 0; i < this.fighters.length; i++) {
            const f = this.fighters[i];
            if (f.stocks < preStocks[i]) {
                if (SMASH.SFX) SMASH.SFX.playStageFall();

                // Check if this stats entry exists (wave enemies added dynamically)
                if (this._stats[f.port]) this._stats[f.port].falls++;

                // Credit kill to last attacker (if not self)
                const src = f._lastHitBy;
                if (src !== undefined && src !== f.port && this._stats[src]) {
                    this._stats[src].kills++;
                }

                if (SMASH.SFX && src !== undefined && src !== f.port && f._lastHitWasSpecial) {
                    SMASH.SFX.playFinisher();
                }

                // Track wave kills
                if (this.gameMode === 'wave' && this._waveEnemies.includes(f)) {
                    this._waveKills++;
                }

                // ── Stock stealing (team mode) ────────────────────
                if (this.gameMode === 'team' && !f.isAlive && f.team >= 0) {
                    const donor = this.fighters.find(t =>
                        t !== f && t.team === f.team && t.isAlive && t.stocks > 1
                    );
                    if (donor) {
                        donor.stocks--;
                        f.stocks = 1;
                        f._respawn();
                        this._koAlpha = 1.0;
                        this._koMsg = `P${donor.port + 1} gave a stock to P${f.port + 1}!`;
                        continue;  // skip normal KO message
                    }
                }

                // ── Draft mode: swap to next character ────────────
                if (this.gameMode === 'draft' && !f.isAlive) {
                    const pIdx = i; // player index in this.players array
                    if (this._draftSwapNext(pIdx)) {
                        const newName = SMASH.ROSTER[this.players[pIdx].characterKey].name;
                        this._koAlpha = 1.0;
                        this._koMsg = `P${f.port + 1} swaps to ${newName}! (${this._draftRemaining(pIdx)} left)`;
                        continue;
                    }
                }

                // KO notification
                this._koAlpha = 1.0;
                if (this.gameMode === 'wave' && this._waveEnemies.includes(f)) {
                    this._koMsg = `Wave enemy defeated!`;
                } else {
                    this._koMsg = f.stocks > 0
                        ? `P${f.port + 1} lost a stock!`
                        : `P${f.port + 1} eliminated!`;
                }

                f._lastHitWasSpecial = false;
            }
        }

        // 8. Camera
        this.camera.update(this.fighters, this.stage, dt);

        // 9. Wave defense tick
        if (this.gameMode === 'wave') this._tickWaveDefense();

        // 10. Win check
        this._checkGameOver();
    }

    _checkProjSpawn(fighter) {
        if (!fighter.currentAttack) return;
        if (!fighter.currentAttack.spawnsProjectile) return;
        if (fighter._projSpawned) return;
        if (fighter._atkPhase === 'active' && fighter.activeHitbox) {
            this.projMgr.spawnFromAttack(fighter, fighter.currentAttack);
            fighter._projSpawned = true;
        }
    }

    _resolveCombat() {
        // ── Grab attempts ────────────────────────────────────────
        for (const atk of this.fighters) {
            if (!atk.isAlive) continue;
            if (atk.state !== 'grabbing' || atk.grabTarget) continue;
            // Try to grab a nearby fighter
            for (const tgt of this.fighters) {
                if (tgt === atk || !tgt.isAlive || tgt.invincible) continue;
                if (this._sameTeam(atk, tgt)) continue; // no friendly grabs
                if (atk.tryGrab(tgt)) break;
            }
        }

        // ── Melee hit detection ──────────────────────────────────
        for (const atk of this.fighters) {
            if (!atk.isAlive) continue;
            if (!atk.activeHitbox || !atk.activeHitbox.isActive()) continue;

            for (const tgt of this.fighters) {
                if (tgt === atk || !tgt.isAlive || tgt.invincible) continue;
                if (this._sameTeam(atk, tgt)) continue; // no friendly fire
                if (tgt.state === 'grabbed') continue; // Can't hit grabbed fighters (grabber pummels them)
                if (atk.activeHitbox.checkHit(atk, tgt)) {
                    const isSpec = tgt.state !== 'shield' &&
                        (atk.state === 'special' || atk.state === 'ultimate');
                    const isUlt = atk.state === 'ultimate';
                    tgt.takeHit(atk.activeHitbox, atk.facing, isSpec, isUlt);
                    tgt._lastHitBy = atk.port;
                    this._stats[atk.port].damageDealt += atk.activeHitbox.damage;

                    // ── Damage multiplier hit tracking (Fazbear) ─
                    if (atk.boostedHitsLeft > 0) {
                        atk.boostedHitsLeft--;
                        if (atk.boostedHitsLeft <= 0) {
                            atk.damageMultiplier = 1.0;
                        }
                    }

                    // ── Slippery effect (Baby Oil) ───────────────
                    if (atk.currentAttack && atk.currentAttack.makesSlippery) {
                        tgt.slipperyTimer = S.SLIPPERY_DURATION_FRAMES;
                    }

                    // ── Pogo bounce: down-air on top → attacker bounces ──
                    if (atk.currentAttack && this._isDownAir(atk) && !atk.grounded) {
                        // Check attacker is above target
                        const atkBottom = atk.y + atk.height;
                        const tgtTop = tgt.y;
                        if (atkBottom <= tgtTop + 40) {
                            atk.vy = S.POGO_BOUNCE_VY;
                            atk.fastFalling = false;
                            atk.jumpsRemaining = Math.min(
                                atk.jumpsRemaining + 1, atk.data.maxJumps
                            );
                        }
                    }
                }
            }
        }
    }

    /**
     * Check if a fighter's current attack is a down-air (dair).
     */
    _isDownAir(fighter) {
        if (!fighter.currentAttack) return false;
        const dair = fighter.data.attacks['down_air'];
        return fighter.currentAttack === dair;
    }

    _onUltimate(attacker) {
        this.ultMgr.trigger(attacker, this.fighters);
    }

    _startMiniCutscene(title, subtitle, port) {
        this._miniCutscene.active = true;
        this._miniCutscene.timer = this._miniCutscene.duration;
        this._miniCutscene.title = title || '';
        this._miniCutscene.subtitle = subtitle || '';
        this._miniCutscene.port = port;
    }

    _checkGameOver() {
        if (this.gameMode === 'wave') {
            // Wave defense: game over when all human players are dead
            const humanPlayers = this.players.filter(p => !p.isWaveEnemy);
            const allHumansDead = humanPlayers.every(p => !p.fighter.isAlive);
            if (allHumansDead) {
                this.state    = 'gameover';
                this._winner  = null; // no winner in wave defense
                this._menuIdx = 0;
            }
            return;
        }

        if (this.gameMode === 'team') {
            // Team mode: game over when only one team has living fighters
            const teamsAlive = new Set();
            for (const f of this.fighters) {
                if (f.isAlive && f.team >= 0) teamsAlive.add(f.team);
            }
            if (teamsAlive.size <= 1 && this.fighters.some(f => f.team >= 0)) {
                this.state    = 'gameover';
                const winTeam = teamsAlive.size === 1 ? [...teamsAlive][0] : -1;
                this._winTeam = winTeam;
                this._winner  = winTeam >= 0
                    ? this.fighters.find(f => f.team === winTeam && f.isAlive) || null
                    : null;
                this._menuIdx = 0;
            }
            return;
        }

        // Stock / Stamina: standard last-fighter-standing
        const alive = this.fighters.filter(f => f.isAlive);
        if (alive.length <= 1 && this.fighters.length > 1) {
            this.state    = 'gameover';
            this._winner  = alive.length === 1 ? alive[0] : null;
            this._menuIdx = 0;
        }
    }

    // ── Pause menu ───────────────────────────────────────────────

    _tickPause() {
        if (this._jp('ArrowUp')   || this._jp('KeyW'))
            this._menuIdx = (this._menuIdx - 1 + PAUSE_OPTS.length) % PAUSE_OPTS.length;
        if (this._jp('ArrowDown') || this._jp('KeyS'))
            this._menuIdx = (this._menuIdx + 1) % PAUSE_OPTS.length;

        // Resume shortcut
        if (this._jp('Escape') || this._jp('KeyP')) {
            this.state = 'playing';
            return;
        }

        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            switch (this._menuIdx) {
                case 0: this.state = 'playing'; break;      // Resume
                case 1:                                      // Move List
                    this.state = 'movelist';
                    this._mlCharIdx  = 0;
                    this._mlScroll   = 0;
                    this._menuIdx    = 0;
                    break;
                case 2: this._restart();        break;      // Restart
                case 3: this._exit('menu');     break;      // Quit
            }
        }
    }

    // ── Move List ─────────────────────────────────────────────────

    _tickMoveList() {
        const keys = SMASH.getCharacterKeys();

        // Escape / P → back to pause menu
        if (this._jp('Escape') || this._jp('KeyP')) {
            this.state    = 'paused';
            this._menuIdx = 0;
            return;
        }

        // Left / Right → cycle character
        if (this._jp('ArrowLeft') || this._jp('KeyA')) {
            this._mlCharIdx = (this._mlCharIdx - 1 + keys.length) % keys.length;
            this._mlScroll  = 0;
        }
        if (this._jp('ArrowRight') || this._jp('KeyD')) {
            this._mlCharIdx = (this._mlCharIdx + 1) % keys.length;
            this._mlScroll  = 0;
        }

        // Up / Down → scroll move list
        if (this._jp('ArrowUp') || this._jp('KeyW'))
            this._mlScroll = Math.max(0, this._mlScroll - 1);
        if (this._jp('ArrowDown') || this._jp('KeyS'))
            this._mlScroll++;
    }

    // ── Game-over menu ───────────────────────────────────────────

    _tickGameOver() {
        if (this._jp('ArrowUp')   || this._jp('KeyW'))
            this._menuIdx = (this._menuIdx - 1 + GAMEOVER_OPTS.length) % GAMEOVER_OPTS.length;
        if (this._jp('ArrowDown') || this._jp('KeyS'))
            this._menuIdx = (this._menuIdx + 1) % GAMEOVER_OPTS.length;

        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            switch (this._menuIdx) {
                case 0: this._restart();           break;   // Rematch
                case 1: this._exit('charSelect');  break;   // Character Select
                case 2: this._exit('menu');        break;   // Main Menu
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  RESTART / EXIT
    // ═════════════════════════════════════════════════════════════

    _restart() {
        const stocks = this._settings.stocks || S.DEFAULT_STOCKS;

        // ── Wave mode: remove wave enemies first ──────────────────
        if (this.gameMode === 'wave') {
            // Remove wave enemies from players/fighters arrays
            this.players  = this.players.filter(p => !p.isWaveEnemy);
            this.fighters = this.fighters.filter(f => {
                return this.players.some(p => p.fighter === f);
            });
            this._waveEnemies     = [];
            this._waveNumber      = 0;
            this._waveSpawnTimer  = 0;
            this._waveClearTimer  = 0;
            this._waveTargetCount = 0;
            this._waveSpawned     = 0;
            this._waveKills       = 0;
        }

        for (const p of this.players) {
            const f  = p.fighter;
            const sp = this.stage.spawns[p.port % this.stage.spawns.length];
            f.x  = sp[0];
            f.y  = sp[1] - 50;
            f.vx = 0;
            f.vy = 0;
            f.damagePercent  = 0;
            f.ultimateMeter  = 0;
            f.stocks         = stocks;
            f.state          = ST.IDLE;
            f.invincible     = false;
            f._invFrames     = 0;
            f.hitstunFrames  = 0;
            f.currentAttack  = null;
            f.activeHitbox   = null;
            f.grounded       = false;
            f.jumpsRemaining = f.data.maxJumps;
            f.shieldHP       = S.SHIELD_MAX_HP;
            f.fastFalling    = false;
            f._lastHitBy     = undefined;
            f._projSpawned   = false;
            // Clear grab state
            f.isGrabbed      = false;
            f.grabbedByPort  = -1;
            f.grabbedEscapeTimer = 0;
            f._grabHitsReceived = 0;
            f.grabTarget     = null;
            f.grabHitsDealt  = 0;
            f.grabTimer      = 0;
            // Clear damage multiplier
            f.damageMultiplier = 1.0;
            f.boostedHitsLeft  = 0;
            f.slipperyTimer    = 0;
        }

        // ── Stamina mode: restore HP ──────────────────────────────
        if (this.gameMode === 'stamina') {
            const hp = this._settings.staminaHP || 150;
            for (const f of this.fighters) {
                f.staminaHP    = hp;
                f.maxStaminaHP = hp;
            }
        }

        // ── Team mode: re-assign teams ────────────────────────────
        if (this.gameMode === 'team') {
            this._assignTeams();
        }

        // ── Wave mode: 1 stock for human players ──────────────────
        if (this.gameMode === 'wave') {
            for (const f of this.fighters) {
                f.stocks = 1;
            }
        }

        // ── Draft mode: reset queue and load first characters ─────
        if (this.gameMode === 'draft') {
            this._draftCurrent = [0, 0];
            for (let i = 0; i < this.players.length && i < 2; i++) {
                const firstKey = (i === 0 ? this._configs[0].character : this._configs[1].character);
                const newData  = new SMASH.FighterData(firstKey);
                const f = this.players[i].fighter;
                f.data   = newData;
                f.width  = newData.width;
                f.height = newData.height;
                f.stocks = 1;
                this.players[i].characterKey = firstKey;
            }
        }

        this.projMgr.clear();
        this.ultMgr = new SMASH.UltimateManager();
        this.ultMgr.setSoundEnabled(this._soundsEnabled);
        this.ultMgr.setVideoEnabled(this._ultimateVideos);

        // Re-link AI context
        for (const p of this.players) {
            if (p.controller instanceof SMASH.AIController) {
                p.controller.setContext(this.fighters, this.stage, this.projMgr.list);
            }
        }

        this._initStats();
        this._countdownTimer = 195;
        this._winner         = null;
        this._winTeam        = -1;
        this._menuIdx        = 0;
        this._matchTime      = 0;
        this._setupBattleIntro();

        // ── Wave mode: start wave 1 ──────────────────────────────
        if (this.gameMode === 'wave') {
            this._startWave(1);
        }
    }

    _exit(reason) {
        this.stop();
        this.projMgr.clear();
        if (this.onExit) this.onExit(reason);
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER
    // ═════════════════════════════════════════════════════════════

    _render() {
        const ctx = this.ctx;
        const cam = this.camera;

        // Background
        ctx.fillStyle = this.stage.bgColor || '#111';
        ctx.fillRect(0, 0, S.W, S.H);

        let shakeX = 0;
        let shakeY = 0;
        if (this.state === 'countdown' && this._intro.shakeTimer > 0) {
            const n = this._intro.shakeTimer / 0.18;
            const amp = Math.max(0, this._intro.shakeStrength * n);
            shakeX = (Math.random() * 2 - 1) * amp;
            shakeY = (Math.random() * 2 - 1) * amp * 0.6;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Stage (background layers + platforms)
        this.stage.render(ctx, cam);

        // Projectiles
        this.projMgr.render(ctx, cam);

        // Fighters
        for (const f of this.fighters) {
            const clipY = this._getIntroClipYForFighter(f, cam);
            if (clipY != null) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(-4000, -4000, S.W + 8000, clipY + 4000);
                ctx.clip();
                f.render(ctx, cam);
                ctx.restore();
            } else {
                f.render(ctx, cam);
            }
        }
        ctx.restore();

        // HUD
        const modeInfo = {
            gameMode:         this.gameMode,
            waveNumber:       this._waveNumber,
            waveEnemiesLeft:  this._waveEnemies.filter(f => f.isAlive).length,
            draftRemaining:   this.gameMode === 'draft'
                ? [this._draftRemaining(0), this._draftRemaining(1)]
                : null,
        };
        this.hud.render(ctx, this.players, this._matchTime, modeInfo);
        this._renderOllamaStatus(ctx);

        // Ultimate cutscene overlay
        this.ultMgr.render(ctx);

        // Mini transformation cutscene overlay
        this._renderMiniCutscene(ctx);

        // KO flash
        if (this._koAlpha > 0) this._renderKO(ctx);

        // State overlays
        if (this.state === 'countdown') {
            this._renderBattleIntro(ctx);
            this._renderCountdown(ctx);
        }
        if (this.state === 'paused')    this._renderPause(ctx);
        if (this.state === 'movelist')  this._renderMoveList(ctx);
        if (this.state === 'gameover')  this._renderGameOver(ctx);
    }

    _renderOllamaStatus(ctx) {
        const ollamaPlayers = this.players.filter(p => p && p.controller instanceof SMASH.OllamaAIController);
        if (!ollamaPlayers.length) return;

        let onlineCount = 0;
        let pendingCount = 0;
        for (const p of ollamaPlayers) {
            if (!p.controller || typeof p.controller.getStatus !== 'function') continue;
            const st = p.controller.getStatus();
            if (st.online) onlineCount++;
            if (st.pending) pendingCount++;
        }

        const allOnline = onlineCount === ollamaPlayers.length;
        const label = allOnline
            ? `OLLAMA: ONLINE (${onlineCount}/${ollamaPlayers.length})`
            : `OLLAMA: OFFLINE (${onlineCount}/${ollamaPlayers.length})`;

        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 14px Arial';

        const x = S.W - 16;
        const y = 12;
        const padX = 10;
        const padY = 6;
        const textW = ctx.measureText(label).width;
        const h = 24;

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(x - textW - padX * 2, y - padY, textW + padX * 2, h, 7);
        ctx.fill();

        ctx.fillStyle = allOnline ? '#44dd66' : '#ff6666';
        ctx.fillText(label, x - padX, y);

        if (pendingCount > 0) {
            ctx.font = '11px Arial';
            ctx.fillStyle = '#cccccc';
            ctx.fillText(`requests: ${pendingCount} pending`, x - padX, y + 15);
        }
        ctx.restore();
    }

    _renderBattleIntro(ctx) {
        if (!this._intro.active) return;

        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);

        ctx.save();

        // Global cinematic dim.
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(0, 0, S.W, S.H);

        // Portals at spawn points.
        for (const e of this._intro.entries) {
            const f = this.fighters.find(x => x.port === e.port);
            if (!f || f.stocks <= 0) continue;

            const t = this._getIntroProgress(e);
            if (t >= 1) continue; // Portal collapses once fighter fully emerges.

            const fx = e.endX + f.width / 2;
            const fy = e.portalY;
            const sx = (fx - this.camera.x) * this.camera.zoom + S.W / 2;
            const sy = (fy - this.camera.y) * this.camera.zoom + S.H / 2;

            const burstStart = e.burstStart != null ? e.burstStart : 0.72;
            const emergence = t < burstStart
                ? 0
                : Math.max(0, Math.min(1, (t - burstStart) / Math.max(0.001, 1 - burstStart)));
            const fade = 1 - emergence;
            const base = (24 + pulse * 10) * (0.75 + fade * 0.55);
            ctx.beginPath();
            ctx.ellipse(sx, sy + 6, base * 1.5, base * 0.52, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(88,194,255,${(0.24 * fade).toFixed(3)})`;
            ctx.fill();

            ctx.beginPath();
            ctx.ellipse(sx, sy + 6, base * 1.1, base * 0.34, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(153,235,255,${(0.82 * fade).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Burst rings when fighters pop out.
        for (const b of this._intro.bursts) {
            const p = Math.max(0, Math.min(1, b.age / b.life));
            const r = 20 + (b.maxR - 20) * p;
            const a = 1 - p;
            const sx = (b.x - this.camera.x) * this.camera.zoom + S.W / 2;
            const sy = (b.y - this.camera.y) * this.camera.zoom + S.H / 2;

            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(173,236,255,${(0.8 * a).toFixed(3)})`;
            ctx.lineWidth = 5 - p * 3;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, r * 0.58, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(92,202,255,${(0.55 * a).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    }

    _renderMiniCutscene(ctx) {
        if (!this._miniCutscene.active) return;

        const mc = this._miniCutscene;
        const p = mc.duration > 0 ? 1 - (mc.timer / mc.duration) : 1;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 110);

        ctx.save();

        // Cinematic letterbox + vignette tint
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, S.W, S.H);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, S.W, 88);
        ctx.fillRect(0, S.H - 88, S.W, 88);

        // Center flash panel
        const panelW = 940;
        const panelH = 250;
        const px = (S.W - panelW) / 2;
        const py = (S.H - panelH) / 2;

        const alpha = Math.min(0.9, 0.25 + p * 0.7);
        const grad = ctx.createLinearGradient(px, py, px + panelW, py + panelH);
        grad.addColorStop(0, `rgba(90,20,20,${alpha.toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(210,35,35,${(alpha + 0.08).toFixed(3)})`);
        grad.addColorStop(1, `rgba(90,20,20,${alpha.toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, panelW, panelH);

        ctx.strokeStyle = '#ffd7a6';
        ctx.lineWidth = 3 + pulse * 3;
        ctx.strokeRect(px, py, panelW, panelH);

        // Headline + subtitle
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 78px Arial';
        ctx.strokeStyle = 'rgba(20,0,0,0.95)';
        ctx.lineWidth = 8;
        ctx.strokeText(mc.title, S.W / 2, py + 112);
        ctx.fillStyle = '#fff2d9';
        ctx.fillText(mc.title, S.W / 2, py + 112);

        ctx.font = 'bold 30px Arial';
        ctx.fillStyle = '#ffe7cf';
        ctx.fillText(mc.subtitle, S.W / 2, py + 182);

        ctx.restore();
    }

    // ── Countdown ────────────────────────────────────────────────

    _renderCountdown(ctx) {
        const t   = this._countdownTimer;
        const sec = Math.ceil(t / 60);

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        if (sec > 0 && sec <= 3) {
            const frac  = (t % 60) / 60;
            const scale = 1.0 + frac * 0.5;
            ctx.font      = `bold ${Math.round(120 * scale)}px Arial`;
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.8 + frac * 0.2;
            ctx.fillText(sec, S.W / 2, S.H / 2);
        } else if (sec <= 0) {
            ctx.font      = 'bold 140px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.shadowColor = '#ff8800';
            ctx.shadowBlur  = 30;
            ctx.fillText('GO!', S.W / 2, S.H / 2);
        }

        ctx.restore();
    }

    // ── KO notification ──────────────────────────────────────────

    _renderKO(ctx) {
        ctx.save();
        ctx.globalAlpha  = this._koAlpha;
        ctx.font         = 'bold 48px Arial';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#ff4444';
        ctx.shadowColor  = '#000';
        ctx.shadowBlur   = 10;
        ctx.fillText(this._koMsg, S.W / 2, 80);
        ctx.restore();
    }

    // ── Pause overlay ────────────────────────────────────────────

    _renderPause(ctx) {
        ctx.save();

        // Dim background
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.font      = 'bold 64px Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText('PAUSED', S.W / 2, S.H / 2 - 110);

        // Match timer
        const mins = Math.floor(this._matchTime / 60);
        const secs = Math.floor(this._matchTime % 60);
        ctx.font      = '18px Arial';
        ctx.fillStyle = '#888';
        ctx.fillText(`Match Time: ${mins}:${secs.toString().padStart(2, '0')}`, S.W / 2, S.H / 2 - 65);

        // Menu
        this._renderMenu(ctx, PAUSE_OPTS, S.W / 2, S.H / 2 - 15);

        ctx.restore();
    }

    // ── Move List overlay ────────────────────────────────────────

    _renderMoveList(ctx) {
        const keys    = SMASH.getCharacterKeys();
        const charKey = keys[this._mlCharIdx];
        const data    = SMASH.ROSTER[charKey];
        if (!data) return;

        ctx.save();

        // Dim background
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.textBaseline = 'middle';

        // ── Title bar ─────────────────────────────────────────────
        ctx.textAlign = 'center';
        ctx.font      = 'bold 38px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('MOVE LIST', S.W / 2, 38);

        // Character name + arrows
        ctx.font      = 'bold 30px Arial';
        ctx.fillStyle = data.color || '#fff';
        ctx.fillText(data.name, S.W / 2, 82);

        ctx.font      = '24px Arial';
        ctx.fillStyle = '#888';
        ctx.fillText('◀', S.W / 2 - 160, 82);
        ctx.fillText('▶', S.W / 2 + 160, 82);

        ctx.font      = '14px Arial';
        ctx.fillStyle = '#555';
        ctx.fillText(`${this._mlCharIdx + 1} / ${keys.length}`, S.W / 2, 108);

        // ── Build move entries ────────────────────────────────────
        const CATEGORIES = [
            { label: 'GROUND NORMALS', keys: ['neutral_attack', 'side_attack', 'up_attack', 'down_attack'] },
            { label: 'AERIALS',        keys: ['neutral_air', 'forward_air', 'up_air', 'down_air'] },
            { label: 'SPECIALS',       keys: ['neutral_special', 'side_special', 'up_special', 'down_special'] },
        ];

        const entries = [];  // { type: 'header'|'move', ... }

        for (const cat of CATEGORIES) {
            entries.push({ type: 'header', label: cat.label });
            for (const ak of cat.keys) {
                const atk = data.attacks && data.attacks[ak];
                if (atk) entries.push({ type: 'move', attack: atk, key: ak });
            }
        }

        // Ultimate
        if (data.ultimateAttack) {
            entries.push({ type: 'header', label: 'ULTIMATE' });
            entries.push({ type: 'move', attack: data.ultimateAttack, key: 'ultimate', isUlt: true });
        }

        // ── Scroll clamp ─────────────────────────────────────────
        const ROW_H      = 56;
        const HDR_H      = 34;
        const PANEL_TOP  = 130;
        const PANEL_BOT  = S.H - 40;
        const viewH      = PANEL_BOT - PANEL_TOP;

        // Total content height
        let totalH = 0;
        for (const e of entries) totalH += e.type === 'header' ? HDR_H : ROW_H;

        const maxScroll = Math.max(0, Math.ceil((totalH - viewH) / ROW_H));
        if (this._mlScroll > maxScroll) this._mlScroll = maxScroll;

        // ── Clip region ──────────────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, PANEL_TOP, S.W, viewH);
        ctx.clip();

        let curY = PANEL_TOP - this._mlScroll * ROW_H;

        const LEFT   = 60;
        const COL_W  = S.W - 120;

        for (const entry of entries) {
            if (entry.type === 'header') {
                // Category header
                const h = HDR_H;
                if (curY + h > PANEL_TOP - 40 && curY < PANEL_BOT + 40) {
                    ctx.fillStyle = 'rgba(255,215,0,0.12)';
                    ctx.fillRect(LEFT, curY, COL_W, h);
                    ctx.font      = 'bold 16px Arial';
                    ctx.fillStyle = '#ffd700';
                    ctx.textAlign = 'left';
                    ctx.fillText(entry.label, LEFT + 14, curY + h / 2);
                }
                curY += h;
            } else {
                // Move row
                const h   = ROW_H;
                const atk = entry.attack;

                if (curY + h > PANEL_TOP - 40 && curY < PANEL_BOT + 40) {
                    // Alternating row bg
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fillRect(LEFT, curY, COL_W, h);

                    const midY = curY + h / 2;

                    // Move name
                    ctx.textAlign = 'left';
                    ctx.font      = 'bold 18px Arial';
                    ctx.fillStyle = entry.isUlt ? '#ff6644' : '#fff';
                    ctx.fillText(atk.name || entry.key, LEFT + 14, midY - 10);

                    // Stats line
                    ctx.font      = '13px Arial';
                    ctx.fillStyle = '#aaa';

                    let stats = `DMG: ${atk.damage}`;
                    stats += `   KB: ${atk.baseKB}`;
                    if (atk.kbScaling) stats += ` (×${atk.kbScaling})`;
                    stats += `   Angle: ${atk.angle}°`;
                    stats += `   Startup: ${atk.startupFrames}f`;
                    stats += `   Active: ${atk.activeFrames}f`;
                    stats += `   Endlag: ${atk.endlagFrames}f`;
                    ctx.fillText(stats, LEFT + 14, midY + 10);

                    // Tags (right side)
                    const tags = [];
                    if (atk.spawnsProjectile) tags.push('Projectile');
                    if (atk.isArmored)        tags.push(`Armor(${atk.armorHits})`);
                    if (atk.isCounter)         tags.push('Counter');
                    if (atk.chargesUlt)        tags.push(`Ult+${atk.chargesUlt}`);
                    if (atk.makesSlippery)     tags.push('Slippery');
                    if (atk.boostVX || atk.boostVY) tags.push('Movement');

                    if (tags.length) {
                        ctx.textAlign = 'right';
                        ctx.font      = '12px Arial';
                        ctx.fillStyle = '#88bbff';
                        ctx.fillText(tags.join(' • '), LEFT + COL_W - 14, midY);
                    }
                }
                curY += h;
            }
        }

        ctx.restore(); // clip

        // ── Scroll indicator ──────────────────────────────────────
        if (maxScroll > 0) {
            const barH   = Math.max(20, viewH * (viewH / totalH));
            const barY   = PANEL_TOP + (this._mlScroll / maxScroll) * (viewH - barH);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.roundRect(S.W - 22, barY, 8, barH, 4);
            ctx.fill();
        }

        // ── Bottom hint ──────────────────────────────────────────
        ctx.textAlign = 'center';
        ctx.font      = '14px Arial';
        ctx.fillStyle = '#555';
        ctx.fillText('◀▶ Character   ▲▼ Scroll   Esc Back', S.W / 2, S.H - 14);

        ctx.restore();
    }

    // ── Game-over overlay ────────────────────────────────────────

    _renderGameOver(ctx) {
        ctx.save();

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // ── Winner banner (mode-specific) ─────────────────────────
        if (this.gameMode === 'wave') {
            // Wave defense: show wave reached
            ctx.font      = 'bold 60px Arial';
            ctx.fillStyle = '#ff6644';
            ctx.shadowColor = '#000';
            ctx.shadowBlur  = 14;
            ctx.fillText('GAME OVER', S.W / 2, 65);
            ctx.shadowBlur = 0;

            ctx.font      = 'bold 30px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(`Reached Wave ${this._waveNumber}`, S.W / 2, 110);

            ctx.font      = '18px Arial';
            ctx.fillStyle = '#aaa';
            ctx.fillText(`Total Kills: ${this._waveKills}`, S.W / 2, 145);
        } else if (this.gameMode === 'team' && this._winTeam >= 0) {
            const teamNames  = ['TEAM A', 'TEAM B', 'TEAM C', 'TEAM D'];
            const teamColors = ['#ff4444', '#4488ff', '#44dd44', '#ddaa22'];
            ctx.font      = 'bold 72px Arial';
            ctx.fillStyle = teamColors[this._winTeam] || '#fff';
            ctx.shadowColor = '#000';
            ctx.shadowBlur  = 14;
            ctx.fillText(`${teamNames[this._winTeam]} WINS!`, S.W / 2, 85);
            ctx.shadowBlur = 0;
        } else if (this._winner) {
            const c = S.P_COLORS[this._winner.port % 4];
            ctx.font      = 'bold 72px Arial';
            ctx.fillStyle = c;
            ctx.shadowColor = '#000';
            ctx.shadowBlur  = 14;
            ctx.fillText(`P${this._winner.port + 1} WINS!`, S.W / 2, 85);
            ctx.shadowBlur = 0;
        } else {
            ctx.font      = 'bold 72px Arial';
            ctx.fillStyle = '#aaa';
            ctx.fillText('DRAW', S.W / 2, 85);
        }

        // Match time
        const mins = Math.floor(this._matchTime / 60);
        const secs = Math.floor(this._matchTime % 60);
        ctx.font      = '18px Arial';
        ctx.fillStyle = '#777';
        ctx.fillText(`Match Time: ${mins}:${secs.toString().padStart(2, '0')}`, S.W / 2, 135);

        // Stats table
        this._renderStats(ctx, S.W / 2, 175);

        // Menu options (hidden in multiplayer auto-exit mode)
        if (!this._suppressGameOverMenu) {
            this._renderMenu(ctx, GAMEOVER_OPTS, S.W / 2, S.H - 150);
        }

        ctx.restore();
    }

    // ── Stats table ──────────────────────────────────────────────

    _renderStats(ctx, cx, topY) {
        let ports = Object.keys(this._stats).map(Number).sort();
        // In wave mode, only show human player stats
        if (this.gameMode === 'wave') {
            ports = ports.filter(p => p < 10);
        }
        if (ports.length === 0) return;
        const colW  = Math.min(220, (S.W - 80) / ports.length);
        const totalW = ports.length * colW;
        const sx = cx - totalW / 2;

        for (let i = 0; i < ports.length; i++) {
            const st = this._stats[ports[i]];
            const px = sx + i * colW + colW / 2;

            // Player column background
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.beginPath();
            ctx.roundRect(sx + i * colW + 4, topY - 8, colW - 8, 230, 6);
            ctx.fill();

            // Player header
            ctx.font      = 'bold 22px Arial';
            ctx.fillStyle = st.color;
            ctx.fillText(`P${st.port + 1}`, px, topY + 18);

            ctx.font      = '14px Arial';
            ctx.fillStyle = '#aaa';
            ctx.fillText(st.name, px, topY + 40);

            // KOs
            ctx.font      = 'bold 36px Arial';
            ctx.fillStyle = '#fff';
            ctx.fillText(st.kills, px, topY + 85);
            ctx.font      = '12px Arial';
            ctx.fillStyle = '#888';
            ctx.fillText('KOs', px, topY + 104);

            // Falls
            ctx.font      = 'bold 36px Arial';
            ctx.fillStyle = '#fff';
            ctx.fillText(st.falls, px, topY + 145);
            ctx.font      = '12px Arial';
            ctx.fillStyle = '#888';
            ctx.fillText('Falls', px, topY + 164);

            // Damage dealt
            ctx.font      = 'bold 24px Arial';
            ctx.fillStyle = '#fff';
            ctx.fillText(`${Math.floor(st.damageDealt)}%`, px, topY + 200);
            ctx.font      = '12px Arial';
            ctx.fillStyle = '#888';
            ctx.fillText('Dealt', px, topY + 218);
        }
    }

    // ── Menu option renderer ─────────────────────────────────────

    _renderMenu(ctx, opts, cx, topY) {
        for (let i = 0; i < opts.length; i++) {
            const y   = topY + i * 50;
            const sel = i === this._menuIdx;

            // Highlight background
            if (sel) {
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                ctx.roundRect(cx - 150, y - 18, 300, 42, 8);
                ctx.fill();
            }

            ctx.font      = sel ? 'bold 26px Arial' : '22px Arial';
            ctx.fillStyle = sel ? '#ffd700' : '#999';
            ctx.textAlign = 'center';
            ctx.fillText(opts[i], cx, y + 8);

            if (sel) {
                ctx.fillText('▸', cx - 130, y + 8);
            }
        }

        // Hint
        ctx.font      = '14px Arial';
        ctx.fillStyle = '#555';
        ctx.fillText('↑↓ Navigate  •  Enter Select', cx, topY + opts.length * 50 + 15);
    }

    // ═════════════════════════════════════════════════════════════
    //  STATE SYNCHRONIZATION (for multiplayer)
    // ═════════════════════════════════════════════════════════════

    /**
     * Serialize critical game state for network sync.
     * Called by host after each frame to send to guest.
     */
    serializeState() {
        const fighters = this.fighters.map(f => {
            let currentAttackKey = null;
            if (f.currentAttack) {
                if (f.data && f.data.attacks) {
                    for (const [atkKey, atk] of Object.entries(f.data.attacks)) {
                        if (atk === f.currentAttack) {
                            currentAttackKey = atkKey;
                            break;
                        }
                    }
                }
                if (!currentAttackKey && f.data && f.data.ultimateAttack === f.currentAttack) {
                    currentAttackKey = 'ultimateAttack';
                }
            }

            return {
            // Position / physics
            x: f.x,
            y: f.y,
            vx: f.vx,
            vy: f.vy,
            facing: f.facing,
            grounded: f.grounded,
            fastFalling: f.fastFalling,

            // State machine
            state: f.state,
            _stateTimer: f._stateTimer,

            // Combat
            damagePercent: f.damagePercent,
            stocks: f.stocks,
            invincible: f.invincible,
            _invFrames: f._invFrames,
            shieldHP: f.shieldHP,
            ultimateMeter: f.ultimateMeter,
            hitstunFrames: f.hitstunFrames,
            jumpsRemaining: f.jumpsRemaining,

            // Attack
            currentAttack: f.currentAttack ? f.currentAttack.name : null,
            currentAttackKey,
            _atkPhase: f._atkPhase,
            _atkTimer: f._atkTimer,

            // Grab
            isGrabbed: f.isGrabbed,
            grabTimer: f.grabTimer,

            // Visual
            inputDirection: f.inputDirection,
            _armorHitsLeft: f._armorHitsLeft,
            _ultimatesUsed: f._ultimatesUsed || 0,
            _vaughanVonForm: !!f._vaughanVonForm,
            _sahurChargeFrames: f._sahurChargeFrames || 0,
            _sahurChargeRatio: f._sahurChargeRatio || 0,
            _sahurFullChargeFlash: f._sahurFullChargeFlash || 0,
            _sahurFullChargeTriggered: !!f._sahurFullChargeTriggered,

            // Mode-specific
            staminaHP: f.staminaHP || 0,
            maxStaminaHP: f.maxStaminaHP || 0,
            team: f.team != null ? f.team : -1,
            isAlive: f.isAlive,
            port: f.port,
            width: f.width,
            height: f.height,
            charKey: f.data ? f.data.key : 'brawler',
            isWaveEnemy: this._waveEnemies.includes(f),
            };
        });

        const projectiles = this.projMgr.list.map(p => ({
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            w: p.w,
            h: p.h,
            ownerPort: p.ownerPort,
            color: p.color,
            alive: p.alive,
            rotation: p.rotation,
            type: p.type,
        }));

        // Ultimate cutscene state
        const um = this.ultMgr;
        const ult = {
            active: um.active,
            phase: um.phase,
            _timer: um._timer,
            _attackerPort: um._attackerPort,
            _isCombo: um._isCombo,
            _comboName: um._comboName,
            _comboDmgMult: um._comboDmgMult,
            _videoError: um._videoError,
            _fallbackElapsed: um._fallbackElapsed,
            _videoPath: um._videoPath,
            _ultDamage: um._ultData ? um._ultData.damage : 0,
            _ultName: um._ultData ? um._ultData.name : '',
            _attackerName: um._attacker ? um._attacker.data.name : '???',
            _victims: (um._victims || []).map(v => ({
                port: v.fighter.port,
                distFactor: v.distFactor,
            })),
        };

        return {
            matchTime: this._matchTime,
            state: this.state,
            _countdownTimer: this._countdownTimer,
            _koAlpha: this._koAlpha,
            _koMsg: this._koMsg,
            _intro: {
                active: !!this._intro.active,
                timer: this._intro.timer || 0,
                duration: this._intro.duration || 3,
                playerCount: this._intro.playerCount || 0,
            },
            _miniCutscene: {
                active: !!this._miniCutscene.active,
                timer: this._miniCutscene.timer || 0,
                duration: this._miniCutscene.duration || 1.8,
                title: this._miniCutscene.title || '',
                subtitle: this._miniCutscene.subtitle || '',
                port: this._miniCutscene.port != null ? this._miniCutscene.port : -1,
            },
            gameMode: this.gameMode,
            _winner: this._winner ? this._winner.port : (this._winner === null ? null : this._winner),
            _winTeam: this._winTeam,
            _waveNumber: this._waveNumber || 0,
            _waveEnemiesLeft: this._waveEnemies ? this._waveEnemies.filter(f => f.isAlive).length : 0,
            _waveSpawned: this._waveSpawned || 0,
            _waveTargetCount: this._waveTargetCount || 0,
            fighterCount: this.fighters.length,
            fighters,
            projectiles,
            ult,
        };
    }

    /**
     * Apply received state from host to local game objects.
     * Called by guest each frame when state arrives.
     */
    applyState(netState) {
        if (!netState) return;

        this._matchTime = netState.matchTime;
        this.state = netState.state;
        this._countdownTimer = netState._countdownTimer;
        this._koAlpha = netState._koAlpha || 0;
        this._koMsg = netState._koMsg || '';
        if (netState._intro) {
            this._intro.active = !!netState._intro.active;
            this._intro.timer = netState._intro.timer || 0;
            this._intro.duration = netState._intro.duration || 3;
            this._intro.playerCount = netState._intro.playerCount || 0;
        }
        if (netState._miniCutscene) {
            const src = netState._miniCutscene;
            this._miniCutscene.active = !!src.active;
            this._miniCutscene.timer = src.timer || 0;
            this._miniCutscene.duration = src.duration || 1.8;
            this._miniCutscene.title = src.title || '';
            this._miniCutscene.subtitle = src.subtitle || '';
            this._miniCutscene.port = src.port != null ? src.port : -1;
        }
        if (netState._waveNumber != null) this._waveNumber = netState._waveNumber;
        if (netState._waveEnemiesLeft != null) this._waveEnemiesLeft = netState._waveEnemiesLeft;
        if (netState._waveSpawned != null) this._waveSpawned = netState._waveSpawned;
        if (netState._waveTargetCount != null) this._waveTargetCount = netState._waveTargetCount;

        // Dynamically grow/shrink fighter list to match host (wave mode spawns enemies)
        while (this.fighters.length < netState.fighters.length) {
            const src = netState.fighters[this.fighters.length];
            const charKey = src.charKey || 'brawler';
            const data = new SMASH.FighterData(charKey);
            const fighter = new SMASH.Fighter(src.port, data, src.x, src.y);
            fighter._isGhostCopy = true; // mark as guest-side copy
            this.fighters.push(fighter);
            // Also add to players for HUD rendering
            this.players.push({
                port: src.port, fighter, controller: { poll() { return new SMASH.InputState(); } },
                isAI: true, isWaveEnemy: !!src.isWaveEnemy, characterKey: charKey,
            });
        }
        // Shrink if host removed fighters (wave cleanup)
        while (this.fighters.length > netState.fighters.length) {
            const removed = this.fighters.pop();
            this.players = this.players.filter(p => p.fighter !== removed);
        }

        // Track wave enemies on guest side
        this._waveEnemies = this.fighters.filter((f, i) => {
            return netState.fighters[i] && netState.fighters[i].isWaveEnemy;
        });

        // Update fighters
        for (let i = 0; i < netState.fighters.length && i < this.fighters.length; i++) {
            const src = netState.fighters[i];
            const dst = this.fighters[i];

            // Position / physics
            dst.x = src.x;
            dst.y = src.y;
            dst.vx = src.vx;
            dst.vy = src.vy;
            dst.facing = src.facing;
            dst.grounded = src.grounded;
            dst.fastFalling = src.fastFalling;

            // State machine
            dst.state = src.state;
            dst._stateTimer = src._stateTimer;

            // Combat
            dst.damagePercent = src.damagePercent;
            dst.stocks = src.stocks;
            dst.invincible = src.invincible;
            dst._invFrames = src._invFrames;
            dst.shieldHP = src.shieldHP;
            dst.ultimateMeter = src.ultimateMeter;
            dst.hitstunFrames = src.hitstunFrames;
            dst.jumpsRemaining = src.jumpsRemaining;

            // Attack
            dst._atkPhase = src._atkPhase;
            dst._atkTimer = src._atkTimer;
            if (src.currentAttackKey) {
                if (src.currentAttackKey === 'ultimateAttack') {
                    dst.currentAttack = (dst.data && dst.data.ultimateAttack) ? dst.data.ultimateAttack : null;
                } else {
                    dst.currentAttack = (dst.data && dst.data.attacks)
                        ? (dst.data.attacks[src.currentAttackKey] || null)
                        : null;
                }
            } else if (src.currentAttack) {
                // Backward compatibility with older snapshots that only carried attack name.
                if (!dst.currentAttack || dst.currentAttack.name !== src.currentAttack) {
                    let byName = null;
                    if (dst.data && dst.data.attacks) {
                        for (const atk of Object.values(dst.data.attacks)) {
                            if (atk && atk.name === src.currentAttack) {
                                byName = atk;
                                break;
                            }
                        }
                    }
                    dst.currentAttack = byName;
                }
            } else {
                dst.currentAttack = null;
            }

            // Grab
            dst.isGrabbed = src.isGrabbed;
            dst.grabTimer = src.grabTimer;

            // Visual
            dst.inputDirection = src.inputDirection || { x: 0, y: 0 };
            dst._armorHitsLeft = src._armorHitsLeft || 0;
            dst._ultimatesUsed = src._ultimatesUsed || 0;
            if (src._vaughanVonForm && !dst._vaughanVonForm && dst.data && dst.data.key === 'vaughan') {
                dst._activateVaughanVonForm();
            }
            dst._vaughanVonForm = !!src._vaughanVonForm;
            dst._sahurChargeFrames = src._sahurChargeFrames || 0;
            dst._sahurChargeRatio = src._sahurChargeRatio || 0;
            dst._sahurFullChargeFlash = src._sahurFullChargeFlash || 0;
            dst._sahurFullChargeTriggered = !!src._sahurFullChargeTriggered;

            // Mode-specific
            if (src.staminaHP != null) dst.staminaHP = src.staminaHP;
            if (src.maxStaminaHP != null) dst.maxStaminaHP = src.maxStaminaHP;
            if (src.team != null) dst.team = src.team;
            // Sync stocks to 0 for dead fighters so isAlive returns false
            dst.stocks = src.stocks;
        }

        // Game-level mode state
        if (netState._winTeam != null) this._winTeam = netState._winTeam;
        // Reconstruct _winner as fighter reference from port number
        if (netState._winner != null) {
            this._winner = this.fighters.find(f => f.port === netState._winner) || null;
        } else {
            this._winner = null;
        }

        // Update ultimate cutscene state
        if (netState.ult) {
            const u = netState.ult;
            const um = this.ultMgr;

            // If host's ultimate just became active, start video on guest
            const wasActive = um.active;
            um.active = u.active;
            um.phase  = u.phase;
            um._timer = u._timer;
            um._attackerPort    = u._attackerPort;
            um._isCombo         = u._isCombo;
            um._comboName       = u._comboName;
            um._comboDmgMult    = u._comboDmgMult || 1;
            um._fallbackElapsed = u._fallbackElapsed;
            um._videoPath       = u._videoPath;

            // Always use canvas fallback on guest (video sync is unreliable)
            um._videoError = true;

            // Reconstruct _ultData stub for damage display & fallback name
            um._ultData = { damage: u._ultDamage || 0, name: u._ultName || 'ULTIMATE' };

            // Reconstruct _attacker stub for fallback render (needs .data.name)
            um._attacker = u._attackerPort >= 0
                ? { data: { name: u._attackerName || '???' } }
                : null;

            // Reconstruct victims from fighter refs
            um._victims = (u._victims || []).map(v => ({
                fighter: this.fighters[v.port] || { port: v.port },
                distFactor: v.distFactor,
            }));

            // If host just became active and guest wasn't → start the fallback
            // (hide any lingering video element)
            if (u.active && !wasActive) {
                um._hideVideo();
            }
            // If host ended → clean up video element
            if (!u.active && wasActive) {
                um._hideVideo();
            }
        }

        // Update projectiles — replace the entire list
        this.projMgr.list.length = 0;
        for (const p of netState.projectiles) {
            // Create minimal projectile-like objects for rendering
            this.projMgr.list.push({
                x: p.x,
                y: p.y,
                vx: p.vx,
                vy: p.vy,
                w: p.w || 22,
                h: p.h || 22,
                ownerPort: p.ownerPort,
                color: p.color,
                alive: p.alive !== false,
                rotation: p.rotation || 0,
                type: p.type || 'linear',
                _trail: [],
                render: SMASH.Projectile.prototype.render,
                _renderTrail: SMASH.Projectile.prototype._renderTrail,
                _renderBody: SMASH.Projectile.prototype._renderBody,
                _renderDebugHitbox: SMASH.Projectile.prototype._renderDebugHitbox || function(){},
                trailLength: 0,
                hitbox: null,
            });
        }
    }
}

SMASH.Game = Game;
})();
