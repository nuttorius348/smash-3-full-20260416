/**
 * Game.js — Core match loop with full lifecycle management.
 *
 * ══════════════════════════════════════════════════════════════════
 *  GAME STATE MACHINE
 * ══════════════════════════════════════════════════════════════════
 *  countdown → playing ⇄ paused
 *                      → gameover
 *
 *  countdown: 3-2-1-GO sequence, fighters frozen, camera active
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

const PAUSE_OPTS    = ['Resume', 'Restart', 'Quit to Menu'];
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

        // ── Core systems ──────────────────────────────────────────
        this.physics = new SMASH.Physics();
        this.camera  = new SMASH.Camera();
        this.hud     = new SMASH.HUD();
        this.projMgr = new SMASH.ProjectileManager();
        this.ultMgr  = new SMASH.UltimateManager();

        // ── Stage ─────────────────────────────────────────────────
        const fact = SMASH.StageLibrary[settings.stageKey];
        this.stage = fact ? fact() : SMASH.StageLibrary.battlefield();

        // ── Players ───────────────────────────────────────────────
        this.players  = [];
        this.fighters = [];
        this._buildPlayers(playerConfigs, settings.stocks || S.DEFAULT_STOCKS);

        // ── Game state ────────────────────────────────────────────
        this.state           = 'countdown';
        this._countdownTimer = 195;   // ~3.25 s at 60 fps (includes "GO!")
        this._winner         = null;
        this._matchTime      = 0;     // elapsed playing time (seconds)

        // ── Match stats ───────────────────────────────────────────
        this._initStats();

        // ── Menu cursor ───────────────────────────────────────────
        this._menuIdx = 0;

        // ── KO notification ───────────────────────────────────────
        this._koAlpha = 0;
        this._koMsg   = '';

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
    }

    // ── Helpers ──────────────────────────────────────────────────
    /** Just-pressed check for overlay/menu keys. */
    _jp(code) { return !!this._mk[code] && !this._mkp[code]; }

    _initStats() {
        this._stats = {};
        for (const p of this.players) {
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

            let ctrl;
            if (cfg.deviceConfig) {
                ctrl = new SMASH.InputManager(cfg.deviceConfig);
            } else {
                switch (cfg.type) {
                    case 'keyboard':  ctrl = new SMASH.KeyboardController('wasd');   break;
                    case 'arrows':    ctrl = new SMASH.KeyboardController('arrows'); break;
                    case 'keyboard2': ctrl = new SMASH.KeyboardController('ijkl');   break;
                    case 'gamepad':   ctrl = new SMASH.GamepadController(cfg.padIndex || cfg.port); break;
                    case 'ai':        ctrl = new SMASH.AIController(cfg.port, cfg.level || 5); break;
                    default:          ctrl = new SMASH.KeyboardController('wasd');
                }
            }

            const player = {
                port:       cfg.port,
                fighter:    fighter,
                controller: ctrl,
                isAI:       cfg.type === 'ai',
            };
            this.players.push(player);
            this.fighters.push(fighter);
        }

        // Give AI references to the world
        for (const p of this.players) {
            if (p.controller instanceof SMASH.AIController) {
                p.controller.setContext(this.fighters, this.stage, this.projMgr.list);
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ═════════════════════════════════════════════════════════════

    start() {
        this._lastTime = performance.now();
        this._raf = requestAnimationFrame(t => this._loop(t));
    }

    stop() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        window.removeEventListener('keydown', this._onKD);
        window.removeEventListener('keyup',   this._onKU);
    }

    _loop(now) {
        const dt = Math.min((now - this._lastTime) / 1000, 1 / 30);
        this._lastTime = now;

        this._update(dt);
        this._render();

        // Sync overlay key state (prev = current after frame)
        this._mkp = Object.assign({}, this._mk);

        // Clear per-frame gameplay input
        if (SMASH.KeyboardController)  SMASH.KeyboardController.clearFrame();
        if (SMASH.InputManager && SMASH.InputManager.clearFrame) SMASH.InputManager.clearFrame();

        this._raf = requestAnimationFrame(t => this._loop(t));
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
            case 'gameover':  return this._tickGameOver();
        }
    }

    // ── Countdown ────────────────────────────────────────────────

    _tickCountdown(dt) {
        this._countdownTimer--;
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
                this._stats[f.port].falls++;

                // Credit kill to last attacker (if not self)
                const src = f._lastHitBy;
                if (src !== undefined && src !== f.port && this._stats[src]) {
                    this._stats[src].kills++;
                }

                // KO notification
                this._koAlpha = 1.0;
                this._koMsg   = f.stocks > 0
                    ? `P${f.port + 1} lost a stock!`
                    : `P${f.port + 1} eliminated!`;
            }
        }

        // 8. Camera
        this.camera.update(this.fighters, this.stage, dt);

        // 9. Win check
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
                if (atk.tryGrab(tgt)) break;
            }
        }

        // ── Melee hit detection ──────────────────────────────────
        for (const atk of this.fighters) {
            if (!atk.isAlive) continue;
            if (!atk.activeHitbox || !atk.activeHitbox.isActive()) continue;

            for (const tgt of this.fighters) {
                if (tgt === atk || !tgt.isAlive || tgt.invincible) continue;
                if (tgt.state === 'grabbed') continue; // Can't hit grabbed fighters (grabber pummels them)
                if (atk.activeHitbox.checkHit(atk, tgt)) {
                    const isSpec = tgt.state !== 'shield' &&
                        (atk.state === 'special' || atk.state === 'ultimate');
                    const isUlt = atk.state === 'ultimate';
                    tgt.takeHit(atk.activeHitbox, atk.facing, isSpec, isUlt);
                    tgt._lastHitBy = atk.port;
                    this._stats[atk.port].damageDealt += atk.activeHitbox.damage;

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

    _checkGameOver() {
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
                case 1: this._restart();        break;      // Restart
                case 2: this._exit('menu');     break;      // Quit
            }
        }
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
        }

        this.projMgr.clear();
        this.ultMgr = new SMASH.UltimateManager();

        // Re-link AI context
        for (const p of this.players) {
            if (p.controller instanceof SMASH.AIController) {
                p.controller.setContext(this.fighters, this.stage, this.projMgr.list);
            }
        }

        this._initStats();
        this.state           = 'countdown';
        this._countdownTimer = 195;
        this._winner         = null;
        this._menuIdx        = 0;
        this._matchTime      = 0;
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

        // Stage (background layers + platforms)
        this.stage.render(ctx, cam);

        // Projectiles
        this.projMgr.render(ctx, cam);

        // Fighters
        for (const f of this.fighters) f.render(ctx, cam);

        // HUD
        this.hud.render(ctx, this.players, this._matchTime);

        // Ultimate cutscene overlay
        this.ultMgr.render(ctx);

        // KO flash
        if (this._koAlpha > 0) this._renderKO(ctx);

        // State overlays
        if (this.state === 'countdown') this._renderCountdown(ctx);
        if (this.state === 'paused')    this._renderPause(ctx);
        if (this.state === 'gameover')  this._renderGameOver(ctx);
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

    // ── Game-over overlay ────────────────────────────────────────

    _renderGameOver(ctx) {
        ctx.save();

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // Winner banner
        if (this._winner) {
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

        // Menu options
        this._renderMenu(ctx, GAMEOVER_OPTS, S.W / 2, S.H - 150);

        ctx.restore();
    }

    // ── Stats table ──────────────────────────────────────────────

    _renderStats(ctx, cx, topY) {
        const ports = Object.keys(this._stats).map(Number).sort();
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
}

SMASH.Game = Game;
})();
