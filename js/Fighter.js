/**
 * Fighter.js — State machine, attacks, shield, focus-armor, rendering.
 */
(function() {
const S      = SMASH.Settings;
const Hitbox = SMASH.Hitbox;
const Hurtbox= SMASH.Hurtbox;

// ── States ───────────────────────────────────────────────────────────
const ST = {
    IDLE:       'idle',
    WALK:       'walk',
    RUN:        'run',
    JUMPSQUAT:  'jumpsquat',
    AIRBORNE:   'airborne',
    ATTACK:     'attack',
    SPECIAL:    'special',
    HITSTUN:    'hitstun',
    HELPLESS:   'helpless',
    SHIELD:     'shield',
    SHIELD_STUN:'shield_stun',
    FOCUS:      'focus',
    ULTIMATE:   'ultimate',
    LEDGE_HANG: 'ledge_hang',
    GRABBING:   'grabbing',
    GRABBED:    'grabbed',
    DEAD:       'dead',
};

class GifSprite {
    constructor(src, onReady) {
        this.src = src;
        this.onReady = onReady;
        this.ready = false;
        this.frames = [];
        this.frameIndex = 0;
        this.accMs = 0;
        this.totalDurationMs = 0;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this._load();
    }

    async _load() {
        if (GifSprite._cache[this.src]) {
            const cached = GifSprite._cache[this.src];
            this.canvas.width = cached.width;
            this.canvas.height = cached.height;
            this.frames = cached.frames;
            this.totalDurationMs = cached.totalDurationMs;
            this._renderFrame(0);
            this.ready = true;
            if (this.onReady) this.onReady();
            return;
        }
        if (!window.gifuct || !window.gifuct.parseGIF || !window.gifuct.decompressFrames) {
            console.warn('gifuct-js not available; cannot animate GIF:', this.src);
            return;
        }
        try {
            const res = await fetch(this.src);
            const buf = await res.arrayBuffer();
            const gif = window.gifuct.parseGIF(buf);
            const frames = window.gifuct.decompressFrames(gif, true);
            if (!frames || frames.length === 0) return;

            const w = gif.lsd && gif.lsd.width ? gif.lsd.width : frames[0].dims.width;
            const h = gif.lsd && gif.lsd.height ? gif.lsd.height : frames[0].dims.height;
            this.canvas.width = w;
            this.canvas.height = h;
            this.frames = frames;
            this.totalDurationMs = frames.reduce((sum, frame) => {
                return sum + this._frameDurationMs(frame);
            }, 0);
            GifSprite._cache[this.src] = {
                width: w,
                height: h,
                frames: frames,
                totalDurationMs: this.totalDurationMs,
            };
            this._renderFrame(0);
            this.ready = true;
            if (this.onReady) this.onReady();
        } catch (err) {
            console.warn('Failed to load GIF sprite:', this.src, err);
        }
    }

    _frameDurationMs(frame) {
        const delay = frame && frame.delay ? frame.delay : 100;
        return Math.max(20, delay);
    }

    _renderFrame(index) {
        const frame = this.frames[index];
        if (!frame) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const imgData = new ImageData(frame.patch, frame.dims.width, frame.dims.height);
        this.ctx.putImageData(imgData, frame.dims.left, frame.dims.top);
    }

    update(dt) {
        if (!this.ready || this.frames.length <= 1) return;
        this.accMs += dt * 1000;
        let cur = this.frames[this.frameIndex];
        let curDur = this._frameDurationMs(cur);
        while (this.accMs >= curDur) {
            this.accMs -= curDur;
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
            this._renderFrame(this.frameIndex);
            cur = this.frames[this.frameIndex];
            curDur = this._frameDurationMs(cur);
        }
    }
}

GifSprite._cache = {};

GifSprite.preload = async function (sources) {
    if (!window.gifuct || !window.gifuct.parseGIF || !window.gifuct.decompressFrames) return;
    const list = Array.isArray(sources) ? sources : [];
    for (const src of list) {
        if (!src || GifSprite._cache[src]) continue;
        try {
            const res = await fetch(src);
            const buf = await res.arrayBuffer();
            const gif = window.gifuct.parseGIF(buf);
            const frames = window.gifuct.decompressFrames(gif, true);
            if (!frames || frames.length === 0) continue;
            const w = gif.lsd && gif.lsd.width ? gif.lsd.width : frames[0].dims.width;
            const h = gif.lsd && gif.lsd.height ? gif.lsd.height : frames[0].dims.height;
            const totalDurationMs = frames.reduce((sum, frame) => {
                const delay = frame && frame.delay ? frame.delay : 100;
                return sum + Math.max(20, delay);
            }, 0);
            GifSprite._cache[src] = { width: w, height: h, frames, totalDurationMs };
        } catch (err) {
            console.warn('Failed to preload GIF:', src, err);
        }
    }
};

SMASH.preloadGifs = function (sources) {
    if (GifSprite && GifSprite.preload) {
        GifSprite.preload(sources);
    }
};

const LOCKED = new Set([
    ST.ATTACK, ST.SPECIAL, ST.HITSTUN, ST.HELPLESS,
    ST.ULTIMATE, ST.JUMPSQUAT, ST.SHIELD_STUN, ST.FOCUS, ST.LEDGE_HANG,
    ST.GRABBING, ST.GRABBED,
]);

class Fighter {
    constructor(port, data, spawnX, spawnY) {
        this.port  = port;
        this.data  = data;

        // Physics
        this.x  = spawnX || 400;
        this.y  = spawnY || 300;
        this.vx = 0;
        this.vy = 0;
        this.prevY    = this.y;
        this.grounded = false;
        this.fastFalling   = false;
        this.droppingThru  = false;
        this.facing   = 1;   // +1 right, -1 left
        this.width    = data.width;
        this.height   = data.height;

        // Combat
        this.damagePercent  = 0;
        this.ultimateMeter  = 0;
        this._ultimateCooldown = 0;
        this.stocks         = S.DEFAULT_STOCKS;
        this.invincible     = false;
        this._invFrames     = 0;

        // State machine
        this.state      = ST.IDLE;
        this._stateTimer = 0;

        // Jumps
        this.jumpsRemaining = data.maxJumps;

        // Attack
        this.currentAttack = null;
        this.activeHitbox  = null;
        this._atkPhase     = 'startup';
        this._atkTimer     = 0;
        this._projSpawned  = false;

        // Hitstun
        this.hitstunFrames = 0;

        // Shield
        this.shieldHP = S.SHIELD_MAX_HP;

        // Focus / super-armor
        this._armorHitsLeft = 0;
        this._focusDamageStored = 0;

        // Reduced stun tracking — consecutive hits decay hitstun
        this._consecutiveHits = 0;
        this._stunDecayTimer  = 0;   // frames since last hit

        // Hurtbox (separate from hitbox!)
        this.hurtbox = new Hurtbox(this);

        // Spawn memory
        this._spawnX = spawnX || 400;
        this._spawnY = spawnY || 300;
        
        // Input direction tracking for arrow display
        this.inputDirection = { x: 0, y: 0 };
        
        // Ledge grab tracking
        this.ledgeHangTimer = 0;
        this.grabbedLedge = null;  // {x, y} of ledge position
        
        // Grabbed state (for displaying "grabbed" text)
        this.isGrabbed = false;
        this.grabbedByPort = -1;
        
        // Grab mechanic
        this.grabTarget = null;      // reference to fighter being grabbed
        this.grabHitsDealt = 0;      // pummel hits dealt while grabbing
        this.grabTimer = 0;          // frames spent in grab state
        this.grabbedEscapeTimer = 0; // frames spent being grabbed (auto-escape)
        this._grabHitsReceived = 0;  // pummel hits received (for display)

        // Slippery debuff
        this.slipperyTimer = 0;      // frames remaining of slippery effect

        // Squish debuff (slow + sprite squash)
        this._squishTimer = 0;
        this._squishSpeedMult = 1.0;
        this._squishScaleX = 1.0;
        this._squishScaleY = 1.0;

        // Alfgar belly-flop state
        this._alfgarBellyFlopRotate = false;
        this._alfgarBellyFlopSlam = false;
        this._landedPlatform = null;

        // Damage multiplier (for Fazbear's stacking ultimate)
        this.damageMultiplier = 1.0;
        this.boostedHitsLeft = 0;  // hits remaining before multiplier resets

        // Vaughan-specific evolution state
        this._ultimatesUsed = 0;
        this._vaughanVonForm = false;
        this._pendingVaughanTransformCutscene = false;

        // Sahur side-special charge state
        this._sahurChargeFrames = 0;
        this._sahurChargeRatio = 0;
        this._sahurFullChargeFlash = 0;
        this._sahurFullChargeTriggered = false;
        this._pendingTempSpriteOnHit = null;
        this._delayHitAudio = null;
        this._delayHitReady = false;
        this._delayHitSpriteTimer = 0;
        this._sahurChargeLoopAudio = null;
        this._sahurSideReleaseAudio = null;
        if (this.data.key === 'sahur') {
            this._sahurChargeLoopAudio = new Audio('assets/Sahur_soundeffect.mp3');
            this._sahurChargeLoopAudio.loop = true;
            this._sahurChargeLoopAudio.preload = 'auto';
            this._sahurChargeLoopAudio.volume = 0.7;
            this._sahurSideReleaseAudio = new Audio('assets/Sahur_soundeffect2.mp3');
            this._sahurSideReleaseAudio.preload = 'auto';
            this._sahurSideReleaseAudio.volume = 0.92;
        }

        // Ultra Lazer charge state
        this._ultraChargeFrames = 0;
        this._ultraChargeRatio = 0;
        this._ultraChargeAttack = null;
        this._ultraChargeDamage = null;
        this._ultraChargeBaseKB = null;
        this._ultraChargeSizeMult = 1;
        this._ultraChargeSpriteActive = false;
        this._ultraChargeLoopAudio = null;
        this._ultraChargeReleaseAudio = null;
        if (this.data.key === 'ultra_lazer' || this.data.key === 'super_perfect_cell') {
            this._ultraChargeLoopAudio = new Audio('assets/UltraLazer_soundeffect neutral charge.mp3');
            this._ultraChargeLoopAudio.loop = true;
            this._ultraChargeLoopAudio.preload = 'auto';
            this._ultraChargeLoopAudio.volume = 0.8;
            this._ultraChargeReleaseAudio = new Audio('assets/UltraLazer_soundeffect fire.mp3');
            this._ultraChargeReleaseAudio.preload = 'auto';
            this._ultraChargeReleaseAudio.volume = 0.9;
        }

        this._chargedUltThisAttack = false;

        // Stamina mode
        this.staminaHP    = 0;   // 0 = not stamina mode
        this.maxStaminaHP = 0;

        // Team assignment (-1 = no team, 0 = red, 1 = blue)
        this.team = -1;

        // Last-hit metadata for KO SFX routing
        this._lastHitWasSpecial = false;

        // Temporary sprite override (e.g., special hit visuals)
        this._tempSpriteTimer = 0;
        this._tempSpriteRestore = null;
        this._pendingTempSpriteOnHit = null;
        this._gifSprite = null;
        this._gifDomImage = null;
        this._delayHitAudio = null;
        this._delayHitReady = false;
        this._delayHitSpriteTimer = 0;
    }

    _canPlaySfx() {
        return !SMASH.SFX || !SMASH.SFX.isEnabled || SMASH.SFX.isEnabled();
    }

    // ── Properties ───────────────────────────────────────────────
    get isAlive()    { return this.stocks > 0; }
    get canAct()     { return !LOCKED.has(this.state); }
    get isAirborne() { return !this.grounded; }

    // ── Main per-frame update ────────────────────────────────────
    update(inp, dt) {
        let event = null;
        
        // Track input direction for arrow display
        this.inputDirection = { x: inp.moveX || 0, y: inp.moveY || 0 };

        // Invincibility countdown
        if (this._invFrames > 0) {
            this._invFrames--;
            this.invincible = this._invFrames > 0;
        }

        if (this._gifSprite) this._gifSprite.update(dt);

        // Temporary sprite override countdown (seconds)
        if (this._tempSpriteTimer > 0) {
            this._tempSpriteTimer = Math.max(0, this._tempSpriteTimer - dt);
            if (this._tempSpriteTimer === 0) this._restoreTempSprite();
        }

        // Ultimate cooldown countdown (seconds)
        if (this._ultimateCooldown > 0) {
            this._ultimateCooldown = Math.max(0, this._ultimateCooldown - dt);
        }

        // Slippery countdown
        if (this.slipperyTimer > 0) this.slipperyTimer--;

        if (this._squishTimer > 0) {
            this._squishTimer--;
            if (this._squishTimer <= 0) {
                this._squishSpeedMult = 1.0;
                this._squishScaleX = 1.0;
                this._squishScaleY = 1.0;
            }
        }

        if (this._sahurFullChargeFlash > 0) {
            this._sahurFullChargeFlash = Math.max(0, this._sahurFullChargeFlash - 1);
        }

        // Shield regen when not shielding
        if (this.state !== ST.SHIELD && this.state !== ST.SHIELD_STUN) {
            this.shieldHP = Math.min(S.SHIELD_MAX_HP, this.shieldHP + S.SHIELD_REGEN);
        }

        if (this.state === ST.DEAD) return null;

        this.droppingThru = false;

        // ── Dispatch by state ────────────────────────────────────
        switch (this.state) {
            case ST.HITSTUN:     this._tickHistun(); break;
            case ST.ATTACK:
            case ST.SPECIAL:
            case ST.ULTIMATE:    this._tickAttack(inp, dt); break;
            case ST.JUMPSQUAT:   this._tickJumpsquat(); break;
            case ST.HELPLESS:    this._tickHelpless(inp); break;
            case ST.SHIELD_STUN: this._tickShieldStun(); break;
            case ST.FOCUS:       this._tickFocus(inp, dt); break;
            case ST.LEDGE_HANG:  this._tickLedgeHang(inp); break;
            case ST.GRABBING:    this._tickGrabbing(inp); break;
            case ST.GRABBED:     this._tickGrabbed(); break;
            default:
                event = this._tickActionable(inp, dt);
        }

        return event;
    }

    // ── Actionable (idle/walk/run/air/shield) ────────────────────
    _tickActionable(inp, dt) {
        let event = null;
        const mx = inp.moveX;
        const speedMult = this._squishSpeedMult || 1.0;

        // ── Shield ───────────────────────────────────────────────
        if (inp.shield && this.grounded && this.shieldHP > 0) {
            this.state = ST.SHIELD;
            this.vx = 0;
            this.shieldHP -= S.SHIELD_DECAY;
            if (this.shieldHP <= 0) {
                this.shieldHP = 0;
                this.state = ST.SHIELD_STUN;
                this._stateTimer = S.SHIELD_STUN_FRAMES;
            }
            return null;
        }
        if (this.state === ST.SHIELD) {
            if (!inp.shield) this.state = ST.IDLE;
            else {
                this.shieldHP -= S.SHIELD_DECAY;
                if (this.shieldHP <= 0) {
                    this.shieldHP = 0;
                    this.state = ST.SHIELD_STUN;
                    this._stateTimer = S.SHIELD_STUN_FRAMES;
                }
            }
            return null;
        }

        // ── Jump ─────────────────────────────────────────────────
        if (inp.jump && this.jumpsRemaining > 0) {
            if (this.grounded) {
                this.state = ST.JUMPSQUAT;
                this._stateTimer = 3;
                return null;
            } else {
                this.jumpsRemaining--;
                this.vy = -this.data.doubleJumpForce;
                this.fastFalling = false;
                this.state = ST.AIRBORNE;
                return null;
            }
        }

        // ── Attack ───────────────────────────────────────────────
        if (inp.attack) {
            const dir = this._attackDir(inp);
            return this._startAttack(dir, false);
        }

        // ── Special / Ultimate ───────────────────────────────────
        if (inp.special) {
            if (this.ultimateMeter >= S.ULT_MAX && this._ultimateCooldown <= 0) {
                return this._startUltimate();
            }
            const dir = this._attackDir(inp);
            return this._startAttack(dir, true);
        }

        // ── Grab ─────────────────────────────────────────────────
        if (inp.grab && this.grounded) {
            return this._startGrab();
        }

        // ── Fast fall ────────────────────────────────────────────
        if (!this.grounded && inp.moveY > 0.5 && this.vy > 0) {
            this.fastFalling = true;
        }

        // ── Drop through ────────────────────────────────────────
        if (this.grounded && inp.moveY > 0.7) {
            this.droppingThru = true;
            this.grounded = false;
            this.y += 4;
        }

        // ── Movement ─────────────────────────────────────────────
        if (this.grounded) {
            if (Math.abs(mx) > 0.1) {
                this.facing = mx > 0 ? 1 : -1;
                const spd = (Math.abs(mx) < 0.7 ? this.data.walkSpeed : this.data.runSpeed) * speedMult;
                this.vx = mx * spd;
                this.state = Math.abs(mx) < 0.7 ? ST.WALK : ST.RUN;
            } else {
                this.state = ST.IDLE;
            }
        } else {
            this.state = ST.AIRBORNE;
            // Enhanced air control - more responsive directional movement
            if (Math.abs(mx) > 0.1) {
                this.facing = mx > 0 ? 1 : -1;
                // Direct air control with smooth transition
                const targetVx = mx * this.data.airSpeed * speedMult;
                this.vx = this.vx * 0.85 + targetVx * 0.15;
            }
            
            // Vertical air control (move_y for up/down drift)
            if (Math.abs(inp.moveY) > 0.1) {
                // Up input: slight upward drift
                if (inp.moveY < 0) {
                    this.vy -= this.data.airSpeed * 0.3 * dt;
                }
                // Down input: faster fall (beyond fast-fall)
                else if (inp.moveY > 0 && this.vy > 0) {
                    this.vy += this.data.airSpeed * 0.5 * dt;
                }
            }
        }

        return event;
    }

    // ── Attack helpers ───────────────────────────────────────────
    _attackDir(inp) {
        if (Math.abs(inp.moveY) > 0.5)
            return inp.moveY < 0 ? 'up' : 'down';
        if (Math.abs(inp.moveX) > 0.5)
            return this.grounded ? 'side' : 'forward';
        return 'neutral';
    }

    _startAttack(direction, isSpecial) {
        let key;
        if (isSpecial) {
            if (direction === 'side' || direction === 'forward') key = 'side_special';
            else if (direction === 'up')   key = 'up_special';
            else if (direction === 'down') key = 'down_special';
            else key = 'neutral_special';
        } else {
            if (this.isAirborne) {
                if (direction === 'forward' || direction === 'side') key = 'forward_air';
                else if (direction === 'up')   key = 'up_air';
                else if (direction === 'down') key = 'down_air';
                else key = 'neutral_air';
            } else {
                if (direction === 'side')      key = 'side_attack';
                else if (direction === 'up')   key = 'up_attack';
                else if (direction === 'down') key = 'down_attack';
                else key = 'neutral_attack';
            }
        }

        const atk = this.data.attacks[key];
        if (!atk) return null;

        this._stopSahurChargeLoopAudio();
        this._sahurChargeFrames = 0;
        this._sahurChargeRatio = 0;
        this._sahurFullChargeFlash = 0;
        this._sahurFullChargeTriggered = false;
        this._chargedUltThisAttack = false;
        this._stopUltraChargeLoopAudio();
        this._ultraChargeFrames = 0;
        this._ultraChargeRatio = 0;
        this._ultraChargeAttack = null;
        this._ultraChargeDamage = null;
        this._ultraChargeBaseKB = null;
        this._ultraChargeSizeMult = 1;
        this._chargedUltThisAttack = false;
        if (this._ultraChargeSpriteActive) {
            this._tempSpriteTimer = 0;
            this._restoreTempSprite();
            this._ultraChargeSpriteActive = false;
        }

        this.currentAttack = atk;
        this._atkPhase = 'startup';
        this._atkTimer = atk.startupFrames;
        this.activeHitbox = null;
        this._projSpawned = false;

        let sfxAudio = null;

        if (atk.tempSprite) {
            if (atk.tempSpriteOnHit) {
                this._pendingTempSpriteOnHit = {
                    src: atk.tempSprite,
                    duration: atk.tempSpriteDuration || 0,
                    audio: null,
                };
            } else {
                this._applyTempSprite(atk.tempSprite, atk.tempSpriteDuration || 0, null);
            }
        }

        if (atk.delayHitUntilSpriteEnd) {
            const fallbackMs = Math.max(0, (atk.tempSpriteDuration || 0) * 1000);
            this._delayHitSpriteTimer = fallbackMs;
        } else {
            this._delayHitSpriteTimer = 0;
        }

        if ((this.data.key === 'alfgar' || this.data.key === 'ultra_lazer' || this.data.key === 'cell' ||
            this.data.key === 'cell_semi' || this.data.key === 'cell_perfect' ||
            this.data.key === 'super_perfect_cell') && key === 'down_special') {
            this._alfgarBellyFlopRotate = true;
        }

        // Focus / super-armor setup
        if (atk.isArmored && atk.armorDuringStartup) {
            this.state = ST.FOCUS;
            this._armorHitsLeft = atk.armorHits || S.FOCUS_ARMOR_HITS;
            this._focusDamageStored = 0;
        } else {
            this.state = isSpecial ? ST.SPECIAL : ST.ATTACK;
        }

        if (atk.invincibleFrames) {
            this._invFrames = Math.max(this._invFrames, atk.invincibleFrames);
            this.invincible = this._invFrames > 0;
        }

        if (this.data.key === 'super_perfect_cell' && key === 'side_special') {
            this._teleportBehindNearestEnemy();
        }

        // Up-B velocity boost (skip Sahur chargeable side-special lunge until release)
        const isSahurChargeSideSpecial =
            this.data.key === 'sahur' &&
            key === 'side_special' &&
            !!atk.chargeable;
        if (!isSahurChargeSideSpecial && atk.boostVY !== undefined) {
            this.vy = atk.boostVY;
            if (atk.boostVX) this.vx += atk.boostVX * this.facing;
        }

        // Sound effect (e.g. Netanyahu side-special)
        if (atk.soundEffect) {
            if (this._canPlaySfx()) {
                try {
                    sfxAudio = new Audio(atk.soundEffect);
                    sfxAudio.play();
                } catch(_) {}
            }
        }

        if (atk.delayHitUntilAudioEnd && sfxAudio) {
            this._delayHitAudio = sfxAudio;
            this._delayHitReady = false;
            sfxAudio.addEventListener('ended', () => {
                this._delayHitReady = true;
            }, { once: true });
        } else {
            this._delayHitAudio = null;
            this._delayHitReady = false;
        }

        if (atk.tempSprite) {
            if (atk.tempSpriteOnHit) {
                if (this._pendingTempSpriteOnHit) this._pendingTempSpriteOnHit.audio = sfxAudio;
            } else {
                this._applyTempSprite(atk.tempSprite, atk.tempSpriteDuration || 0, sfxAudio);
            }
        }

        if (isSpecial && SMASH.SFX && !atk.suppressDefaultSpecialSfx) {
            if (key === 'down_special') SMASH.SFX.playDownSpecial();
            if (key === 'up_special') SMASH.SFX.playUpSpecial();
            if (this.data.key === 'trump' && key === 'neutral_special') {
                SMASH.SFX.playTrump();
            }
        }

        return null;
    }

    _teleportBehindNearestEnemy() {
        const fighters = this._arenaFighters || [];
        let target = null;
        let bestDist = Infinity;
        for (const f of fighters) {
            if (!f || f === this || !f.isAlive) continue;
            if (this.team >= 0 && f.team >= 0 && f.team === this.team) continue;
            const dx = (f.x + f.width / 2) - (this.x + this.width / 2);
            const dy = (f.y + f.height / 2) - (this.y + this.height / 2);
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
                bestDist = dist;
                target = f;
            }
        }
        if (!target) return;

        const behindOffset = 8;
        const behindX = target.facing === 1
            ? target.x - this.width - behindOffset
            : target.x + target.width + behindOffset;
        this.x = behindX;
        this.y = target.y;
        this.vx = 0;
        this.vy = 0;
        this.facing = target.facing;
    }

    _startUltimate() {
        const ult = this.data.ultimateAttack;
        if (!ult || ult.disableUltimate) {
            return null;
        }
        this.ultimateMeter = 0;
        this._ultimateCooldown = S.ULT_COOLDOWN_SECONDS;
        if (ult) {
            this.currentAttack = ult;
            this._atkPhase = 'startup';
            this._atkTimer = ult.startupFrames;
        }
        this.state = ST.ULTIMATE;
        return { type: 'ultimate', port: this.port };
    }

    _setAudioPitch(audio, rate) {
        if (!audio) return;
        const r = Math.max(0.5, Math.min(3.0, rate));
        audio.playbackRate = r;
        try { audio.preservesPitch = false; } catch(_) {}
        try { audio.mozPreservesPitch = false; } catch(_) {}
        try { audio.webkitPreservesPitch = false; } catch(_) {}
    }

    _applyTempSprite(src, duration, audio) {
        if (!src) return;
        const useAudio = !!audio;
        if (!useAudio && duration <= 0) return;
        if (!this._tempSpriteRestore) {
            this._tempSpriteRestore = {
                idleSprite: this.data.idleSprite,
                spriteImage: this.data.spriteImage,
                spriteLoaded: this.data.spriteLoaded,
            };
        }

        this.data.idleSprite = src;
        this.data.spriteLoaded = false;

        const isGif = typeof src === 'string' && src.toLowerCase().endsWith('.gif');
        if (isGif && window.gifuct) {
            const gifSprite = new GifSprite(src, () => {
                this.data.spriteLoaded = true;
                if (this._delayHitSpriteTimer > 0 && gifSprite.totalDurationMs > 0) {
                    this._delayHitSpriteTimer = Math.max(this._delayHitSpriteTimer, gifSprite.totalDurationMs);
                }
            });
            this._gifSprite = gifSprite;
            this._gifDomImage = null;
            this.data.spriteImage = gifSprite.canvas;
        } else if (isGif) {
            const img = document.createElement('img');
            img.style.position = 'absolute';
            img.style.left = '-10000px';
            img.style.top = '-10000px';
            img.style.width = '1px';
            img.style.height = '1px';
            img.style.opacity = '0';
            img.style.pointerEvents = 'none';
            document.body.appendChild(img);
            this._gifSprite = null;
            this._gifDomImage = img;
            this.data.spriteImage = img;
            this.data.spriteImage.onload = () => { this.data.spriteLoaded = true; };
            this.data.spriteImage.onerror = () => {
                console.warn(`Failed to load sprite: ${src}`);
                this.data.spriteLoaded = false;
            };
            this.data.spriteImage.src = this.data.idleSprite;
        } else {
            this._gifSprite = null;
            this._gifDomImage = null;
            this.data.spriteImage = new Image();
            this.data.spriteImage.onload = () => { this.data.spriteLoaded = true; };
            this.data.spriteImage.onerror = () => {
                console.warn(`Failed to load sprite: ${src}`);
                this.data.spriteLoaded = false;
            };
            this.data.spriteImage.src = this.data.idleSprite;
        }
        this._tempSpriteTimer = duration;

        if (useAudio) {
            const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
            if (audioDuration > 0) this._tempSpriteTimer = audioDuration;
            audio.addEventListener('ended', () => {
                if (this._tempSpriteTimer > 0) {
                    this._tempSpriteTimer = 0;
                    this._restoreTempSprite();
                }
            }, { once: true });
        }
    }

    _restoreTempSprite() {
        if (!this._tempSpriteRestore) return;
        this.data.idleSprite = this._tempSpriteRestore.idleSprite;
        this.data.spriteImage = this._tempSpriteRestore.spriteImage;
        this.data.spriteLoaded = this._tempSpriteRestore.spriteLoaded;
        this._tempSpriteRestore = null;
        this._gifSprite = null;
        if (this._gifDomImage && this._gifDomImage.parentNode) {
            this._gifDomImage.parentNode.removeChild(this._gifDomImage);
        }
        this._gifDomImage = null;
    }

    _startSahurChargeLoopAudio() {
        const a = this._sahurChargeLoopAudio;
        if (!a) return;
        if (!this._canPlaySfx()) {
            this._stopSahurChargeLoopAudio();
            return;
        }
        this._setAudioPitch(a, 1.0 + this._sahurChargeRatio * 1.25);
        if (a.paused) {
            const p = a.play();
            if (p && p.catch) p.catch(() => {});
        }
    }

    _updateSahurChargeLoopAudio() {
        const a = this._sahurChargeLoopAudio;
        if (!a) return;
        this._setAudioPitch(a, 1.0 + this._sahurChargeRatio * 1.25);
    }

    _stopSahurChargeLoopAudio() {
        const a = this._sahurChargeLoopAudio;
        if (!a) return;
        a.pause();
        a.currentTime = 0;
        this._setAudioPitch(a, 1.0);
    }

    _playSahurSideReleaseAudio() {
        const a = this._sahurSideReleaseAudio;
        if (!a) return;
        if (!this._canPlaySfx()) return;
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
    }

    _startUltraChargeLoopAudio() {
        const a = this._ultraChargeLoopAudio;
        if (!a) return;
        if (!this._canPlaySfx()) {
            this._stopUltraChargeLoopAudio();
            return;
        }
        if (a.paused) {
            const p = a.play();
            if (p && p.catch) p.catch(() => {});
        }
    }

    _stopUltraChargeLoopAudio() {
        const a = this._ultraChargeLoopAudio;
        if (!a) return;
        a.pause();
        a.currentTime = 0;
    }

    _playUltraChargeReleaseAudio() {
        const a = this._ultraChargeReleaseAudio;
        if (!a) return;
        if (!this._canPlaySfx()) return;
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
    }

    _tickAttack(inp, dt) {
        const tickDt = typeof dt === 'number' ? dt : 0;
        const isSahurSideCharge =
            this.data.key === 'sahur' &&
            this.state === ST.SPECIAL &&
            this.currentAttack &&
            this.currentAttack === this.data.attacks['side_special'] &&
            this._atkPhase === 'startup' &&
            !!this.currentAttack.chargeable;

        const isUltraChargeNeutral =
            (this.data.key === 'ultra_lazer' || this.data.key === 'super_perfect_cell') &&
            this.state === ST.SPECIAL &&
            this.currentAttack &&
            this.currentAttack === this.data.attacks['neutral_special'] &&
            this._atkPhase === 'startup' &&
            !!this.currentAttack.chargeable;

        if (isSahurSideCharge) {
            const maxFrames = Math.max(1, this.currentAttack.maxChargeFrames || 120);
            this._sahurChargeFrames = Math.min(maxFrames, this._sahurChargeFrames + 1);
            this._sahurChargeRatio = this._sahurChargeFrames / maxFrames;

            // Allow movement while charging before release.
            const mx = inp ? (inp.moveX || 0) : 0;
            if (Math.abs(mx) > 0.1) {
                this.facing = mx > 0 ? 1 : -1;
                const moveSpd = this.grounded ? this.data.walkSpeed * 0.85 : this.data.airSpeed * 0.75;
                this.vx = mx * moveSpd;
            } else {
                this.vx *= this.grounded ? 0.65 : 0.9;
                if (Math.abs(this.vx) < 4) this.vx = 0;
            }

            if (this._sahurChargeFrames >= maxFrames && !this._sahurFullChargeTriggered) {
                this._sahurFullChargeTriggered = true;
                this._sahurFullChargeFlash = 14;
            }

            const holdingSpecial = !!(inp && (inp.specialHeld || inp.special));
            if (holdingSpecial) {
                this._startSahurChargeLoopAudio();
                this._updateSahurChargeLoopAudio();
            }
            const shouldRelease = !holdingSpecial || this._sahurChargeFrames >= maxFrames;
            if (shouldRelease) {
                this._atkTimer = 0;
                this._stopSahurChargeLoopAudio();
                this._playSahurSideReleaseAudio();
            }
        } else if (isUltraChargeNeutral) {
            const maxFrames = Math.max(1, this.currentAttack.maxChargeFrames || 120);
            this._ultraChargeFrames = Math.min(maxFrames, this._ultraChargeFrames + 1);
            this._ultraChargeRatio = this._ultraChargeFrames / maxFrames;

            const holdingSpecial = !!(inp && (inp.specialHeld || inp.special));
            if (holdingSpecial) {
                this._startUltraChargeLoopAudio();
                if (!this._ultraChargeSpriteActive && this.currentAttack.chargeSprite) {
                    this._applyTempSprite(this.currentAttack.chargeSprite, 999, null);
                    this._ultraChargeSpriteActive = true;
                }
            }

            const shouldRelease = !holdingSpecial || this._ultraChargeFrames >= maxFrames;
            if (shouldRelease) {
                this._atkTimer = 0;
                this._stopUltraChargeLoopAudio();
                this._playUltraChargeReleaseAudio();
                this._ultraChargeAttack = this.currentAttack;

                const minDmg = (this.currentAttack.chargeDamageMin != null)
                    ? this.currentAttack.chargeDamageMin
                    : (this.currentAttack.projDamage || this.currentAttack.damage || 0);
                const maxDmg = (this.currentAttack.chargeDamageMax != null)
                    ? this.currentAttack.chargeDamageMax
                    : minDmg;
                this._ultraChargeDamage = minDmg + (maxDmg - minDmg) * this._ultraChargeRatio;

                const minKB = this.currentAttack.chargeBaseKBMin;
                const maxKB = this.currentAttack.chargeBaseKBMax;
                if (minKB != null && maxKB != null) {
                    this._ultraChargeBaseKB = minKB + (maxKB - minKB) * this._ultraChargeRatio;
                } else {
                    this._ultraChargeBaseKB = null;
                }

                const minSize = this.currentAttack.chargeSizeMin || 1;
                const maxSize = this.currentAttack.chargeSizeMax || minSize;
                this._ultraChargeSizeMult = minSize + (maxSize - minSize) * this._ultraChargeRatio;

                if (this._ultraChargeSpriteActive) {
                    this._tempSpriteTimer = 0;
                    this._restoreTempSprite();
                    this._ultraChargeSpriteActive = false;
                }
            }
        } else {
            this._stopSahurChargeLoopAudio();
            this._stopUltraChargeLoopAudio();
            if (this._atkPhase === 'startup') {
                if (this._delayHitSpriteTimer > 0) {
                    this._delayHitSpriteTimer = Math.max(0, this._delayHitSpriteTimer - tickDt * 1000);
                    if (this._delayHitSpriteTimer === 0) this._atkTimer = 0;
                } else if (this._delayHitAudio) {
                    if (this._delayHitReady) {
                        this._delayHitAudio = null;
                        this._atkTimer = 0;
                    }
                } else {
                    this._atkTimer--;
                }
            } else {
                this._atkTimer--;
            }
        }

        if (this._atkPhase === 'startup') {
            if (this._atkTimer <= 0) {
                this._atkPhase = 'active';
                this._atkTimer = this.currentAttack.activeFrames;
                this.activeHitbox = Hitbox.fromAttack(this.port, this.currentAttack);

                // Apply damage multiplier (for Fazbear's stacking ultimate)
                if (this.activeHitbox && this.damageMultiplier !== 1.0) {
                    this.activeHitbox.damage *= this.damageMultiplier;
                    this.activeHitbox.baseKB *= this.damageMultiplier;
                }

                // Sahur's charged bat swing scales with hold duration.
                if (this.activeHitbox && this.data.key === 'sahur' &&
                    this.currentAttack === this.data.attacks['side_special']) {
                    const charge = this._sahurChargeRatio || 0;
                    const fullChargeDamage = 175;
                    const baseDamage = this.currentAttack.damage || this.activeHitbox.damage;
                    this.activeHitbox.damage = baseDamage + (fullChargeDamage - baseDamage) * charge;
                    this.activeHitbox.baseKB *= (1 + charge * 2.2);
                    this.activeHitbox.kbScaling *= (1 + charge * 0.55);
                }

                // Vaughan's Von form boosts only normal + special attacks.
                if (this.activeHitbox && this._vaughanVonForm && this.state !== ST.ULTIMATE) {
                    this.activeHitbox.damage *= 5;
                    this.activeHitbox.baseKB *= 5;
                }

                // Counter: boost damage with stored absorbed damage
                if (this.currentAttack.isCounter && this._focusDamageStored > 0 && this.activeHitbox) {
                    const bonus = this._focusDamageStored * 1.3;
                    this.activeHitbox.damage += bonus;
                    this.activeHitbox.baseKB += bonus * 2;
                }

                // Ult-charge special (e.g. Reel in Cash)
                if (this.currentAttack.chargesUlt) {
                    this.ultimateMeter = Math.min(S.ULT_MAX,
                        this.ultimateMeter + this.currentAttack.chargesUlt);
                    if (SMASH.SFX && SMASH.SFX.playCharge) {
                        SMASH.SFX.playCharge(this.data.key);
                    }
                }

                if (this.currentAttack.healsPercent) {
                    this.damagePercent = Math.max(0,
                        this.damagePercent - this.currentAttack.healsPercent);
                }

                // Transition focus → attack state for active phase
                if (this.state === ST.FOCUS) {
                    this._armorHitsLeft = 0;
                    this.state = ST.ATTACK;
                }
            }
        } else if (this._atkPhase === 'active') {
            if (this.activeHitbox) this.activeHitbox.tick();
            if (this._atkTimer <= 0) {
                this._atkPhase = 'endlag';
                this._atkTimer = this.currentAttack.endlagFrames;
                this.activeHitbox = null;
            }
        } else if (this._atkPhase === 'endlag') {
            if (this._atkTimer <= 0) {
                this._endAttack();
            }
        }
    }

    // Focus state = startup with super armor
    _tickFocus(inp, dt) {
        this._tickAttack(inp, dt);
    }

    _endAttack() {
        const wasUpB = this.currentAttack &&
            this.currentAttack === this.data.attacks['up_special'];

        // Apply damage boost from ultimate (e.g. Fazbear's stacking boost)
        if (this.state === ST.ULTIMATE && this.currentAttack && this.currentAttack.damageBoostMultiplier) {
            this.damageMultiplier *= this.currentAttack.damageBoostMultiplier;
        }

        this.currentAttack = null;
        this.activeHitbox  = null;
        this._stopSahurChargeLoopAudio();
        this._sahurChargeFrames = 0;
        this._sahurChargeRatio = 0;
        this._sahurFullChargeFlash = 0;
        this._sahurFullChargeTriggered = false;
        this._stopUltraChargeLoopAudio();
        this._ultraChargeFrames = 0;
        this._ultraChargeRatio = 0;
        this._ultraChargeAttack = null;
        this._ultraChargeDamage = null;
        this._ultraChargeBaseKB = null;
        this._ultraChargeSizeMult = 1;
        if (this._ultraChargeSpriteActive) {
            this._tempSpriteTimer = 0;
            this._restoreTempSprite();
            this._ultraChargeSpriteActive = false;
        }

        if (this.state === ST.ULTIMATE) {
            this.state = this.grounded ? ST.IDLE : ST.AIRBORNE;
        } else if (wasUpB && !this.grounded) {
            this.state = ST.HELPLESS;
        } else {
            this.state = this.grounded ? ST.IDLE : ST.AIRBORNE;
        }
    }

    // ── Hitstun ──────────────────────────────────────────────────
    _tickHistun() {
        this.hitstunFrames--;
        this._stunDecayTimer++;
        // Reset combo counter after 60 frames without being hit again
        if (this._stunDecayTimer > 60) this._consecutiveHits = 0;
        if (this.hitstunFrames <= 0)
            this.state = this.grounded ? ST.IDLE : ST.AIRBORNE;
    }

    // ── Jumpsquat ────────────────────────────────────────────────
    _tickJumpsquat() {
        this._stateTimer--;
        if (this._stateTimer <= 0) {
            this.jumpsRemaining--;
            this.vy = -this.data.jumpForce;
            this.grounded = false;
            this.state = ST.AIRBORNE;
        }
    }

    // ── Helpless ─────────────────────────────────────────────────
    _tickHelpless(inp) {
        if (Math.abs(inp.moveX) > 0.1)
            this.vx += inp.moveX * this.data.airSpeed * 0.02;
        if (this.grounded) this.state = ST.IDLE;
    }
    
    // ── Ledge hang ───────────────────────────────────────────────
    _tickLedgeHang(inp) {
        this.ledgeHangTimer++;
        
        // Auto-drop after 3 seconds
        if (this.ledgeHangTimer >= 180) {
            this._releaseLedge();
            return;
        }
        
        // Hold position at ledge
        if (this.grabbedLedge) {
            this.x = this.grabbedLedge.x;
            this.y = this.grabbedLedge.y;
            this.vx = 0;
            this.vy = 0;
        }
        
        // Jump from ledge
        if (inp.jump) {
            this._releaseLedge();
            this.state = ST.AIRBORNE;
            this.vy = -this.data.jumpForce;
            this.jumpsRemaining = this.data.maxJumps - 1;
            return;
        }
        
        // Drop from ledge (down input)
        if (inp.moveY > 0.5) {
            this._releaseLedge();
            this.state = ST.AIRBORNE;
            return;
        }
    }
    
    _releaseLedge() {
        this.grabbedLedge = null;
        this.ledgeHangTimer = 0;
        this.state = ST.AIRBORNE;
    }
    
    checkLedgeGrab(stage) {
        // Only grab while falling and not already hanging
        if (this.vy <= 0 || this.state === ST.LEDGE_HANG) return false;
        
        const GRAB_RANGE = 40;
        const GRAB_HEIGHT = 60;
        
        // Check each solid platform for ledges
        for (const platform of stage.platforms) {
            if (platform.is_passthrough) continue;
            
            const plat = platform.rect;
            const platLeft = plat.x;
            const platRight = plat.x + plat.width;
            const platTop = plat.y;
            
            // Check right ledge (facing left)
            if (this.facing === -1) {
                if (platRight - GRAB_RANGE < this.x + this.width / 2 && 
                    this.x + this.width / 2 < platRight + 20 &&
                    platTop - GRAB_HEIGHT < this.y && this.y < platTop + 20) {
                    this._grabLedge(platRight, platTop);
                    return true;
                }
            }
            // Check left ledge (facing right)  
            else {
                if (platLeft - 20 < this.x + this.width / 2 && 
                    this.x + this.width / 2 < platLeft + GRAB_RANGE &&
                    platTop - GRAB_HEIGHT < this.y && this.y < platTop + 20) {
                    this._grabLedge(platLeft, platTop);
                    return true;
                }
            }
        }
        
        return false;
    }
    
    _grabLedge(ledgeX, ledgeY) {
        this.state = ST.LEDGE_HANG;
        this.grabbedLedge = {
            x: this.facing === 1 ? ledgeX - this.width : ledgeX,
            y: ledgeY - this.height + 10
        };
        this.ledgeHangTimer = 0;
        this.vx = 0;
        this.vy = 0;
        this.jumpsRemaining = this.data.maxJumps;  // Restore jumps
    }

    // ── Shield stun (shield break) ──────────────────────────────
    _tickShieldStun() {
        this._stateTimer--;
        if (this._stateTimer <= 0) {
            this.state = ST.IDLE;
            this.shieldHP = S.SHIELD_MAX_HP * 0.3; // partial regen
        }
    }

    // ── Grab initiation ─────────────────────────────────────────
    _startGrab() {
        this.state = ST.GRABBING;
        this.grabTimer = 0;
        this.grabHitsDealt = 0;
        this.grabTarget = null;
        return { type: 'grab_attempt', port: this.port };
    }

    // ── Grabbing state (attacker side) ──────────────────────────
    _tickGrabbing(inp) {
        this.grabTimer++;
        this.vx = 0; // Can't move while grabbing

        // If we don't have a target yet, we're in the grab lunge
        if (!this.grabTarget) {
            // Grab attempt window: first 10 frames
            if (this.grabTimer > 10) {
                // Whiffed grab — endlag
                this.state = this.grounded ? ST.IDLE : ST.AIRBORNE;
                return;
            }
            return; // Wait for Game.js to assign a target via tryGrab()
        }

        // We have a target — pummel on attack press
        if (inp.attack) {
            this.grabHitsDealt++;
            this.grabTarget._grabHitsReceived = this.grabHitsDealt;
            this.grabTarget.damagePercent += S.GRAB_HIT_DAMAGE;
            this.grabTarget._chargeUlt(S.GRAB_HIT_DAMAGE);
            this.grabTarget._lastHitBy = this.port;

            // After GRAB_HITS_TO_THROW hits, throw the target
            if (this.grabHitsDealt >= S.GRAB_HITS_TO_THROW) {
                this._throwGrabbed();
                return;
            }
        }

        // Auto-release after timeout
        if (this.grabTimer > S.GRAB_ESCAPE_FRAMES) {
            this._releaseGrab();
            return;
        }

        // Hold grabbed fighter in place (in front of grabber)
        if (this.grabTarget) {
            this.grabTarget.x = this.x + this.facing * (this.width + 5);
            this.grabTarget.y = this.y;
            this.grabTarget.vx = 0;
            this.grabTarget.vy = 0;
        }
    }

    // ── Grabbed state (victim side) ─────────────────────────────
    _tickGrabbed() {
        this.grabbedEscapeTimer++;
        this.vx = 0;
        this.vy = 0;

        // Auto-escape safety (in case grabber dies or disconnects)
        if (this.grabbedEscapeTimer > S.GRAB_ESCAPE_FRAMES + 30) {
            this._escapeGrab();
        }
    }

    _throwGrabbed() {
        if (!this.grabTarget) return;

        const tgt = this.grabTarget;
        const angleRad = S.GRAB_THROW_ANGLE * Math.PI / 180;
        tgt.vx = Math.cos(angleRad) * S.GRAB_THROW_KB * this.facing;
        tgt.vy = -Math.sin(angleRad) * S.GRAB_THROW_KB;
        tgt.hitstunFrames = Math.floor(S.GRAB_THROW_KB * S.KB_HITSTUN_FACTOR);
        tgt.state = ST.HITSTUN;
        tgt.isGrabbed = false;
        tgt.grabbedByPort = -1;
        tgt.grabbedEscapeTimer = 0;
        tgt._grabHitsReceived = 0;

        this.grabTarget = null;
        this.grabHitsDealt = 0;
        this.grabTimer = 0;
        this.state = this.grounded ? ST.IDLE : ST.AIRBORNE;
    }

    _releaseGrab() {
        if (this.grabTarget) {
            this.grabTarget.isGrabbed = false;
            this.grabTarget.grabbedByPort = -1;
            this.grabTarget.grabbedEscapeTimer = 0;
            this.grabTarget._grabHitsReceived = 0;
            this.grabTarget.state = this.grabTarget.grounded ? ST.IDLE : ST.AIRBORNE;
        }
        this.grabTarget = null;
        this.grabHitsDealt = 0;
        this.grabTimer = 0;
        this.state = this.grounded ? ST.IDLE : ST.AIRBORNE;
    }

    _escapeGrab() {
        this.isGrabbed = false;
        this.grabbedByPort = -1;
        this.grabbedEscapeTimer = 0;
        this._grabHitsReceived = 0;
        this.state = this.grounded ? ST.IDLE : ST.AIRBORNE;
    }

    /**
     * Called by Game.js to attempt to grab a nearby target.
     * Returns true if grab succeeded.
     */
    tryGrab(target) {
        if (this.state !== ST.GRABBING || this.grabTarget) return false;
        if (!target.isAlive || target.invincible) return false;
        if (target.state === ST.GRABBED || target.state === ST.HITSTUN) return false;

        // Range check
        const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
        const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > S.GRAB_RANGE) return false;
        // Must be facing the target
        if ((dx > 0 && this.facing < 0) || (dx < 0 && this.facing > 0)) return false;

        // Success — grab the target
        this.grabTarget = target;
        target.isGrabbed = true;
        target.grabbedByPort = this.port;
        target.grabbedEscapeTimer = 0;
        target.state = ST.GRABBED;
        target.vx = 0;
        target.vy = 0;
        target.currentAttack = null;
        target.activeHitbox = null;

        return true;
    }

    // ──────────────────────────────────────────────────────────────
    // Hit reception
    // ──────────────────────────────────────────────────────────────
    takeHit(hitbox, attackerFacing, isSpecialHit, isUltimateHit) {
        this._stopSahurChargeLoopAudio();
        this._stopUltraChargeLoopAudio();
        if (this._ultraChargeSpriteActive) {
            this._tempSpriteTimer = 0;
            this._restoreTempSprite();
            this._ultraChargeSpriteActive = false;
        }

        // Play hit + character-specific hurt SFX
        if (SMASH.SFX) SMASH.SFX.playHit(this.data.key);

        this._lastHitWasSpecial = !!isSpecialHit && !isUltimateHit;

        // ── Release grab if we're grabbing someone ───────────────
        if (this.state === ST.GRABBING && this.grabTarget) {
            this._releaseGrab();
        }

        // ── Shield absorption ────────────────────────────────────
        if (this.state === ST.SHIELD) {
            this.shieldHP -= hitbox.damage * 1.2;
            // Pushback
            this.vx = S.SHIELD_PUSHBACK * -attackerFacing;
            if (this.shieldHP <= 0) {
                this.shieldHP = 0;
                this.state = ST.SHIELD_STUN;
                this._stateTimer = S.SHIELD_STUN_FRAMES;
            }
            return;
        }

        // ── Focus / super-armor absorption ───────────────────────
        if ((this.state === ST.FOCUS || this.state === ST.ATTACK) && this._armorHitsLeft > 0) {
            this._armorHitsLeft--;
            // Take damage but no knockback / hitstun
            this.damagePercent += hitbox.damage;
            this._chargeUlt(hitbox.damage);
            this._focusDamageStored += hitbox.damage;
            // Brief visual flash handled in render
            return;
        }

        // ── Normal hit ───────────────────────────────────────────
        this.damagePercent += hitbox.damage;
        this._chargeUlt(hitbox.damage);

        // ── Stamina mode: reduce HP, die at 0 ───────────────────
        if (this.maxStaminaHP > 0) {
            this.staminaHP = Math.max(0, this.staminaHP - hitbox.damage);

            // Small fixed knockback (flinch) instead of scaling KB
            const flinchKB = Math.min(180, hitbox.baseKB * 0.35);
            const angleDeg = hitbox.getLaunchAngle(attackerFacing);
            const angleRad = angleDeg * Math.PI / 180;
            this.vx = Math.cos(angleRad) * flinchKB;
            this.vy = -Math.sin(angleRad) * flinchKB;

            this.hitstunFrames = Math.min(15, Math.floor(flinchKB * S.KB_HITSTUN_FACTOR));
            this.state = ST.HITSTUN;
            this.currentAttack = null;
            this.activeHitbox  = null;
            this._armorHitsLeft = 0;

            if (this.staminaHP <= 0) this.die();
            return;
        }

        // Track consecutive hits
        this._consecutiveHits++;
        this._stunDecayTimer = 0;
        
        // ── Combo breaker — after 3rd hit, force knockback and grant invincibility ──
        if (this._consecutiveHits >= S.COMBO_BREAKER_HIT_THRESHOLD) {
            // Apply strong knockback away from attacker (45-degree angle upward)
            const comboBreakAngle = 45;
            const comboBreakKB = S.COMBO_BREAKER_KNOCKBACK;
            const angleRad = comboBreakAngle * Math.PI / 180;
            
            this.vx = Math.cos(angleRad) * comboBreakKB * (attackerFacing > 0 ? 1 : -1);
            this.vy = -Math.sin(angleRad) * comboBreakKB;
            
            // Grant invincibility
            this.invincible = true;
            this._invFrames = S.COMBO_BREAKER_INVINCIBILITY_FRAMES;
            
            // Reset consecutive hit counter
            this._consecutiveHits = 0;
            
            // Set minimal hitstun just to trigger the state
            this.hitstunFrames = 10;
            this.state = ST.HITSTUN;
            
            // Cancel any in-progress attack
            this.currentAttack = null;
            this.activeHitbox  = null;
            this._armorHitsLeft = 0;
            return;  // Skip normal knockback calculation
        }
        // ── Instant KO: ultimates at 150%+, specials at 250%+ ────
        const isInstantKO = (isUltimateHit && this.damagePercent >= S.ULT_KO_THRESHOLD) ||
            (isSpecialHit && this.damagePercent >= S.INSTANT_KO_THRESHOLD);

        // Knockback calculation
        let kb;
        if (isInstantKO) {
            kb = S.INSTANT_KO_KB;   // un-survivable knockback
        } else {
            kb = Fighter.calcKB(
                hitbox.damage, this.damagePercent, this.data.weight,
                hitbox.baseKB, hitbox.kbScaling
            );
        }
        const angleDeg = hitbox.getLaunchAngle(attackerFacing);
        const angleRad = angleDeg * Math.PI / 180;

        this.vx = Math.cos(angleRad) * kb;
        this.vy = -Math.sin(angleRad) * kb;

        // ── Reduced stun: decay consecutive hitstun + hard cap ───
        const decayMult = Math.pow(S.HITSTUN_DECAY, this._consecutiveHits - 1);
        const rawStun   = Math.floor(kb * S.KB_HITSTUN_FACTOR);
        this.hitstunFrames = Math.max(1,
            Math.min(S.HITSTUN_MAX_FRAMES, Math.floor(rawStun * decayMult)));
        this.state = ST.HITSTUN;

        // Cancel any in-progress attack
        this.currentAttack = null;
        this.activeHitbox  = null;
        this._armorHitsLeft = 0;
    }

    _chargeUlt(dmg) {
        if (this.damagePercent >= S.ULT_CHARGE_CAP) return;
        const prev = this.ultimateMeter;
        this.ultimateMeter = Math.min(S.ULT_MAX, this.ultimateMeter + dmg * S.DMG_TO_METER);
        if (prev < S.ULT_MAX && this.ultimateMeter >= S.ULT_MAX && SMASH.SFX) {
            SMASH.SFX.playUltimateReady();
        }
    }

    _activateVaughanVonForm() {
        this._vaughanVonForm = true;
        this.data.idleSprite = 'assets/sprite_vaughan2.jpg';
        this.data.spriteLoaded = false;
        this.data.spriteImage = new Image();
        this.data.spriteImage.onload = () => { this.data.spriteLoaded = true; };
        this.data.spriteImage.onerror = () => {
            console.warn('Failed to load sprite: assets/sprite_vaughan2.jpg');
            this.data.spriteLoaded = false;
        };
        this.data.spriteImage.src = this.data.idleSprite;
    }

    consumeVaughanTransformCutsceneEvent() {
        if (!this._pendingVaughanTransformCutscene) return false;
        this._pendingVaughanTransformCutscene = false;
        return true;
    }

    notifyUltimateResolved() {
        this._ultimatesUsed++;
        if (this.data.key === 'vaughan' && this._ultimatesUsed >= 2 && !this._vaughanVonForm) {
            this._activateVaughanVonForm();
            this._pendingVaughanTransformCutscene = true;
        }
    }

    // ── Knockback formula ────────────────────────────────────────
    static calcKB(damage, percent, weight, baseKB, kbScaling) {
        const raw = damage * S.KB_DMG_FACTOR + damage * (percent / S.KB_PCT_DIVISOR);
        const wf  = weight * 0.1 + 1.0;
        return (raw / wf) * kbScaling + baseKB;
    }

    // ── Death / respawn ──────────────────────────────────────────
    die() {
        // Release any grab on death
        if (this.grabTarget) {
            this._releaseGrab();
        }
        this._stopSahurChargeLoopAudio();
        this._stopUltraChargeLoopAudio();
        this.stocks--;
        if (this.stocks <= 0) { this.state = ST.DEAD; return; }
        this._respawn();
    }

    _respawn() {
        this.x  = this._spawnX;
        this.y  = this._spawnY - 200;
        this.vx = 0; this.vy = 0;
        this.damagePercent = 0;
        if (this.maxStaminaHP > 0) this.staminaHP = this.maxStaminaHP;
        this.state = ST.AIRBORNE;
        this.invincible  = true;
        this._invFrames  = S.RESPAWN_INV_FRAMES;
        this.hitstunFrames = 0;
        this.currentAttack = null;
        this.activeHitbox  = null;
        this.fastFalling   = false;
        this.jumpsRemaining = this.data.maxJumps;
        this.shieldHP = S.SHIELD_MAX_HP;
        this._armorHitsLeft = 0;
        this._consecutiveHits = 0;
        this._stunDecayTimer  = 0;
        // Clear grab state
        this.isGrabbed = false;
        this.grabbedByPort = -1;
        this.grabbedEscapeTimer = 0;
        this._grabHitsReceived = 0;
        this.grabTarget = null;
        this.grabHitsDealt = 0;
        this.grabTimer = 0;
        this.slipperyTimer = 0;
        this._squishTimer = 0;
        this._squishSpeedMult = 1.0;
        this._squishScaleX = 1.0;
        this._squishScaleY = 1.0;
        this._alfgarBellyFlopRotate = false;
        this._alfgarBellyFlopSlam = false;
        this._landedPlatform = null;
        this._lastHitWasSpecial = false;
        this._stopSahurChargeLoopAudio();
        this._sahurChargeFrames = 0;
        this._sahurChargeRatio = 0;
        this._sahurFullChargeFlash = 0;
        this._sahurFullChargeTriggered = false;
        this._stopUltraChargeLoopAudio();
        this._ultraChargeFrames = 0;
        this._ultraChargeRatio = 0;
        this._ultraChargeAttack = null;
        this._ultraChargeDamage = null;
        this._ultraChargeBaseKB = null;
        this._ultraChargeSizeMult = 1;
        this._ultraChargeSpriteActive = false;
        this._chargedUltThisAttack = false;
        this._tempSpriteTimer = 0;
        this._pendingTempSpriteOnHit = null;
        this._restoreTempSprite();
    }

    // ──────────────────────────────────────────────────────────────
    // Rendering (colored placeholder — no sprites required)
    // ──────────────────────────────────────────────────────────────
    render(ctx, cam) {
        if (!this.isAlive) return;

        const sx = cam.wtsx(this.x);
        const sy = cam.wtsy(this.y);
        const sw = this.width  * cam.zoom;
        const sh = this.height * cam.zoom;

        // Flicker when invincible
        if (this.invincible && (this._invFrames % 6 < 3)) {
            ctx.globalAlpha = 0.35;
        }

        const color = S.P_COLORS[this.port % 4];

        ctx.save();

        const rotation = this._alfgarBellyFlopRotate ? -Math.PI / 2 : 0;
        const scaleX = this._squishScaleX || 1.0;
        const scaleY = this._squishScaleY || 1.0;

        // ── Draw sprite or colored rectangle ─────────────────────
        if (this.data.spriteLoaded && this.data.spriteImage) {
            // Draw actual sprite image
            ctx.save();
            if (rotation !== 0 || scaleX !== 1.0 || scaleY !== 1.0 || this.facing === -1) {
                const cx = sx + sw / 2;
                const cy = sy + sh / 2;
                ctx.translate(cx, cy);
                if (rotation !== 0) ctx.rotate(rotation);
                const flip = this.facing === -1 ? -1 : 1;
                ctx.scale(flip * scaleX, scaleY);
                ctx.drawImage(this.data.spriteImage, -sw / 2, -sh / 2, sw, sh);
            } else {
                ctx.drawImage(this.data.spriteImage, sx, sy, sw, sh);
            }
            ctx.restore();
        } else {
            // Fallback: colored rectangle
            ctx.save();
            ctx.fillStyle = color;
            if (rotation !== 0 || scaleX !== 1.0 || scaleY !== 1.0) {
                const cx = sx + sw / 2;
                const cy = sy + sh / 2;
                ctx.translate(cx, cy);
                if (rotation !== 0) ctx.rotate(rotation);
                ctx.scale(scaleX, scaleY);
                ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
            } else {
                ctx.fillRect(sx, sy, sw, sh);
            }
            ctx.restore();

            // Face direction indicator (eye)
            const eyeX = sx + sw / 2 + (this.facing * sw * 0.18);
            const eyeY = sy + sh * 0.18;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, 4 * cam.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(eyeX + this.facing * 1.5 * cam.zoom, eyeY, 2.5 * cam.zoom, 0, Math.PI * 2);
            ctx.fill();
        }

        // Sahur charge aura: gets redder as side-special charge increases.
        if (this.data.key === 'sahur' && this.state === ST.SPECIAL &&
            this.currentAttack && this.currentAttack === this.data.attacks['side_special'] &&
            this._atkPhase === 'startup' && this._sahurChargeRatio > 0) {
            const alpha = 0.12 + this._sahurChargeRatio * 0.55;
            ctx.fillStyle = `rgba(255,40,40,${alpha.toFixed(3)})`;
            ctx.fillRect(sx, sy, sw, sh);
        }

        // Max-charge cue: a quick bright pulse when Sahur reaches full charge.
        if (this.data.key === 'sahur' && this._sahurFullChargeFlash > 0) {
            const p = this._sahurFullChargeFlash / 14;
            ctx.fillStyle = `rgba(255,255,255,${(0.16 * p).toFixed(3)})`;
            ctx.fillRect(sx, sy, sw, sh);
            ctx.strokeStyle = `rgba(255,70,70,${(0.95 * p).toFixed(3)})`;
            ctx.lineWidth = Math.max(2, 4 * cam.zoom * p);
            ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4);
        }

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(11 * cam.zoom)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(`P${this.port + 1}`, sx + sw / 2, sy - 4 * cam.zoom);

        // Shield bubble
        if (this.state === ST.SHIELD) {
            const alpha = 0.2 + 0.3 * (this.shieldHP / S.SHIELD_MAX_HP);
            ctx.fillStyle = `rgba(100,180,255,${alpha})`;
            ctx.strokeStyle = `rgba(150,210,255,${alpha + 0.2})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx + sw/2, sy + sh/2, S.SHIELD_RADIUS * cam.zoom * (0.6 + 0.4 * this.shieldHP / S.SHIELD_MAX_HP), 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
        }        
        // Directional arrow
        this._renderDirectionArrow(ctx, cam, sx, sy, sw, sh);
        
        // "GRABBED" text
        if (this.isGrabbed) {
            this._renderGrabbedText(ctx, cam, sx, sy, sw, sh);
        }
        
        // Grab glow on grabber
        if (this.state === ST.GRABBING && this.grabTarget) {
            ctx.strokeStyle = '#ff44ff';
            ctx.lineWidth = 2 * cam.zoom;
            ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
        }
        
        // Shield stun stars
        if (this.state === ST.SHIELD_STUN) {
            const t = this._stateTimer;
            for (let i = 0; i < 3; i++) {
                const a = (t * 0.1 + i * 2.1);
                const starX = sx + sw/2 + Math.cos(a) * 18 * cam.zoom;
                const starY = sy - 8 * cam.zoom + Math.sin(a) * 8 * cam.zoom;
                ctx.fillStyle = '#ffff00';
                ctx.font = `${Math.round(10 * cam.zoom)}px Arial`;
                ctx.fillText('★', starX, starY);
            }
        }

        // Focus armor glow
        if (this.state === ST.FOCUS || this._armorHitsLeft > 0) {
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 3 * cam.zoom;
            ctx.shadowColor = '#ff8800';
            ctx.shadowBlur = 10 * cam.zoom;
            ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4);
            ctx.shadowBlur = 0;
        }

        // Ultimate ready glow
        if (this.ultimateMeter >= S.ULT_MAX) {
            const t = performance.now() / 400;
            const pulse = 0.55 + 0.45 * Math.sin(t);
            const glowSize = (8 + 6 * pulse) * cam.zoom;
            ctx.shadowColor = `rgba(255,215,0,${0.7 + 0.3 * pulse})`;
            ctx.shadowBlur = glowSize;
            ctx.strokeStyle = `rgba(255,215,0,${0.5 + 0.5 * pulse})`;
            ctx.lineWidth = (2 + pulse) * cam.zoom;
            ctx.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6);
            ctx.shadowBlur = 0;
        }

        ctx.restore();
        ctx.globalAlpha = 1;

        // Debug overlays
        if (S.DEBUG_HURTBOXES) Hurtbox.debugDraw(ctx, this.hurtbox, cam);
        if (S.DEBUG_HITBOXES && this.activeHitbox && this.activeHitbox.isActive()) {
            Hitbox.debugDraw(ctx, this.activeHitbox,
                this.x, this.y, this.width, this.height, this.facing, cam);
        }
    }
    
    _renderDirectionArrow(ctx, cam, sx, sy, sw, sh) {
        const moveX = this.inputDirection.x;
        const moveY = this.inputDirection.y;
        
        // Only draw if there's input
        if (Math.abs(moveX) < 0.1 && Math.abs(moveY) < 0.1) return;
        
        // Arrow position above fighter
        const arrowWorldX = this.x + this.width / 2;
        const arrowWorldY = this.y - 30;
        const arrowSx = cam.wtsx(arrowWorldX);
        const arrowSy = cam.wtsy(arrowWorldY);
        
        // Arrow size
        const arrowSize = 20 * cam.zoom;
        
        // Normalize direction
        const mag = Math.sqrt(moveX * moveX + moveY * moveY);
        if (mag === 0) return;
        
        const dx = moveX / mag;
        const dy = moveY / mag;
        
        // Arrow color (bright yellow)
        ctx.fillStyle = '#ffff32';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1, 2 * cam.zoom);
        
        // Calculate arrow points
        const tipX = arrowSx + dx * arrowSize;
        const tipY = arrowSy + dy * arrowSize;
        
        // Base corners perpendicular to direction
        const perpX = -dy;
        const perpY = dx;
        const baseOffset = arrowSize * 0.5;
        const baseBack = arrowSize * 0.3;
        
        const corner1X = arrowSx + perpX * baseOffset - dx * baseBack;
        const corner1Y = arrowSy + perpY * baseOffset - dy * baseBack;
        const corner2X = arrowSx - perpX * baseOffset - dx * baseBack;
        const corner2Y = arrowSy - perpY * baseOffset - dy * baseBack;
        
        // Draw filled triangle
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(corner1X, corner1Y);
        ctx.lineTo(corner2X, corner2Y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    _renderGrabbedText(ctx, cam, sx, sy, sw, sh) {
        // Text position above fighter (higher than arrow)
        const textWorldX = this.x + this.width / 2;
        const textWorldY = this.y - 50;
        const textSx = cam.wtsx(textWorldX);
        const textSy = cam.wtsy(textWorldY);
        
        // Font setup
        const fontSize = Math.max(14, Math.round(18 * cam.zoom));
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Measure text for background
        const hitsLeft = S.GRAB_HITS_TO_THROW - (this._grabHitsReceived || 0);
        const text = `GRABBED (${hitsLeft})`;
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;
        
        // Draw semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(
            textSx - textWidth / 2 - 4,
            textSy - textHeight / 2 - 2,
            textWidth + 8,
            textHeight + 4
        );
        
        // Draw text (red)
        ctx.fillStyle = '#ff3232';
        ctx.fillText(text, textSx, textSy);
    }
}


Fighter.States = ST;

SMASH.Fighter = Fighter;
})();
