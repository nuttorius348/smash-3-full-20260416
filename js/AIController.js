/**
 * AIController.js — Behavior-tree CPU opponent with difficulty 1-10.
 *
 * ══════════════════════════════════════════════════════════════════
 *  DIFFICULTY SCALING FORMULAE  (d = difficulty 1-9)
 * ══════════════════════════════════════════════════════════════════
 *  reactionFrames   = lerp(34, 1, t)   // frames before AI re-evaluates
 *  accuracy         = lerp(0.35, 0.99, t)// chance action inputs aren't dropped
 *  aggression       = lerp(0.15, 0.95, t)// bias toward attacking vs retreating
 *  comboProb        = lerp(0.0,  0.90, t)// chance AI chains a follow-up attack
 *  shieldProb       = lerp(0.0,  0.20, t)// chance AI shields incoming attacks
 *  dodgeSkill       = lerp(0.0,  0.95, t)// projectile avoidance competence
 *  edgeRecoveryIQ   = lerp(0.1,  1.0,  t)// how well AI recovers offstage
 *  ultThreshold     = lerp(0.0,  0.85, t)// dmg% on target before using ult
 *
 *  where t = (d - 1) / 8            (maps 1→0.0,  9→1.0)
 *
 *  Level 10 (ELITE) — hand-tuned profile with advanced behaviors:
 *    reaction 1f, accuracy 100%, adaptive aggression, combo 95%,
 *    shield 60%, dodge 100%, perfect recovery, optimal ult usage.
 *    Uses pogo bounces, proactive shielding, grabs, and dynamically
 *    balances evasion vs aggression based on own damage %.
 * ══════════════════════════════════════════════════════════════════
 *
 *  BEHAVIOR TREE (evaluated top-down, first match wins):
 *
 *  Root (Selector)
 *  ├─ [PRIORITY 0] DeadGuard          — skip if dead
 *  ├─ [PRIORITY 1] Recovery           — offstage? → recover
 *  ├─ [PRIORITY 2] ProjectileDodge    — incoming projectile? → dodge
 *  ├─ [PRIORITY 3] UltimateUse        — ult ready + target killable? → ult
 *  ├─ [PRIORITY 4] ShieldReact        — opponent attacking nearby? → shield
 *  ├─ [PRIORITY 5] ComboFollow        — just landed a hit? → chain attack
 *  ├─ [PRIORITY 6] AttackInRange      — target close? → attack
 *  ├─ [PRIORITY 7] Approach           — target far? → move toward
 *  └─ [PRIORITY 8] Idle / Wander      — nothing else → idle movement
 *
 * ══════════════════════════════════════════════════════════════════
 *  EXAMPLE BEHAVIOR BY LEVEL:
 *
 *  Lv1 (Punching Bag):
 *    reaction 34f, accuracy 35%, aggro 15%, combo 0%, no dodge, no shield
 *    Wanders randomly, rarely attacks, never combos, walks off stage often,
 *    never uses ultimate. No projectile avoidance.
 *
 *  Lv5 (Sparring Partner):
 *    reaction 14f, accuracy 67%, aggro 55%, combo 45%, dodge 47%, shield 10%
 *    Approaches target, mixes attacks and specials, sometimes chains a combo,
 *    shields telegraphed attacks, dodges slow projectiles, uses ult when
 *    target is above 80%. Decent recovery — uses double jump + up-B.
 *
 *  Lv9 (Frame-Perfect Menace):
 *    reaction 1f, accuracy 99%, aggro 95%, combo 90%, dodge 95%, shield 20%
 *    Relentlessly pursues, reads attacks and shields on reaction, chains
 *    multi-hit combos, dodges every projectile, uses ult at optimal kill %,
 *    perfect recovery with DI + jump conservation + up-B.
 *
 *  Lv10 (ELITE):
 *    reaction 1f, accuracy 100%, adaptive aggro, combo 95%, dodge 100%,
 *    shield 60%. Pogo bounces, proactive shields, optimal grabs, ult usage,
 *    survival-aware aggression (retreats at high %, all-in at low %),
 *    edge-guards opponents, uses every tool available.
 * ══════════════════════════════════════════════════════════════════
 */
