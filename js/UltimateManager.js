/**
 * UltimateManager.js — Cinematic ultimate cutscene system.
 *
 * ══════════════════════════════════════════════════════════════════
 *  ARCHITECTURE
 * ══════════════════════════════════════════════════════════════════
 *  UltimateManager orchestrates the full ultimate sequence:
 *
 *  1. TRIGGER:   Fighter's special input fires when meter >= ULT_MAX
 *     Fighter._startUltimate() returns { type: 'ultimate', port }
 *
 *  2. DETECT:    Scan fighters in attacker's facing direction within
 *     a detection cone (configurable range + angle).
 *     Victims are stored for post-video damage.
 *
 *  3. FREEZE:    Game state → 'ultimate_cutscene', halting all
 *     physics / input / combat for the duration.
 *
 *  4. CUTSCENE:  Play a placeholder MP4 via an overlay <video>
 *     element. Falls back to an animated canvas splash if no
 *     video file is found (404 / error).
 *
 *  5. RESOLVE:   After video ends (or fallback timer):
 *     • Apply stored damage to each victim
 *     • Compute & apply knockback (uses Fighter.calcKB)
 *     • Grant attacker brief invincibility
 *
 *  6. RESUME:    Game state → 'playing', loop resumes.
 *
 * ══════════════════════════════════════════════════════════════════
 */
