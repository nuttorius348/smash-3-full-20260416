/**
 * Physics.js — Gravity, friction, platform collision, blast zones.
 *
 * Supports moving platforms: riders inherit platform velocity so
 * they're carried along.
 */
(function() {
const S = SMASH.Settings;

class Physics {
    constructor() {
        this.gravity          = S.GRAVITY;
        this.terminalVelocity = S.TERMINAL_VELOCITY;
        this.groundFriction   = S.GROUND_FRICTION;
        this.airFriction      = S.AIR_FRICTION;
    }

    /** Per-frame update for one fighter. */
    update(f, stage, dt) {
        // ── Gravity ──────────────────────────────────────────────
        if (!f.grounded) {
            let g = this.gravity;
            if (f.fastFalling) g *= S.FAST_FALL_MULT;
            f.vy += g * dt;
            if (f.vy > this.terminalVelocity) f.vy = this.terminalVelocity;
        }

        // ── Friction ─────────────────────────────────────────────
        if (f.grounded) {
            f.vx *= Math.max(0, 1 - this.groundFriction * dt);
        } else {
            f.vx *= Math.max(0, 1 - this.airFriction * dt);
        }

        // ── Integrate ────────────────────────────────────────────
        f.prevY = f.y;
        f.x += f.vx * dt;
        f.y += f.vy * dt;

        // ── Platform collision ───────────────────────────────────
        f.grounded = false;
        f._ridingPlatform = null;

        for (const plat of stage.platforms) {
            if (this._collidePlatform(f, plat)) {
                f._ridingPlatform = plat;
                break;
            }
        }

        // ── Moving platform carry ────────────────────────────────
        if (f._ridingPlatform && f._ridingPlatform.isMoving) {
            const mp = f._ridingPlatform;
            f.x += mp.velX * dt;
            f.y += mp.velY * dt;
        }

        // ── Blast zone ───────────────────────────────────────────
        if (this._blastZone(f, stage)) f.die();
    }

    _collidePlatform(f, plat) {
        const fx = f.x, fy = f.y, fw = f.width, fh = f.height;
        const pr = plat.rect;

        // Quick AABB reject
        if (fx + fw <= pr.x || fx >= pr.x + pr.w ||
            fy + fh <= pr.y || fy >= pr.y + pr.h) return false;

        if (plat.passthrough) {
            // Only land from above
            if (f.vy >= 0 && f.prevY + fh <= pr.y + 4) {
                if (!f.droppingThru) {
                    f.y = pr.y - fh;
                    f.vy = 0;
                    f.grounded = true;
                    f.jumpsRemaining = f.data.maxJumps;
                    f.fastFalling = false;
                    return true;
                }
            }
            return false;
        }

        // ── Solid platform ───────────────────────────────────────
        const oL = (fx + fw) - pr.x;
        const oR = (pr.x + pr.w) - fx;
        const oT = (fy + fh) - pr.y;
        const oB = (pr.y + pr.h) - fy;
        const m  = Math.min(oL, oR, oT, oB);

        if (m === oT && f.vy >= 0) {
            f.y = pr.y - fh;
            f.vy = 0;
            f.grounded = true;
            f.jumpsRemaining = f.data.maxJumps;
            f.fastFalling = false;
        } else if (m === oB && f.vy < 0) {
            f.y = pr.y + pr.h;
            f.vy = 0;
        } else if (m === oL) {
            f.x = pr.x - fw;
            f.vx = 0;
        } else if (m === oR) {
            f.x = pr.x + pr.w;
            f.vx = 0;
        }

        return f.grounded;
    }

    _blastZone(f, stage) {
        const bz = stage.blastZone;
        const cx = f.x + f.width / 2;
        const cy = f.y + f.height / 2;
        return cx < bz.x || cx > bz.x + bz.w || cy < bz.y || cy > bz.y + bz.h;
    }
}

SMASH.Physics = Physics;
})();
