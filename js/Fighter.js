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
            case ST.ULTIMATE:    this._tickAttack(); break;
            case ST.JUMPSQUAT:   this._tickJumpsquat(); break;
            case ST.HELPLESS:    this._tickHelpless(inp); break;
            case ST.SHIELD_STUN: this._tickShieldStun(); break;
            case ST.FOCUS:       this._tickFocus(); break;
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
            if (this.ultimateMeter >= S.ULT_MAX) {
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
                const spd = Math.abs(mx) < 0.7 ? this.data.walkSpeed : this.data.runSpeed;
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
                const targetVx = mx * this.data.airSpeed;
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

        this.currentAttack = atk;
        this._atkPhase = 'startup';
        this._atkTimer = atk.startupFrames;
        this.activeHitbox = null;
        this._projSpawned = false;

        // Focus / super-armor setup
        if (atk.isArmored && atk.armorDuringStartup) {
            this.state = ST.FOCUS;
            this._armorHitsLeft = atk.armorHits || S.FOCUS_ARMOR_HITS;
            this._focusDamageStored = 0;
        } else {
            this.state = isSpecial ? ST.SPECIAL : ST.ATTACK;
        }

        // Up-B velocity boost
        if (atk.boostVY !== undefined) {
            this.vy = atk.boostVY;
            if (atk.boostVX) this.vx += atk.boostVX * this.facing;
        }

        // Sound effect (e.g. Netanyahu side-special)
        if (atk.soundEffect) {
            try { new Audio(atk.soundEffect).play(); } catch(_) {}
        }

        return null;
    }

    _startUltimate() {
        this.ultimateMeter = 0;
        const ult = this.data.ultimateAttack;
        if (ult) {
            this.currentAttack = ult;
            this._atkPhase = 'startup';
            this._atkTimer = ult.startupFrames;
        }
        this.state = ST.ULTIMATE;
        return { type: 'ultimate', port: this.port };
    }

    _tickAttack() {
        this._atkTimer--;

        if (this._atkPhase === 'startup') {
            if (this._atkTimer <= 0) {
                this._atkPhase = 'active';
                this._atkTimer = this.currentAttack.activeFrames;
                this.activeHitbox = Hitbox.fromAttack(this.port, this.currentAttack);

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
    _tickFocus() {
        this._tickAttack();
    }

    _endAttack() {
        const wasUpB = this.currentAttack &&
            this.currentAttack === this.data.attacks['up_special'];

        this.currentAttack = null;
        this.activeHitbox  = null;

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
        this.ultimateMeter = Math.min(S.ULT_MAX, this.ultimateMeter + dmg * S.DMG_TO_METER);
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
        this.stocks--;
        if (this.stocks <= 0) { this.state = ST.DEAD; return; }
        this._respawn();
    }

    _respawn() {
        this.x  = this._spawnX;
        this.y  = this._spawnY - 200;
        this.vx = 0; this.vy = 0;
        this.damagePercent = 0;
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

        // ── Draw sprite or colored rectangle ─────────────────────
        if (this.data.spriteLoaded && this.data.spriteImage) {
            // Draw actual sprite image
            ctx.save();
            if (this.facing === -1) {
                // Flip horizontally for left-facing
                ctx.translate(sx + sw, sy);
                ctx.scale(-1, 1);
                ctx.drawImage(this.data.spriteImage, 0, 0, sw, sh);
            } else {
                ctx.drawImage(this.data.spriteImage, sx, sy, sw, sh);
            }
            ctx.restore();
        } else {
            // Fallback: colored rectangle
            ctx.fillStyle = color;
            ctx.fillRect(sx, sy, sw, sh);

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