(function() {
const InputState = SMASH.InputState;
const S          = SMASH.Settings;

// ── Difficulty scaling helper ────────────────────────────────────
function lerp(lo, hi, t) { return lo + (hi - lo) * t; }

function buildProfile(d) {
    // Level 10 (ELITE) — hand-tuned, separate from the standard curve
    if (d >= 10) {
        return {
            reactionFrames: 1,
            accuracy:       1.00,
            aggression:     0.90,   // base; dynamically adjusted in poll()
            comboProb:      0.98,
            shieldProb:     0.70,   // proactive + reactive shielding
            dodgeSkill:     1.00,
            edgeRecoveryIQ: 1.00,
            ultThreshold:   0.95,
            elite:          true,   // flag for special BT behaviours
            grabProb:       0.50,   // dedicated grab probability
            pogoProb:       0.55,   // pogo (down-air bounce) probability
        };
    }

    const t = (d - 1) / 8;  // 1→0.0   9→1.0
    return {
        reactionFrames: Math.round(lerp(34, 1, t)),
        accuracy:       lerp(0.35, 0.99, t),
        aggression:     lerp(0.15, 0.95, t),
        comboProb:      lerp(0.00, 0.90, t),
        shieldProb:     lerp(0.00, 0.20, t),
        dodgeSkill:     lerp(0.00, 0.95, t),
        edgeRecoveryIQ: lerp(0.10, 1.00, t),
        ultThreshold:   lerp(0.00, 0.85, t),
        elite:          false,
        grabProb:       0,
        pogoProb:       0,
    };
}

// ── Behavior-tree node results ───────────────────────────────────
const BT_SUCCESS = 1;
const BT_FAIL    = 0;
const BT_RUNNING = 2;

// ══════════════════════════════════════════════════════════════════
//  AIController class
// ══════════════════════════════════════════════════════════════════

class AIController {
    constructor(port, difficulty) {
        this.port       = port;
        this.difficulty = Math.max(1, Math.min(10, difficulty || 5));
        this.profile    = buildProfile(this.difficulty);

        // World references (populated by Game.setContext)
        this._fighters    = [];
        this._self        = null;
        this._stage       = null;
        this._projectiles = [];   // live projectile list from ProjectileManager

        // Decision state
        this._target       = null;
        this._cooldown     = 0;
        this._plan         = 'idle';
        this._planFrames   = 0;

        // Combo state
        this._lastHitFrame = -999;
        this._comboCount   = 0;
        this._frameCounter = 0;

        // Dodge state
        this._dodgeDir     = 0;
        this._dodgeFrames  = 0;

        // Wander state (for constant movement)
        this._wanderDir    = Math.random() < 0.5 ? -1 : 1;
        this._wanderTimer  = 30 + Math.floor(Math.random() * 90);
    }

    // ── Context injection (called by Game) ───────────────────────
    setContext(fighters, stage, projectiles) {
        this._fighters    = fighters;
        this._stage       = stage;
        this._self        = fighters.find(f => f.port === this.port) || null;
        this._projectiles = projectiles || [];
    }

    // ── Per-frame poll ───────────────────────────────────────────
    poll() {
        const inp = new InputState();
        const me  = this._self;
        if (!me || !me.isAlive) return inp;
        this._frameCounter++;

        // Re-evaluate target
        this._pickTarget(me);

        // Elite AI: dynamically adjust aggression based on own damage %
        if (this.profile.elite) {
            const myPct = me.damagePercent || 0;
            if (myPct > 150) {
                // High danger — play defensively, focus on survival
                this.profile.aggression = 0.45;
            } else if (myPct > 100) {
                // Medium danger — mix offense and defense
                this.profile.aggression = 0.70;
            } else if (myPct < 40) {
                // Low damage — relentless aggression
                this.profile.aggression = 1.00;
            } else {
                // Balanced — still very aggressive
                this.profile.aggression = 0.90;
            }
        }

        // Reaction cooldown — low-level AI only re-thinks every N frames
        this._cooldown--;
        const canDecide = this._cooldown <= 0;
        if (canDecide) {
            this._cooldown = this.profile.reactionFrames
                           + Math.floor(Math.random() * 4);
        }

        // ── Behavior tree (selector — first success wins) ────────
        if (this._btRecovery(me, inp, canDecide))       { this._applyAccuracy(inp); return inp; }
        if (this._btDodgeProjectile(me, inp, canDecide)) { this._applyAccuracy(inp); return inp; }
        if (this._btUltimate(me, inp, canDecide))        { this._applyAccuracy(inp); return inp; }
        if (this._btChargeUlt(me, inp, canDecide))       { this._applyAccuracy(inp); return inp; }
        if (this._btElitePogo(me, inp, canDecide))       { return inp; }
        if (this._btEliteShield(me, inp, canDecide))     { return inp; }
        if (this._btShieldReact(me, inp, canDecide))     { return inp; }
        if (this._btComboFollow(me, inp, canDecide))     { this._applyAccuracy(inp); return inp; }
        if (this._btEliteGrab(me, inp, canDecide))       { return inp; }
        if (this._btAttack(me, inp, canDecide))          { this._applyAccuracy(inp); return inp; }
        if (this._btApproach(me, inp, canDecide))        { return inp; }
        this._btIdle(me, inp);

        this._applyAccuracy(inp);
        return inp;
    }

    // ══════════════════════════════════════════════════════════════
    //  BT NODES
    // ══════════════════════════════════════════════════════════════

    // ── 1. Recovery (offstage / near blast zone) ─────────────────
    _btRecovery(me, inp, decide) {
        if (!this._stage) return false;
        const bz  = this._stage.blastZone;
        const iq  = this.profile.edgeRecoveryIQ;

        // How far inside the blast zone we must be to feel safe
        const safeMarginX = lerp(30, 180, iq);
        const safeMarginY = lerp(50, 250, iq);

        const nearLeft   = me.x < bz.x + safeMarginX;
        const nearRight  = me.x > bz.x + bz.w - safeMarginX;
        const nearBottom = me.y > bz.y + bz.h - safeMarginY;
        const isOffstage = !me.grounded && (nearLeft || nearRight || nearBottom);

        if (!isOffstage) return false;

        // Calculate stage center for horizontal DI
        const stageCenter = this._getNearestPlatformCenter(me);
        const cx = stageCenter.x;
        const cy = stageCenter.y;

        // Horizontal: drift toward stage center
        if (me.x < cx - 20)      inp.moveX = 1;
        else if (me.x > cx + 20) inp.moveX = -1;

        // Vertical: need to gain height
        const desperation = nearBottom ? 1.0 : 0.5;

        // Jump management — smart AI conserves jumps
        if (me.jumpsRemaining > 0) {
            // High IQ: conserve double jump, use it later for max height
            if (me.jumpsRemaining > 1 || iq < 0.5) {
                inp.jump = true;
            } else {
                // Save last jump — only use if falling or very low
                if (me.vy > 100 * (1 - iq) || me.y > bz.y + bz.h - 150) {
                    inp.jump = true;
                }
            }
        } else {
            // No jumps left — use Up-B
            if (iq > 0.2) {
                inp.special = true;
                inp.moveY   = -1;
            }
            // Very high IQ: also DI toward stage for better angle
            if (iq > 0.7) {
                inp.moveX = me.x < cx ? 1 : -1;
            }
        }

        // Fast-fall cancel: never fast-fall during recovery
        if (me.vy > 0 && iq > 0.3) {
            inp.moveY = Math.min(inp.moveY, 0);
        }

        return true;
    }

    // ── 2. Projectile dodge ──────────────────────────────────────
    _btDodgeProjectile(me, inp, decide) {
        const skill = this.profile.dodgeSkill;
        if (skill <= 0) return false;

        // Already executing a dodge maneuver
        if (this._dodgeFrames > 0) {
            this._dodgeFrames--;
            inp.moveY = -0.5;   // slight upward drift
            inp.moveX = this._dodgeDir;
            if (me.grounded && this._dodgeFrames > 6) inp.jump = true;
            return true;
        }

        // Scan for incoming projectiles from opponents
        const threatProj = this._findIncomingProjectile(me);
        if (!threatProj) return false;

        // Probability check — low skill AI fails to react
        if (Math.random() > skill) return false;

        // Decide dodge direction: move perpendicular to projectile travel
        const projDx = threatProj.x - me.x;
        const projVx = threatProj.vx;
        const approachingH = (projDx > 0 && projVx < 0) || (projDx < 0 && projVx > 0)
                          || Math.abs(projDx) < 80;

        if (!approachingH) return false;

        // Dodge up (jump) if grounded, or move away horizontally
        if (me.grounded) {
            // Jump over the projectile
            if (skill > 0.5) {
                inp.jump = true;
                this._dodgeDir  = 0;
                this._dodgeFrames = 10;
            } else {
                // Low skill: just run away
                this._dodgeDir = projDx > 0 ? -1 : 1;
                this._dodgeFrames = 8;
                inp.moveX = this._dodgeDir;
            }
        } else {
            // In-air: DI away from projectile
            this._dodgeDir = projDx > 0 ? -1 : 1;
            this._dodgeFrames = 6;
            inp.moveX = this._dodgeDir;
        }

        // High skill: shield instead of dodge when very close & grounded
        if (skill > 0.8 && me.grounded && Math.abs(projDx) < 60) {
            inp.shield = true;
            inp.jump   = false;
            inp.moveX  = 0;
            this._dodgeFrames = 8;
        }

        return true;
    }

    _findIncomingProjectile(me) {
        let closest = null;
        let closestDist = Infinity;
        const myBox = { x: me.x - 30, y: me.y - 30, w: me.width + 60, h: me.height + 60 };

        for (const p of this._projectiles) {
            if (!p.alive || p.ownerPort === this.port) continue;

            // Predict where projectile will be in ~15 frames
            const futureX = p.x + p.vx * 0.25;
            const futureY = p.y + p.vy * 0.25;

            // Is it heading roughly toward us?
            const dx = me.x - p.x;
            const headingToward = (dx > 0 && p.vx > 0) || (dx < 0 && p.vx < 0) || Math.abs(p.vx) < 50;
            if (!headingToward) continue;

            // Will it be near us?
            const dist = Math.hypot(futureX - me.x, futureY - me.y);
            if (dist < 200 && dist < closestDist) {
                closestDist = dist;
                closest = p;
            }
        }
        return closest;
    }

    // ── 3. Ultimate usage ────────────────────────────────────────
    _btUltimate(me, inp, decide) {
        if (me.ultimateMeter < S.ULT_MAX) return false;
        if (!decide) return false;

        const tgt = this._target;
        if (!tgt) return false;

        const threshold = this.profile.ultThreshold;

        // Low-difficulty AI: fires ult randomly when available
        if (threshold <= 0) {
            if (Math.random() < 0.02) {
                inp.special = true;
                return true;
            }
            return false;
        }

        // Elite AI: ult auto-KOs at 150%, so target anyone 70%+ 
        // (ult damage 70-85 will push them past 150% for the instant KO)
        if (this.profile.elite) {
            const tgtClose = Math.hypot(tgt.x - me.x, tgt.y - me.y) < 250;
            if (tgt.damagePercent >= 70 && tgtClose) {
                inp.moveX = tgt.x > me.x ? 1 : -1;
                inp.special = true;
                return true;
            }
            // Elite: also use on any crowd of 2+
            if (this._countNearbyOpponents(me, 250) >= 2) {
                inp.special = true;
                return true;
            }
            // Desperation: always ult when on last stock
            if (me.stocks <= 1 && me.damagePercent > 100) {
                const anyClose = this._fighters.some(f =>
                    f.port !== this.port && f.isAlive &&
                    Math.hypot(f.x - me.x, f.y - me.y) < 200);
                if (anyClose) {
                    inp.special = true;
                    return true;
                }
            }
            return false;
        }

        // Mid/high AI: use ult when target is at kill percent
        // or when multiple opponents are clustered nearby
        const tgtKillable = tgt.damagePercent >= (80 + (1 - threshold) * 120);
        const tgtClose    = Math.hypot(tgt.x - me.x, tgt.y - me.y) < 200;
        const multiTarget = this._countNearbyOpponents(me, 250) >= 2;

        if (tgtKillable && tgtClose) {
            inp.moveX = tgt.x > me.x ? 1 : -1;
            inp.special = true;
            return true;
        }

        // Very high AI: use ult on crowd
        if (threshold > 0.7 && multiTarget) {
            inp.special = true;
            return true;
        }

        // Desperation: use ult when on last stock with high %
        if (me.stocks <= 1 && me.damagePercent > 150 && tgtClose) {
            inp.special = true;
            return true;
        }

        return false;
    }

    // ── 3B. Charge Ultimate (use ult-charging neutral special) ───
    _btChargeUlt(me, inp, decide) {
        if (!decide) return false;
        if (me.ultimateMeter >= S.ULT_MAX) return false; // meter already full

        // Check if this character has an ult-charging neutral special
        const neutralSpec = me.data?.neutral_special;
        if (!neutralSpec || !neutralSpec.chargesUlt) return false;

        const tgt = this._target;
        if (!tgt) return false;

        const dx   = tgt.x - me.x;
        const dy   = tgt.y - me.y;
        const dist = Math.hypot(dx, dy);

        // Only charge when at safe distance from opponents
        if (dist < 180) return false;

        // Probability based on difficulty and how empty the meter is
        const meterRatio = me.ultimateMeter / S.ULT_MAX;
        const chargeProb = 0.02 + this.profile.aggression * 0.08 * (1 - meterRatio);

        if (Math.random() > chargeProb) return false;

        // Use neutral special to charge ult
        inp.moveX = 0;  // ensure neutral (no direction)
        inp.moveY = 0;
        inp.special = true;
        this._plan = 'charge_ult';
        this._planFrames = 30;
        return true;
    }

    // ── 4. Shield reaction (opponent attacking nearby) ───────────
    _btShieldReact(me, inp, decide) {
        if (!decide) return false;
        if (me.isAirborne) return false;
        if (me.shieldHP < 20) return false; // low shield, don't bother

        const prob = this.profile.shieldProb;
        if (prob <= 0) return false;

        // Check if any opponent is in attack state and close
        for (const f of this._fighters) {
            if (f.port === this.port || !f.isAlive) continue;
            if (f.state !== 'attack' && f.state !== 'special' && f.state !== 'ultimate') continue;

            const dist = Math.hypot(f.x - me.x, f.y - me.y);
            if (dist < 120 && Math.random() < prob) {
                inp.shield = true;
                inp.attack  = false;
                inp.special = false;
                inp.moveX   = 0;
                return true;
            }
        }
        return false;
    }

    // ── 5. Combo follow-up ───────────────────────────────────────
    _btComboFollow(me, inp, decide) {
        const prob = this.profile.comboProb;
        if (prob <= 0) return false;

        // Detect if we recently hit someone (check if any opponent is in hitstun
        // and close, indicating we just hit them)
        const tgt = this._target;
        if (!tgt) return false;

        const tgtInHistun = tgt.state === 'hitstun';
        const dist = Math.hypot(tgt.x - me.x, tgt.y - me.y);

        if (!tgtInHistun || dist > 180) {
            this._comboCount = 0;
            return false;
        }

        // Target is in hitstun and nearby — attempt follow-up
        if (Math.random() > prob) {
            this._comboCount = 0;
            return false;
        }

        this._comboCount++;
        const dx = tgt.x - me.x;
        const dy = tgt.y - me.y;

        // Face toward target
        inp.moveX = dx > 0 ? 0.5 : -0.5;

        // Pick optimal follow-up based on target position
        if (dy < -40) {
            // Target is above: up attack / up air
            inp.moveY = -1;
            inp.attack = true;
        } else if (dy > 40 && me.isAirborne) {
            // Target below in air: dair spike (high combo count = more willing to spike)
            if (this._comboCount >= 3 || Math.random() < prob * 0.5) {
                inp.moveY = 1;
                inp.attack = true;
            } else {
                inp.attack = true; // neutral air
            }
        } else if (Math.abs(dx) > 60) {
            // Target at medium range: side attack / fair
            inp.moveX = dx > 0 ? 1 : -1;
            inp.attack = true;
        } else {
            // Close range: jab / nair for reset
            inp.attack = true;
        }

        // At high combo count, special finisher
        if (this._comboCount >= 4 && prob > 0.6) {
            inp.attack  = false;
            inp.special = true;
            if (Math.abs(dx) > 40) inp.moveX = dx > 0 ? 1 : -1;
        }

        return true;
    }

    // ── 6. Attack when in range ──────────────────────────────────
    _btAttack(me, inp, decide) {
        const tgt = this._target;
        if (!tgt) return false;

        const dx   = tgt.x - me.x;
        const dy   = tgt.y - me.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 200) return false;
        if (!decide && this._plan !== 'attack') return false;

        // Decide attack type based on range and position
        inp.moveX = dx > 0 ? (dist < 60 ? 0.3 : 1) : (dist < 60 ? -0.3 : -1);

        if (dist < 80) {
            // Melee range — pick directional attack
            if (dy < -40) {
                inp.moveY = -1;
                inp.attack = true;    // up tilt / up air
            } else if (dy > 30 && me.isAirborne) {
                inp.moveY = 1;
                inp.attack = true;    // dair
            } else {
                // Occasionally grab at close range
                if (me.grounded && dist < 70 && Math.random() < 0.18 * this.profile.aggression) {
                    inp.grab = true;
                    inp.attack = false;
                } else if (Math.random() < this.profile.aggression * 0.6) {
                    inp.moveX = dx > 0 ? 1 : -1;
                    inp.attack = true;  // side attack (stronger)
                } else {
                    inp.attack = true;  // neutral attack (fast)
                }
            }
        } else if (dist < 200) {
            // Mid range — use specials or approach attack
            if (Math.random() < 0.35 + this.profile.aggression * 0.15) {
                inp.moveX = 0;          // reset to ensure neutral special
                inp.moveY = 0;
                inp.special = true;     // neutral-B projectile at range
            } else {
                inp.moveX = dx > 0 ? 1 : -1;
                inp.attack = true;      // running attack
            }
        }

        // Focus Attack (down-special) — armored approach at high aggression
        if (this.profile.aggression > 0.6 && dist < 150 && dist > 60
            && me.grounded && Math.random() < 0.08 * this.profile.aggression) {
            inp.moveY   = 1;
            inp.special = true;
            inp.attack  = false;
        }

        this._plan = 'attack';
        this._planFrames = 8 + Math.floor(Math.random() * 8);
        return true;
    }

    // ── 7. Approach target ───────────────────────────────────────
    _btApproach(me, inp, decide) {
        const tgt = this._target;
        if (!tgt) return false;

        const dx   = tgt.x - me.x;
        const dy   = tgt.y - me.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 100) return false; // too close, handled by attack node

        // Retreat if at high percent and low aggression
        if (me.damagePercent > 120 && Math.random() > this.profile.aggression) {
            inp.moveX = dx > 0 ? -1 : 1;
            return true;
        }

        // Move toward target
        inp.moveX = dx > 0 ? 1 : -1;

        // Jump if target is significantly above us
        if (dy < -80 && me.grounded) {
            inp.jump = true;
        }

        // Short-hop approach at mid range for aerials (high difficulty)
        if (this.profile.aggression > 0.6 && dist < 250 && me.grounded
            && Math.random() < 0.15) {
            inp.jump = true;
        }

        // Drop through platforms to reach target below
        if (dy > 80 && me.grounded && this.profile.edgeRecoveryIQ > 0.3) {
            inp.moveY = 1;
        }

        this._plan = 'approach';
        return true;
    }

    // ── 8. Idle / wander ─────────────────────────────────────────
    _btIdle(me, inp) {
        // Always move - AI never stands completely still
        this._wanderTimer--;
        if (this._wanderTimer <= 0) {
            // Change direction periodically
            this._wanderDir = Math.random() < 0.5 ? -1 : 1;
            this._wanderTimer = 30 + Math.floor(Math.random() * 90); // 0.5-2 seconds
        }

        // Apply movement based on current wander direction
        const moveIntensity = 0.3 + Math.random() * 0.4; // 0.3-0.7
        inp.moveX = this._wanderDir * moveIntensity;

        // Occasionally jump while wandering (more frequent at higher difficulties)
        const jumpChance = 0.008 + this.difficulty * 0.002; // 1% at lv1, 3% at lv10
        if (me.grounded && Math.random() < jumpChance) {
            inp.jump = true;
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  ELITE-ONLY BT NODES  (level 10)
    // ══════════════════════════════════════════════════════════════

    /**
     * Elite Pogo — intentionally jump above the target and down-air
     * for a pogo bounce (spike the opponent downward, bounce back up).
     */
    _btElitePogo(me, inp, decide) {
        if (!this.profile.elite) return false;
        if (!decide) return false;

        const tgt = this._target;
        if (!tgt || !tgt.isAlive) return false;

        const dx = tgt.x - me.x;
        const dy = tgt.y - me.y;
        const dist = Math.hypot(dx, dy);

        // Only attempt pogo when airborne and above the target
        if (me.grounded) {
            // If very close and target is nearby, jump to set up pogo
            if (dist < 120 && Math.random() < this.profile.pogoProb * 0.3) {
                inp.jump = true;
                inp.moveX = dx > 0 ? 0.5 : -0.5;
                return true;
            }
            return false;
        }

        // Airborne — check if we're above the target and falling toward them
        const aboveTarget = dy > 30;     // target is below us
        const horizontallyClose = Math.abs(dx) < 80;

        if (aboveTarget && horizontallyClose && Math.random() < this.profile.pogoProb) {
            // Down-air (pogo attempt)
            inp.moveY = 1;
            inp.attack = true;
            // Fine-tune horizontal drift toward target
            if (Math.abs(dx) > 15) inp.moveX = dx > 0 ? 0.5 : -0.5;
            return true;
        }

        // If airborne and close horizontally but not yet above, drift over them
        if (!aboveTarget && Math.abs(dx) < 100 && dist < 150 && me.vy < 0) {
            inp.moveX = dx > 0 ? 0.3 : -0.3;
            return false; // let other nodes handle
        }

        return false;
    }

    /**
     * Elite Proactive Shield — shield preemptively when approaching
     * a dangerous target (not just reactive to attacks).
     */
    _btEliteShield(me, inp, decide) {
        if (!this.profile.elite) return false;
        if (!decide) return false;
        if (!me.grounded) return false;
        if (me.shieldHP < 15) return false;

        const tgt = this._target;
        if (!tgt || !tgt.isAlive) return false;

        const dx = tgt.x - me.x;
        const dist = Math.hypot(dx, tgt.y - me.y);

        // Proactive shield scenarios:

        // 1. Opponent is close and has high damage (we want to survive)
        if (dist < 100 && me.damagePercent > 100 && Math.random() < 0.25) {
            inp.shield = true;
            return true;
        }

        // 2. Opponent is in attack/special wind-up at medium range — predict and shield
        if (dist < 150 && (tgt.state === 'attack' || tgt.state === 'special')) {
            if (Math.random() < this.profile.shieldProb) {
                inp.shield = true;
                return true;
            }
        }

        // 3. Multiple opponents nearby — defensive stance
        if (this._countNearbyOpponents(me, 140) >= 2 && Math.random() < 0.15) {
            inp.shield = true;
            return true;
        }

        return false;
    }

    /**
     * Elite Grab — dedicated grab behavior with better timing and range.
     * Grabs are powerful; elite AI uses them strategically.
     */
    _btEliteGrab(me, inp, decide) {
        if (!this.profile.elite) return false;
        if (!decide) return false;
        if (!me.grounded) return false;

        const tgt = this._target;
        if (!tgt || !tgt.isAlive) return false;

        const dx = tgt.x - me.x;
        const dist = Math.hypot(dx, tgt.y - me.y);

        // Grab range check (GRAB_RANGE from settings)
        if (dist > 75) return false;

        // Don't grab if target is shielding (shield-grab is risky)
        // Actually, grabbing shielding opponents IS good in Smash
        const grabChance = tgt.state === 'shield' ? this.profile.grabProb * 1.5
                         : this.profile.grabProb;

        if (Math.random() < grabChance) {
            inp.grab = true;
            inp.moveX = dx > 0 ? 0.3 : -0.3;
            return true;
        }

        return false;
    }

    // ══════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════

    _pickTarget(me) {
        const alive = this._fighters.filter(f => f.port !== this.port && f.isAlive);
        if (!alive.length) { this._target = null; return; }

        const d = this.difficulty;

        if (d >= 10) {
            // Elite AI: target the closest opponent who is killable,
            // or the closest if nobody is at kill percent
            const killable = alive.filter(f => f.damagePercent > 80);
            if (killable.length > 0) {
                this._target = killable.reduce((a, b) =>
                    Math.hypot(a.x - me.x, a.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? a : b);
            } else {
                this._target = alive.reduce((a, b) =>
                    Math.hypot(a.x - me.x, a.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? a : b);
            }
        } else if (d >= 7) {
            // High AI: target the opponent with the most damage (easiest to kill)
            this._target = alive.reduce((a, b) =>
                a.damagePercent > b.damagePercent ? a : b);
        } else if (d >= 4) {
            // Mid AI: target the closest opponent
            this._target = alive.reduce((a, b) =>
                Math.abs(a.x - me.x) < Math.abs(b.x - me.x) ? a : b);
        } else {
            // Low AI: random target, rarely switches
            if (!this._target || !this._target.isAlive || Math.random() < 0.015) {
                this._target = alive[Math.floor(Math.random() * alive.length)];
            }
        }
    }

    _countNearbyOpponents(me, radius) {
        let count = 0;
        for (const f of this._fighters) {
            if (f.port === this.port || !f.isAlive) continue;
            if (Math.hypot(f.x - me.x, f.y - me.y) < radius) count++;
        }
        return count;
    }

    _getNearestPlatformCenter(me) {
        if (!this._stage) return { x: 640, y: 400 };

        let best = null;
        let bestDist = Infinity;
        for (const plat of this._stage.platforms) {
            if (plat.passthrough && me.y < plat.rect.y) continue; // skip platforms above
            const cx = plat.rect.x + plat.rect.w / 2;
            const cy = plat.rect.y;
            const d  = Math.hypot(cx - me.x, cy - me.y);
            if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
        }
        return best || { x: 640, y: 400 };
    }

    _applyAccuracy(inp) {
        // Accuracy filter: low-difficulty AI randomly drops action inputs
        if (Math.random() > this.profile.accuracy) {
            inp.attack  = false;
            inp.special = false;
            inp.shield  = false;
        }
    }
}

// ── Static utility: get profile summary for a difficulty ─────────
AIController.getProfile = buildProfile;

SMASH.AIController = AIController;
})();