(function() {
const S    = SMASH.Settings;
const ST   = SMASH.Fighter.States;

// ── Detection defaults ───────────────────────────────────────────
const ULT_DETECT_RANGE    = 400;   // px forward from attacker center
const ULT_DETECT_BEHIND   = 60;    // small tolerance behind attacker
const ULT_DETECT_HALF_H   = 200;   // vertical half-height of detection zone
const FALLBACK_DURATION   = 2.5;   // seconds for canvas fallback anim
const FLASH_IN_DURATION   = 0.35;  // white flash fade-in  (seconds)
const FLASH_OUT_DURATION  = 0.3;   // white flash fade-out (seconds)
const POST_RESOLVE_PAUSE  = 0.4;   // brief freeze after damage applied

// ── Combo Ultimate pairs (sorted keys) ───────────────────────────
const COMBO_ULTIMATES = {
    'netanyahu+trump':   { video: 'assets/ultimate_netanyahutrump.mp4', name: 'Middle East Domination' },
    'diddy+epstein':     { video: 'assets/ultimate_epsteindiddy.mp4',   name: 'Island Secrets' },
    'droid+metabot':     { video: 'assets/ultimate_droidmetabot.mp4',   name: 'AI Overload' },
    'aru+bomber':        { video: 'assets/ultimate_bomberaru.mp4',      name: 'Late Defuser' },
    'grappler+zoner':    { video: 'assets/ultimate_frankieslaveish.mp4',name: 'Vibe Code Supreme' },
    'brawler+fazbear':   { video: 'assets/ultimate_fazbearlazer.mp4',   name: 'Super Saiyan Sumpreme' },
    'kirky+speedster':   { video: 'assets/ultimate_kirkynutsak.mp4',    name: 'Turning Point Debate' },
    'kiddo+speed':       { video: 'assets/ultimate_kiddospeed.mp4',     name: 'Brainrot Overload' },
    'sahur+vaughan':     { video: 'assets/Ultimate_sahurvaughan.mp4',   name: 'batznglock' },
};

function _getComboKey(keyA, keyB) {
    return [keyA, keyB].sort().join('+');
}

// ══════════════════════════════════════════════════════════════════
//  UltimateManager
// ══════════════════════════════════════════════════════════════════

class UltimateManager {
    constructor() {
        this._videosEnabled = true;
        this._soundsEnabled = true;

        // ── State ────────────────────────────────────────────────
        this.active       = false;   // true while cutscene is running
        this.phase        = 'idle';  // idle | flash_in | video | flash_out | resolve | done
        this._timer       = 0;

        // ── Cutscene data ────────────────────────────────────────
        this._attackerPort = -1;
        this._attacker     = null;
        this._ultData      = null;   // ultimateAttack object
        this._victims      = [];     // { fighter, distFactor }
        this._videoPath    = null;
        this._isCombo      = false;  // combo ultimate active?
        this._comboDmgMult = 1;      // 4x for combo ultimates
        this._comboName    = null;   // combo ultimate name

        // ── Video element (created once, reused) ─────────────────
        this._videoEl = null;
        this._videoReady = false;
        this._videoError = false;
        this._createVideoElement();

        // ── Fallback canvas anim ─────────────────────────────────
        this._fallbackElapsed = 0;
    }

    setVideoEnabled(enabled) {
        this._videosEnabled = enabled !== false;
    }

    setSoundEnabled(enabled) {
        this._soundsEnabled = enabled !== false;
        if (this._videoEl) {
            this._videoEl.muted = !this._soundsEnabled;
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Video element setup
    // ──────────────────────────────────────────────────────────────

    _createVideoElement() {
        const el = document.createElement('video');
        el.id = 'ultVideo';
        el.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            object-fit: cover;
            z-index: 500;
            display: none;
            background: #000;
            pointer-events: none;
        `;
        el.playsInline = true;
        el.muted = !this._soundsEnabled;
        el.preload = 'auto';
        document.body.appendChild(el);
        this._videoEl = el;

        // Ended → advance to flash_out
        el.addEventListener('ended', () => {
            if (this.phase === 'video') {
                this._hideVideo();
                this.phase = 'flash_out';
                this._timer = FLASH_OUT_DURATION;
            }
        });

        // Error → switch to fallback
        el.addEventListener('error', () => {
            this._videoError = true;
            if (this.phase === 'video') {
                this._hideVideo();
                // Already used fallback timer via _timer
            }
        });
    }

    _showVideo(src) {
        const el = this._videoEl;
        this._videoError = false;
        this._videoReady = false;

        el.src = src;
        el.style.display = 'block';
        el.currentTime = 0;

        // Try to play — if source missing, error handler fires
        const playPromise = el.play();
        if (playPromise) {
            playPromise.then(() => {
                this._videoReady = true;
            }).catch(() => {
                this._videoError = true;
            });
        }
    }

    _hideVideo() {
        const el = this._videoEl;
        el.pause();
        el.style.display = 'none';
        el.removeAttribute('src');
        el.load();  // reset
    }

    // ──────────────────────────────────────────────────────────────
    //  PUBLIC API — called from Game.js
    // ──────────────────────────────────────────────────────────────

    /**
     * Trigger an ultimate cutscene.
     * @param {Fighter} attacker   — the fighter who activated ultimate
     * @param {Fighter[]} allFighters — full fighter list
     */
    trigger(attacker, allFighters) {
        if (this.active) return; // only one at a time

        this._attackerPort = attacker.port;
        this._attacker     = attacker;
        this._ultData      = attacker.data.ultimateAttack;

        // ── Check for combo ultimate (team mode) ─────────────────
        this._isCombo      = false;
        this._comboDmgMult = 1;
        this._comboName    = null;
        const attackerKey  = attacker.data.key;
        if (attacker.team >= 0 && attackerKey) {
            for (const f of allFighters) {
                if (f === attacker || !f.isAlive) continue;
                if (f.team !== attacker.team) continue;
                const partnerKey = f.data.key;
                if (!partnerKey) continue;
                const comboKey = _getComboKey(attackerKey, partnerKey);
                const comboData = COMBO_ULTIMATES[comboKey];
                if (comboData) {
                    this._isCombo      = true;
                    this._comboDmgMult = 4;
                    this._videoPath    = comboData.video;
                    this._comboName    = comboData.name;
                    break;
                }
            }
        }

        // ── Detect victims ───────────────────────────────────────
        // Combo ultimates hit ALL enemies, normal ultimates use cone detection
        this._victims = this._detectVictims(attacker, allFighters, this._isCombo);

        // ── Resolve video path (combo overrides individual) ──────
        if (!this._isCombo) {
            this._videoPath = this._ultData.cutsceneVideo || null;
        }
        this._videoError = false;
        this._fallbackElapsed = 0;

        // Videos disabled: apply ultimate immediately and continue gameplay.
        if (!this._videosEnabled) {
            this._applyDamage();
            this._finish();
            return;
        }

        this.active = true;

        // ── Begin flash-in ───────────────────────────────────────
        this.phase  = 'flash_in';
        this._timer = FLASH_IN_DURATION;
    }

    /**
     * Per-frame update — call from Game._update BEFORE other logic.
     * Returns true while the cutscene is running (Game should skip
     * normal updates).
     */
    update(dt) {
        if (!this.active) return false;

        switch (this.phase) {
            case 'flash_in':
                this._timer -= dt;
                if (this._timer <= 0) {
                    // Start video or fallback
                    if (this._videoPath && !this._videoError) {
                        this.phase = 'video';
                        this._timer = 0;
                        this._showVideo(this._videoPath);
                    } else {
                        // Canvas fallback
                        this.phase = 'video';
                        this._videoError = true; // force fallback path
                        this._timer = FALLBACK_DURATION;
                    }
                }
                break;

            case 'video':
                if (this._videoError) {
                    // Canvas fallback timer
                    this._fallbackElapsed += dt;
                    this._timer -= dt;
                    if (this._timer <= 0) {
                        this.phase = 'flash_out';
                        this._timer = FLASH_OUT_DURATION;
                    }
                }
                // If video is playing, we wait for 'ended' event
                break;

            case 'flash_out':
                this._timer -= dt;
                if (this._timer <= 0) {
                    this.phase = 'resolve';
                    this._timer = POST_RESOLVE_PAUSE;
                    this._applyDamage();
                }
                break;

            case 'resolve':
                this._timer -= dt;
                if (this._timer <= 0) {
                    this._finish();
                }
                break;
        }

        return true; // still active → skip normal game update
    }

    /**
     * Render overlays on top of the game canvas.
     * Called from Game._render after everything else.
     */
    render(ctx) {
        if (!this.active) return;

        switch (this.phase) {
            case 'flash_in': {
                // White flash fading in
                const t = 1.0 - (this._timer / FLASH_IN_DURATION);
                ctx.save();
                ctx.fillStyle = `rgba(255,255,255,${t.toFixed(3)})`;
                ctx.fillRect(0, 0, S.W, S.H);
                ctx.restore();
                break;
            }

            case 'video': {
                if (this._videoError) {
                    // Canvas fallback cutscene
                    this._renderFallback(ctx);
                }
                // If real video is playing, the <video> element covers the canvas
                break;
            }

            case 'flash_out': {
                // White flash fading out
                const t = this._timer / FLASH_OUT_DURATION;
                ctx.save();
                ctx.fillStyle = `rgba(255,255,255,${t.toFixed(3)})`;
                ctx.fillRect(0, 0, S.W, S.H);
                ctx.restore();
                break;
            }

            case 'resolve': {
                // Brief hit-freeze overlay
                const alpha = Math.min(0.5, this._timer / POST_RESOLVE_PAUSE);
                ctx.save();
                ctx.fillStyle = `rgba(255,60,60,${alpha.toFixed(3)})`;
                ctx.fillRect(0, 0, S.W, S.H);

                // "ULTIMATE!" text
                ctx.font = 'bold 80px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#000';
                ctx.shadowBlur = 12;
                const ultLabel = this._isCombo
                    ? `P${this._attackerPort + 1} COMBO ULTIMATE!`
                    : `P${this._attackerPort + 1} ULTIMATE!`;
                ctx.fillText(ultLabel, S.W / 2, S.H / 2 - 50);

                // Damage numbers per victim
                ctx.font = 'bold 36px Arial';
                for (let i = 0; i < this._victims.length; i++) {
                    const v = this._victims[i];
                    const dmg = this._getVictimDamage(v);
                    ctx.fillStyle = S.P_COLORS[v.fighter.port % 4];
                    ctx.fillText(
                        `P${v.fighter.port + 1}  -${dmg.toFixed(0)}%`,
                        S.W / 2, S.H / 2 + 20 + i * 45
                    );
                }
                ctx.restore();
                break;
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  DIRECTIONAL DETECTION
    // ──────────────────────────────────────────────────────────────

    /**
     * Detect fighters in the attacker's facing direction within
     * a rectangular detection zone.
     *
     * Detection zone (facing right):
     *   ┌───────────────────────┐
     *   │  ULT_DETECT_BEHIND   │ ← small tolerance behind
     *   │◄──────────►          │
     *   │         ★ ──────────►│ ← ULT_DETECT_RANGE forward
     *   │       attacker       │
     *   │     ULT_DETECT_HALF_H│ ← vertical extent
     *   └───────────────────────┘
     *
     * For combo ultimates, all enemies are detected regardless of position.
     *
     * @param {boolean} [isCombo=false] — if true, detect ALL enemies
     * @returns {Array<{fighter, distFactor}>}
     *   distFactor: 0=point blank, 1=max range (scales damage falloff)
     */
    _detectVictims(attacker, allFighters, isCombo = false) {
        const victims = [];
        const ax = attacker.x + attacker.width / 2;  // attacker center X
        const ay = attacker.y + attacker.height / 2;  // attacker center Y
        const dir = attacker.facing; // +1 right, -1 left

        for (const f of allFighters) {
            if (f === attacker) continue;
            if (!f.isAlive) continue;
            if (f.invincible) continue;
            // Skip teammates
            if (attacker.team >= 0 && f.team >= 0 && attacker.team === f.team) continue;

            // Combo ultimate: hit ALL enemies
            if (isCombo) {
                victims.push({ fighter: f, distFactor: 0 });  // full damage, no falloff
                continue;
            }

            const fx = f.x + f.width / 2;
            const fy = f.y + f.height / 2;

            // Signed horizontal distance (positive = in facing direction)
            const dx = (fx - ax) * dir;
            // Vertical distance (absolute)
            const dy = Math.abs(fy - ay);

            // Check: within forward range (with small behind tolerance)
            if (dx < -ULT_DETECT_BEHIND) continue;
            if (dx > ULT_DETECT_RANGE) continue;

            // Check: within vertical extent
            if (dy > ULT_DETECT_HALF_H) continue;

            // Distance factor for damage scaling (0..1, 0=close)
            const distFactor = Math.max(0, dx) / ULT_DETECT_RANGE;

            victims.push({ fighter: f, distFactor });
        }

        return victims;
    }

    // ──────────────────────────────────────────────────────────────
    //  DAMAGE APPLICATION
    // ──────────────────────────────────────────────────────────────

    _getVictimDamage(victim) {
        // Full damage at close range, 60% at max range
        const falloff = 1.0 - victim.distFactor * 0.4;
        return this._ultData.damage * falloff * this._comboDmgMult;
    }

    _applyDamage() {
        if (!this._ultData || !this._attacker) return;

        const ult = this._ultData;

        for (const v of this._victims) {
            const target = v.fighter;
            const dmg = this._getVictimDamage(v);

            // Track kill attribution
            target._lastHitBy = this._attackerPort;

            // Apply damage
            target.damagePercent += dmg;

            // Compute knockback (instant KO flag or 150% threshold)
            const forceInstantKO = !!ult.instantKO;
            const kb = (forceInstantKO || target.damagePercent >= S.ULT_KO_THRESHOLD)
                ? S.INSTANT_KO_KB
                : SMASH.Fighter.calcKB(
                    dmg,
                    target.damagePercent,
                    target.data.weight,
                    ult.baseKB,
                    ult.kbScaling
                );

            // Launch angle (use ultimate's angle, flip based on attacker facing)
            const angleDeg = ult.angle * (this._attacker.facing >= 0 ? 1 : 1);
            // If target is behind attacker, launch backward
            const fx = target.x + target.width / 2;
            const ax = this._attacker.x + this._attacker.width / 2;
            const behindAttacker = (fx - ax) * this._attacker.facing < 0;
            const finalAngle = behindAttacker ? (180 - angleDeg) : angleDeg;

            const angleRad = finalAngle * Math.PI / 180;
            target.vx = Math.cos(angleRad) * kb * this._attacker.facing;
            target.vy = -Math.sin(angleRad) * kb;

            // Put victim in hitstun
            target.hitstunFrames = Math.max(1, Math.floor(kb * S.KB_HITSTUN_FACTOR));
            target.state = ST.HITSTUN;

            // Cancel any attack they were doing
            target.currentAttack = null;
            target.activeHitbox  = null;
            target._armorHitsLeft = 0;
        }

        // Brief invincibility for attacker after cutscene
        this._attacker.invincible = true;
        this._attacker._invFrames = 30; // 0.5s at 60fps
    }

    // ──────────────────────────────────────────────────────────────
    //  FINISH
    // ──────────────────────────────────────────────────────────────

    _finish() {
        // Clean up attacker state
        if (this._attacker) {
            // Apply damage boost multiplier (e.g. Fazbear's stacking 10x)
            if (this._ultData && this._ultData.damageBoostMultiplier) {
                this._attacker.damageMultiplier *= this._ultData.damageBoostMultiplier;
                this._attacker.boostedHitsLeft = 2;
            }

            if (this._attacker.notifyUltimateResolved) {
                this._attacker.notifyUltimateResolved();
            }

            this._attacker.currentAttack = null;
            this._attacker.activeHitbox  = null;
            this._attacker.state = this._attacker.grounded ? ST.IDLE : ST.AIRBORNE;
        }

        this.active = false;
        this.phase  = 'idle';
        this._attacker = null;
        this._ultData  = null;
        this._victims  = [];
        this._attackerPort = -1;
        this._isCombo      = false;
        this._comboDmgMult = 1;
        this._comboName    = null;
    }

    // ──────────────────────────────────────────────────────────────
    //  CANVAS FALLBACK (when video is missing / fails to load)
    // ──────────────────────────────────────────────────────────────

    _renderFallback(ctx) {
        const t = this._fallbackElapsed;
        const dur = FALLBACK_DURATION;
        const norm = Math.min(t / dur, 1.0);  // 0→1

        ctx.save();

        // ── Background ───────────────────────────────────────────
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, S.W, S.H);

        // Radial energy burst
        const pColor = S.P_COLORS[this._attackerPort % 4];
        const cx = S.W / 2;
        const cy = S.H / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy);
        const burstR = norm * maxR * 1.2;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, burstR);
        grad.addColorStop(0, pColor);
        grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, S.W, S.H);

        // ── Speed lines ──────────────────────────────────────────
        ctx.strokeStyle = `rgba(255,255,255,${(0.6 - norm * 0.5).toFixed(2)})`;
        ctx.lineWidth = 2;
        const numLines = 24;
        for (let i = 0; i < numLines; i++) {
            const angle = (i / numLines) * Math.PI * 2 + t * 3;
            const r1 = 100 + norm * 200;
            const r2 = r1 + 150 + norm * 300;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
            ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
            ctx.stroke();
        }

        // ── Character silhouette (rectangle placeholder) ─────────
        const charW = 120;
        const charH = 180;
        const charX = cx - charW / 2;
        const charY = cy - charH / 2 - 20;

        // Glow
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 30 + Math.sin(t * 10) * 10;
        ctx.fillStyle = pColor;
        ctx.fillRect(charX, charY, charW, charH);

        // Character name inside silhouette
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this._attacker ? this._attacker.data.name : '???',
            cx, cy - 20
        );

        // ── Ultimate name ────────────────────────────────────────
        const ultName = this._isCombo && this._comboName
            ? this._comboName
            : (this._ultData ? this._ultData.name : 'ULTIMATE');
        const scale = 1.0 + Math.sin(t * 4) * 0.05;

        ctx.save();
        ctx.translate(cx, cy + charH / 2 + 40);
        ctx.scale(scale, scale);
        ctx.font = 'bold 56px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 20;
        ctx.fillText(ultName.toUpperCase(), 0, 0);
        ctx.restore();

        // ── Combo badge ──────────────────────────────────────────
        if (this._isCombo) {
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd700';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 10;
            ctx.fillText('⚡ COMBO ULTIMATE ⚡', cx, cy + charH / 2 + 90);
            ctx.shadowBlur = 0;
        }

        // ── Player label ─────────────────────────────────────────
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = pColor;
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 8;
        ctx.fillText(`P${this._attackerPort + 1}`, cx, 80);

        // ── Victim indicators ────────────────────────────────────
        if (this._victims.length > 0) {
            ctx.font = '20px Arial';
            ctx.fillStyle = '#ccc';
            ctx.shadowBlur = 0;
            const txt = this._victims.length === 1
                ? `1 target locked`
                : `${this._victims.length} targets locked`;
            ctx.fillText(txt, cx, S.H - 60);
        }

        ctx.restore();
    }
}

// ══════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════

SMASH.UltimateManager = UltimateManager;

})();
